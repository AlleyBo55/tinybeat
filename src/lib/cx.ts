/** Join class names, skipping falsy values. */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
