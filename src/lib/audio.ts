// Web Audio engine: a lookahead scheduler driven by a Worker timer (so it keeps
// time in background tabs) and fully synthesized drums (no sample downloads).

import {
  DRUM_COUNT,
  STEPS,
  VOICES,
  degreeToMidi,
  midiToFreq,
  secondsPerStep,
  stepTime,
  type Pattern,
} from "./pattern";

/** Seconds of audio scheduled ahead of the clock. */
const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const WORKER_SRC = `let t=null;onmessage=e=>{if(e.data==='start'){if(t===null)t=setInterval(()=>postMessage(0),${TICK_MS})}else{clearInterval(t);t=null}}`;

type Listener = (step: number) => void;

/** Map a General MIDI percussion note to the nearest of our four drums. */
function drumForGm(midi: number): number {
  if (midi === 39 || midi === 82) return 3; // hand clap, shaker
  if (midi === 35 || midi === 36 || midi === 41 || midi === 43 || midi === 45) return 0; // kicks, low toms
  if (midi === 38 || midi === 40 || midi === 37 || midi === 47 || midi === 48 || midi === 50) return 1; // snares, stick, mid/high toms
  return 2; // hats, cymbals, everything else
}

export class Engine {
  playing = false;

  private pattern: Pattern;
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private noise!: AudioBuffer;
  private worker: Worker | null = null;
  private step = 0;
  private nextTime = 0;
  private queue: { step: number; at: number }[] = [];
  private live = new Set<AudioScheduledSourceNode>();
  private listeners = new Set<Listener>();
  private raf = 0;

  constructor(pattern: Pattern) {
    this.pattern = pattern;
  }

  /** The scheduler reads the pattern at schedule time, so edits are heard live. */
  setPattern(pattern: Pattern): void {
    this.pattern = pattern;
  }

  /** Called with the step that just became audible, or -1 on stop. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  async start(): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
    this.playing = true;
    this.step = 0;
    this.queue = [];
    this.nextTime = ctx.currentTime + 0.06;
    this.schedule();
    this.timer().postMessage("start");
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.playing = false;
    this.worker?.postMessage("stop");
    cancelAnimationFrame(this.raf);
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // already ended
      }
    }
    this.live.clear();
    this.queue = [];
    this.emit(-1);
  }

  previewDrum(drum: number): void {
    const ctx = this.context();
    this.resume();
    this.drum(drum, ctx.currentTime + 0.01);
  }

  previewNote(row: number): void {
    const ctx = this.context();
    this.resume();
    this.note(row, ctx.currentTime + 0.01);
  }

  /** Warm up the context from a user gesture so the first tap is not late. */
  async unlock(): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
  }

  /**
   * Magic Piano: play one song step now. Pitched notes get the piano voice,
   * percussion notes are routed to the closest synthesized drum. `gain` is the
   * per-song loudness normalisation from buildViews. Optional `offsets` (in
   * seconds) stagger notes inside a beat for per-beat mode.
   */
  playSongNotes(
    notes: readonly { midi: number; percussion: boolean }[],
    velocity: number,
    gain: number,
    offsets?: readonly number[],
  ): void {
    const ctx = this.context();
    this.resume();
    const base = ctx.currentTime + 0.005;
    const level = Math.min(velocity * gain, 1.2);
    notes.forEach((n, i) => {
      const at = base + (offsets?.[i] ?? 0);
      if (n.percussion) this.drum(drumForGm(n.midi), at);
      else this.piano(n.midi, at, level);
    });
  }

  // ---------- clock ----------

  private timer(): Worker {
    if (!this.worker) {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
      this.worker = new Worker(url);
      this.worker.onmessage = () => this.schedule();
    }
    return this.worker;
  }

  private schedule(): void {
    if (!this.playing || !this.ctx) return;
    const p = this.pattern;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      const at = stepTime(this.nextTime, this.step, p.bpm, p.swing);
      this.queue.push({ step: this.step, at });
      for (let d = 0; d < DRUM_COUNT; d++) {
        if (p.drums[d][this.step]) this.drum(d, at);
      }
      const m = p.melody[this.step];
      if (m > 0) this.note(m - 1, at);
      this.nextTime += secondsPerStep(p.bpm);
      this.step = (this.step + 1) % STEPS;
    }
  }

  private frame = (): void => {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    let latest: number | undefined;
    while (this.queue.length && this.queue[0].at <= now) latest = this.queue.shift()!.step;
    if (latest !== undefined) this.emit(latest);
    if (this.playing) this.raf = requestAnimationFrame(this.frame);
  };

  private emit(step: number): void {
    for (const fn of this.listeners) fn(step);
  }

  // ---------- graph ----------

  private context(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(comp).connect(ctx.destination);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.out = out;
    this.noise = noise;
    this.ctx = ctx;
    return ctx;
  }

  private resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private track(src: AudioScheduledSourceNode, stopAt: number): void {
    this.live.add(src);
    src.onended = () => this.live.delete(src);
    src.stop(stopAt);
  }

  private env(t: number, peak: number, decay: number, attack = 0.002): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private burst(t: number, dur: number, type: BiquadFilterType, freq: number, peak: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter).connect(this.env(t, peak, dur)).connect(this.out);
    src.start(t, Math.random() * 0.5);
    this.track(src, t + dur + 0.05);
  }

  private drum(drum: number, t: number): void {
    const ctx = this.ctx!;
    switch (drum) {
      case 0: {
        // kick: pitched sine sweep plus a tiny click
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(170, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        osc.connect(this.env(t, 1, 0.38)).connect(this.out);
        osc.start(t);
        this.track(osc, t + 0.45);
        this.burst(t, 0.012, "highpass", 2000, 0.5);
        break;
      }
      case 1: {
        // snare: filtered noise plus a short tonal body
        this.burst(t, 0.2, "bandpass", 1900, 0.75, 0.7);
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(230, t);
        osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
        osc.connect(this.env(t, 0.6, 0.11)).connect(this.out);
        osc.start(t);
        this.track(osc, t + 0.15);
        break;
      }
      case 2:
        // closed hat
        this.burst(t, 0.055, "highpass", 7500, 0.32);
        break;
      case 3: {
        // clap: three fast bursts then a tail
        for (let k = 0; k < 3; k++) this.burst(t + k * 0.011, 0.025, "bandpass", 1200, 0.45, 1.2);
        this.burst(t + 0.033, 0.16, "bandpass", 1200, 0.5, 1.2);
        break;
      }
    }
  }

  /**
   * Piano-ish voice: two detuned triangles through a lowpass whose cutoff
   * follows pitch, plus a soft attack transient. Polyphony is free because
   * every note is its own short-lived node chain.
   */
  private piano(midi: number, t: number, level: number): void {
    const ctx = this.ctx!;
    const freq = midiToFreq(midi);
    const decay = Math.min(2.2, Math.max(0.5, 3.4 - midi / 40)); // low notes ring longer
    const peak = Math.max(0.05, Math.min(0.6, 0.22 + level * 0.3));

    const body = this.env(t, peak, decay, 0.006);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(Math.min(freq * 6 + 800, 11_000), t);
    lowpass.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 300), t + decay);
    lowpass.Q.value = 0.5;
    lowpass.connect(body).connect(this.out);

    for (const detune of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(lowpass);
      osc.start(t);
      this.track(osc, t + decay + 0.05);
    }

    // hammer: a short sine an octave up
    const hammer = ctx.createOscillator();
    hammer.type = "sine";
    hammer.frequency.value = freq * 2;
    hammer.connect(this.env(t, peak * 0.35, 0.09, 0.002)).connect(this.out);
    hammer.start(t);
    this.track(hammer, t + 0.15);
  }

  private note(row: number, t: number): void {
    const ctx = this.ctx!;
    const p = this.pattern;
    const v = VOICES[p.voice] ?? VOICES[0];
    const freq = midiToFreq(degreeToMidi(row, p.key, p.scale, v.octave));

    const osc = ctx.createOscillator();
    osc.type = v.type;
    osc.frequency.value = freq;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = Math.min(v.cutoff, ctx.sampleRate / 2 - 100);
    lowpass.Q.value = 0.7;
    osc.connect(lowpass).connect(this.env(t, v.gain, v.decay, 0.004)).connect(this.out);
    osc.start(t);
    this.track(osc, t + v.decay + 0.05);

    if (v.partial > 0) {
      const partial = ctx.createOscillator();
      partial.type = "sine";
      partial.frequency.value = freq * v.partial;
      partial.connect(this.env(t, v.gain * 0.3, v.decay * 0.6, 0.004)).connect(this.out);
      partial.start(t);
      this.track(partial, t + v.decay);
    }
  }
}
