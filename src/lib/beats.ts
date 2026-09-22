// Generated beats: a drum pattern laid on the song's own bar grid, one per
// genre. The song keeps every note it has; the beat gives it a floor. Pure
// data and math, so it runs on the server, in the browser, and in Node.

/** Every sound the kit can make. The GM drum parts in a file map onto kick, snare, clap and the hats. */
export type DrumKind = "kick" | "kick808" | "snare" | "clap" | "rim" | "hatc" | "hato" | "shaker" | "tamb";

/** What plays under the song: nothing, the file's own drum parts, or a genre id. */
export type BeatChoice = "off" | "file" | string;

export interface Genre {
  id: string;
  label: string;
  hint: string;
  /** the tempo this beat wants, quarter notes per minute */
  bpm: number;
  /** 0..1: every odd 16th is delayed by up to half a step (0.5 ≈ a 62% MPC swing, 0.67 ≈ triplets) */
  swing: number;
  /** 0..1: how loose the timing and levels are */
  human: number;
  /**
   * One string per kit sound, 16 characters per bar: a digit 1..9 is a hit at
   * that level, "." is a rest, "|" is ignored. Lanes of one bar tile against
   * lanes of two. Steps read 1 e + a 2 e + a 3 e + a 4 e + a; swing moves only
   * the "e" and "a" steps, so anything meant to stay straight sits on even steps.
   */
  lanes: Partial<Record<DrumKind, string>>;
}

export interface Hit {
  kind: DrumKind;
  /** 0..1 */
  velocity: number;
}

export interface Pattern {
  /** steps per loop (16 or 32) */
  length: number;
  /** hits per step */
  steps: Hit[][];
}

// Only grooves that can be defended beat by beat are here. A wrong beat is
// worse than no beat, so a genre this kit and this grid cannot do justice
// (anything built on a kendang, triplet shuffles, odd meters) is left out.
export const GENRES: readonly Genre[] = [
  {
    id: "lofi",
    label: "Lo-fi",
    hint: "Dusty boom bap, swung and unhurried.",
    bpm: 78,
    swing: 0.5,
    human: 0.35,
    lanes: {
      // kick on one, the and of two, the and of three; a pickup on the and of four every other bar
      kick: "9.....7...8.....|9.....7...8...6.",
      // two and four, with a ghost a 16th before four that the swing drags late
      snare: "....8......38...",
      hatc: "6.4.6.4.6.4.6.4.",
      // every offbeat 16th, all swung: this is where the lilt lives
      shaker: ".3.3.3.3.3.3.3.3",
    },
  },
  {
    id: "rap",
    label: "Rap",
    hint: "Boom bap: a heavy kick, snare on two and four.",
    bpm: 92,
    swing: 0.15,
    human: 0.3,
    lanes: {
      kick: "9..9....9.9.....|9..9....9....9..",
      snare: "....9.......9...|....9.......9..7",
      hatc: "7.5.7.5.7.5.7.5.",
      hato: "................|..............6.",
    },
  },
  {
    id: "rnb",
    label: "R&B",
    hint: "Smooth and swung: claps over soft snares.",
    bpm: 88,
    swing: 0.3,
    human: 0.3,
    lanes: {
      kick: "9.....7.9.....7.",
      clap: "....8.......8...",
      snare: "....5.......5...",
      hatc: "6.4.6.4.6.4.6.4.",
      rim: ".......4.......4",
      shaker: "...3.......3....",
    },
  },
  {
    id: "pop",
    label: "Pop",
    hint: "Kick on one and three, claps on two and four.",
    bpm: 104,
    swing: 0,
    human: 0.15,
    lanes: {
      kick: "9.....7.9.......|9.....7.9.....7.",
      snare: "....8.......8...",
      clap: "....6.......6...",
      hatc: "6.4.6.4.6.4.6.4.",
      tamb: "..4...4...4...4.",
    },
  },
  {
    id: "rock",
    label: "Rock",
    hint: "Straight eighths, snare on two and four.",
    bpm: 120,
    swing: 0,
    human: 0.15,
    lanes: {
      kick: "9.......8.8.....|9.......8.8..8..",
      snare: "....9.......9...",
      hatc: "8.6.8.6.8.6.8.6.",
      hato: "................|..............6.",
    },
  },
  {
    id: "disco",
    label: "Disco",
    hint: "Four on the floor, the hat opening on every offbeat.",
    bpm: 118,
    swing: 0,
    human: 0.1,
    lanes: {
      kick: "9...9...9...9...",
      snare: "....9.......9...",
      clap: "....6.......6...",
      // closed on the beat, open on the offbeat: the disco hat
      hatc: "6...6...6...6...",
      hato: "..8...8...8...8.",
      tamb: "4.4.4.4.4.4.4.4.",
    },
  },
  {
    id: "house",
    label: "House",
    hint: "A steady kick, open hats off the beat.",
    bpm: 124,
    swing: 0.1,
    human: 0.1,
    lanes: {
      kick: "9...9...9...9...",
      clap: "....8.......8...",
      hato: "..7...7...7...7.",
      shaker: "4.3.4.3.4.3.4.3.",
    },
  },
  {
    id: "edm",
    label: "EDM",
    hint: "Four on the floor with big claps.",
    bpm: 128,
    swing: 0,
    human: 0,
    lanes: {
      kick: "9...9...9...9...",
      clap: "....9.......9...",
      snare: "....6.......6...",
      hato: "..7...7...7...7.",
      hatc: "5.5.5.5.5.5.5.5.",
    },
  },
  {
    id: "eurobeat",
    label: "Eurobeat",
    hint: "Fast and driving: every beat is a kick.",
    bpm: 155,
    swing: 0,
    human: 0,
    lanes: {
      kick: "9...9...9...9...",
      snare: "....9.......9...|....9.......9.77",
      clap: "....6.......6...",
      hato: "..7...7...7...7.",
      hatc: "6.6.6.6.6.6.6.6.",
    },
  },
  {
    id: "trap",
    label: "Trap",
    hint: "Half-time snare, an 808 kick, rolling hats.",
    bpm: 140,
    swing: 0,
    human: 0.15,
    lanes: {
      kick808: "9......8..9.....|9......8..9..8..",
      snare: "........9.......",
      clap: "........7.......",
      hatc: "7.6.7.6.7.6.7777|7.6.7.6.77777.6.",
      hato: "......6.........|..............6.",
      rim: "...........5....|....5.....5.....",
    },
  },
  {
    id: "dnb",
    label: "Drum & bass",
    hint: "Two-step: kick on one and the and of three, snare on two and four.",
    bpm: 174,
    swing: 0,
    human: 0.05,
    lanes: {
      kick: "9.........9.....|9.........9...8.",
      snare: "....9.......9...",
      hatc: "6.4.6.4.6.4.6.4.",
      hato: "..............5.",
      rim: "......4.......4.",
    },
  },
  {
    id: "reggaeton",
    label: "Reggaeton",
    hint: "Dembow: a kick on every beat, the snare on the tresillo.",
    bpm: 95,
    swing: 0,
    human: 0.1,
    lanes: {
      kick: "9...9...9...9...",
      // the a of one, the and of two, the a of three, the and of four
      snare: "...9..8....9..8.",
      rim: "...6..6....6..6.",
      hatc: "7.5.7.5.7.5.7.5.",
    },
  },
  {
    id: "reggae",
    label: "Reggae",
    hint: "One drop: kick and cross-stick land together on three, nothing on one.",
    bpm: 76,
    swing: 0.15,
    human: 0.2,
    lanes: {
      kick: "........9.......",
      rim: "........8.......",
      snare: "........4.......",
      // eighths with the offbeat leaning forward, the way the skank does
      hatc: "4.7.4.7.4.7.4.7.",
    },
  },
  {
    id: "bossa",
    label: "Bossa nova",
    hint: "A soft cross-stick clave over a gentle kick.",
    bpm: 132,
    swing: 0,
    human: 0.2,
    lanes: {
      kick: "9.....7.9.....7.",
      rim: "8..7..7...7..7..",
      hatc: "5.5.5.5.5.5.5.5.",
      shaker: "3.3.3.3.3.3.3.3.",
    },
  },
];

export function genreById(id: string | null | undefined): Genre | null {
  if (!id) return null;
  return GENRES.find((g) => g.id === id) ?? null;
}

const compiled = new Map<string, Pattern>();

/** Lanes into per-step hits. Cached per genre. */
export function compileGenre(genre: Genre): Pattern {
  const hit = compiled.get(genre.id);
  if (hit) return hit;
  const lanes = Object.entries(genre.lanes).map(([kind, text]) => [kind as DrumKind, text.replace(/\|/g, "")] as const);
  const length = Math.max(16, ...lanes.map(([, text]) => text.length));
  const steps: Hit[][] = Array.from({ length }, () => []);
  for (const [kind, text] of lanes) {
    if (!text.length) continue;
    for (let s = 0; s < length; s++) {
      const c = text[s % text.length];
      if (c >= "1" && c <= "9") steps[s].push({ kind, velocity: Number(c) / 9 });
    }
  }
  const pattern = { length, steps };
  compiled.set(genre.id, pattern);
  return pattern;
}

export interface BeatPlan {
  /** pattern quarter notes per song quarter note: 0.5, 1, 2 or 4 */
  rate: number;
  /** the song speed that brings the pattern closest to the genre's tempo, SPEED_DOWN..SPEED_UP */
  speed: number;
}

/** A song will be pushed up to this much faster to meet a genre's tempo... */
export const SPEED_UP = 1.25;
/** ...but held back only this much: a dragged song sounds broken long before a hurried one does. */
export const SPEED_DOWN = 0.9;

/**
 * Lay a genre on a song. The pattern runs at a power of two of the song's
 * tempo, and the song is nudged toward the genre's tempo within the limits
 * above. Each candidate rate is scored by how far the pattern still misses
 * its tempo plus half of how far the song had to move, so the song's own
 * speed is protected. A 66 BPM piece under reggaeton (95) plays both at 82,
 * not the piece at 53 under a double-time pattern; under trap (140) the
 * pattern runs at double time and the piece at 70.
 */
export function planBeat(songBpm: number, genre: Genre): BeatPlan {
  const bpm = songBpm > 0 && Number.isFinite(songBpm) ? songBpm : 120;
  let best: BeatPlan = { rate: 1, speed: 1 };
  let bestCost = Infinity;
  for (const rate of [0.5, 1, 2, 4]) {
    const speed = Math.min(SPEED_UP, Math.max(SPEED_DOWN, genre.bpm / (bpm * rate)));
    const miss = Math.abs(Math.log2((bpm * rate * speed) / genre.bpm));
    const cost = miss + 0.5 * Math.abs(Math.log2(speed));
    if (cost < bestCost) {
      bestCost = cost;
      best = { rate, speed };
    }
  }
  return best;
}

/** The song's written tempo: the median quarter note across its notes. */
export function songBpm(events: readonly { beatSeconds: number }[]): number {
  if (!events.length) return 120;
  const sorted = events.map((e) => e.beatSeconds).sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  return mid > 0 ? 60 / mid : 120;
}
