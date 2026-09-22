"use client";

import type { CSSProperties } from "react";
import type { Engine } from "@/lib/audio";
import { DRUMS, STEPS } from "@/lib/pattern";
import { Playhead } from "./Playhead";
import { StepCell } from "./StepCell";

interface Props {
  drums: boolean[][];
  engine: Engine;
  onToggle: (drum: number, step: number) => void;
}

export function DrumGrid({ drums, engine, onToggle }: Props) {
  return (
    <div className="seq">
      {DRUMS.map((drum, d) => (
        // display: contents keeps every cell a direct grid child while the
        // track colour is inherited from this wrapper.
        <div key={drum.name} className="contents" style={{ "--c": drum.color } as CSSProperties}>
          <div className="flex items-center gap-1.5 select-none text-[10px] font-medium text-zinc-400 sm:text-xs">
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--c)]" />
            <span className="hidden sm:inline">{drum.name}</span>
            <span className="sm:hidden">{drum.short}</span>
          </div>
          {Array.from({ length: STEPS }, (_, s) => (
            <StepCell
              key={s}
              on={drums[d][s]}
              beat={s % 4 === 0}
              label={`${drum.name}, step ${s + 1}`}
              onClick={() => onToggle(d, s)}
            />
          ))}
        </div>
      ))}
      <Playhead engine={engine} />
    </div>
  );
}
