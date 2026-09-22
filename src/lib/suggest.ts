// Picks an instrument and reverb amount that suit a MIDI file, from what the
// file itself says: the General MIDI programs on its melodic tracks, its tempo,
// how dense the notes are, and how high they sit. Known songs match by name.

import { SONG_PRESETS } from "./instruments";
import type { ParsedMidi } from "./midi";

export interface SoundSuggestion {
  instrument: string;
  reverb: number;
  /** why, for the UI */
  reason: string;
}

/** General MIDI program (0-based) -> our instrument id. */
function instrumentForProgram(program: number): string | null {
  if (program <= 3) return "piano"; // acoustic pianos
  if (program <= 5) return "epiano"; // electric pianos
  if (program <= 7) return "piano"; // harpsichord, clavinet
  if (program <= 15) return program === 14 ? "bells" : "marimba"; // celesta, glockenspiel, music box, vibes, marimba, xylophone, tubular bells, dulcimer
  if (program === 10) return "musicbox";
  if (program <= 23) return "organ";
  if (program <= 31) return "guitar";
  if (program <= 39) return "bass";
  if (program <= 47) return "strings"; // violin, viola, cello, contrabass, tremolo, pizzicato, harp, timpani
  if (program === 46) return "harp";
  if (program <= 55) return "strings"; // ensembles, choirs
  if (program <= 63) return "brass";
  if (program <= 79) return "synth"; // reeds, pipes
  if (program <= 87) return "synth"; // synth leads
  if (program <= 95) return "pad"; // synth pads
  if (program <= 103) return "pad"; // synth fx
  return "pluck"; // ethnic, percussive, sfx
}

export function suggestSound(parsed: ParsedMidi, fileName = ""): SoundSuggestion {
  const name = `${parsed.name} ${fileName}`.toLowerCase();

  // 1. A song we know
  for (const p of SONG_PRESETS) {
    if (name.includes(p.id) || name.includes(p.label.toLowerCase())) {
      return { instrument: p.instrument, reverb: p.reverb, reason: `matched "${p.label}"` };
    }
  }

  const melodic = parsed.events.filter((e) => !e.percussion);
  if (!melodic.length) return { instrument: "piano", reverb: 0.3, reason: "default" };

  // 2. The programs the file asks for. Each track is weighted by its note count
  //    and by how high it sits: the melody is what the player hears as "the
  //    song", and a busy bass line must not win just by having more notes.
  const weight = new Map<string, number>();
  let programNotes = 0;
  for (const t of parsed.tracks) {
    if (t.percussion || t.program == null) continue;
    const id = instrumentForProgram(t.program);
    if (!id) continue;
    const trackNotes = parsed.events.filter((e) => e.track === t.index);
    const pitch = trackNotes.reduce((s, e) => s + e.midi, 0) / Math.max(1, trackNotes.length);
    const register = Math.min(2, Math.max(0.25, (pitch - 40) / 20)); // ~0.25 for deep bass, ~2 for high melody
    weight.set(id, (weight.get(id) ?? 0) + t.noteCount * register);
    programNotes += t.noteCount;
  }

  // 3. Character of the music
  const duration = Math.max(parsed.duration, 1);
  const density = melodic.length / duration; // notes per second
  const avgPitch = melodic.reduce((s, e) => s + e.midi, 0) / melodic.length;
  const avgDuration = melodic.reduce((s, e) => s + e.duration, 0) / melodic.length;
  const slow = density < 3 && avgDuration > 0.45;
  const fast = density > 9;

  // reverb: slow, sparse music breathes with more; fast music needs less
  let reverb = slow ? 0.42 : fast ? 0.18 : 0.28;

  if (programNotes > melodic.length * 0.5 && weight.size) {
    const [instrument] = [...weight.entries()].sort((a, b) => b[1] - a[1])[0];
    // a "piano" program with slow, sparse notes sounds better as the cinematic piano
    if (instrument === "piano" && slow && avgPitch < 66) {
      return { instrument: "intheend", reverb: Math.max(reverb, 0.36), reason: "slow piano piece" };
    }
    if (instrument === "pad" || instrument === "strings") reverb = Math.max(reverb, 0.38);
    return { instrument, reverb, reason: "from the file's instrument" };
  }

  // 4. No usable program info: infer from the notes
  if (slow) return { instrument: avgPitch > 70 ? "musicbox" : "intheend", reverb: 0.42, reason: "slow and sparse" };
  if (fast && avgPitch > 68) return { instrument: "pluck", reverb: 0.2, reason: "fast and bright" };
  if (avgPitch < 55) return { instrument: "epiano", reverb: 0.3, reason: "low register" };
  return { instrument: "piano", reverb, reason: "default piano" };
}
