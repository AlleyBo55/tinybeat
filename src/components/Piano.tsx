"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Engine } from "@/lib/audio";
import { cx } from "@/lib/cx";
import { buildViews, parseMidi, type Beat, type ParsedMidi, type Step } from "@/lib/midi";

type TapMode = "beat" | "note";

interface Song {
  parsed: ParsedMidi;
  fileName: string;
}

/**
 * Magic Piano: any key, any pad, any tap plays the next notes of the song.
 * The song never leaves the browser; it is parsed from the local file.
 */
export function Piano({ engine, active }: { engine: Engine; active: boolean }) {
  const [song, setSong] = useState<Song | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tapMode, setTapMode] = useState<TapMode>("beat");
  const [position, setPosition] = useState(0);
  const [lit, setLit] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const posRef = useRef(0);
  const lastTapRef = useRef(0);
  const lastBeatTapRef = useRef(0);
  const litTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const views = useMemo(() => {
    if (!song) return null;
    const events = song.parsed.events.filter((e) => selected.has(e.track));
    return buildViews(events, song.parsed.ppq);
  }, [song, selected]);

  const total = views ? (tapMode === "beat" ? views.beats.length : views.steps.length) : 0;

  // Rewind happens inside the events that change the song shape (load, part
  // toggle, tap mode), so the pointer can never outlive the list it indexes.
  const rewind = useCallback(() => {
    posRef.current = 0;
    lastBeatTapRef.current = 0;
    setPosition(0);
    setLit([]);
  }, []);

  const changeTapMode = (m: TapMode) => {
    setTapMode(m);
    rewind();
  };

  const loadFile = useCallback(
    async (file: File) => {
      try {
        const parsed = parseMidi(await file.arrayBuffer());
        if (!parsed.events.length) throw new Error("That file has no notes in it.");
        setSong({ parsed, fileName: file.name.replace(/\.midi?$/i, "") });
        // Default selection: everything that is not drums, or everything if the
        // song is only drums.
        const melodic = parsed.tracks.filter((t) => !t.percussion).map((t) => t.index);
        setSelected(new Set(melodic.length ? melodic : parsed.tracks.map((t) => t.index)));
        setError(null);
        rewind();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read that file.");
      }
    },
    [rewind],
  );

  const advance = useCallback(() => {
    if (!views || total === 0) return;
    const now = performance.now();
    if (now - lastTapRef.current < 30) return; // debounce accidental double fire
    lastTapRef.current = now;
    void engine.unlock();

    const gain = views.gain;
    let notes: { midi: number; percussion: boolean }[];
    if (tapMode === "beat") {
      const beat: Beat = views.beats[posRef.current];
      // Beat length follows the player's own tapping speed.
      let beatSeconds = 0.5;
      if (lastBeatTapRef.current) beatSeconds = Math.min(Math.max((now - lastBeatTapRef.current) / 1000, 0.15), 1.5);
      lastBeatTapRef.current = now;
      const velocity = beat.notes.reduce((m, n) => Math.max(m, n.velocity), 0) || 0.8;
      engine.playSongNotes(beat.notes, velocity, gain, beat.notes.map((n) => n.offset * beatSeconds));
      notes = beat.notes;
    } else {
      const step: Step = views.steps[posRef.current];
      engine.playSongNotes(step.notes, step.velocity, gain);
      notes = step.notes;
    }
    posRef.current = (posRef.current + 1) % total;
    setPosition(posRef.current);
    setLit(notes.filter((n) => !n.percussion).map((n) => n.midi));
    if (litTimer.current) clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => setLit([]), 300);
  }, [engine, views, total, tapMode]);

  // Any key advances the song while this mode is on screen.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (["Shift", "Tab", "CapsLock", "Escape"].includes(e.key)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      advance();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [active, advance]);

  const toggleTrack = (index: number) => {
    if (selected.has(index) && selected.size === 1) return; // keep at least one part
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    rewind();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  };

  return (
    <div className="flex flex-col gap-5">
      <section
        className={cx("card flex flex-col gap-4 transition-colors", dragging && "ring-indigo-400/70 bg-indigo-500/10")}
        aria-label="Song"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary h-10 px-4 text-sm" onClick={() => fileInput.current?.click()}>
            {song ? "Load another MIDI" : "Load a MIDI file"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".mid,.midi,audio/midi"
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void loadFile(file);
              e.currentTarget.value = "";
            }}
          />
          {song ? (
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{song.parsed.name || song.fileName}</p>
              <p className="text-xs text-zinc-500">
                {song.parsed.events.length.toLocaleString()} notes · {Math.round(song.parsed.duration)}s · stays on your device
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400">
              Drop any <span className="font-mono text-zinc-300">.mid</span> here. Free ones live at bitmidi.com.
            </p>
          )}

          {song && (
            <div className="ml-auto flex rounded-full bg-white/6 p-1 ring-1 ring-white/10" role="group" aria-label="Tap mode">
              {(["beat", "note"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={tapMode === m}
                  onClick={() => changeTapMode(m)}
                  className={cx(
                    "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                    tapMode === m ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10",
                  )}
                >
                  {m === "beat" ? "Per beat" : "Per note"}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}

        {song && song.parsed.tracks.length > 1 && (
          <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
            <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-zinc-500">Parts</span>
            {song.parsed.tracks.map((t) => (
              <button
                key={t.index}
                type="button"
                aria-pressed={selected.has(t.index)}
                onClick={() => toggleTrack(t.index)}
                className={cx("chip", selected.has(t.index) && "bg-indigo-500/30 ring-indigo-400/60 text-white")}
              >
                {t.name}
                <span className="ml-1.5 text-zinc-500">{t.noteCount}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-4" aria-label="Play">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Play</h2>
          <p className="text-xs text-zinc-500">
            {song ? "tap anywhere below, or press any key. every tap is the right note." : "load a song to start"}
          </p>
        </div>

        <Keys lit={lit} disabled={!song} onTap={advance} />

        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-indigo-400 transition-[width] duration-100"
              style={{ width: total ? `${(position / total) * 100}%` : "0%" }}
            />
          </div>
          <span className="w-24 text-right text-xs tabular-nums text-zinc-400">
            {total ? `${position} / ${total}` : "—"}
          </span>
          <button type="button" className="btn btn-ghost h-8 px-3 text-xs" onClick={rewind} disabled={!song}>
            Rewind
          </button>
        </div>
      </section>
    </div>
  );
}

const LOW = 48; // C3
const HIGH = 84; // C6
const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

/**
 * A three-octave keyboard where every key does the same thing: advance.
 * Keys light up with whatever the song just played, so it still looks like
 * you are playing the melody.
 */
function Keys({ lit, disabled, onTap }: { lit: number[]; disabled: boolean; onTap: () => void }) {
  const whites: number[] = [];
  for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whites.push(m);
  const litSet = new Set(lit.map((m) => ((m - LOW) % 36 + 36) % 36 + LOW)); // fold into range

  return (
    <div
      className={cx("relative h-36 select-none touch-none sm:h-44", disabled && "opacity-40")}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        onTap();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Piano keys: tap to play the next notes"
      aria-disabled={disabled}
    >
      <div className="flex h-full gap-px">
        {whites.map((m) => (
          <div
            key={m}
            className={cx(
              "flex-1 rounded-b-md transition-colors duration-75",
              litSet.has(m) ? "bg-indigo-300" : "bg-zinc-100",
            )}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[62%]">
        {whites.map((m, i) => {
          const next = m + 1;
          const hasBlack = i < whites.length - 1 && isBlack(next);
          return (
            <div key={m} className="relative flex-1">
              {hasBlack && (
                <div
                  className={cx(
                    "absolute right-0 top-0 h-full w-[64%] translate-x-1/2 rounded-b-md ring-1 ring-black/60 transition-colors duration-75",
                    litSet.has(next) ? "bg-indigo-500" : "bg-zinc-900",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
