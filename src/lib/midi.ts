// Standard MIDI File parser plus the Magic Piano "views" (steps and beats).
// Hand-written so the page does not ship a MIDI library: SMF is a small format
// and we only need note on/off, tempo, and program/channel to spot drums.
//
// The view builders mirror key-board/src/renderer/src/engine/midi.js exactly,
// so a song feels the same here as in the Electron app.

export interface NoteEvent {
  /** seconds */
  time: number;
  ticks: number;
  midi: number;
  /** 0..1 */
  velocity: number;
  /** seconds */
  duration: number;
  track: number;
  percussion: boolean;
  /** seconds per quarter note at this position (the tempo in force) */
  beatSeconds: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  noteCount: number;
  percussion: boolean;
  /** first General MIDI program change on the track, 0-based, if any */
  program: number | null;
}

export interface ParsedMidi {
  events: NoteEvent[];
  tracks: TrackInfo[];
  ppq: number;
  name: string;
  duration: number;
}

export interface StepNote {
  midi: number;
  percussion: boolean;
  /** the part this note belongs to (index into ParsedMidi.tracks) */
  track: number;
  /** seconds, when known (beat notes carry it, chord steps do not) */
  duration?: number;
}

/** One tap in per-note mode: every note that starts within the chord window. */
export interface Step {
  notes: StepNote[];
  velocity: number;
}

export interface BeatNote extends StepNote {
  /** fraction of a beat after the first note of this beat */
  offset: number;
  duration: number;
  velocity: number;
}

/** One tap in per-beat mode: every note whose onset falls inside one quarter note. */
export interface Beat {
  notes: BeatNote[];
  /** real length of this beat in seconds, so offsets inside it keep their rhythm */
  beatSeconds: number;
}

export interface Views {
  steps: Step[];
  beats: Beat[];
  /** onset time (seconds) of each step / beat at the written tempo */
  stepTimes: number[];
  beatTimes: number[];
  gain: number;
}

const CHORD_WINDOW = 0.035;

// ---------- SMF parsing ----------

class Reader {
  pos = 0;
  private readonly view: DataView;
  constructor(view: DataView) {
    this.view = view;
  }
  get eof(): boolean {
    return this.pos >= this.view.byteLength;
  }
  u8(): number {
    return this.view.getUint8(this.pos++);
  }
  u16(): number {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  ascii(n: number): string {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  /**
   * Variable-length quantity. The spec caps values at 4 bytes, but files in
   * the wild pad with redundant 0x80 bytes, so read until the continuation
   * bit clears (bounded by the buffer) instead of by byte count.
   */
  vlq(): number {
    let v = 0;
    for (let i = 0; i < 8 && !this.eof; i++) {
      const b = this.u8();
      v = v * 128 + (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return v;
  }
  slice(n: number): Reader {
    const r = new Reader(new DataView(this.view.buffer, this.view.byteOffset + this.pos, n));
    this.pos += n;
    return r;
  }
}

interface TempoChange {
  ticks: number;
  /** microseconds per quarter note */
  usPerQuarter: number;
}

interface RawNote {
  ticks: number;
  endTicks: number;
  midi: number;
  velocity: number;
  channel: number;
  track: number;
}

const DRUM_PROGRAMS_START = 112; // GM "Percussive" and "Sound effects" families

/** General MIDI level 1 program names, 0-based, used to label parts. */
const GM_NAMES: string[] = (
  "Piano,Bright Piano,Electric Grand,Honky-tonk,Electric Piano,Electric Piano 2,Harpsichord,Clavinet," +
  "Celesta,Glockenspiel,Music Box,Vibraphone,Marimba,Xylophone,Tubular Bells,Dulcimer," +
  "Drawbar Organ,Percussive Organ,Rock Organ,Church Organ,Reed Organ,Accordion,Harmonica,Tango Accordion," +
  "Nylon Guitar,Steel Guitar,Jazz Guitar,Clean Guitar,Muted Guitar,Overdriven Guitar,Distortion Guitar,Guitar Harmonics," +
  "Acoustic Bass,Finger Bass,Pick Bass,Fretless Bass,Slap Bass,Slap Bass 2,Synth Bass,Synth Bass 2," +
  "Violin,Viola,Cello,Contrabass,Tremolo Strings,Pizzicato Strings,Harp,Timpani," +
  "Strings,Strings 2,Synth Strings,Synth Strings 2,Choir Aahs,Voice Oohs,Synth Voice,Orchestra Hit," +
  "Trumpet,Trombone,Tuba,Muted Trumpet,French Horn,Brass,Synth Brass,Synth Brass 2," +
  "Soprano Sax,Alto Sax,Tenor Sax,Baritone Sax,Oboe,English Horn,Bassoon,Clarinet," +
  "Piccolo,Flute,Recorder,Pan Flute,Blown Bottle,Shakuhachi,Whistle,Ocarina," +
  "Square Lead,Saw Lead,Calliope,Chiff,Charang,Voice Lead,Fifths,Bass + Lead," +
  "New Age Pad,Warm Pad,Polysynth,Choir Pad,Bowed Pad,Metallic Pad,Halo Pad,Sweep Pad," +
  "Rain,Soundtrack,Crystal,Atmosphere,Brightness,Goblins,Echoes,Sci-fi," +
  "Sitar,Banjo,Shamisen,Koto,Kalimba,Bagpipe,Fiddle,Shanai," +
  "Tinkle Bell,Agogo,Steel Drums,Woodblock,Taiko,Melodic Tom,Synth Drum,Reverse Cymbal," +
  "Fret Noise,Breath Noise,Seashore,Bird Tweet,Telephone,Helicopter,Applause,Gunshot"
).split(",");

export function parseMidi(buffer: ArrayBuffer): ParsedMidi {
  const r = new Reader(new DataView(buffer));
  if (r.ascii(4) !== "MThd") throw new Error("Not a MIDI file");
  const headerLength = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.pos += headerLength - 6;
  if (division & 0x8000) throw new Error("SMPTE time division is not supported");
  const ppq = division || 480;
  if (format > 2) throw new Error(`Unsupported MIDI format ${format}`);

  const tempos: TempoChange[] = [];
  const notes: RawNote[] = [];
  const trackNames: string[] = [];
  // first program change per (track, channel): key = track * 16 + channel
  const programs = new Map<number, number>();
  let songName = "";

  for (let t = 0; t < trackCount && !r.eof; t++) {
    const id = r.ascii(4);
    const len = r.u32();
    if (id !== "MTrk") {
      r.pos += len;
      continue;
    }
    const tr = r.slice(len);
    const open = new Map<number, RawNote>(); // key = channel<<8 | note
    let ticks = 0;
    let running = 0;

    while (!tr.eof) {
      ticks += tr.vlq();
      let status = tr.u8();
      if (status < 0x80) {
        // running status: this byte is the first data byte
        tr.pos--;
        status = running;
      } else if (status < 0xf0) {
        running = status;
      }

      if (status === 0xff) {
        const type = tr.u8();
        const n = tr.vlq();
        if (type === 0x51 && n === 3) {
          tempos.push({ ticks, usPerQuarter: (tr.u8() << 16) | (tr.u8() << 8) | tr.u8() });
        } else if (type === 0x03) {
          const name = decodeText(tr, n);
          if (t === 0 && format === 1 && !songName) songName = name;
          else trackNames[t] = trackNames[t] || name;
        } else {
          tr.pos += n;
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        // Read the length first: `pos += vlq()` would capture the old pos
        // before vlq() advances it and land the skip short.
        const n = tr.vlq();
        tr.pos += n;
        continue;
      }

      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const d1 = tr.u8();
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : tr.u8();
      if (kind === 0xc0) {
        const pk = t * 16 + channel;
        if (!programs.has(pk)) programs.set(pk, d1);
        continue;
      }
      if (kind !== 0x90 && kind !== 0x80) continue;

      const key = (channel << 8) | d1;
      if (kind === 0x90 && d2 > 0) {
        const prev = open.get(key);
        if (prev) {
          prev.endTicks = ticks;
          notes.push(prev);
        }
        open.set(key, { ticks, endTicks: -1, midi: d1, velocity: d2 / 127, channel, track: t });
      } else {
        const note = open.get(key);
        if (note) {
          note.endTicks = ticks;
          notes.push(note);
          open.delete(key);
        }
      }
    }
    for (const note of open.values()) {
      note.endTicks = ticks;
      notes.push(note);
    }
  }

  tempos.sort((a, b) => a.ticks - b.ticks);
  if (!tempos.length || tempos[0].ticks > 0) tempos.unshift({ ticks: 0, usPerQuarter: 500_000 });
  const toSeconds = tickClock(tempos, ppq);
  const quarterAt = (ticks: number): number => {
    let i = tempos.length - 1;
    while (i > 0 && tempos[i].ticks > ticks) i--;
    return tempos[i].usPerQuarter / 1e6;
  };

  // A "part" is a (track, channel) pair that carries notes. Format-1 files with
  // one channel per track keep one part per track; format-0 files, which pack
  // every channel into a single track, split into their real instruments.
  const partIndex = new Map<number, number>(); // (track*16+channel) -> part index
  const partMeta: { track: number; channel: number }[] = [];
  const partOf = (track: number, channel: number): number => {
    const pk = track * 16 + channel;
    let idx = partIndex.get(pk);
    if (idx === undefined) {
      idx = partMeta.length;
      partIndex.set(pk, idx);
      partMeta.push({ track, channel });
    }
    return idx;
  };
  notes.sort((a, b) => a.track - b.track || a.channel - b.channel);
  for (const n of notes) partOf(n.track, n.channel);

  const events: NoteEvent[] = notes.map((n) => {
    const time = toSeconds(n.ticks);
    const program = programs.get(n.track * 16 + n.channel);
    const percussion = n.channel === 9 || (program !== undefined && program >= DRUM_PROGRAMS_START);
    return {
      time,
      ticks: n.ticks,
      midi: n.midi,
      velocity: n.velocity,
      duration: Math.max(toSeconds(n.endTicks) - time, 0.02),
      track: partOf(n.track, n.channel),
      percussion,
      beatSeconds: quarterAt(n.ticks),
    };
  });
  events.sort((a, b) => a.time - b.time || a.midi - b.midi);

  const counts = new Map<number, { count: number; percussion: boolean }>();
  for (const e of events) {
    const c = counts.get(e.track) ?? { count: 0, percussion: true };
    c.count++;
    c.percussion &&= e.percussion;
    counts.set(e.track, c);
  }
  const multiChannelTracks = new Set(
    partMeta.filter((m, i) => partMeta.some((o, j) => j !== i && o.track === m.track)).map((m) => m.track),
  );
  const tracks: TrackInfo[] = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, c]) => {
      const meta = partMeta[index];
      const program = programs.get(meta.track * 16 + meta.channel);
      const trackName = trackNames[meta.track];
      // In a multi-channel track the track name belongs to the whole song, so
      // name each part after its instrument instead.
      const name = c.percussion
        ? "Drums"
        : multiChannelTracks.has(meta.track) || !trackName
          ? program !== undefined
            ? GM_NAMES[program] ?? `Channel ${meta.channel + 1}`
            : trackName || `Channel ${meta.channel + 1}`
          : trackName;
      return { index, name, noteCount: c.count, percussion: c.percussion, program: program ?? null };
    });

  const duration = events.reduce((m, e) => Math.max(m, e.time + e.duration), 0);
  return { events, tracks, ppq, name: songName, duration };
}

function decodeText(r: Reader, n: number): string {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = r.u8();
  try {
    return new TextDecoder().decode(bytes).replace(/\0/g, "").trim();
  } catch {
    return "";
  }
}

/** Piecewise-linear tick→seconds map across all tempo changes. */
function tickClock(tempos: TempoChange[], ppq: number): (ticks: number) => number {
  const starts: number[] = [0];
  for (let i = 1; i < tempos.length; i++) {
    const dt = tempos[i].ticks - tempos[i - 1].ticks;
    starts[i] = starts[i - 1] + (dt / ppq) * (tempos[i - 1].usPerQuarter / 1e6);
  }
  return (ticks) => {
    let i = tempos.length - 1;
    while (i > 0 && tempos[i].ticks > ticks) i--;
    return starts[i] + ((ticks - tempos[i].ticks) / ppq) * (tempos[i].usPerQuarter / 1e6);
  };
}

// ---------- views (ported 1:1 from the Electron app) ----------

export function buildViews(events: NoteEvent[], ppq: number): Views {
  const steps: Step[] = [];
  const stepTimes: number[] = [];
  let i = 0;
  while (i < events.length) {
    const startTime = events[i].time;
    const notes: StepNote[] = [];
    const seen = new Set<string>();
    let velocity = 0;
    while (i < events.length && events[i].time - startTime <= CHORD_WINDOW) {
      const e = events[i];
      const key = (e.percussion ? "d" : "p") + e.midi;
      if (!seen.has(key)) {
        seen.add(key);
        notes.push({ midi: e.midi, percussion: e.percussion, track: e.track, duration: e.duration });
      }
      velocity = Math.max(velocity, e.velocity);
      i++;
    }
    steps.push({ notes, velocity: velocity || 0.8 });
    stepTimes.push(startTime);
  }

  const beatMap = new Map<number, { notes: BeatNote[]; time: number; beatSeconds: number }>();
  for (const e of events) {
    const beatIndex = Math.floor(e.ticks / ppq);
    const offset = (e.ticks % ppq) / ppq;
    let entry = beatMap.get(beatIndex);
    if (!entry) beatMap.set(beatIndex, (entry = { notes: [], time: e.time, beatSeconds: e.beatSeconds }));
    entry.time = Math.min(entry.time, e.time);
    entry.notes.push({ midi: e.midi, offset, duration: e.duration, velocity: e.velocity, percussion: e.percussion, track: e.track });
  }
  // Only beats that contain notes: rests never eat a silent tap.
  const sortedBeats = [...beatMap.keys()].sort((a, b) => a - b);
  const beats: Beat[] = sortedBeats.map((k) => {
    const entry = beatMap.get(k)!;
    const notes = entry.notes.sort((x, y) => x.offset - y.offset);
    const lead = notes.length ? notes[0].offset : 0;
    return { notes: notes.map((n) => ({ ...n, offset: n.offset - lead })), beatSeconds: entry.beatSeconds };
  });
  const beatTimes = sortedBeats.map((k) => beatMap.get(k)!.time);

  let gain = 1;
  if (events.length) {
    const vels = events.map((e) => e.velocity).sort((a, b) => a - b);
    const ref = vels[Math.floor(vels.length * 0.95)] || vels[vels.length - 1] || 0.7;
    gain = Math.min(Math.max(0.7 / Math.max(ref, 0.05), 0.4), 2.2);
  }

  return { steps, beats, stepTimes, beatTimes, gain };
}
