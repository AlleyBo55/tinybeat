"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Engine } from "@/lib/audio";

/**
 * Subscribes to the engine directly so the ~10 updates/second during playback
 * re-render this one element and nothing else.
 */
export function Playhead({ engine }: { engine: Engine }) {
  const [step, setStep] = useState(-1);
  useEffect(() => engine.subscribe(setStep), [engine]);
  if (step < 0) return null;
  return <div aria-hidden className="seq-playhead" style={{ "--step": step } as CSSProperties} />;
}
