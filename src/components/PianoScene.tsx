"use client";

import { useEffect, useRef } from "react";
import { demoAttract } from "@/lib/demo";
import { instrumentById } from "@/lib/instruments";
import type { PianoStore } from "@/lib/piano-store";
import type { SceneHandle } from "@/lib/scene";

/**
 * Hosts the three.js canvas. The scene is created once, subscribes to the
 * store directly for taps, and is told to re-read the upcoming notes whenever
 * the song, parts, mode, or pointer change outside of a tap.
 *
 * With no song loaded it runs the silent attract mode (unless the visitor
 * prefers reduced motion), and a tap on the keys starts the built-in song.
 */
export function PianoScene({
  store,
  instrument,
  hasSong,
  onEmptyTap,
}: {
  store: PianoStore;
  instrument: string;
  hasSong: boolean;
  onEmptyTap?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle: SceneHandle | null = null;
    const unsubscribers: (() => void)[] = [];
    let cancelled = false;
    // three.js loads after first paint so the shell is interactive before it arrives.
    void import("@/lib/scene").then(({ createScene }) => {
      if (cancelled) return;
      handle = createScene(canvas, store);
      sceneRef.current = handle;
      const snapshot = store.getSnapshot();
      handle.setHue(instrumentById(snapshot.instrument).hue);
      applyIdle(handle, !snapshot.song);
      unsubscribers.push(store.onTap((e) => handle?.tap(e)));
      unsubscribers.push(store.onPulse(() => handle?.pulse()));
      unsubscribers.push(store.subscribe(() => handle?.refresh()));
    });
    return () => {
      cancelled = true;
      unsubscribers.forEach((u) => u());
      handle?.dispose();
      sceneRef.current = null;
    };
  }, [store]);

  useEffect(() => {
    sceneRef.current?.setHue(instrumentById(instrument).hue);
  }, [instrument]);

  useEffect(() => {
    if (sceneRef.current) applyIdle(sceneRef.current, !hasSong);
  }, [hasSong]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!store.getSnapshot().song) {
      onEmptyTap?.();
      return;
    }
    const midi = sceneRef.current?.pick(e.clientX, e.clientY);
    if (midi != null) sceneRef.current?.nudge(midi);
    store.tap();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      className="block h-full w-full touch-none select-none outline-none"
      aria-label={
        hasSong
          ? "Piano. Tap anywhere, or press any key on your keyboard, to play the next notes of the song."
          : "Piano. Tap anywhere, or press any key, to start playing."
      }
      role="button"
      tabIndex={0}
    />
  );
}

function applyIdle(handle: SceneHandle, idle: boolean): void {
  handle.setIdle(idle);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  handle.setAttract(idle && !reduced ? demoAttract() : null);
}
