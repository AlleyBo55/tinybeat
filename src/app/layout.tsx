import type { Metadata, Viewport } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, THEME_COLOR } from "@/lib/site";
import { SOUNDFONT_BASE } from "@/lib/samples";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["piano", "play piano online", "MIDI player", "magic piano", "falling notes", "learn a song", "web audio"],
  alternates: { canonical: "/" },
  openGraph: { title: SITE_TITLE, description: SITE_DESCRIPTION, type: "website", siteName: SITE_NAME, url: "/" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "MusicApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript and Web Audio",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {/* Instrument recordings come from here after the first tap; warm the connection early. */}
        <link rel="preconnect" href={new URL(SOUNDFONT_BASE).origin} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={new URL(SOUNDFONT_BASE).origin} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
        <noscript>
          <p style={{ padding: 24, textAlign: "center", color: "#a1a1aa" }}>
            tinybeat is a piano you play in the browser. It needs JavaScript and Web Audio to make sound.
          </p>
        </noscript>
      </body>
    </html>
  );
}
