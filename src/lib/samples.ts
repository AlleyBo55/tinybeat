// Sampled instruments: General MIDI soundfonts, one MP3 recording per key,
// fetched on demand and decoded into AudioBuffers. This is the difference
// between "a MIDI file" and "a piano": real recordings of real instruments.
//
// Source: the widely used gleitz/midi-js-soundfonts set (FluidR3_GM). Each
// instrument is a single ~1–2 MB file, cached by the browser after first use.
// Change SOUNDFONT_BASE to self-host the same files.

export const SOUNDFONT_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";

export type SampleBank = Map<number, AudioBuffer>;

const cache = new Map<string, Promise<SampleBank>>();

const SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Db4" -> 61. The soundfont files name keys with flats. */
function noteToMidi(name: string): number | null {
  const m = /^([A-G])(b|#)?(-?\d+)$/.exec(name);
  if (!m) return null;
  const semi = SEMITONE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return (Number(m[3]) + 1) * 12 + semi;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Load (once) and decode every key of a soundfont instrument. */
export function loadSoundfont(ctx: AudioContext, instrument: string): Promise<SampleBank> {
  let pending = cache.get(instrument);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(`${SOUNDFONT_BASE}/${instrument}-mp3.js`);
      if (!res.ok) throw new Error(`soundfont ${instrument}: HTTP ${res.status}`);
      const text = await res.text();
      // The file is a JS assignment: `MIDI.Soundfont.<name> = { "A0": "data:audio/mp3;base64,...", ... }`
      const start = text.indexOf("{", text.indexOf(`${instrument} =`));
      const end = text.lastIndexOf("}");
      if (start < 0 || end < 0) throw new Error(`soundfont ${instrument}: unexpected file layout`);
      const table = JSON.parse(text.slice(start, end + 1)) as Record<string, string>;

      const bank: SampleBank = new Map();
      await Promise.all(
        Object.entries(table).map(async ([note, uri]) => {
          const midi = noteToMidi(note);
          const comma = uri.indexOf(",");
          if (midi === null || comma < 0) return;
          const bytes = base64ToBytes(uri.slice(comma + 1));
          try {
            bank.set(midi, await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
          } catch {
            // a single bad sample should not sink the instrument
          }
        }),
      );
      if (!bank.size) throw new Error(`soundfont ${instrument}: no decodable samples`);
      return bank;
    })();
    cache.set(instrument, pending);
    pending.catch(() => cache.delete(instrument)); // allow a retry after a network failure
  }
  return pending;
}

/** The sample for `midi`, or the nearest one with the playback rate to reach the pitch. */
export function pickSample(bank: SampleBank, midi: number): { buffer: AudioBuffer; rate: number } | null {
  const exact = bank.get(midi);
  if (exact) return { buffer: exact, rate: 1 };
  let best: number | null = null;
  for (const k of bank.keys()) if (best === null || Math.abs(k - midi) < Math.abs(best - midi)) best = k;
  if (best === null) return null;
  return { buffer: bank.get(best)!, rate: 2 ** ((midi - best) / 12) };
}
