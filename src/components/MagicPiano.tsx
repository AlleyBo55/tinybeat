"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import { INSTRUMENTS, SONG_PRESETS, instrumentById } from "@/lib/instruments";
import { PianoStore, type PianoState, type Timing } from "@/lib/piano-store";
import { PianoScene } from "./PianoScene";

const SERVER_STATE: PianoState = {
  song: null,
  selectedTracks: new Set(),
  partHues: {},
  tapMode: "beat",
  timing: "easy",
  speed: 1,
  instrument: "piano",
  reverb: 0.3,
  volume: 1,
  autoSound: true,
  samples: "synth",
  position: 0,
  total: 0,
  rolling: false,
  tapped: false,
  error: null,
};

type Sheet = "song" | "sound" | null;

const hueCss = (hue: number) => `oklch(74% 0.17 ${hue})`;

export default function MagicPiano() {
  const [store] = useState(() => new PianoStore());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_STATE);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<{ id: number; title: string; body: string; tone: Timing } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = (t: { title: string; body: string; tone: Timing }, ms = 3200) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), ...t });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  };

  // Switching timing mode is easy to do by accident and changes how every tap
  // behaves, so it is always confirmed with a short, dismissable note.
  const changeTiming = (t: Timing) => {
    if (t === state.timing) return;
    store.setTiming(t);
    showToast(
      t === "easy"
        ? { title: "Easy timing", body: "The song keeps its own tempo. Tap along to keep it going.", tone: "easy" }
        : { title: "Manual timing", body: "Every tap plays the next notes right away. The rhythm is yours.", tone: "free" },
    );
  };

  // The built-in piece. Loading and the first tap happen in the same gesture,
  // so the first sound is heard the instant the visitor commits.
  const startDemo = () => {
    store.loadDemo();
    store.tap();
    setSheet(null);
    showToast({ title: "You’re playing Bach.", body: "Keep tapping: any key, any rhythm. It stays in time.", tone: "easy" }, 4200);
  };

  // Every key on the physical keyboard is a piano key while this tab is focused.
  // With no song loaded, any key starts the built-in one.
  // Only browser/system chords, text fields, and Escape are left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        setSheet(null);
        return;
      }
      if (["Shift", "Tab", "CapsLock", "Fn", "Meta"].includes(e.key)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (!store.getSnapshot().song) {
        startDemo();
        return;
      }
      store.tap();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
    // startDemo only closes over stable refs and the store
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // On the first sign of intent, fetch the piano recordings so the demo's
  // first notes are already the real instrument. ~1.5 MB, once, cached.
  useEffect(() => {
    if (state.song) return;
    const warm = () => {
      store.audio.preload("piano");
      cleanup();
    };
    const cleanup = () => {
      removeEventListener("pointermove", warm);
      removeEventListener("touchstart", warm);
      removeEventListener("keydown", warm);
    };
    addEventListener("pointermove", warm, { once: true });
    addEventListener("touchstart", warm, { once: true, passive: true });
    addEventListener("keydown", warm, { once: true });
    return cleanup;
  }, [store, state.song]);

  const pickFile = () => fileInput.current?.click();
  const loadFile = (file: File) => {
    void store.loadFile(file).then(() => setSheet(null));
  };
  const song = state.song;
  const progress = state.total ? state.position / state.total : 0;
  const instrument = instrumentById(state.instrument);
  const title = song ? song.parsed.name || song.fileName : "";

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#050508] text-zinc-100"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) loadFile(file);
      }}
    >
      <div className="absolute inset-0">
        <PianoScene store={store} instrument={state.instrument} hasSong={!!song} onEmptyTap={startDemo} />
      </div>

      {/* top bar: identity left, controls right. Nothing ever covers the keys. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight" aria-label="tinybeat">
            <span
              aria-hidden
              className={cx(
                "inline-block size-2 rounded-full transition-colors duration-300",
                state.rolling ? "bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.7)]" : "bg-indigo-400 shadow-[0_0_10px_2px_rgba(129,140,248,0.6)]",
              )}
            />
            tinybeat
          </div>
          {song && (
            <div className="hidden items-center gap-2 text-xs sm:flex">
              <span
                data-testid="status"
                className={cx(
                  "rounded-full px-2.5 py-1 font-medium ring-1 backdrop-blur transition-colors duration-300",
                  state.timing === "free"
                    ? "bg-amber-300/10 text-amber-100 ring-amber-300/25"
                    : state.rolling
                      ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
                      : "bg-white/5 text-zinc-400 ring-white/10",
                )}
              >
                {state.timing === "free"
                  ? "manual · you set the tempo"
                  : state.rolling
                    ? "playing · keep tapping"
                    : state.tapped
                      ? "paused · tap to continue"
                      : "tap to start"}
              </span>
              <span data-testid="counter" className="rounded-full bg-black/40 px-2.5 py-1 tabular-nums text-zinc-300 ring-1 ring-white/10 backdrop-blur">
                {state.position} <span className="text-zinc-500">/ {state.total}</span>
              </span>
            </div>
          )}
        </div>

        <nav
          className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full bg-[#0c0c14]/85 p-1 ring-1 ring-white/10 backdrop-blur-xl"
          aria-label="Controls"
        >
          {song ? (
            <DockButton active={sheet === "song"} onClick={() => setSheet(sheet === "song" ? null : "song")} label="Song options">
              <span className="max-w-[30vw] truncate sm:max-w-[200px]">{title}</span>
            </DockButton>
          ) : (
            <DockButton active={false} onClick={pickFile} label="Open a MIDI file">
              Open a song
            </DockButton>
          )}
          {song && (
            <button
              type="button"
              onClick={pickFile}
              title="Open another song"
              aria-label="Open another song"
              className="flex size-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                <path d="M12 4v11" />
                <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
              </svg>
            </button>
          )}
          <span className="h-5 w-px bg-white/10" />
          <DockButton active={sheet === "sound"} onClick={() => setSheet(sheet === "sound" ? null : "sound")} label="Sound options">
            <span
              className={cx("size-2 rounded-full", state.samples === "loading" && "animate-pulse")}
              style={{ background: hueCss(instrument.hue) }}
            />
            <span className="hidden sm:inline">{instrument.label}</span>
            <span className="hidden text-[10px] font-normal uppercase tracking-wider text-zinc-500 sm:inline" data-testid="samples">
              {state.samples === "loading" ? "loading real sound…" : state.autoSound ? "auto" : ""}
            </span>
          </DockButton>
          {song && (
            <>
              <span className="h-5 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 pl-1.5" title="Timing mode: who keeps the tempo">
                <span className="hidden text-[10px] font-medium uppercase tracking-wider text-zinc-500 md:inline">Timing</span>
                <Segmented
                  compact
                  value={state.timing}
                  groupLabel="Timing mode"
                  options={[
                    ["easy", "Easy", "The song keeps its own tempo. Tap along; you can’t be early or late."],
                    ["free", "Manual", "Every tap plays the next notes right away. You set the tempo."],
                  ]}
                  onChange={changeTiming}
                />
              </div>
            </>
          )}
        </nav>
      </header>

      {/* transient confirmation after a mode switch */}
      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 top-16 flex justify-center px-4 sm:top-[4.5rem]">
          <div
            role="status"
            className="flex max-w-md items-center gap-3 rounded-2xl bg-[#0c0c14]/90 px-4 py-2.5 text-sm ring-1 ring-white/12 shadow-xl backdrop-blur-xl motion-safe:animate-[toast-in_.28s_ease-out]"
          >
            <span className={cx("size-2 shrink-0 rounded-full", toast.tone === "easy" ? "bg-emerald-400" : "bg-amber-300")} />
            <div>
              <p className="font-medium text-zinc-100">{toast.title}</p>
              <p className="text-xs text-zinc-400">{toast.body}</p>
            </div>
          </div>
        </div>
      )}

      {/* landing: the piano behind is already playing to itself, down in the bass */}
      {!song && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[68%] bg-[radial-gradient(60%_70%_at_50%_38%,rgba(5,5,8,0.88)_0%,rgba(5,5,8,0.55)_55%,transparent_100%)]"
        />
      )}
      {!song && (
        <section
          aria-labelledby="hero-title"
          className="pointer-events-none absolute inset-x-0 top-[9%] flex flex-col items-center px-6 text-center sm:top-[12%]"
        >
          <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500 motion-safe:animate-[rise_.7s_ease-out_both]">
            The piano that can’t play a wrong note
          </p>
          <h1
            id="hero-title"
            className="text-balance text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl motion-safe:animate-[rise_.7s_.08s_ease-out_both]"
          >
            Any song. Any key.
            <br />
            Never a wrong note.
          </h1>
          <p className="mt-5 max-w-xl text-balance text-base text-zinc-300 sm:text-lg motion-safe:animate-[rise_.7s_.16s_ease-out_both]">
            Drop in a MIDI file and press anything. Every tap plays the next notes of the song, in tune and in time. What’s left is the
            part that was always yours: the feeling.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3 motion-safe:animate-[rise_.7s_.24s_ease-out_both]">
            <button
              type="button"
              onClick={startDemo}
              className="btn btn-primary h-12 px-6 text-base shadow-[0_0_48px_-12px_rgba(255,255,255,0.7)] motion-safe:animate-[breathe_3s_ease-in-out_1s_infinite]"
            >
              Play Bach now
            </button>
            <button type="button" onClick={pickFile} className="btn btn-ghost h-12 px-5 text-base">
              Open your own .mid
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500 motion-safe:animate-[rise_.7s_.3s_ease-out_both]">
            or just press any key · free songs at bitmidi.com
          </p>

          <ul className="mt-10 hidden max-w-3xl grid-cols-3 gap-3 text-left sm:grid motion-safe:animate-[rise_.7s_.4s_ease-out_both]">
            <Fact title="It keeps the tempo." body="Easy mode holds the song’s own rhythm. Tap along; you can’t be early or late." />
            <Fact title="Real instruments." body="Seventeen voices, fourteen sampled from real recordings, from a grand piano to a music box." />
            <Fact title="Nothing leaves your device." body="Your file is read right here in the browser. No upload, no account, no waiting." />
          </ul>
        </section>
      )}

      {/* first-tap prompt, floating in the lane just above the keys */}
      {song && !state.tapped && !sheet && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[36%] flex justify-center">
          <p className="animate-[float_2.4s_ease-in-out_infinite] rounded-full bg-black/55 px-4 py-2 text-sm text-zinc-100 ring-1 ring-white/15 backdrop-blur motion-reduce:animate-none">
            press <kbd className="mx-1 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[11px]">any key</kbd> or tap the piano
          </p>
        </div>
      )}

      {/* progress: a hairline along the very top edge */}
      {song && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-white/5">
          <div
            className="h-full transition-[width] duration-150"
            style={{
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${hueCss(instrument.hue)}, ${hueCss(instrument.hue + 137.5)})`,
            }}
          />
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-indigo-500/15 ring-4 ring-inset ring-indigo-400/70">
          <p className="rounded-full bg-black/60 px-5 py-2 text-lg font-medium">drop to open</p>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".mid,.midi,audio/midi"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          // reset first so re-picking the same file fires change again
          e.currentTarget.value = "";
          if (file) loadFile(file);
        }}
      />

      {/* sheets */}
      {sheet && (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/30 sm:items-start sm:pt-16" onClick={() => setSheet(null)}>
          <div
            className="card w-full max-w-lg !rounded-t-3xl !rounded-b-none bg-[#0d0d16]/95 !p-5 shadow-2xl backdrop-blur-2xl motion-safe:animate-[sheet-in_.22s_ease-out] sm:!rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={sheet === "song" ? "Song options" : "Sound options"}
          >
            {sheet === "song" ? (
              <SongSheet state={state} store={store} onPick={pickFile} onClose={() => setSheet(null)} onTiming={changeTiming} />
            ) : (
              <SoundSheet state={state} store={store} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- sheets ----------

function SongSheet({
  state,
  store,
  onPick,
  onClose,
  onTiming,
}: {
  state: PianoState;
  store: PianoStore;
  onPick: () => void;
  onClose: () => void;
  onTiming: (t: Timing) => void;
}) {
  const song = state.song;
  const tracks = song?.parsed.tracks ?? [];
  const melodic = tracks.filter((t) => !t.percussion).map((t) => t.index);
  const allOn = tracks.length > 0 && tracks.every((t) => state.selectedTracks.has(t.index));
  const melodyOn = melodic.length > 0 && state.selectedTracks.size === melodic.length && melodic.every((i) => state.selectedTracks.has(i));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Song</h2>
          {song ? (
            <p className="truncate text-sm text-zinc-400" title={song.parsed.name || song.fileName}>
              {song.parsed.name || song.fileName} · {song.parsed.events.length.toLocaleString()} notes · {Math.round(song.parsed.duration)}s
            </p>
          ) : (
            <p className="text-sm text-zinc-400">Any MIDI file. Read on your device, never uploaded.</p>
          )}
        </div>
        <button type="button" className="btn btn-primary h-9 shrink-0 px-4 text-sm" onClick={onPick}>
          {song ? "Open another song" : "Choose a file"}
        </button>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-rose-300">
          {state.error}
        </p>
      )}

      {song && (
        <>
          <Field label="Timing mode · who keeps the tempo">
            <Segmented
              value={state.timing}
              groupLabel="Timing mode"
              options={[
                ["easy", "Easy · the song does"],
                ["free", "Manual · you do"],
              ]}
              onChange={onTiming}
            />
            <p className="text-xs leading-relaxed text-zinc-500">
              {state.timing === "easy"
                ? "The song keeps perfect time on its own. Tap along to keep it going; you can’t be early or late. Stop tapping and it waits for you."
                : "Each tap plays the next notes right away, as fast or slow as you like. The rhythm is entirely yours, so it only sounds right if you know the song."}
            </p>
          </Field>

          {state.timing === "easy" && (
            <Field label={`Song speed · ${Math.round(state.speed * 100)}%`}>
              <Slider min={0.5} max={1.5} value={state.speed} onChange={(v) => store.setSpeed(v)} />
            </Field>
          )}

          <Field label="Each tap plays">
            <Segmented
              value={state.tapMode}
              options={[
                ["beat", "A whole beat"],
                ["note", "The next note"],
              ]}
              onChange={(m) => store.setTapMode(m)}
            />
            <p className="text-xs text-zinc-500">
              {state.tapMode === "beat" ? "fewer taps, the song flows" : "one note per tap, you play every single one"}
            </p>
          </Field>

          {tracks.length > 1 && (
            <Field label="Which parts to play">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={melodyOn}
                  onClick={() => store.selectMelodicTracks()}
                  className={cx("chip !py-1 !text-xs", melodyOn && "bg-white text-black ring-white hover:bg-white")}
                >
                  Instruments only
                </button>
                <button
                  type="button"
                  aria-pressed={allOn}
                  onClick={() => store.selectAllTracks()}
                  className={cx("chip !py-1 !text-xs", allOn && "bg-white text-black ring-white hover:bg-white")}
                >
                  Everything
                </button>
                <span className="mx-1 h-6 w-px self-center bg-white/10" />
                {tracks.map((t) => {
                  const on = state.selectedTracks.has(t.index);
                  const last = on && state.selectedTracks.size === 1;
                  const hue = state.partHues[t.index];
                  return (
                    <button
                      key={t.index}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={last}
                      title={last ? "at least one part has to stay on" : undefined}
                      onClick={() => store.setTrack(t.index, !on)}
                      className={cx(
                        "chip flex items-center gap-1.5 !py-1 !text-xs",
                        on && "bg-white/12 text-white ring-white/30",
                        last && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: t.percussion ? "#7a7a86" : hue !== undefined ? hueCss(hue) : "#555", opacity: on ? 1 : 0.35 }}
                      />
                      {t.name}
                      <span className="text-zinc-500">{t.noteCount}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-500">each part has its own colour on the falling notes · drums are off unless you turn them on</p>
            </Field>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-sm tabular-nums text-zinc-400">
              {state.position} / {state.total} {state.tapMode === "beat" ? "beats" : "notes"}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost h-9 px-4 text-sm text-rose-200 hover:bg-rose-500/15"
                onClick={() => {
                  store.eject();
                  onClose();
                }}
              >
                Close song
              </button>
              <button type="button" className="btn btn-ghost h-9 px-4 text-sm" onClick={() => store.rewind()}>
                Back to start
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SoundSheet({ state, store }: { state: PianoState; store: PianoStore }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Sound</h2>
          <p className="text-sm text-zinc-400">{instrumentById(state.instrument).hint}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
          <span>Pick for me</span>
          <input type="checkbox" className="peer sr-only" checked={state.autoSound} onChange={(e) => store.setAutoSound(e.currentTarget.checked)} />
          <span className="relative h-6 w-10 rounded-full bg-white/15 transition-colors peer-checked:bg-indigo-500 peer-focus-visible:ring-2 peer-focus-visible:ring-white/60">
            <span className={cx("absolute top-1 size-4 rounded-full bg-white transition-[left]", state.autoSound ? "left-5" : "left-1")} />
          </span>
        </label>
      </div>
      <p className="-mt-3 text-xs text-zinc-500">
        {state.autoSound
          ? "The instrument and reverb are chosen from what each song asks for. Change anything below to take over."
          : "You’re choosing the sound. Turn “Pick for me” on to let each song decide."}
      </p>
      <p className="-mt-3 text-xs text-zinc-500">
        {state.samples === "ready" && "Playing from real recordings of this instrument."}
        {state.samples === "loading" && "Fetching real recordings of this instrument (about 1–2 MB, once). The synth plays until they arrive."}
        {state.samples === "synth" && "A synthesizer voice: this instrument is electronic by nature."}
        {state.samples === "failed" && "Couldn’t fetch the recordings (offline?). Playing the synth voice instead."}
      </p>

      <Field label="Made for these songs">
        <div className="flex flex-wrap gap-1.5">
          {SONG_PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip !py-1 !text-xs" onClick={() => store.applyPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Instrument">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {INSTRUMENTS.map((i) => {
            const on = state.instrument === i.id;
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={on}
                onClick={() => store.setInstrument(i.id)}
                className={cx(
                  "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs ring-1 transition-colors",
                  on ? "bg-white text-black ring-white" : "bg-white/5 text-zinc-200 ring-white/10 hover:bg-white/10",
                )}
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: hueCss(i.hue) }} />
                <span className="truncate font-medium">{i.label}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={`Reverb · ${Math.round(state.reverb * 100)}%`}>
        <Slider min={0} max={1} value={state.reverb} onChange={(v) => store.setReverb(v)} />
      </Field>
      <Field label={`Volume · ${Math.round(state.volume * 100)}%`}>
        <Slider min={0} max={1} value={state.volume} onChange={(v) => store.setVolume(v)} />
      </Field>
    </div>
  );
}

// ---------- small bits ----------

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <li className="rounded-2xl bg-[#0b0b13]/80 px-4 py-3 ring-1 ring-white/10 backdrop-blur-md">
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{body}</p>
    </li>
  );
}

function DockButton({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        "flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors",
        active ? "bg-white text-black" : "text-zinc-100 hover:bg-white/10",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  compact,
  groupLabel,
}: {
  value: T;
  /** [value, label, optional tooltip] */
  options: [T, string, string?][];
  onChange: (v: T) => void;
  compact?: boolean;
  groupLabel?: string;
}) {
  return (
    <div
      className={cx("flex w-fit rounded-full bg-white/6 ring-1 ring-white/10", compact ? "p-0.5" : "p-1")}
      role="radiogroup"
      aria-label={groupLabel}
    >
      {options.map(([v, label, tip]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={tip}
          onClick={() => onChange(v)}
          className={cx(
            "rounded-full font-medium transition-colors",
            compact ? "h-8 px-3 text-xs" : "px-3.5 py-1.5 text-sm",
            value === v ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }) {
  return <input type="range" className="range w-full" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.currentTarget.value))} />;
}
