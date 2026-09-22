// The built-in song: J. S. Bach, Prelude in C major (BWV 846), first 19 bars.
// Public domain. Built as a Standard MIDI File in memory so it goes through
// exactly the same parser, views, and engine as a file the player drops in.

import { buildViews, parseMidi, type Beat } from "./midi";
import type { PlayedNote } from "./piano-audio";

export const DEMO_TITLE = "Prelude in C · J. S. Bach";

const BPM = 66;
const PPQ = 480;
const SIXTEENTH = PPQ / 4;

/** [bass, tenor, upper1, upper2, upper3] for each bar, as MIDI note numbers. */
const BARS: number[][] = [
  [60, 64, 67, 72, 76], // C
  [60, 62, 69, 74, 77], // Dm7/C
  [59, 62, 67, 74, 77], // G7/B
  [60, 64, 67, 72, 76], // C
  [60, 64, 69, 76, 81], // Am/C
  [60, 62, 66, 69, 74], // D7/C
  [59, 62, 67, 74, 79], // G/B
  [59, 60, 64, 67, 72], // Cmaj7/B
  [57, 60, 64, 67, 72], // Am7
  [50, 57, 62, 66, 72], // D7
  [55, 59, 62, 67, 71], // G
  [55, 58, 64, 67, 73], // C#dim/G
  [53, 57, 62, 69, 74], // Dm/F
  [53, 56, 62, 65, 71], // Bdim/F
  [52, 55, 60, 67, 72], // C/E
  [52, 53, 57, 60, 65], // F/E
  [50, 53, 57, 60, 65], // Dm7
  [43, 50, 55, 59, 65], // G7
  [48, 52, 55, 60, 64], // C
];

/** Each half bar: bass, tenor, then the three upper notes twice, all in sixteenths. */
const ORDER = [0, 1, 2, 3, 4, 2, 3, 4];
const LENGTH = [8, 7, 1, 1, 1, 1, 1, 1]; // sixteenths held
const VELOCITY = [78, 64, 72, 62, 68, 66, 60, 64]; // a little shape, like a hand would give it

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

let cachedMidi: ArrayBuffer | null = null;

/** The piece as SMF bytes (format 0, one piano track). */
export function demoMidi(): ArrayBuffer {
  if (cachedMidi) return cachedMidi;
  const events: { tick: number; data: number[] }[] = [];
  BARS.forEach((chord, bar) => {
    for (let half = 0; half < 2; half++) {
      const base = (bar * 16 + half * 8) * SIXTEENTH;
      ORDER.forEach((voice, i) => {
        const note = chord[voice];
        const on = base + i * SIXTEENTH;
        events.push({ tick: on, data: [0x90, note, VELOCITY[i]] });
        events.push({ tick: on + LENGTH[i] * SIXTEENTH, data: [0x80, note, 0] });
      });
    }
  });
  // note-offs before note-ons at the same tick, so a repeated pitch retriggers cleanly
  events.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0]);

  const track: number[] = [];
  const name = ascii("Piano");
  track.push(0, 0xff, 0x03, name.length, ...name);
  const us = Math.round(60_000_000 / BPM);
  track.push(0, 0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  track.push(0, 0xc0, 0x00); // program 0: acoustic grand piano
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  track.push(0, 0xff, 0x2f, 0x00);

  const bytes = new Uint8Array([
    ...ascii("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(PPQ),
    ...ascii("MTrk"), ...u32(track.length), ...track,
  ]);
  cachedMidi = bytes.buffer;
  return cachedMidi;
}

export interface AttractStep {
  notes: PlayedNote[];
  /** seconds until the next step */
  gap: number;
}

let cachedAttract: AttractStep[] | null = null;

/** The piece as beats for the scene's silent attract mode. */
export function demoAttract(): AttractStep[] {
  if (cachedAttract) return cachedAttract;
  const parsed = parseMidi(demoMidi());
  const views = buildViews(parsed.events, parsed.ppq);
  const gapAfter = (i: number) =>
    i + 1 < views.beatTimes.length ? views.beatTimes[i + 1] - views.beatTimes[i] : views.beatTimes[1] - views.beatTimes[0];
  cachedAttract = views.beats.map((b: Beat, i) => ({
    notes: b.notes.map((n) => ({ midi: n.midi, percussion: n.percussion, track: n.track, duration: n.duration })),
    gap: gapAfter(i),
  }));
  return cachedAttract;
}
