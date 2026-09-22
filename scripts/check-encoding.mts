// Round-trip and edge-case checks for the v1 URL encoding and the timing math.
// Run: npm run check   (Node 22.6+, uses --experimental-strip-types)

import {
  DRUM_COUNT,
  PRESETS,
  ROWS,
  SCALES,
  STEPS,
  VOICES,
  decodePattern,
  degreeToMidi,
  emptyPattern,
  encodePattern,
  secondsPerStep,
  stepTime,
  type Pattern,
} from "../src/lib/pattern.ts";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${message}`);
  }
};

const same = (a: Pattern, b: Pattern) => JSON.stringify(a) === JSON.stringify(b);

// Every preset survives a round trip and produces a short, URL-safe token.
for (const { name, pattern } of PRESETS) {
  const token = encodePattern(pattern);
  check(/^v1\.[A-Za-z0-9_-]+$/.test(token), `${name}: token is base64url`);
  check(token.length <= 32, `${name}: token is short (${token.length} chars)`);
  const back = decodePattern(token);
  check(back !== null && same(back, pattern), `${name}: round trip`);
  check(decodePattern(`#${token}`) !== null, `${name}: leading # accepted`);
}

// Extremes.
const extreme = emptyPattern();
extreme.bpm = 240;
extreme.swing = 100;
extreme.key = 11;
extreme.scale = SCALES.length - 1;
extreme.voice = VOICES.length - 1;
extreme.drums = extreme.drums.map(() => Array<boolean>(STEPS).fill(true));
extreme.melody = Array.from({ length: STEPS }, (_, i) => (i % ROWS) + 1);
check(same(decodePattern(encodePattern(extreme))!, extreme), "extremes round trip");

const low = emptyPattern();
low.bpm = 40;
check(decodePattern(encodePattern(low))!.bpm === 40, "bpm floor");

// Out-of-range input is clamped, never thrown.
const wild = emptyPattern();
wild.bpm = 999;
wild.swing = -5;
wild.melody[0] = 99;
const clamped = decodePattern(encodePattern(wild))!;
check(clamped.bpm === 240 && clamped.swing === 0 && clamped.melody[0] === 0, "out-of-range clamps");

// Garbage is rejected, not thrown.
for (const bad of ["", "#", "v2.AAAA", "v1.", "v1.!!!", "v1.AAAA", "#v1." + "A".repeat(200), "hello"]) {
  let result: Pattern | null = null;
  let threw = false;
  try {
    result = decodePattern(bad);
  } catch {
    threw = true;
  }
  check(!threw && result === null, `rejects ${JSON.stringify(bad)}`);
}

// Drum bits map to the right drum/step and nothing else.
const single = emptyPattern();
single.drums[DRUM_COUNT - 1][STEPS - 1] = true;
const decodedSingle = decodePattern(encodePattern(single))!;
check(
  decodedSingle.drums.flat().filter(Boolean).length === 1 && decodedSingle.drums[DRUM_COUNT - 1][STEPS - 1],
  "single drum bit lands on the right cell",
);

// Scale lock: every row of every scale/key is a member of that scale.
for (let scale = 0; scale < SCALES.length; scale++) {
  const members = new Set(SCALES[scale].steps.map((s) => s % 12));
  for (let key = 0; key < 12; key++) {
    for (let row = 0; row < ROWS; row++) {
      const midi = degreeToMidi(row, key, scale);
      check(members.has((((midi - 60 - key) % 12) + 12) % 12), `row ${row} in key ${key} scale ${scale} is in scale`);
      if (row > 0) check(midi > degreeToMidi(row - 1, key, scale), `rows ascend (${scale}/${key}/${row})`);
    }
  }
}

// Timing: 120 BPM → 0.125 s per 16th; swing shifts odd steps only, by ≤ half a step.
check(Math.abs(secondsPerStep(120) - 0.125) < 1e-12, "seconds per step at 120 BPM");
check(stepTime(10, 0, 120, 100) === 10, "even step never swings");
check(Math.abs(stepTime(10, 1, 120, 100) - 10.0625) < 1e-12, "odd step at 100% swing = +half step");
check(stepTime(10, 1, 120, 0) === 10, "zero swing is straight");

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log(`all checks passed (${PRESETS.length} presets, token ≤ 32 chars)`);
