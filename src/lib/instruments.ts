// The instrument catalogue, mirroring key-board/src/renderer/src/engine/audio.js
// (same ids and labels) so song presets carry across. Each voice is described
// as data; the synth in piano-audio.ts renders it. No samples are downloaded.

export type Wave = "sine" | "triangle" | "sawtooth" | "square";

export interface Layer {
  wave: Wave;
  /** frequency multiplier (1 = fundamental, 2 = octave up, 0.5 = octave down) */
  ratio: number;
  /** cents */
  detune: number;
  /** relative level 0..1 */
  level: number;
}

export interface Instrument {
  id: string;
  label: string;
  /** short poetic hint shown in the UI */
  hint: string;
  layers: Layer[];
  /** amplitude envelope, seconds (sustain is a 0..1 level) */
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** lowpass cutoff as a multiple of the note frequency, clamped to `cutoffMax` Hz */
  cutoffRatio: number;
  cutoffMax: number;
  /** how far the filter falls during the decay, 0..1 (1 = down to the fundamental) */
  filterDrop: number;
  /** optional pitched "hammer/click" transient level 0..1 */
  transient: number;
  /** vibrato depth in cents (0 = none) and rate in Hz */
  vibrato: number;
  vibratoRate: number;
  /** overall level trim */
  gain: number;
  /** visual accent (oklch hue 0..360) used by the 3D scene */
  hue: number;
  /**
   * General MIDI soundfont to sample from (see samples.ts). Instruments that
   * are synthetic by nature have none and always use the synth.
   */
  soundfont?: string;
  /** how long a sampled note keeps ringing after its written end (seconds) */
  sampleRelease?: number;
}

const inst = (i: Omit<Instrument, "vibrato" | "vibratoRate" | "transient"> & Partial<Instrument>): Instrument => ({
  vibrato: 0,
  vibratoRate: 5,
  transient: 0,
  ...i,
});

export const INSTRUMENTS: readonly Instrument[] = [
  inst({
    id: "piano", label: "Grand Piano", hint: "warm, honest, ringing",
    layers: [
      { wave: "triangle", ratio: 1, detune: -3, level: 1 },
      { wave: "triangle", ratio: 1, detune: 3, level: 1 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.35 },
      { wave: "sine", ratio: 3, detune: 0, level: 0.12 },
    ],
    attack: 0.004, decay: 1.6, sustain: 0.0, release: 0.4,
    cutoffRatio: 7, cutoffMax: 9000, filterDrop: 0.75, transient: 0.35, gain: 0.55, hue: 260, soundfont: "acoustic_grand_piano", sampleRelease: 1.6,
  }),
  inst({
    id: "intheend", label: "'In the End' Piano", hint: "sparse, dark, cinematic",
    layers: [
      { wave: "triangle", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.6 },
      { wave: "sine", ratio: 4, detune: 0, level: 0.18 },
    ],
    attack: 0.003, decay: 2.4, sustain: 0.0, release: 0.6,
    cutoffRatio: 5, cutoffMax: 6500, filterDrop: 0.85, transient: 0.45, gain: 0.55, hue: 230, soundfont: "bright_acoustic_piano", sampleRelease: 1.8,
  }),
  inst({
    id: "epiano", label: "Electric Piano", hint: "glassy, soft, tine-like",
    layers: [
      { wave: "sine", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.5 },
      { wave: "sine", ratio: 14, detune: 0, level: 0.05 },
    ],
    attack: 0.003, decay: 1.4, sustain: 0.05, release: 0.35,
    cutoffRatio: 6, cutoffMax: 8000, filterDrop: 0.6, transient: 0.55, gain: 0.6, hue: 195, soundfont: "electric_piano_1", sampleRelease: 1.0,
  }),
  inst({
    id: "pluck", label: "Pluck", hint: "tight, bright, bouncy",
    layers: [
      { wave: "triangle", ratio: 1, detune: 0, level: 1 },
      { wave: "square", ratio: 1, detune: 0, level: 0.25 },
    ],
    attack: 0.002, decay: 0.32, sustain: 0.0, release: 0.15,
    cutoffRatio: 10, cutoffMax: 10000, filterDrop: 0.9, transient: 0.2, gain: 0.5, hue: 45,
  }),
  inst({
    id: "guitar", label: "Clean Guitar", hint: "round, woody, plucked",
    layers: [
      { wave: "triangle", ratio: 1, detune: 0, level: 1 },
      { wave: "sawtooth", ratio: 1, detune: 0, level: 0.22 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.3 },
    ],
    attack: 0.003, decay: 1.1, sustain: 0.0, release: 0.25,
    cutoffRatio: 4.5, cutoffMax: 5200, filterDrop: 0.8, transient: 0.3, gain: 0.5, hue: 30, soundfont: "electric_guitar_clean", sampleRelease: 0.9,
  }),
  inst({
    id: "bass", label: "Synth Bass", hint: "deep, thick, low",
    layers: [
      { wave: "sawtooth", ratio: 0.5, detune: 0, level: 1 },
      { wave: "square", ratio: 0.5, detune: 0, level: 0.5 },
      { wave: "sine", ratio: 0.25, detune: 0, level: 0.6 },
    ],
    attack: 0.005, decay: 0.45, sustain: 0.15, release: 0.2,
    cutoffRatio: 3, cutoffMax: 1400, filterDrop: 0.7, gain: 0.55, hue: 320, soundfont: "synth_bass_1", sampleRelease: 0.25,
  }),
  inst({
    id: "organ", label: "Organ", hint: "held, churchy, drawbars",
    layers: [
      { wave: "sine", ratio: 0.5, detune: 0, level: 0.8 },
      { wave: "sine", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.6 },
      { wave: "sine", ratio: 3, detune: 0, level: 0.35 },
      { wave: "sine", ratio: 4, detune: 0, level: 0.25 },
    ],
    attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.12,
    cutoffRatio: 8, cutoffMax: 7000, filterDrop: 0, vibrato: 6, vibratoRate: 6.5, gain: 0.32, hue: 20, soundfont: "church_organ", sampleRelease: 0.35,
  }),
  inst({
    id: "synth", label: "Synth Lead", hint: "sharp, singing, retro",
    layers: [
      { wave: "sawtooth", ratio: 1, detune: -7, level: 1 },
      { wave: "sawtooth", ratio: 1, detune: 7, level: 1 },
      { wave: "square", ratio: 0.5, detune: 0, level: 0.2 },
    ],
    attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.2,
    cutoffRatio: 5, cutoffMax: 6000, filterDrop: 0.3, vibrato: 8, vibratoRate: 5.5, gain: 0.3, hue: 350, soundfont: "lead_2_sawtooth", sampleRelease: 0.25,
  }),
  inst({
    id: "sawpluck", label: "Saw Pluck", hint: "the Faded sound",
    layers: [
      { wave: "sawtooth", ratio: 1, detune: -6, level: 1 },
      { wave: "sawtooth", ratio: 1, detune: 6, level: 1 },
      { wave: "sawtooth", ratio: 2, detune: 0, level: 0.3 },
    ],
    attack: 0.002, decay: 0.42, sustain: 0.0, release: 0.3,
    cutoffRatio: 9, cutoffMax: 9500, filterDrop: 0.92, transient: 0.1, gain: 0.34, hue: 275,
  }),
  inst({
    id: "pad", label: "Synth Pad", hint: "slow, wide, dreamy",
    layers: [
      { wave: "sawtooth", ratio: 1, detune: -10, level: 0.8 },
      { wave: "sawtooth", ratio: 1, detune: 10, level: 0.8 },
      { wave: "triangle", ratio: 2, detune: 0, level: 0.3 },
      { wave: "sine", ratio: 0.5, detune: 0, level: 0.5 },
    ],
    attack: 0.25, decay: 1.2, sustain: 0.7, release: 1.4,
    cutoffRatio: 3, cutoffMax: 3200, filterDrop: 0.2, vibrato: 4, vibratoRate: 0.8, gain: 0.26, hue: 210, soundfont: "pad_2_warm", sampleRelease: 1.4,
  }),
  inst({
    id: "strings", label: "Strings", hint: "bowed, swelling, lush",
    layers: [
      { wave: "sawtooth", ratio: 1, detune: -5, level: 1 },
      { wave: "sawtooth", ratio: 1, detune: 5, level: 1 },
      { wave: "sawtooth", ratio: 2, detune: 3, level: 0.35 },
    ],
    attack: 0.18, decay: 0.6, sustain: 0.8, release: 0.9,
    cutoffRatio: 4, cutoffMax: 4200, filterDrop: 0.15, vibrato: 7, vibratoRate: 5, gain: 0.26, hue: 15, soundfont: "string_ensemble_1", sampleRelease: 0.9,
  }),
  inst({
    id: "brass", label: "Synth Brass", hint: "bold, brassy, punchy",
    layers: [
      { wave: "sawtooth", ratio: 1, detune: -4, level: 1 },
      { wave: "sawtooth", ratio: 1, detune: 4, level: 1 },
      { wave: "square", ratio: 1, detune: 0, level: 0.3 },
    ],
    attack: 0.04, decay: 0.25, sustain: 0.7, release: 0.18,
    cutoffRatio: 3.5, cutoffMax: 3800, filterDrop: 0.35, gain: 0.3, hue: 60, soundfont: "synth_brass_1", sampleRelease: 0.3,
  }),
  inst({
    id: "musicbox", label: "Music Box", hint: "tiny, tinkling, sweet",
    layers: [
      { wave: "sine", ratio: 2, detune: 0, level: 1 },
      { wave: "sine", ratio: 6, detune: 0, level: 0.25 },
      { wave: "sine", ratio: 10.2, detune: 0, level: 0.08 },
    ],
    attack: 0.002, decay: 1.3, sustain: 0.0, release: 0.5,
    cutoffRatio: 12, cutoffMax: 12000, filterDrop: 0.5, transient: 0.5, gain: 0.45, hue: 330, soundfont: "music_box", sampleRelease: 1.2,
  }),
  inst({
    id: "bells", label: "Bells", hint: "glassy, shimmering, long",
    layers: [
      { wave: "sine", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 2.76, detune: 0, level: 0.5 },
      { wave: "sine", ratio: 5.4, detune: 0, level: 0.2 },
    ],
    attack: 0.002, decay: 2.6, sustain: 0.0, release: 0.8,
    cutoffRatio: 12, cutoffMax: 12000, filterDrop: 0.4, transient: 0.4, gain: 0.42, hue: 180, soundfont: "tubular_bells", sampleRelease: 2.4,
  }),
  inst({
    id: "marimba", label: "Marimba", hint: "wooden, hollow, warm",
    layers: [
      { wave: "sine", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 4, detune: 0, level: 0.3 },
      { wave: "sine", ratio: 9.2, detune: 0, level: 0.08 },
    ],
    attack: 0.002, decay: 0.4, sustain: 0.0, release: 0.15,
    cutoffRatio: 8, cutoffMax: 8000, filterDrop: 0.85, transient: 0.6, gain: 0.5, hue: 40, soundfont: "marimba", sampleRelease: 0.5,
  }),
  inst({
    id: "harp", label: "Harp", hint: "airy, plucked, glistening",
    layers: [
      { wave: "triangle", ratio: 1, detune: 0, level: 1 },
      { wave: "sine", ratio: 2, detune: 0, level: 0.45 },
      { wave: "sine", ratio: 3, detune: 0, level: 0.18 },
    ],
    attack: 0.002, decay: 1.9, sustain: 0.0, release: 0.6,
    cutoffRatio: 7, cutoffMax: 9000, filterDrop: 0.7, transient: 0.25, gain: 0.5, hue: 140, soundfont: "orchestral_harp", sampleRelease: 1.6,
  }),
  inst({
    id: "chip", label: "8-bit", hint: "square waves, arcade",
    layers: [
      { wave: "square", ratio: 1, detune: 0, level: 1 },
      { wave: "square", ratio: 2, detune: 0, level: 0.15 },
    ],
    attack: 0.001, decay: 0.28, sustain: 0.25, release: 0.05,
    cutoffRatio: 20, cutoffMax: 14000, filterDrop: 0, gain: 0.26, hue: 120,
  }),
];

export const instrumentById = (id: string): Instrument =>
  INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];

export type TapMode = "beat" | "note";

/** One-click song presets: same ids and values as the Electron app. */
export const SONG_PRESETS: readonly { id: string; label: string; instrument: string; reverb: number; mode: TapMode }[] = [
  { id: "faded", label: "Faded", instrument: "sawpluck", reverb: 0.42, mode: "beat" },
  { id: "lily", label: "Lily", instrument: "sawpluck", reverb: 0.34, mode: "beat" },
  { id: "intheend", label: "In the End", instrument: "intheend", reverb: 0.3, mode: "beat" },
  { id: "sunflower", label: "Sunflower", instrument: "pluck", reverb: 0.22, mode: "beat" },
  { id: "circles", label: "Circles", instrument: "guitar", reverb: 0.28, mode: "beat" },
];
