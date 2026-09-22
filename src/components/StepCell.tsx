"use client";

import { cx } from "@/lib/cx";

interface Props {
  on: boolean;
  /** first step of a beat (every 4th) gets a slightly brighter resting state */
  beat: boolean;
  label: string;
  onClick: () => void;
}

export function StepCell({ on, beat, label, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cx("step", on ? "step-on" : beat ? "step-off-beat" : "step-off")}
    />
  );
}
