// Cross-checks the hand-written SMF parser against @tonejs/midi (the library
// the Electron app uses) on real files. Reads MIDI files from the paths given
// on the command line. Run: npm run check:midi -- path/to/song.mid ...
//
// Uses key-board's node_modules for the reference parser so tinybeat itself
// never depends on it.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { buildViews, parseMidi } from "../src/lib/midi.ts";

const require = createRequire("/Users/gilang/ngoding/key-board/package.json");
const { Midi } = require("@tonejs/midi") as typeof import("@tonejs/midi");

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npm run check:midi -- file.mid [...]");
  process.exit(2);
}

let failures = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failures++;
    console.error(`  FAIL ${msg}`);
  }
};

/**
 * Independent mini-walk of the SMF: for every (track, channel) pair that has
 * note-ons, the number of note-ons and the first program change on that pair.
 */
function rawParts(b: Buffer): Map<string, { notes: number; program?: number }> {
  const out = new Map<string, { notes: number; program?: number }>();
  const programs = new Map<string, number>();
  let p = 14;
  const tracks = b.readUInt16BE(10);
  const vlq = () => {
    let v = 0;
    for (;;) {
      const x = b[p++];
      v = v * 128 + (x & 0x7f);
      if (!(x & 0x80)) break;
    }
    return v;
  };
  for (let t = 0; t < tracks && p < b.length; t++) {
    const len = b.readUInt32BE(p + 4);
    p += 8;
    const end = p + len;
    let run = 0;
    while (p < end) {
      vlq();
      let s = b[p++];
      if (s < 0x80) {
        p--;
        s = run;
      } else if (s < 0xf0) run = s;
      if (s === 0xff) {
        p++;
        const l = vlq(); // read first: `p += vlq()` captures p before vlq advances it
        p += l;
      } else if (s === 0xf0 || s === 0xf7) {
        const l = vlq();
        p += l;
      } else {
        const kind = s & 0xf0;
        const key = `${t}:${s & 15}`;
        const d1 = b[p++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++];
        if (kind === 0xc0 && !programs.has(key)) programs.set(key, d1);
        if (kind === 0x90 && d2 > 0) {
          const part = out.get(key) ?? { notes: 0 };
          part.notes++;
          out.set(key, part);
        }
      }
    }
    p = end;
  }
  for (const [key, part] of out) part.program = programs.get(key);
  return out;
}

for (const path of files) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  console.log(`\n${path}`);

  const ours = parseMidi(ab);
  const ref = new Midi(ab);
  const refNotes = ref.tracks
    .flatMap((t, ti) =>
      t.notes.map((n) => ({
        time: n.time,
        ticks: n.ticks,
        midi: n.midi,
        velocity: n.velocity,
        track: ti,
        percussion: !!(t.instrument && t.instrument.percussion) || t.channel === 9,
      })),
    )
    .sort((a, b) => a.time - b.time || a.midi - b.midi);

  check(ours.ppq === ref.header.ppq, `ppq ${ours.ppq} vs ${ref.header.ppq}`);
  check(ours.events.length === refNotes.length, `note count ${ours.events.length} vs ${refNotes.length}`);

  const n = Math.min(ours.events.length, refNotes.length);
  let timeDrift = 0;
  let pitchMismatch = 0;
  for (let i = 0; i < n; i++) {
    timeDrift = Math.max(timeDrift, Math.abs(ours.events[i].time - refNotes[i].time));
    if (ours.events[i].midi !== refNotes[i].midi) pitchMismatch++;
  }
  check(timeDrift < 1e-6, `max onset drift ${timeDrift}s`);
  check(pitchMismatch === 0, `${pitchMismatch} pitch mismatches`);
  // Percussion is compared as a multiset: when notes on different channels
  // share an onset, the two parsers order them differently, but the number of
  // drum notes must agree exactly.
  const oursPerc = ours.events.filter((e) => e.percussion).length;
  const refPerc = refNotes.filter((e) => e.percussion).length;
  check(oursPerc === refPerc, `percussion notes ${oursPerc} vs ${refPerc}`);
  check(Math.abs(ours.duration - ref.duration) < 0.05, `duration ${ours.duration.toFixed(3)} vs ${ref.duration.toFixed(3)}`);

  const views = buildViews(ours.events, ours.ppq);
  check(views.steps.length > 0 && views.beats.length > 0, "views are non-empty");
  check(views.steps.every((s) => s.notes.length > 0), "every step has notes");
  check(views.beats.every((b) => b.notes.length > 0 && b.notes[0].offset === 0), "every beat starts at offset 0");
  check(views.gain >= 0.4 && views.gain <= 2.2, `gain ${views.gain} in range`);
  // timing arrays drive easy mode: same length as their views, strictly increasing
  check(views.stepTimes.length === views.steps.length, "stepTimes matches steps");
  check(views.beatTimes.length === views.beats.length, "beatTimes matches beats");
  check(views.stepTimes.every((x, i) => i === 0 || x > views.stepTimes[i - 1]), "stepTimes increase");
  check(views.beatTimes.every((x, i) => i === 0 || x > views.beatTimes[i - 1]), "beatTimes increase");
  // Parts: every (track, channel) pair with notes becomes one part, so the part
  // count must equal the number of such pairs in the raw file, and the part's
  // program must be the first program change seen on that pair.
  const raw = rawParts(buf);
  check(ours.tracks.length === raw.size, `part count ${ours.tracks.length} vs ${raw.size} (track,channel) pairs in file`);
  const rawPrograms = [...raw.values()].map((r) => r.program ?? null).sort((a, b) => (a ?? -1) - (b ?? -1));
  const ourPrograms = ours.tracks.map((t) => t.program).sort((a, b) => (a ?? -1) - (b ?? -1));
  check(JSON.stringify(rawPrograms) === JSON.stringify(ourPrograms), `part programs ${ourPrograms.join(",")} vs raw ${rawPrograms.join(",")}`);
  const rawNoteTotal = [...raw.values()].reduce((s, r) => s + r.notes, 0);
  check(ours.tracks.reduce((s, t) => s + t.noteCount, 0) === rawNoteTotal, "part note counts sum to the file's note-ons");

  console.log(
    `  ok: ${ours.events.length} notes, ${ours.tracks.length} parts, ppq ${ours.ppq}, ${views.steps.length} steps / ${views.beats.length} beats, name "${ours.name}"`,
  );
  console.log(`  parts: ${ours.tracks.map((t) => `${t.name}${t.percussion ? " [drums]" : ""} (${t.noteCount})`).join(", ")}`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall MIDI checks passed");
