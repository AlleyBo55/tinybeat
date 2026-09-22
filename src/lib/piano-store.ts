// The Magic Piano state machine. Every input path (physical keyboard, tapping
// the keys, touch) calls `tap()`, which plays the next notes of the song and
// moves the pointer. Because taps never choose a pitch, no tap is wrong.
//
// Two timing modes:
//   easy  - the song keeps its written tempo on a grid-locked clock. The first
//           tap starts it; taps never move the grid, so it cannot be rushed or
//           dragged. A tap landing just before a note plays that note right
//           then (you feel your hit) without disturbing what follows. Stop
//           tapping and the song pauses at the next note until you tap again.
//   free  - each tap plays the next beat/chord immediately. Timing is yours.
//
// It is a tiny external store: React subscribes with useSyncExternalStore for
// the slow-changing parts (song, options), and the scene subscribes to
// `onTap` / `onPulse` directly so 60 fps visuals never go through React.

import { DEMO_TITLE, demoMidi } from "./demo";
import { SONG_PRESETS, instrumentById, type TapMode } from "./instruments";
import { buildViews, parseMidi, type ParsedMidi, type Views } from "./midi";
import { PianoAudio, type PlayedNote, type SampleState } from "./piano-audio";
import { suggestSound } from "./suggest";

export type Timing = "easy" | "free";

export interface TapEvent {
  /** the notes that just sounded */
  notes: PlayedNote[];
  velocity: number;
  /** pointer after this tap, and the total for the current mode */
  position: number;
  total: number;
  /** wall-clock ms when the notes sound */
  at: number;
  /** whether a player's tap or the easy-mode clock fired it */
  source: "tap" | "clock";
}

/** One upcoming tap, for the falling-note display. */
export interface UpcomingTap {
  /** taps ahead of the pointer: 0 = the very next tap */
  distance: number;
  notes: PlayedNote[];
  /** seconds until this tap fires in easy mode (0 in free mode) */
  eta: number;
}

export interface PianoState {
  song: { parsed: ParsedMidi; fileName: string } | null;
  selectedTracks: ReadonlySet<number>;
  /** hue (0..360) per part index; drums are absent */
  partHues: Readonly<Record<number, number>>;
  tapMode: TapMode;
  timing: Timing;
  /** playback tempo scale in easy mode, 0.5..1.5 */
  speed: number;
  instrument: string;
  reverb: number;
  volume: number;
  /** whether the sound was chosen automatically for this song */
  autoSound: boolean;
  /** whether melodic notes play from recordings, the synth, or are still loading */
  samples: SampleState;
  position: number;
  total: number;
  /** easy mode: true while the song is running under the player's taps */
  rolling: boolean;
  /** false until the first tap after loading; drives the "press any key" hint */
  tapped: boolean;
  error: string | null;
}

type Listener = () => void;
type TapListener = (e: TapEvent) => void;

/** Easy mode: the song pauses when no tap has arrived for this long (seconds)... */
const KEEP_ALIVE = 1.6;
/** ...or for 1.5x the current gap between notes, whichever is longer, so long rests do not pause it. */
const KEEP_ALIVE_GAPS = 1.5;
/** The clock wakes this early and schedules the sound on the audio clock for the exact grid time. */
const LOOKAHEAD_MS = 30;
/** A tap this close before the next note plays it now (ms, also capped at 30% of the gap). */
const SNAP_MS = 120;

export class PianoStore {
  readonly audio = new PianoAudio();

  private state: PianoState = {
    song: null,
    selectedTracks: new Set(),
    partHues: {},
    tapMode: "beat",
    timing: "easy",
    speed: 1,
    instrument: "piano",
    reverb: 0.3,
    volume: 1,
    autoSound: true,
    samples: "synth",
    position: 0,
    total: 0,
    rolling: false,
    tapped: false,
    error: null,
  };
  private views: Views | null = null;
  private listeners = new Set<Listener>();
  private tapListeners = new Set<TapListener>();
  private pulseListeners = new Set<Listener>();
  private lastTap = 0;
  private lastBeatTap = 0;

  // easy-mode clock (performance.now() ms)
  private timer: ReturnType<typeof setTimeout> | null = null;
  private due = 0; // grid time of the step at the pointer
  private gapMs = 500; // grid gap from the last fired step to `due`
  private lastArm = 0; // last tap, for keep-alive

  constructor() {
    this.audio.onSamples((samples) => this.set({ samples }));
  }

  // ---------- subscriptions ----------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): PianoState => this.state;

  onTap(fn: TapListener): () => void {
    this.tapListeners.add(fn);
    return () => {
      this.tapListeners.delete(fn);
    };
  }

  /** Fires for a tap that was absorbed (easy mode, between notes): feedback without sound. */
  onPulse(fn: Listener): () => void {
    this.pulseListeners.add(fn);
    return () => {
      this.pulseListeners.delete(fn);
    };
  }

  private set(partial: Partial<PianoState>): void {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn();
  }

  // ---------- song ----------

  async loadFile(file: File): Promise<void> {
    try {
      const parsed = parseMidi(await file.arrayBuffer());
      this.applySong(parsed, file.name.replace(/\.midi?$/i, ""));
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : "Could not read that file." });
    }
  }

  /** The built-in piece, ready instantly. Same path as a dropped file. */
  loadDemo(): void {
    this.applySong(parseMidi(demoMidi()), DEMO_TITLE);
  }

  private applySong(parsed: ParsedMidi, fileName: string): void {
    if (!parsed.events.length) throw new Error("That file has no notes in it.");
    this.stopClock();
    this.audio.silence();
    const melodic = parsed.tracks.filter((t) => !t.percussion).map((t) => t.index);
    const selectedTracks = new Set(melodic.length ? melodic : parsed.tracks.map((t) => t.index));
    this.set({ song: { parsed, fileName }, selectedTracks, error: null, tapped: false });
    if (this.state.autoSound) {
      const s = suggestSound(parsed, fileName);
      this.audio.setInstrument(s.instrument);
      this.audio.setReverb(s.reverb);
      this.set({ instrument: s.instrument, reverb: s.reverb });
    } else {
      this.audio.setInstrument(this.state.instrument); // starts the sample load if needed
    }
    this.set({ partHues: this.computeHues() });
    this.rebuild();
  }

  /** Unload the song and return to the empty state. Sound options are kept. */
  eject(): void {
    this.stopClock();
    this.audio.silence();
    this.views = null;
    this.set({ song: null, selectedTracks: new Set(), partHues: {}, position: 0, total: 0, rolling: false, tapped: false, error: null });
  }

  setTrack(index: number, on: boolean): void {
    const next = new Set(this.state.selectedTracks);
    if (on) next.add(index);
    else next.delete(index);
    if (next.size === 0) return; // a song with no parts has nothing to play
    this.set({ selectedTracks: next });
    this.rebuild();
  }

  toggleTrack(index: number): void {
    this.setTrack(index, !this.state.selectedTracks.has(index));
  }

  selectAllTracks(): void {
    const song = this.state.song;
    if (!song) return;
    this.set({ selectedTracks: new Set(song.parsed.tracks.map((t) => t.index)) });
    this.rebuild();
  }

  /** The default selection: every non-drum part. */
  selectMelodicTracks(): void {
    const song = this.state.song;
    if (!song) return;
    const melodic = song.parsed.tracks.filter((t) => !t.percussion).map((t) => t.index);
    this.set({ selectedTracks: new Set(melodic.length ? melodic : song.parsed.tracks.map((t) => t.index)) });
    this.rebuild();
  }

  setTapMode(tapMode: TapMode): void {
    if (tapMode === this.state.tapMode) return;
    this.set({ tapMode });
    this.rewind();
  }

  setTiming(timing: Timing): void {
    if (timing === this.state.timing) return;
    this.stopClock();
    this.set({ timing });
    this.rewind();
  }

  setSpeed(speed: number): void {
    this.set({ speed: Math.min(1.5, Math.max(0.5, speed)) });
  }

  rewind(): void {
    this.stopClock();
    this.lastBeatTap = 0;
    this.audio.silence();
    this.set({ position: 0, total: this.totalFor(this.state.tapMode), rolling: false });
  }

  private rebuild(): void {
    const { song, selectedTracks } = this.state;
    if (!song) return;
    const events = song.parsed.events.filter((e) => selectedTracks.has(e.track));
    this.views = buildViews(events, song.parsed.ppq);
    this.audio.setSongGain(this.views.gain);
    this.rewind();
  }

  private totalFor(mode: TapMode): number {
    if (!this.views) return 0;
    return mode === "beat" ? this.views.beats.length : this.views.steps.length;
  }

  /** Seconds between step `i` and step `i+1` at the song's written tempo (scaled by speed). */
  private gapAfter(i: number): number {
    const v = this.views!;
    const times = this.state.tapMode === "beat" ? v.beatTimes : v.stepTimes;
    const total = times.length;
    if (total < 2) return 0.5;
    const next = (i + 1) % total;
    const raw = next === 0 ? times[1] - times[0] : times[next] - times[i];
    return Math.min(Math.max(raw, 0.05), 3) / this.state.speed;
  }

  /** Whether the easy-mode clock is currently driving the song. */
  get rolling(): boolean {
    return this.state.rolling;
  }

  /** The next `count` taps from the pointer, wrapping at the end of the song. */
  upcoming(count: number): UpcomingTap[] {
    const views = this.views;
    const total = this.state.total;
    if (!views || total === 0) return [];
    const out: UpcomingTap[] = [];
    const easy = this.state.timing === "easy";
    // Easy mode always lays notes out on the real time grid. When rolling the
    // first one is `due` away; when paused it rests on the hit line.
    let eta = easy && this.state.rolling ? Math.max(0, (this.due - performance.now()) / 1000) : 0;
    for (let d = 0; d < Math.min(count, total); d++) {
      const i = (this.state.position + d) % total;
      const notes = this.state.tapMode === "beat" ? views.beats[i].notes : views.steps[i].notes;
      out.push({ distance: d, notes, eta });
      eta = easy ? eta + this.gapAfter(i) : 0;
    }
    return out;
  }

  // ---------- colours ----------

  /**
   * One hue per melodic part. The busiest part takes the instrument's hue;
   * the rest step around the wheel by the golden angle so neighbours contrast.
   */
  private computeHues(): Record<number, number> {
    const song = this.state.song;
    if (!song) return {};
    const base = instrumentById(this.state.instrument).hue;
    const parts = song.parsed.tracks.filter((t) => !t.percussion).sort((a, b) => b.noteCount - a.noteCount);
    const hues: Record<number, number> = {};
    parts.forEach((t, i) => {
      hues[t.index] = (base + i * 137.5) % 360;
    });
    return hues;
  }

  hueForTrack(track: number | undefined): number {
    if (track !== undefined && track in this.state.partHues) return this.state.partHues[track];
    return instrumentById(this.state.instrument).hue;
  }

  // ---------- sound options ----------

  setInstrument(instrument: string): void {
    this.audio.setInstrument(instrument);
    this.set({ instrument, autoSound: false });
    this.set({ partHues: this.computeHues() });
  }

  setReverb(reverb: number): void {
    this.audio.setReverb(reverb);
    this.set({ reverb, autoSound: false });
  }

  setVolume(volume: number): void {
    this.audio.setVolume(volume);
    this.set({ volume });
  }

  setAutoSound(on: boolean): void {
    this.set({ autoSound: on });
    const song = this.state.song;
    if (on && song) {
      const s = suggestSound(song.parsed, song.fileName);
      this.audio.setInstrument(s.instrument);
      this.audio.setReverb(s.reverb);
      this.set({ instrument: s.instrument, reverb: s.reverb, partHues: this.computeHues() });
    }
  }

  applyPreset(id: string): void {
    const p = SONG_PRESETS.find((x) => x.id === id);
    if (!p) return;
    this.audio.setInstrument(p.instrument);
    this.audio.setReverb(p.reverb);
    this.set({ instrument: p.instrument, reverb: p.reverb, autoSound: false, partHues: this.computeHues() });
    this.setTapMode(p.mode);
  }

  // ---------- the one thing every input does ----------

  tap(): void {
    if (!this.views || this.state.total === 0) return;
    const now = performance.now();
    if (now - this.lastTap < 28) return; // debounce accidental double fire
    this.lastTap = now;
    void this.audio.unlock();
    if (!this.state.tapped) this.set({ tapped: true });

    if (this.state.timing === "free") {
      this.fire(now, 0, "tap");
      return;
    }

    this.lastArm = now;
    if (!this.state.rolling) {
      // first tap (or resuming from a pause): play now, anchor the grid here
      this.fire(now, 0, "tap");
      this.set({ rolling: true });
      this.schedule();
      return;
    }
    // Rolling. A tap just before the next note plays it now; the grid time of
    // everything after is untouched, so the tempo cannot drift. Any other tap
    // only keeps the song alive and gets a visual pulse.
    const remaining = this.due - now;
    if (remaining <= Math.min(SNAP_MS, this.gapMs * 0.3)) {
      this.fire(now, 0, "tap");
      this.schedule();
    } else {
      for (const fn of this.pulseListeners) fn();
    }
  }

  /**
   * Play the step at the pointer `delayMs` from now and advance the pointer.
   * Also moves the grid: `due` becomes the grid time of the following step.
   */
  private fire(now: number, delayMs: number, source: TapEvent["source"]): void {
    const views = this.views!;
    const total = this.state.total;
    const index = this.state.position;
    const easy = this.state.timing === "easy";
    let notes: PlayedNote[];
    let velocity: number;

    if (this.state.tapMode === "beat") {
      const beat = views.beats[index];
      // Notes inside the beat keep their written rhythm: offsets are fractions
      // of the real beat length. In free mode that length follows the player's
      // own tapping speed instead.
      let beatSeconds = beat.beatSeconds / this.state.speed;
      if (!easy) {
        beatSeconds = this.lastBeatTap ? Math.min(Math.max((now - this.lastBeatTap) / 1000, 0.15), 1.5) : 0.5;
      }
      this.lastBeatTap = now;
      velocity = beat.notes.reduce((m, n) => Math.max(m, n.velocity), 0) || 0.8;
      this.audio.play(
        beat.notes,
        velocity,
        beat.notes.map((n) => n.offset * beatSeconds),
        beat.notes.map((n) => n.duration / this.state.speed),
        delayMs / 1000,
      );
      notes = beat.notes;
    } else {
      const step = views.steps[index];
      velocity = step.velocity;
      this.audio.play(step.notes, velocity, undefined, undefined, delayMs / 1000);
      notes = step.notes;
    }

    const soundsAt = now + delayMs;
    const gap = this.gapAfter(index) * 1000;
    // grid-locked: the next step is exactly one gap after this one *should* have sounded
    this.due = (source === "clock" ? this.due : soundsAt) + gap;
    this.gapMs = gap;
    const position = (index + 1) % total;
    this.set({ position });
    const event: TapEvent = { notes, velocity, position, total, at: soundsAt, source };
    for (const fn of this.tapListeners) fn(event);
  }

  // ---------- easy-mode clock ----------

  private schedule(): void {
    this.stopClock();
    const wait = Math.max(0, this.due - performance.now() - LOOKAHEAD_MS);
    this.timer = setTimeout(() => this.tick(), wait);
  }

  private tick(): void {
    this.timer = null;
    if (!this.state.rolling || !this.views) return;
    const now = performance.now();
    const keepAlive = Math.max(KEEP_ALIVE * 1000, this.gapMs * KEEP_ALIVE_GAPS);
    if (now - this.lastArm > keepAlive) {
      // the player stopped tapping: pause here, resume on the next tap
      this.set({ rolling: false });
      return;
    }
    if (this.state.position === 0 && this.state.total > 0) {
      // reached the end: stop rolling so the song does not loop on its own
      this.set({ rolling: false });
      return;
    }
    // schedule the sound for the exact grid time, even though we woke early
    this.fire(now, Math.max(0, this.due - now), "clock");
    this.schedule();
  }

  private stopClock(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
