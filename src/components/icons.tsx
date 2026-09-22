// Hand-written inline icons. An icon library would cost more bytes than this
// whole component tree.

type Props = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function PlayIcon({ className }: Props) {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

export function StopIcon({ className }: Props) {
  return (
    <svg {...base} className={className} fill="currentColor" stroke="none">
      <rect x="5.5" y="5.5" width="13" height="13" rx="2" />
    </svg>
  );
}

export function ShareIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export function TrashIcon({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6.5 7l1 13h9l1-13" />
    </svg>
  );
}
