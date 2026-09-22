// The pattern model, the musical constants, and the URL encoding.
// Everything here is pure and runs on the server, in the browser, and in Node.

export const STEPS = 16;
export const ROWS = 8;

export const DRUMS = [
  { name: "Kick", short: "KK", color: "var(--color-rose-400)" },
  { name: "Snare", short: "SN", color: "var(--color-amber-400)" },
  { name: "Hat", short: "HH", color: "var(--color-cyan-400)" },
  { name: "Clap", short: "CP", color: "var(--color-fuchsia-400)" },
] as const;
export const DRUM_COUNT = DRUMS.length;

export const KEYS = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;

export const SCALES = [
  { name: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: "Pentatonic", steps: [0, 2, 4, 7, 9] },
  { name: "Minor pentatonic", steps: [0, 3, 5, 7, 10] },
  { name: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: "Blues", steps: [0, 3, 5, 6, 7, 10] },
] as const;

export type OscType = "sine" | "triangle" | "sawtooth" | "square";

export interface Voice {
  name: string;
  type: OscType;
  /** seconds from peak to silence */
  decay: number;
  /** lowpass cutoff in Hz */
  cutoff: number;
  /** peak gain 0..1 */
  gain: number;
  /** octave shift relative to C4 */
  octave: number;
  /** ratio of an extra sine partial, 0 = none */
  partial: number;
}

export const VOICES: readonly Voice[] = [
  { name: "Pluck", type: "triangle", decay: 0.28, cutoff: 3200, gain: 0.5, octave: 0, partial: 0 },
  { name: "Keys", type: "sine", decay: 0.6, cutoff: 2500, gain: 0.55, octave: 0, partial: 2 },
  { name: "Bass", type: "sawtooth", decay: 0.35, cutoff: 700, gain: 0.45, octave: -1, partial: 0 },
  { name: "Bell", type: "sine", decay: 0.9, cutoff: 8000, gain: 0.4, octave: 1, partial: 2.4 },
];

export interface Pattern {
  /** 40..240 */
  bpm: number;
  /** 0..100, percent of maximum offbeat delay */
  swing: number;
  /** 0..11, index into KEYS */
  key: number;
  /** index into SCALES */
  scale: number;
  /** index into VOICES */
  voice: number;
  /** [drum][step] */
  drums: boolean[][];
  /** [step] 0 = rest, 1..ROWS = scale row + 1 (monophonic) */
  melody: number[];
}

export function emptyPattern(): Pattern {
  return {
    bpm: 110,
    swing: 0,
    key: 0,
    scale: 2,
    voice: 0,
    drums: Array.from({ length: DRUM_COUNT }, () => Array<boolean>(STEPS).fill(false)),
    melody: Array<number>(STEPS).fill(0),
  };
}

// ---------- music math ----------

/** Row 0 is the root; rows climb the scale and wrap into the next octave. */
export function degreeToMidi(row: number, key: number, scale: number, octave = 0): number {
  const steps = (SCALES[scale] ?? SCALES[0]).steps;
  const n = steps.length;
  return 60 + key + steps[row % n] + 12 * Math.floor(row / n) + 12 * octave;
}

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export const noteName = (midi: number): string => KEYS[((midi % 12) + 12) % 12];

export const secondsPerStep = (bpm: number): number => 60 / bpm / 4;

/** Swing delays every odd 16th by up to half a step at 100%. */
export function stepTime(base: number, step: number, bpm: number, swing: number): number {
  return base + (step % 2 === 1 ? (swing / 100) * secondsPerStep(bpm) * 0.5 : 0);
}

// ---------- URL encoding (v1) ----------
//
// 20 bytes, base64url, prefixed "v1.":
//   0      bpm - 40
//   1      swing
//   2      key (low nibble) | scale (high nibble)
//   3      voice
//   4..11  drums, 64 bits, bit i = drum (i >> 4), step (i & 15)
//   12..19 melody, 16 nibbles, one per step
//
// The prefix is the contract: once links are shared, v1 must keep decoding
// forever. Add v2 alongside it, never change v1.

const VERSION = "v1";
const BYTES = 20;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n | 0));

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodePattern(p: Pattern): string {
  const out = new Uint8Array(BYTES);
  out[0] = clamp(p.bpm - 40, 0, 200);
  out[1] = clamp(p.swing, 0, 100);
  out[2] = clamp(p.key, 0, 11) | (clamp(p.scale, 0, SCALES.length - 1) << 4);
  out[3] = clamp(p.voice, 0, VOICES.length - 1);
  for (let d = 0; d < DRUM_COUNT; d++) {
    for (let s = 0; s < STEPS; s++) {
      if (p.drums[d]?.[s]) {
        const i = d * STEPS + s;
        out[4 + (i >> 3)] |= 1 << (i & 7);
      }
    }
  }
  for (let s = 0; s < STEPS; s++) {
    // Same rule as the decoder: anything outside 0..ROWS is a rest, not a note.
    const raw = (p.melody[s] ?? 0) | 0;
    const v = raw >= 0 && raw <= ROWS ? raw : 0;
    out[12 + (s >> 1)] |= v << ((s & 1) * 4);
  }
  return `${VERSION}.${toBase64Url(out)}`;
}

/** Accepts "v1.xxx" or "#v1.xxx". Returns null for anything it cannot trust. */
export function decodePattern(hash: string): Pattern | null {
  const text = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!text.startsWith(`${VERSION}.`)) return null;
  const bytes = fromBase64Url(text.slice(VERSION.length + 1));
  if (!bytes || bytes.length !== BYTES) return null;

  const p = emptyPattern();
  p.bpm = clamp(bytes[0] + 40, 40, 240);
  p.swing = clamp(bytes[1], 0, 100);
  p.key = bytes[2] & 15;
  if (p.key > 11) p.key = 0;
  p.scale = bytes[2] >> 4;
  if (p.scale >= SCALES.length) p.scale = 0;
  p.voice = bytes[3];
  if (p.voice >= VOICES.length) p.voice = 0;
  for (let i = 0; i < DRUM_COUNT * STEPS; i++) {
    p.drums[i >> 4][i & 15] = ((bytes[4 + (i >> 3)] >> (i & 7)) & 1) === 1;
  }
  for (let s = 0; s < STEPS; s++) {
    const v = (bytes[12 + (s >> 1)] >> ((s & 1) * 4)) & 15;
    p.melody[s] = v > ROWS ? 0 : v;
  }
  return p;
}

// ---------- presets ----------

const D = (row: string): boolean[] =>
  Array.from(row.padEnd(STEPS, ".").slice(0, STEPS), (c) => c !== ".");

const M = (...v: number[]): number[] => {
  const a = Array<number>(STEPS).fill(0);
  v.slice(0, STEPS).forEach((x, i) => (a[i] = x));
  return a;
};

interface PresetSpec {
  bpm: number;
  swing: number;
  key: number;
  scale: number;
  voice: number;
  drums: [string, string, string, string];
  melody?: number[];
}

const make = (s: PresetSpec): Pattern => ({
  bpm: s.bpm,
  swing: s.swing,
  key: s.key,
  scale: s.scale,
  voice: s.voice,
  drums: s.drums.map(D),
  melody: s.melody ?? Array<number>(STEPS).fill(0),
});

export const PRESETS: readonly { name: string; pattern: Pattern }[] = [
  {
    name: "House",
    pattern: make({
      bpm: 124, swing: 0, key: 0, scale: 2, voice: 0,
      drums: [
        "x...x...x...x...",
        "................",
        "..x...x...x...x.",
        "....x.......x...",
      ],
      melody: M(1, 0, 0, 3, 0, 0, 5, 0, 0, 6, 0, 0, 5, 0, 3, 0),
    }),
  },
  {
    name: "Boom bap",
    pattern: make({
      bpm: 90, swing: 18, key: 9, scale: 3, voice: 1,
      drums: [
        "x......x..x.....",
        "....x.......x...",
        "x.x.x.x.x.x.x.x.",
        "............x...",
      ],
      melody: M(5, 0, 0, 6, 0, 0, 5, 0, 4, 0, 0, 3, 0, 0, 4, 0),
    }),
  },
  {
    name: "Lo-fi",
    pattern: make({
      bpm: 78, swing: 35, key: 2, scale: 1, voice: 1,
      drums: [
        "x..x......x.....",
        "....x.......x...",
        "x.x.x.xxx.x.x.x.",
        "................",
      ],
      melody: M(3, 0, 0, 5, 0, 0, 4, 0, 0, 3, 0, 0, 2, 0, 1, 0),
    }),
  },
  {
    name: "Trap",
    pattern: make({
      bpm: 140, swing: 0, key: 5, scale: 1, voice: 3,
      drums: [
        "x.....x...x.....",
        "........x.......",
        "x.x.x.x.x.x.xxxx",
        "........x.......",
      ],
      melody: M(8, 0, 0, 0, 0, 0, 6, 0, 0, 0, 0, 0, 5, 0, 0, 0),
    }),
  },
  {
    name: "Techno",
    pattern: make({
      bpm: 132, swing: 0, key: 7, scale: 1, voice: 2,
      drums: [
        "x...x...x...x...",
        "................",
        "..x...x...x...x.",
        "....x.......x...",
      ],
      melody: M(1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 3, 0),
    }),
  },
];
