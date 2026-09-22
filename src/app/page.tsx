import MagicPiano from "@/components/MagicPiano";

// Beats mode (components/Studio.tsx) is intentionally not mounted for now.
// The piano is the product; the beat maker stays in the tree until it earns
// its place on the page.
export default function Page() {
  return <MagicPiano />;
}
