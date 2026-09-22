"use client";

import type { CSSProperties } from "react";
import type { Engine } from "@/lib/audio";
import { KEYS, ROWS, SCALES, STEPS, VOICES, degreeToMidi, noteName, type Pattern } from "@/lib/pattern";
import { Playhead } from "./Playhead";
import { StepCell } from "./StepCell";

interface Props {
  pattern: Pattern;
  engine: Engine;
  onNote: (step: number, row: number) => void;
  onKey: (key: number) => void;
  onScale: (scale: number) => void;
  onVoice: (voice: number) => void;
}

/** Low rows are violet, high rows teal: pitch is readable at a glance. */
const rowColor = (row: number) => `oklch(78% 0.16 ${290 - row * 17})`;

export function MelodyGrid({ pattern, engine, onNote, onKey, onScale, onVoice }: Props) {
  const octave = VOICES[pattern.voice]?.octave ?? 0;
  const rows = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i); // top = highest

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Key" value={pattern.key} onChange={onKey} options={KEYS} />
        <Select label="Scale" value={pattern.scale} onChange={onScale} options={SCALES.map((s) => s.name)} />
        <Select label="Sound" value={pattern.voice} onChange={onVoice} options={VOICES.map((v) => v.name)} />
      </div>

      <div className="seq">
        {rows.map((row) => {
          const name = noteName(degreeToMidi(row, pattern.key, pattern.scale, octave));
          return (
            <div key={row} className="contents" style={{ "--c": rowColor(row) } as CSSProperties}>
              <div className="flex items-center gap-1.5 select-none text-[10px] font-medium text-zinc-400 sm:text-xs">
                <span className="size-1.5 shrink-0 rounded-full bg-[var(--c)]" />
                <span className="tabular-nums">{name}</span>
              </div>
              {Array.from({ length: STEPS }, (_, s) => (
                <StepCell
                  key={s}
                  on={pattern.melody[s] === row + 1}
                  beat={s % 4 === 0}
                  label={`${name}, step ${s + 1}`}
                  onClick={() => onNote(s, row)}
                />
              ))}
            </div>
          );
        })}
        <Playhead engine={engine} />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly string[];
  onChange: (index: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      <span>{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(Number(e.currentTarget.value))}>
        {options.map((name, i) => (
          <option key={name} value={i}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
