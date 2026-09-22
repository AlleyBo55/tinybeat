// Prints and sanity-checks the automatic sound choice for real MIDI files.
// Run: npm run check:suggest -- path/to/song.mid ...

import { readFileSync } from "node:fs";
import { INSTRUMENTS } from "../src/lib/instruments.ts";
import { parseMidi } from "../src/lib/midi.ts";
import { suggestSound } from "../src/lib/suggest.ts";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: npm run check:suggest -- file.mid [...]");
  process.exit(2);
}

const ids = new Set(INSTRUMENTS.map((i) => i.id));
let failures = 0;
for (const path of files) {
  const buf = readFileSync(path);
  const parsed = parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  const s = suggestSound(parsed, path.split("/").pop() ?? "");
  const ok = ids.has(s.instrument) && s.reverb >= 0 && s.reverb <= 1;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${(path.split("/").pop() ?? "").padEnd(44)} -> ${s.instrument.padEnd(9)} reverb ${s.reverb.toFixed(2)}  (${s.reason})`);
}
if (failures) process.exit(1);
