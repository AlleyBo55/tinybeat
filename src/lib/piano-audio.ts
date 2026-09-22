// The Magic Piano synth: a data-driven polyphonic voice, a synthesized drum
// kit for percussion tracks, an algorithmic reverb, and the master chain
// (song-normalise gain -> compressor -> reverb send -> master volume).
//
// Melodic notes play from real recordings (samples.ts) once an instrument's
// soundfont has loaded; until then, and for the synthetic instruments, the
// data-driven synth voice plays so the first tap is never silent.

import { type Instrument, instrumentById } from "./instruments";
import { midiToFreq } from "./pattern";
import { loadSoundfont, pickSample, type SampleBank } from "./samples";

export interface PlayedNote {
  midi: number;
  percussion: boolean;
  /** the part this note belongs to, for colouring */
  track?: number;
  /** seconds, when the source knows it */
  duration?: number;
}

export type SampleState = "synth" | "loading" | "ready" | "failed";

/** Sampled voices are polyphonic; beyond this many the oldest are released. */
const MAX_SAMPLE_VOICES = 48;

export class PianoAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private songGain!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private drumBus!: GainNode;
  private noise!: AudioBuffer;
  private live = new Set<AudioScheduledSourceNode>();
  private sampleVoices: { src: AudioBufferSourceNode; amp: GainNode; end: number }[] = [];
  private instrument: Instrument = instrumentById("piano");
  private bank: SampleBank | null = null;
  private sampleState: SampleState = "synth";
  private sampleListeners = new Set<(s: SampleState) => void>();
  private reverbAmount = 0.3;
  private volume = 1;

  setInstrument(id: string): void {
    this.instrument = instrumentById(id);
    this.bank = null;
    const sf = this.instrument.soundfont;
    if (!sf) {
      this.setSampleState("synth");
      return;
    }
    this.setSampleState("loading");
    const ctx = this.context();
    loadSoundfont(ctx, sf).then(
      (bank) => {
        if (this.instrument.soundfont !== sf) return; // the user moved on
        this.bank = bank;
        this.setSampleState("ready");
      },
      () => {
        if (this.instrument.soundfont === sf) this.setSampleState("failed");
      },
    );
  }

  /** Whether melodic notes currently play from recordings or the synth. */
  get samples(): SampleState {
    return this.sampleState;
  }

  /**
   * Fetch and decode an instrument's recordings ahead of time (on the first
   * sign of intent), so the first note after "play" is already the real thing.
   */
  preload(id: string): void {
    const sf = instrumentById(id).soundfont;
    if (!sf) return;
    loadSoundfont(this.context(), sf).catch(() => {
      // best effort; setInstrument reports failures when it matters
    });
  }

  onSamples(fn: (s: SampleState) => void): () => void {
    this.sampleListeners.add(fn);
    return () => {
      this.sampleListeners.delete(fn);
    };
  }

  private setSampleState(s: SampleState): void {
    if (s === this.sampleState) return;
    this.sampleState = s;
    for (const fn of this.sampleListeners) fn(s);
  }

  setReverb(amount: number): void {
    this.reverbAmount = Math.min(1, Math.max(0, amount));
    if (this.ctx) this.applyReverb();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  setSongGain(g: number): void {
    if (this.ctx) this.songGain.gain.setTargetAtTime(g, this.ctx.currentTime, 0.02);
    this.pendingSongGain = g;
  }
  private pendingSongGain = 1;

  /** Resume from a user gesture so the first tap is not late. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
  }

  /**
   * Play the notes of one tap. `offsets` (seconds) stagger notes within a
   * beat in per-beat mode; `durations` (seconds) hold sustaining instruments;
   * `when` (seconds from now) schedules ahead on the audio clock so the clock
   * in the store can run a little early and still land the sound on the grid.
   */
  play(notes: readonly PlayedNote[], velocity: number, offsets?: readonly number[], durations?: readonly number[], when = 0): void {
    const ctx = this.context();
    if (ctx.state === "suspended") void ctx.resume();
    const base = ctx.currentTime + 0.004 + Math.max(0, when);
    notes.forEach((n, i) => {
      const at = base + (offsets?.[i] ?? 0);
      if (n.percussion) this.drum(n.midi, at, velocity);
      else this.voice(n.midi, at, velocity, durations?.[i] ?? 0.25);
    });
  }

  /** Cut every ringing note (used on rewind / song change). */
  silence(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.songGain.gain.cancelScheduledValues(t);
    this.songGain.gain.setValueAtTime(this.songGain.gain.value, t);
    this.songGain.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    this.songGain.gain.setValueAtTime(this.pendingSongGain, t + 0.05);
    for (const src of this.live) {
      try {
        src.stop(t + 0.04);
      } catch {
        // already stopped
      }
    }
    this.sampleVoices = [];
  }

  // ---------- graph ----------

  private context(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });

    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 20;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.8, 2.2);
    comp.connect(dry).connect(master);
    comp.connect(wet).connect(reverb).connect(master);

    const songGain = ctx.createGain();
    songGain.gain.value = this.pendingSongGain;
    songGain.connect(comp);

    // Drums stay dry so the beat keeps its punch, mirroring the Electron app.
    const drumBus = ctx.createGain();
    drumBus.gain.value = 0.9;
    drumBus.connect(comp);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.songGain = songGain;
    this.dry = dry;
    this.wet = wet;
    this.drumBus = drumBus;
    this.noise = noise;
    this.applyReverb();
    return ctx;
  }

  private applyReverb(): void {
    const t = this.ctx!.currentTime;
    // Equal-power crossfade so turning reverb up does not just get louder.
    const a = this.reverbAmount * 0.85;
    this.dry.gain.setTargetAtTime(Math.cos(a * Math.PI * 0.5), t, 0.03);
    this.wet.gain.setTargetAtTime(Math.sin(a * Math.PI * 0.5) * 1.15, t, 0.03);
  }

  private track(src: AudioScheduledSourceNode, stopAt: number): void {
    this.live.add(src);
    src.onended = () => this.live.delete(src);
    src.stop(stopAt);
  }

  private voice(midi: number, t: number, velocity: number, hold: number): void {
    if (this.bank) {
      const picked = pickSample(this.bank, midi);
      if (picked) {
        this.sampleVoice(picked.buffer, picked.rate, t, velocity, hold);
        return;
      }
    }
    this.synthVoice(midi, t, velocity, hold);
  }

  /**
   * A recorded note. Velocity shapes both level and brightness the way a real
   * instrument does: soft notes are quieter and duller, hard notes bite.
   * Sustaining instruments hold for the written length then release; decaying
   * ones (piano, bells, harp) ring on like a held sustain pedal.
   */
  private sampleVoice(buffer: AudioBuffer, rate: number, t: number, velocity: number, hold: number): void {
    const ctx = this.ctx!;
    const ins = this.instrument;
    const vel = Math.min(1, Math.max(0.1, velocity));
    const level = 0.18 + 0.82 * Math.pow(vel, 1.4);
    const sustaining = ins.sustain > 0.05;
    const release = ins.sampleRelease ?? 0.8;
    const holdFor = sustaining ? Math.min(Math.max(hold, 0.15), 6) : Math.max(hold, 0.4) + 1.8;
    const end = Math.min(t + holdFor + release, t + buffer.duration / rate);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = Math.min(ctx.sampleRate / 2 - 200, 2200 + 16000 * Math.pow(vel, 1.6));
    tone.Q.value = 0.3;

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(level, t);
    amp.gain.setValueAtTime(level, t + holdFor);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + holdFor + release);

    src.connect(tone).connect(amp).connect(this.songGain);
    src.start(t);
    this.track(src, end + 0.05);

    // polyphony cap: gently release the oldest voices past the limit
    this.sampleVoices.push({ src, amp, end });
    this.sampleVoices = this.sampleVoices.filter((v) => v.end > ctx.currentTime);
    while (this.sampleVoices.length > MAX_SAMPLE_VOICES) {
      const old = this.sampleVoices.shift()!;
      const now = ctx.currentTime;
      old.amp.gain.cancelScheduledValues(now);
      old.amp.gain.setValueAtTime(old.amp.gain.value, now);
      old.amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      try {
        old.src.stop(now + 0.15);
      } catch {
        // already stopped
      }
    }
  }

  private synthVoice(midi: number, t: number, velocity: number, hold: number): void {
    const ctx = this.ctx!;
    const ins = this.instrument;
    const freq = midiToFreq(midi);
    const vel = Math.min(1, Math.max(0.15, velocity));
    // Sustaining instruments hold for the note's written length, plucky ones ignore it.
    const sustainTime = ins.sustain > 0.05 ? Math.min(Math.max(hold, 0.12), 2.5) : 0;
    const end = t + ins.attack + ins.decay + sustainTime + ins.release;

    // Amplitude envelope (ADSR) on a single gain node for the whole voice.
    const amp = ctx.createGain();
    const peak = ins.gain * (0.35 + 0.65 * vel);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + ins.attack);
    const sustainLevel = Math.max(peak * ins.sustain, 0.0001);
    amp.gain.exponentialRampToValueAtTime(sustainLevel, t + ins.attack + ins.decay);
    if (sustainTime > 0) amp.gain.setValueAtTime(sustainLevel, t + ins.attack + ins.decay + sustainTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    // Tone filter: opens with velocity, falls during the decay.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.6;
    const nyquist = ctx.sampleRate / 2 - 200;
    const open = Math.min(ins.cutoffMax, nyquist, freq * ins.cutoffRatio * (0.6 + 0.4 * vel));
    const closed = Math.max(freq * 1.2, open * (1 - ins.filterDrop), 120);
    filter.frequency.setValueAtTime(Math.max(open, 150), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(closed, 120), t + ins.attack + ins.decay);
    filter.connect(amp).connect(this.songGain);

    // Vibrato: one LFO per voice, eased in, modulating every layer's detune.
    let vibratoDepth: GainNode | null = null;
    if (ins.vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = ins.vibratoRate;
      vibratoDepth = ctx.createGain();
      vibratoDepth.gain.setValueAtTime(0, t);
      vibratoDepth.gain.linearRampToValueAtTime(ins.vibrato, t + 0.35);
      lfo.connect(vibratoDepth);
      lfo.start(t);
      this.track(lfo, end + 0.05);
    }

    for (const layer of ins.layers) {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.value = freq * layer.ratio;
      osc.detune.value = layer.detune;
      vibratoDepth?.connect(osc.detune);
      const level = ctx.createGain();
      level.gain.value = layer.level / Math.sqrt(ins.layers.length);
      osc.connect(level).connect(filter);
      osc.start(t);
      this.track(osc, end + 0.05);
    }

    if (ins.transient > 0) {
      // Hammer / pick: a fast sine two octaves up plus a whisper of noise.
      const click = ctx.createOscillator();
      click.type = "sine";
      click.frequency.value = Math.min(freq * 4, nyquist);
      const clickAmp = ctx.createGain();
      clickAmp.gain.setValueAtTime(0.0001, t);
      clickAmp.gain.exponentialRampToValueAtTime(peak * ins.transient * 0.6, t + 0.002);
      clickAmp.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      click.connect(clickAmp).connect(this.songGain);
      click.start(t);
      this.track(click, t + 0.1);
      this.burst(t, 0.018, "highpass", 3000, peak * ins.transient * 0.35, this.songGain);
    }
  }

  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, peak: number, out: AudioNode, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.002 + dur);
    src.connect(filter).connect(amp).connect(out);
    src.start(t, Math.random() * 0.5);
    this.track(src, t + dur + 0.05);
  }

  /** General MIDI percussion, rendered by family. */
  private drum(gm: number, t: number, velocity: number): void {
    const ctx = this.ctx!;
    const v = 0.4 + 0.6 * Math.min(1, velocity);
    const out = this.drumBus;
    const kick = [35, 36, 41, 43, 45].includes(gm);
    const snare = [37, 38, 40, 47, 48, 50].includes(gm);
    const clap = gm === 39 || gm === 82;
    const openHat = [46, 49, 51, 52, 53, 55, 57, 59].includes(gm);
    if (kick) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(165, t);
      osc.frequency.exponentialRampToValueAtTime(44, t + 0.13);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.95 * v, t + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.connect(amp).connect(out);
      osc.start(t);
      this.track(osc, t + 0.45);
      this.burst(t, 0.012, "highpass", 2000, 0.4 * v, out);
    } else if (snare) {
      this.burst(t, 0.19, "bandpass", 1900, 0.7 * v, out, 0.7);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(225, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.002);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(amp).connect(out);
      osc.start(t);
      this.track(osc, t + 0.15);
    } else if (clap) {
      for (let k = 0; k < 3; k++) this.burst(t + k * 0.011, 0.025, "bandpass", 1200, 0.42 * v, out, 1.2);
      this.burst(t + 0.033, 0.16, "bandpass", 1200, 0.45 * v, out, 1.2);
    } else if (openHat) {
      this.burst(t, 0.32, "highpass", 6500, 0.28 * v, out);
    } else {
      this.burst(t, 0.055, "highpass", 7500, 0.3 * v, out);
    }
  }
}

/** Exponentially decaying stereo noise as a reverb impulse (a "hall" without downloading one). */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // 8 ms pre-delay then a smooth exponential tail.
      const pre = i < rate * 0.008 ? 0 : 1;
      data[i] = pre * (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}
