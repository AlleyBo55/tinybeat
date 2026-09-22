import type { NextConfig } from "next";

// Static export: the whole app is one HTML page plus JS, deployable to any
// static host (Vercel, Netlify, Cloudflare Pages, S3, GitHub Pages).
// There is intentionally no server: the beat lives in the URL hash, which
// never leaves the browser.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true },
  // A stray package-lock.json in the home directory otherwise confuses root detection.
  turbopack: { root: __dirname },
};

export default nextConfig;
