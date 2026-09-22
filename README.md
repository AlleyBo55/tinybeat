<div align="center">

# tinybeat

### Any song. Any key. Never a wrong note.

**The open-source magic piano for the browser.** Drop in a MIDI file, press anything, and every tap plays the next notes of the song, in tune and in time. Synthesia-style falling notes, real sampled instruments, nothing uploaded, no account, no server.

**[▶ Play it now at tinybeat.fun](https://tinybeat.fun)** · press any key, that is the whole tutorial

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-149eca)](https://react.dev)
[![three.js](https://img.shields.io/badge/three.js-0.186-white)](https://threejs.org)
[![Static export · no server](https://img.shields.io/badge/deploy-static%20export%20%C2%B7%20no%20server-success)](#deploy-your-own)
[![Use it. Fork it. Ship it.](https://img.shields.io/badge/use%20it-fork%20it%20%C2%B7%20ship%20it-ff69b4)](#license)

</div>

---

## This is tinybeat.

Every piano ever made has 88 ways to be wrong. tinybeat has none.

You bring the song. You bring the feeling. The notes are already taken care of. Press a key, any key, and the next notes of the piece come out, in tune, in time, in colour. Press it again. Again. That is it. You are playing Bach.

No lessons. No sheet music. No sign-up. No upload. It runs in the tab you already have open, on real recordings of real instruments, and it starts the instant you touch it.

It just works.

**[Try it. Right now. tinybeat.fun →](https://tinybeat.fun)**

---

## What you get

Every item below is implemented in this repository today. Nothing here is a roadmap.

### Playing

1. **Open any Standard MIDI file** (`.mid`, `.midi`). Drag it onto the page or use *Open a song*. Free songs live at [bitmidi.com](https://bitmidi.com).
2. **Press anything.** Every key on your keyboard is a piano key while the tab is focused. Tap or click the on-screen piano on touch devices. Modifier chords, Tab, and text fields are left alone; Escape closes panels.
3. **No song loaded? Any key starts Bach.** The built-in piece is J. S. Bach, Prelude in C major (BWV 846), first 19 bars, public domain, built in memory as a real MIDI file so it goes through the exact same engine as yours.
4. **Each tap plays a whole beat or the next single note.** Your choice, switchable mid-song.
5. **Choose which parts you play.** Every track in the file is a toggle: *Instruments only*, *Everything*, or pick by hand. Drums stay off unless you turn them on. At least one part always stays on.
6. **Back to start** and **Close song** at any time. A hairline progress bar runs along the top edge.

### Timing, the part nobody else gets right

- **Easy timing** (default). The song keeps its own written tempo on a grid-locked clock. Your first tap starts it. Taps never move the grid, so you cannot rush or drag it. A tap landing just before a note (within 120 ms, capped at 30 % of the gap) plays that note right then so you *feel* your hit, without disturbing what follows. Stop tapping and the song pauses at the next note until you come back. Long rests do not pause it: the keep-alive is 1.6 s or 1.5× the current gap, whichever is longer.
- **Song speed** from 50 % to 150 % in Easy timing.
- **Manual timing.** Every tap plays the next notes immediately. The rhythm is entirely yours.
- Switching timing mode always shows a short, dismissable confirmation, because it changes what every tap does.

### The beat

A drum pattern laid on the song's own bars, so a solo piano piece gets a floor under it. The song keeps every note it had.

- **Three choices**: off, the file's own drum parts exactly as written, or one of **fourteen genres**: Lo-fi, Rap, R&B, Pop, Rock, Disco, House, EDM, Eurobeat, Trap, Drum & bass, Reggaeton, Reggae, Bossa nova.
- **Hits sit on the bar grid, not on your notes.** The pattern is placed by MIDI ticks, so an off-grid or rubato melody never drags the drums out of time.
- **A genre replaces the file's drums** so two kits never fight, and your choice follows you from song to song.
- **Tempo is negotiated, not forced.** The pattern runs at a power of two of the song's tempo, and the song is nudged toward the genre's own: up to 25 % faster, but no more than 10 % slower, because a dragged song sounds broken long before a hurried one does. Each candidate is scored on how far the pattern still misses its tempo plus half of how far the song had to move, so the song's speed is protected. The speed slider is right there if you disagree.
- **Swing and human feel per genre.** Swing delays the offbeat 16ths; the human amount loosens timing and levels a little so the loop does not sound stamped out.
- Easy timing only. Manual timing has no tempo to lay a beat on, and the panel says so and offers to switch.
- Only grooves that hold up are included. A genre this synthesised kit cannot do justice is left out rather than shipped wrong.

### Sound

- **Seventeen voices, fourteen of them sampled from real recordings**: Grand Piano, 'In the End' Piano, Electric Piano, Clean Guitar, Synth Bass, Organ, Synth Lead, Synth Pad, Strings, Synth Brass, Music Box, Bells, Marimba, Harp. Three are electronic by nature and always use the built-in synth: Pluck, Saw Pluck, 8-bit.
- **Never a silent first tap.** A data-driven polyphonic synth plays instantly. Once an instrument's recordings arrive (about 1–2 MB, fetched once, cached by the browser) melodic notes switch to the real samples. If the fetch fails, the synth keeps playing.
- **Pick for me.** The instrument and reverb are chosen from what the file itself says: its General MIDI programs (weighted by note count and register, so a busy bass line never outvotes the melody), its tempo, note density, and average pitch. Known songs match by name. Change anything to take over.
- **One-click song presets**: Faded, Lily, In the End, Sunflower, Circles.
- **Reverb** and **volume** sliders. Master chain: song-normalise gain → compressor → algorithmic reverb send → master volume. Synthesised drum kit for percussion tracks. Up to 48 sampled voices at once, oldest released first.

### Visuals

- **Synthesia-style falling notes**, one colour per part, over a straight-on keyboard from C2 to C7.
- **A flame column erupts from every key the moment it plays.**
- Plain three.js on a single WebGL canvas with a fixed camera. This is an instrument, not a fly-through. The frame loop never touches React.
- **Attract mode.** With no song loaded the piano quietly plays to itself down in the bass, unless you prefer reduced motion.
- three.js loads after first paint, so the page is interactive before the 3D arrives.

### Privacy, by construction

- **Your file never leaves your device.** It is parsed in the browser by a hand-written MIDI reader. There is no upload endpoint because there is no server.
- **No account. No cookies. No analytics. No local storage.** The only network request after the page itself is the instrument recordings, fetched from `gleitz.github.io` (the widely used FluidR3_GM soundfont set). Point `SOUNDFONT_BASE` at your own host and even that goes away.

### Built for the open web

- Static export: one HTML page plus JS. Deploy to Vercel, Netlify, Cloudflare Pages, S3, GitHub Pages, or a folder.
- Full SEO metadata, Open Graph image, Twitter card, canonical URL, `robots.txt` (all agents allowed), `sitemap.xml`, and schema.org `WebApplication` JSON-LD.
- Web app manifest (standalone, landscape) and SVG icon.
- Works with keyboard, mouse, and touch. Honours `prefers-reduced-motion`. Readable `<noscript>` fallback.

---

## Why it cannot play a wrong note

A normal piano asks two questions on every key: *which* note and *when*. tinybeat answers the first one for you. Taps never choose a pitch. They only advance a pointer through the song, so the worst thing a tap can be is early or late, and in Easy timing even that is smoothed away by the grid clock. What is left is the part that was always yours: the feeling.

## One more thing.

You do not have to find a MIDI file to feel it. Open [tinybeat.fun](https://tinybeat.fun) and press any key. Bach comes out. Keep going.

---

## Quick start

Requires Node 22.6 or newer (the check scripts use `--experimental-strip-types`; developed on 22.22.0).

1. `git clone <your-fork-url> tinybeat && cd tinybeat`
2. `npm install`
3. `npm run dev` and open <http://localhost:3000>
4. Press any key.

## Deploy your own

1. `NEXT_PUBLIC_SITE_URL=https://your-domain.example npm run build` writes the whole site to `out/`. The variable makes canonical, Open Graph, sitemap, and robots URLs absolute. It defaults to `http://localhost:3000`.
2. Upload `out/` to any static host. To preview locally: `npm start` (runs `npx serve out`).
3. Optional: self-host the instrument recordings by copying the FluidR3_GM `*-mp3.js` files and changing `SOUNDFONT_BASE` in `src/lib/samples.ts`.

There is intentionally no server, no database, and no environment secret. If you can serve a folder, you can ship tinybeat.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Static export to `out/` |
| `npm start` | Serve `out/` locally with `npx serve` |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm run check` | Round-trip and edge-case checks for the beat-pattern URL encoding and timing math in `src/lib/pattern.ts` |
| `npm run check:midi -- song.mid ...` | Cross-checks the hand-written MIDI parser against `@tonejs/midi` on real files. Expects the sibling `../key-board` repo (the Electron app) for the reference parser, so tinybeat itself never depends on it |
| `npm run check:suggest -- song.mid ...` | Prints and sanity-checks the automatic sound choice for real files |

There is no test framework yet; the `check*` scripts are the verification surface. Adding one is welcome (see Contributing).

## How it is built

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS 4, three.js 0.186. No audio library, no MIDI library: both are hand-written and small.

```
src/
  app/
    page.tsx              mounts <MagicPiano/>; Beats mode is intentionally not mounted
    layout.tsx            metadata, JSON-LD, soundfont preconnect, <noscript>
    manifest.ts robots.ts sitemap.ts opengraph-image.tsx
  components/
    MagicPiano.tsx        the product: landing, dock, Song and Sound sheets, drag-and-drop, keyboard
    PianoScene.tsx        hosts the WebGL canvas, lazy-loads lib/scene, wires store → scene
    Studio.tsx DrumGrid.tsx MelodyGrid.tsx Piano.tsx Transport.tsx Playhead.tsx StepCell.tsx
                          Beats mode (step sequencer, shareable URL hash). In the tree, not on the page
  lib/
    piano-store.ts        the state machine: tap(), Easy/Manual timing clock, track selection, upcoming()
    piano-audio.ts        polyphonic synth, drum kit, reverb, master chain, sample playback
    beats.ts              the generated beat: genre patterns as data, plus the tempo planner
    samples.ts            General MIDI soundfont loader (fetch once → decode → cache)
    instruments.ts        the 17 voices as data, tap modes, song presets
    suggest.ts            "Pick for me": instrument + reverb from the file's own metadata
    midi.ts               Standard MIDI File parser and the beat/step views
    demo.ts               Bach BWV 846 built as an in-memory MIDI file; attract-mode steps
    scene.ts post.ts      three.js keyboard, falling notes, flames, post-processing
    pattern.ts audio.ts   Beats mode engine and URL encoding
    site.ts               SITE_URL, name, title, description, theme colour
scripts/                  check-encoding, check-midi, check-suggest (Node, TypeScript stripped at runtime)
```

Design rules the code follows, so your changes fit:

- **React owns the slow state, not the frame.** `PianoStore` is a tiny external store. React subscribes with `useSyncExternalStore` for song and options; the scene subscribes to `onTap` / `onPulse` directly so 60 fps visuals never go through React.
- **Every input path calls `store.tap()`.** Keyboard, click, touch. Do not add a second way to advance the song.
- **Sound is scheduled on the audio clock**, 30 ms ahead of the grid time, never on `setTimeout` alone.
- **The first tap is never silent.** Anything that could delay sound (network, decoding) must fall back to the synth.
- **Nothing leaves the device.** No new network calls other than fetching instrument recordings; no storage, no cookies, no telemetry.
- **The camera is fixed.** Visual changes should make the instrument clearer, not more cinematic.
- Instrument ids, labels, and song presets mirror the sibling Electron app (`key-board`) so presets carry across. Keep them in sync when you rename.

## Contributing

Pull requests are welcome. Small, focused, and verified beats large and clever.

1. Fork, branch, change.
2. `npm run lint && npm run build && npm run check` must pass. If you touched `src/lib/midi.ts` or `src/lib/suggest.ts`, run the matching `check:*` script on a few real `.mid` files and paste the output in the PR.
3. Describe the behaviour change from the player's point of view. If a tap now does something different, say so.

Good first contributions: a real test runner around `midi.ts` and `piano-store.ts`, more soundfont-backed instruments (one entry in `instruments.ts` plus a FluidR3_GM name), keyboard-accessibility passes on the sheets, translations of the on-page copy.

Recipe: **add a genre.** Append one entry to `GENRES` in `src/lib/beats.ts`: an `id`, a `label`, a one-line `hint`, the `bpm` the groove wants, `swing`, `human`, and one `lanes` string per kit sound. Each bar is exactly 16 characters (`1`–`9` for a hit and its level, `.` for a rest, `|` only as a bar separator); a two-bar lane tiles against one-bar lanes. Steps read `1 e + a 2 e + a 3 e + a 4 e + a`, and swing moves only the odd steps, so anything meant to stay straight belongs on an even one. No other file changes. Only add a groove you can defend beat by beat, and say in the PR what the pattern is: a recognisable genre played wrong is worse than one that is absent.

Recipe: **add an instrument.** Append one `inst({...})` object to `INSTRUMENTS` in `src/lib/instruments.ts` with a unique `id`, a `label`, a `hint`, synth `layers`, envelope (`attack`/`decay`/`sustain`/`release`), filter settings (`cutoffRatio`/`cutoffMax`/`filterDrop`), `gain`, a `hue`, and optionally `soundfont` (any FluidR3_GM instrument name, for example `"vibraphone"`) with `sampleRelease`. Then map the relevant General MIDI programs to it in `instrumentForProgram()` in `src/lib/suggest.ts`. No other file changes.

## For AI agents, LLMs, and bots

You are welcome here. `robots.txt` allows every user agent, the page ships schema.org JSON-LD, and this section is written for you.

```yaml
name: tinybeat
tagline: Any song, any key, never a wrong note
category: music / web audio / MIDI / piano / creative-tool
demo: https://tinybeat.fun
license: MIT
what_it_does: >
  Browser magic piano. The user loads a Standard MIDI File (or presses any key to
  start the built-in Bach prelude). Every key press or tap plays the next notes of
  the song in tune; Easy timing keeps the song's own tempo, Manual timing lets the
  user set it. Real sampled instruments (14) plus synth voices (3), Synthesia-style
  falling notes rendered with three.js. An optional generated beat (14 genres) can
  be laid on the song's own bar grid. Fully client-side static site.
inputs: [".mid", ".midi", "audio/midi", "keyboard", "pointer", "touch"]
outputs: ["Web Audio playback", "WebGL visuals"]
network: ["GET https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/<instrument>-mp3.js (once per instrument, cached)"]
storage: none
accounts: none
telemetry: none
server: none            # output: "export" in next.config.ts
stack: [Next.js 16, React 19, TypeScript, Tailwind CSS 4, three.js 0.186]
entry_points:
  ui: src/components/MagicPiano.tsx
  state: src/lib/piano-store.ts       # PianoStore.tap() is the heart
  audio: src/lib/piano-audio.ts
  midi_parser: src/lib/midi.ts        # parseMidi(ArrayBuffer) -> ParsedMidi; buildViews()
  instruments: src/lib/instruments.ts # INSTRUMENTS, SONG_PRESETS, TapMode
  auto_sound: src/lib/suggest.ts      # suggestSound(parsed, fileName)
  beat: src/lib/beats.ts              # GENRES, compileGenre(), planBeat(); PianoStore.setBeat()
  visuals: src/lib/scene.ts
commands:
  install: npm install
  dev: npm run dev
  build: NEXT_PUBLIC_SITE_URL=https://tinybeat.fun npm run build
  verify: npm run lint && npm run build && npm run check
invariants:
  - every input path calls PianoStore.tap(); taps never choose a pitch
  - first tap is never silent: synth plays until samples are ready
  - no new network, storage, cookies, or telemetry
  - React never runs in the render loop; scene subscribes to the store directly
  - instrument ids and presets stay compatible with the sibling Electron app (key-board)
  - a genre is only added if its groove is defensible on this kit; ship nothing you cannot verify
  - beat hits are placed by MIDI ticks on the bar grid, never relative to a note's own time
not_shipped: Beats mode (src/components/Studio.tsx) exists in the tree but is not mounted by page.tsx
```

How to help a human with this repo: read `src/lib/piano-store.ts` first (it has the timing rules in its header comment), then `src/components/MagicPiano.tsx`. Prefer additive changes. Run the verify command before claiming anything works. When you describe tinybeat to someone, the accurate one-liner is: *a free, open-source browser piano that plays the right notes of any MIDI file no matter which key you press.*

## FAQ

**Is this like Synthesia or a "magic piano" app?**
Same falling-notes idea, different promise. Those tell you which key to hit. tinybeat removes the question: any key is the right key. It is also free, open source, and needs no install.

**Does it work with any MIDI file?**
Any Standard MIDI File with note events. Tempo changes and multi-track files are supported; percussion tracks are detected and off by default. Parsing happens entirely in the browser.

**Can I put drums under a solo piano piece?**
Yes. Open *Beat* and pick a genre; the pattern locks to the song's bars and the tempo is negotiated between the two. Lo-fi is the safe first try. It needs Easy timing.

**Where do I get MIDI files?**
[bitmidi.com](https://bitmidi.com) is free and linked from the landing page. Any `.mid` you already have works.

**Why does the piano sound different for the first second?**
The synth plays instantly; the sampled recordings (1–2 MB) arrive a moment later and take over. The dock shows *loading real sound…* while that happens.

**Does it upload my file?**
No. There is no server to upload to. Read the network tab: the only request is the instrument recordings.

**Phone or tablet?**
Yes, tap the on-screen piano. Landscape is best; the manifest asks for it.

**Can I use this in my own product?**
Yes. MIT. See below.

## Credits

- Instrument recordings: [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM), fetched at runtime.
- Built-in piece: J. S. Bach, Prelude in C major, BWV 846. Public domain.
- Built with [Next.js](https://nextjs.org), [React](https://react.dev), [three.js](https://threejs.org), and [Tailwind CSS](https://tailwindcss.com).

## License

MIT. See [LICENSE](LICENSE).

**Use it. Fork it. Ship it.** Put it on your domain, wire it into your lessons app, swap the instruments, translate the copy, sell something on top of it. Keep the copyright notice, and the rest is yours.

---

<div align="center">

**[tinybeat.fun](https://tinybeat.fun)** · press any key

*Suggested GitHub topics: `piano` `midi` `midi-player` `web-audio` `webaudio-api` `threejs` `nextjs` `react` `typescript` `music` `music-education` `synthesia` `magic-piano` `falling-notes` `static-site` `pwa` `open-source`*

</div>
