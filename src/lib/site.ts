// Public site facts shared by metadata, the manifest, robots, sitemap, and
// the Open Graph image. Set NEXT_PUBLIC_SITE_URL at build time for production
// so canonical and social URLs are absolute.

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_NAME = "tinybeat";
export const SITE_TITLE = "tinybeat — any song, any key, never a wrong note";
export const SITE_DESCRIPTION =
  "Drop in a MIDI file and press anything. Every tap plays the next notes of the song, in tune and in time. Real sampled instruments, runs in your browser, nothing is uploaded.";
export const THEME_COLOR = "#050508";
