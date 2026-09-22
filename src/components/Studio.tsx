"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "@/lib/audio";
import { cx } from "@/lib/cx";
import { PRESETS, decodePattern, emptyPattern, encodePattern, type Pattern } from "@/lib/pattern";
import { DrumGrid } from "./DrumGrid";
import { MelodyGrid } from "./MelodyGrid";
import { Piano } from "./Piano";
import { Transport } from "./Transport";
import { ShareIcon } from "./icons";

const DEFAULT = PRESETS[0].pattern;
type Mode = "piano" | "beats";

export default function Studio() {
  const [mode, setMode] = useState<Mode>("piano");
  const [pattern, setPattern] = useState<Pattern>(DEFAULT);
  // The constructor touches no browser API, so this is safe during prerender.
  const [engine] = useState(() => new Engine(DEFAULT));
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards the URL writer until the incoming hash has been read once, so a
  // shared link is never overwritten by the default preset on first paint.
  const loadedFromUrl = useRef(false);

  // 1. Load the beat from the URL on mount, and again if the hash changes.
  //    A beat link opens straight into Beats mode; everything else starts on the piano.
  useEffect(() => {
    const load = () => {
      const decoded = decodePattern(location.hash);
      if (decoded) {
        setPattern(decoded);
        setMode("beats");
      }
      loadedFromUrl.current = true;
    };
    load();
    addEventListener("hashchange", load);
    return () => removeEventListener("hashchange", load);
  }, []);

  // 2. Every edit goes to the engine immediately and to the URL shortly after.
  useEffect(() => {
    engine.setPattern(pattern);
    if (!loadedFromUrl.current) return;
    const id = setTimeout(() => history.replaceState(null, "", `#${encodePattern(pattern)}`), 150);
    return () => clearTimeout(id);
  }, [pattern, engine]);

  const togglePlay = useCallback(async () => {
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else {
      await engine.start();
      setPlaying(true);
    }
  }, [engine]);

  // Stop the sequencer when leaving Beats mode so the piano is never underneath it.
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "piano" && engine.playing) {
      engine.stop();
      setPlaying(false);
    }
    setMode(next);
  };

  // Space toggles playback unless a form control has focus (Beats mode only;
  // in Piano mode every key, including space, is a piano key).
  useEffect(() => {
    if (mode !== "beats") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      e.preventDefault();
      void togglePlay();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [togglePlay, mode]);

  const flash = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const patch = (partial: Partial<Pattern>) => setPattern((p) => ({ ...p, ...partial }));

  const toggleDrum = (drum: number, step: number) => {
    if (!pattern.drums[drum][step] && !engine.playing) engine.previewDrum(drum);
    setPattern((p) => {
      const drums = p.drums.map((row) => row.slice());
      drums[drum][step] = !drums[drum][step];
      return { ...p, drums };
    });
  };

  const setNote = (step: number, row: number) => {
    if (pattern.melody[step] !== row + 1 && !engine.playing) engine.previewNote(row);
    setPattern((p) => {
      const melody = p.melody.slice();
      melody[step] = melody[step] === row + 1 ? 0 : row + 1;
      return { ...p, melody };
    });
  };

  const share = async () => {
    const url = `${location.origin}${location.pathname}#${encodePattern(pattern)}`;
    history.replaceState(null, "", url);
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (mobile && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "tinybeat", text: "Listen to my beat", url });
        return;
      } catch {
        // user dismissed the sheet; fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied. Send it to someone.");
    } catch {
      prompt("Copy your beat link", url);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-3 py-6 sm:px-6 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={cx(
              "size-2.5 shrink-0 rounded-full transition-colors",
              playing ? "bg-emerald-400 animate-pulse motion-reduce:animate-none" : "bg-zinc-600",
            )}
          />
          <h1 className="text-xl font-semibold tracking-tight">tinybeat</h1>
          <p className="hidden text-sm text-zinc-400 md:block">
            {mode === "piano" ? "play any song. can’t be wrong." : "make a beat. can’t be wrong."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-white/6 p-1 ring-1 ring-white/10" role="group" aria-label="Mode">
            {(["piano", "beats"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={cx(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors",
                  mode === m ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {mode === "beats" && (
            <button type="button" onClick={share} className="btn btn-accent h-10 px-4 text-sm">
              <ShareIcon />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
        </div>
      </header>

      {mode === "piano" ? (
        <Piano engine={engine} active={mode === "piano"} />
      ) : (
        <>
          <Transport
            playing={playing}
            bpm={pattern.bpm}
            swing={pattern.swing}
            onPlay={() => void togglePlay()}
            onBpm={(bpm) => patch({ bpm })}
            onSwing={(swing) => patch({ swing })}
            onPreset={(i) => setPattern(PRESETS[i].pattern)}
            onClear={() => patch({ drums: emptyPattern().drums, melody: emptyPattern().melody })}
          />

          <section className="card flex flex-col gap-4" aria-label="Drums">
            <SectionTitle title="Drums" hint="tap a square to place a hit" />
            <DrumGrid drums={pattern.drums} engine={engine} onToggle={toggleDrum} />
          </section>

          <section className="card flex flex-col gap-4" aria-label="Melody">
            <SectionTitle title="Melody" hint="every row is in key, so any note fits" />
            <MelodyGrid
              pattern={pattern}
              engine={engine}
              onNote={setNote}
              onKey={(key) => patch({ key })}
              onScale={(scale) => patch({ scale })}
              onVoice={(voice) => patch({ voice })}
            />
          </section>
        </>
      )}

      <footer className="flex flex-col gap-1 px-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        {mode === "piano" ? (
          <>
            <p>Your MIDI file is read on your device and never uploaded.</p>
            <p className="hidden sm:block">
              <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">any key</kbd> next notes
            </p>
          </>
        ) : (
          <>
            <p>Your beat lives in the URL. Copy the link to save or share it. No account, no upload.</p>
            <p className="hidden sm:block">
              <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">space</kbd> play / stop
            </p>
          </>
        )}
      </footer>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
