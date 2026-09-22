import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// Generated once at build time; this is the card people see when a link is shared.
export const dynamic = "force-static";
export const alt = "tinybeat: any song, any key, never a wrong note";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WHITE_KEYS = 28;
const LIT = new Set([21, 24, 26]); // keys glowing on the card, to the right of the copy
const BLACK_AFTER = new Set([0, 1, 3, 4, 5]); // pattern of black keys within an octave of whites (C D E F G A B)

export default function Image() {
  const keyW = size.width / WHITE_KEYS;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "radial-gradient(1200px 500px at 50% 120%, #1a1230 0%, #050508 60%)",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* wordmark */}
        <div style={{ position: "absolute", top: 44, left: 56, display: "flex", alignItems: "center", gap: 12, fontSize: 28, fontWeight: 600 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#818cf8", boxShadow: "0 0 24px 6px rgba(129,140,248,0.7)" }} />
          {SITE_NAME}
        </div>

        {/* headline */}
        <div style={{ position: "absolute", top: 130, left: 56, right: 56, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, letterSpacing: 6, textTransform: "uppercase", color: "#8b8b99", marginBottom: 18 }}>
            The piano that can’t play a wrong note
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>Any song. Any key.</div>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2 }}>Never a wrong note.</div>
          <div style={{ marginTop: 22, fontSize: 26, color: "#c4c4cf" }}>Drop in a MIDI file. Press anything. Real instruments, right in your browser.</div>
        </div>

        {/* falling notes */}
        {[...LIT].map((k, i) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: k * keyW + keyW * 0.2,
              top: 300 + i * 40,
              width: keyW * 0.6,
              height: 70 + i * 20,
              borderRadius: 12,
              background: i === 1 ? "#fb923c" : "#a855f7",
              boxShadow: `0 0 40px 8px ${i === 1 ? "rgba(251,146,60,0.55)" : "rgba(168,85,247,0.55)"}`,
            }}
          />
        ))}

        {/* keys */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 150, display: "flex" }}>
          {Array.from({ length: WHITE_KEYS }, (_, i) => (
            <div
              key={i}
              style={{
                width: keyW,
                height: "100%",
                background: LIT.has(i) ? (i === 24 ? "#fdba74" : "#d8b4fe") : "#ece7dc",
                borderRight: "2px solid #0a0a12",
                boxShadow: LIT.has(i) ? `inset 0 -40px 60px -20px ${i === 24 ? "#f97316" : "#9333ea"}` : "inset 0 -8px 0 #cfc9bc",
              }}
            />
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 60, height: 90, display: "flex" }}>
          {Array.from({ length: WHITE_KEYS }, (_, i) =>
            BLACK_AFTER.has(i % 7) ? (
              <div
                key={i}
                style={{ position: "absolute", left: i * keyW + keyW * 0.68, width: keyW * 0.62, height: 90, background: "#101018", borderRadius: "0 0 6px 6px" }}
              />
            ) : null,
          )}
        </div>
      </div>
    ),
    size,
  );
}
