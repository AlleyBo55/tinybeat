"use client";

import { PRESETS } from "@/lib/pattern";
import { PlayIcon, StopIcon, TrashIcon } from "./icons";

interface Props {
  playing: boolean;
  bpm: number;
  swing: number;
  onPlay: () => void;
  onBpm: (bpm: number) => void;
  onSwing: (swing: number) => void;
  onPreset: (index: number) => void;
  onClear: () => void;
}

export function Transport({ playing, bpm, swing, onPlay, onBpm, onSwing, onPreset, onClear }: Props) {
  return (
    <section className="card flex flex-col gap-4" aria-label="Transport">
      <div className="flex flex-wrap items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onPlay}
          aria-pressed={playing}
          className="btn btn-primary h-12 pl-4 pr-5 text-base"
        >
          {playing ? <StopIcon /> : <PlayIcon />}
          {playing ? "Stop" : "Play"}
        </button>

        <Slider label="BPM" min={60} max={200} value={bpm} display={String(bpm)} onChange={onBpm} />
        <Slider label="Swing" min={0} max={100} value={swing} display={`${swing}%`} onChange={onSwing} />

        <button type="button" onClick={onClear} className="btn btn-ghost h-10 px-4 text-sm ml-auto">
          <TrashIcon />
          Clear
        </button>
      </div>

      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
        <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-zinc-500">Start from</span>
        {PRESETS.map((preset, i) => (
          <button key={preset.name} type="button" className="chip" onClick={() => onPreset(i)}>
            {preset.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-44 flex-1 items-center gap-2 text-sm sm:flex-none sm:w-56">
      <span className="w-12 text-zinc-400">{label}</span>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span className="w-11 text-right tabular-nums text-zinc-100">{display}</span>
    </label>
  );
}
