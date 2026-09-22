// The piano scene, Synthesia-style: a straight-on keyboard across the bottom,
// a dark lane above it where the upcoming notes fall as coloured bars, and a
// flame column that erupts from every key the moment it plays.
//
// Plain three.js, one WebGL canvas, no React in the frame loop. The camera is
// fixed: this is an instrument, not a fly-through.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";
import type { AttractStep } from "./demo";
import type { PlayedNote } from "./piano-audio";
import type { PianoStore, TapEvent, UpcomingTap } from "./piano-store";
import { Post } from "./post";

// ---------- layout (world units; the camera frames exactly this box) ----------
const LOW = 36; // C2
const HIGH = 96; // C7
const WHITE_W = 1;
const KEY_H = 6.2; // white key height (≈33% of a 16:9 stage)
const BLACK_H = 3.9;
const BLACK_W = 0.58;
const LANE_H = 14; // nominal lane height; the real height follows the viewport
const AHEAD = 6; // upcoming taps drawn: enough to see what is coming, not a wall
const BAR_SPACING = 3.4; // free mode: world units between consecutive taps
const FALL_SPEED = 6.5; // easy mode: world units per second the bars descend
const FLAMES = 24; // simultaneous flame columns
const SPARKS = 400;

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

interface Key {
  midi: number;
  black: boolean;
  x: number; // centre
  w: number;
  press: number; // 0..1 shown
  target: number;
  glow: Color;
  hue: number;
}

interface Spark {
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
  size: number;
}

interface Flame {
  key: Key | null;
  life: number; // 1 -> 0
  hue: number;
  seed: number;
  /** attract-mode flame: half brightness */
  dim: boolean;
}

export interface SceneHandle {
  tap: (e: TapEvent) => void;
  /** feedback for a tap that did not play a note */
  pulse: () => void;
  /**
   * With no song loaded, play this sequence silently and dimmed so the page
   * shows what it does before anyone touches it. null stops it.
   */
  setAttract: (steps: AttractStep[] | null) => void;
  setHue: (hue: number) => void;
  setIdle: (idle: boolean) => void;
  /** re-read the upcoming notes from the store (after load, mode change, rewind) */
  refresh: () => void;
  dispose: () => void;
  pick: (clientX: number, clientY: number) => number | null;
  nudge: (midi: number) => void;
}

export function createScene(canvas: HTMLCanvasElement, store: PianoStore): SceneHandle {
  // Flat shading with soft edges: 1.5x is visually identical to 2x here and
  // renders ~44% fewer pixels on Retina. The offscreen target carries 4x MSAA.
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  let post: Post | null = null;

  const scene = new Scene();
  scene.background = new Color("#050508");

  /** Colour per part, from the store (the busiest part carries the instrument hue). */
  const noteHue = (n: { track?: number }) => store.hueForTrack(n.track);

  // ---------- keyboard geometry ----------
  const keys: Key[] = [];
  const byMidi = new Map<number, Key>();
  let whites = 0;
  for (let m = LOW; m <= HIGH; m++) if (!isBlack(m)) whites++;
  const width = whites * WHITE_W;
  let wx = WHITE_W / 2;
  let lastWhite = wx;
  for (let m = LOW; m <= HIGH; m++) {
    const black = isBlack(m);
    let x: number;
    if (black) x = lastWhite + WHITE_W / 2;
    else {
      x = wx;
      lastWhite = wx;
      wx += WHITE_W;
    }
    const key: Key = { midi: m, black, x, w: black ? BLACK_W : WHITE_W, press: 0, target: 0, glow: new Color(), hue: 260 };
    keys.push(key);
    byMidi.set(m, key);
  }
  const height = KEY_H + LANE_H;

  // Orthographic: a flat, straight-on view where world x maps to screen x
  // linearly, so falling bars line up exactly with the keys below them.
  const camera = new OrthographicCamera(0, width, height, 0, 0.1, 100);
  camera.position.z = 10;

  // ---------- key faces, drawn by a shader so press/glow is one uniform array ----------
  const keyGeo = new PlaneGeometry(1, 1);
  const keyCount = keys.length;
  const keyMesh = new InstancedMesh(keyGeo, keyMaterial(), keyCount);
  const aBlack = new Float32Array(keyCount);
  const aPress = new Float32Array(keyCount);
  const aGlow = new Float32Array(keyCount * 3);
  const dummy = new Object3D();
  keys.forEach((k, i) => {
    const h = k.black ? BLACK_H : KEY_H;
    dummy.position.set(k.x, k.black ? KEY_H - h / 2 : h / 2, k.black ? 0.2 : 0);
    dummy.scale.set(k.black ? BLACK_W : WHITE_W - 0.06, h - (k.black ? 0 : 0.08), 1);
    dummy.updateMatrix();
    keyMesh.setMatrixAt(i, dummy.matrix);
    aBlack[i] = k.black ? 1 : 0;
  });
  keyGeo.setAttribute("aBlack", new InstancedBufferAttribute(aBlack, 1));
  keyGeo.setAttribute("aPress", new InstancedBufferAttribute(aPress, 1));
  keyGeo.setAttribute("aGlow", new InstancedBufferAttribute(aGlow, 3));
  scene.add(keyMesh);

  // key labels (C notes only, like the reference's bottom row) drawn to a texture strip
  const labels = new Mesh(new PlaneGeometry(width, 0.9), new MeshBasicMaterial({ map: labelTexture(keys, width), transparent: true, depthWrite: false }));
  labels.position.set(width / 2, 0.55, 0.3);
  scene.add(labels);

  // ---------- the lane: dark, with faint guide lines under the black keys ----------
  const lane = new Mesh(new PlaneGeometry(width, LANE_H), laneMaterial(keys.filter((k) => k.black).map((k) => k.x / width)));
  lane.position.set(width / 2, KEY_H + LANE_H / 2, -1);
  scene.add(lane);

  // hit line glow where bars meet the keys
  const hitLine = new Mesh(
    new PlaneGeometry(width, 1.6),
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uHue: { value: new Color() }, uEnergy: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uHue; uniform float uEnergy; varying vec2 vUv;
        void main(){ float a = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 3.0) * (0.12 + uEnergy * 0.35); gl_FragColor = vec4(uHue * a, a); }`,
    }),
  );
  hitLine.position.set(width / 2, KEY_H, 0.5);
  scene.add(hitLine);

  // ---------- falling bars: one instanced quad per upcoming note ----------
  const MAX_BARS = AHEAD * 12;
  const barGeo = new PlaneGeometry(1, 1);
  const barMesh = new InstancedMesh(barGeo, barMaterial(), MAX_BARS);
  const aBarColor = new Float32Array(MAX_BARS * 3);
  barGeo.setAttribute("aColor", new InstancedBufferAttribute(aBarColor, 3));
  barMesh.frustumCulled = false;
  scene.add(barMesh);

  // ---------- flames: additive shader columns rising from played keys ----------
  const flameGeo = new PlaneGeometry(1, 1);
  const flameMesh = new InstancedMesh(flameGeo, flameMaterial(), FLAMES);
  const aFlameLife = new Float32Array(FLAMES);
  const aFlameColor = new Float32Array(FLAMES * 3);
  const aFlameSeed = new Float32Array(FLAMES);
  flameGeo.setAttribute("aLife", new InstancedBufferAttribute(aFlameLife, 1));
  flameGeo.setAttribute("aColor", new InstancedBufferAttribute(aFlameColor, 3));
  flameGeo.setAttribute("aSeed", new InstancedBufferAttribute(aFlameSeed, 1));
  flameMesh.frustumCulled = false;
  scene.add(flameMesh);
  const flames: Flame[] = Array.from({ length: FLAMES }, () => ({ key: null, life: 0, hue: 0, seed: Math.random() * 100, dim: false }));

  // ---------- sparks ----------
  const sparkTex = sparkTexture();
  const sparks: Spark[] = Array.from({ length: SPARKS }, () => ({ life: 0, x: 0, y: 0, vx: 0, vy: 0, hue: 0, size: 1 }));
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  const sparkSize = new Float32Array(SPARKS);
  const sparkGeo = new BufferGeometry();
  sparkGeo.setAttribute("position", new BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new BufferAttribute(sparkCol, 3));
  sparkGeo.setAttribute("aSize", new BufferAttribute(sparkSize, 1));
  const sparkMat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTex: { value: sparkTex }, uScale: { value: 1 } },
    vertexShader: `attribute float aSize; attribute vec3 color; varying vec3 vColor; uniform float uScale;
      void main(){ vColor = color; gl_PointSize = aSize * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vColor; void main(){ gl_FragColor = vec4(vColor,1.0) * texture2D(uTex, gl_PointCoord); }`,
  });
  const sparkPoints = new Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  sparkPoints.position.z = 1;
  scene.add(sparkPoints);
  let sparkCursor = 0;
  let sparksAlive = 0;

  // ---------- state ----------
  let hue = 260;
  let idle = true;
  let energy = 0;
  let upcoming: UpcomingTap[] = [];
  let scroll = 0; // free mode: how far the stack has glided since the last tap, 0..1
  let refreshAt = performance.now(); // easy mode: wall-clock anchor for the etas in `upcoming`
  let attract: AttractStep[] | null = null;
  let attractIdx = 0;
  let attractNext = 0; // wall-clock ms of the next attract step (0 = not started)
  let laneHeight = LANE_H; // visible lane height in world units, set by resize()
  let lastTime = performance.now();
  let raf = 0;
  let disposed = false;
  const tmp = new Color();
  const hsl = (h: number, s: number, l: number) => tmp.setHSL((((h % 360) + 360) % 360) / 360, s, l);

  function refresh(): void {
    upcoming = store.upcoming(AHEAD + 1);
    scroll = 0;
    refreshAt = performance.now();
  }

  /** An absorbed tap: light the hit line so the player knows they were heard. */
  function pulse(): void {
    energy = Math.min(1.5, energy + 0.25);
  }

  /**
   * Attract mode plays in the left third of the keyboard, two octaves down,
   * so the performance frames the landing copy instead of running through it.
   */
  const ATTRACT_SHIFT = -24;
  function attractKey(midi: number): number {
    let m = midi + ATTRACT_SHIFT;
    while (m < LOW) m += 12;
    while (m > HIGH) m -= 12;
    return m;
  }
  // shifted copies are built once per step and reused every frame
  const attractCache = new WeakMap<AttractStep, PlayedNote[]>();
  function attractNotes(step: AttractStep): PlayedNote[] {
    let notes = attractCache.get(step);
    if (!notes) {
      notes = step.notes.map((n) => ({ ...n, midi: attractKey(n.midi) }));
      attractCache.set(step, notes);
    }
    return notes;
  }

  function spark(x: number, y: number, h: number, size: number): void {
    const s = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % SPARKS;
    if (s.life <= 0) sparksAlive++;
    s.life = 1;
    s.x = x + (Math.random() - 0.5) * 0.6;
    s.y = y;
    s.vx = (Math.random() - 0.5) * 3;
    s.vy = 4 + Math.random() * 7;
    s.hue = h + (Math.random() - 0.5) * 30;
    s.size = size * (0.5 + Math.random());
  }

  function ignite(key: Key, h: number, velocity: number, dim = false): void {
    // reuse the flame on this key if it is still burning, else the deadest one
    const f = flames.find((x) => x.key === key) ?? flames.reduce((a, b) => (a.life <= b.life ? a : b));
    f.key = key;
    f.life = dim ? 0.8 : 1;
    f.hue = h;
    f.dim = dim;
    key.target = dim ? 0.7 : 1;
    key.hue = h;
    key.glow.copy(hsl(h, 0.9, 0.6));
    if (dim) key.glow.multiplyScalar(0.6);
    const n = dim ? 2 + Math.round(velocity * 3) : 5 + Math.round(velocity * 6);
    for (let i = 0; i < n; i++) spark(key.x, KEY_H + 0.2, h, 3 + velocity * 3);
  }

  function tap(e: TapEvent): void {
    idle = false;
    energy = Math.min(1.5, energy + 0.4 + e.velocity * 0.3);
    for (const n of e.notes) {
      if (n.percussion) continue;
      let midi = n.midi;
      while (midi < LOW) midi += 12;
      while (midi > HIGH) midi -= 12;
      const key = byMidi.get(midi);
      if (key) ignite(key, noteHue(n), e.velocity);
    }
    refresh();
  }

  function nudge(midi: number): void {
    const key = byMidi.get(midi);
    if (key) key.target = Math.max(key.target, 0.6);
  }

  // ---------- frame ----------
  let quietFor = 0; // seconds with nothing but ambience moving
  function frame(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const elapsed = (now - lastTime) / 1000;
    // Low-power idle: when nothing is in motion, render at ~24 fps. The
    // ambience breathes slowly enough that nobody can tell.
    if (quietFor > 1 && elapsed < 1 / 24) return;
    const dt = Math.min(0.05, elapsed);
    lastTime = now;
    const t = now / 1000;
    energy = Math.max(0, energy - dt * 1.1);
    let busy = energy > 0.01 || store.rolling || scroll < 1;

    // keys: upload only while something is moving
    let keysMoving = false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.press === 0 && k.target === 0) continue;
      const rate = k.target > k.press ? 30 : 6;
      k.press += (k.target - k.press) * Math.min(1, dt * rate);
      if (k.press < 0.002 && k.target === 0) k.press = 0;
      k.target = Math.max(0, k.target - dt * 4);
      aPress[i] = k.press;
      aGlow[i * 3] = k.glow.r;
      aGlow[i * 3 + 1] = k.glow.g;
      aGlow[i * 3 + 2] = k.glow.b;
      keysMoving = true;
    }
    if (keysMoving) {
      busy = true;
      (keyGeo.getAttribute("aPress") as InstancedBufferAttribute).needsUpdate = true;
      (keyGeo.getAttribute("aGlow") as InstancedBufferAttribute).needsUpdate = true;
    }

    // lane. Easy mode: bars fall at the song's real tempo, each one landing on
    // the hit line the instant its notes sound (position = eta * speed).
    // Free mode: the stack glides down one slot after each tap and rests, so
    // the next tap's notes always sit just above the keys.
    scroll = Math.min(1, scroll + dt * 4.5);
    const ease = 1 - (1 - scroll) * (1 - scroll);
    // Attract mode: with no song loaded, the built-in piece plays itself
    // silently and dimmed, one beat at a time, so the page demonstrates itself.
    const attracting = idle && attract !== null && attract.length > 0;
    if (attracting) {
      const seq = attract!;
      if (attractNext === 0) attractNext = now + 1400;
      if (now >= attractNext) {
        const step = seq[attractIdx];
        for (const n of step.notes) {
          const key = byMidi.get(attractKey(n.midi));
          if (key) ignite(key, hue + (n.midi - 72) * 2.2, 0.5, true);
        }
        energy = Math.min(1, energy + 0.12);
        attractIdx = (attractIdx + 1) % seq.length;
        // after a hidden tab, resume from now rather than firing a burst of catch-up steps
        attractNext = Math.max(attractNext + step.gap * 1000, now - 50);
      }
      upcoming.length = 0;
      let eta = Math.max(0, (attractNext - now) / 1000);
      for (let d = 0; d <= AHEAD; d++) {
        const s = seq[(attractIdx + d) % seq.length];
        upcoming.push({ distance: d, notes: attractNotes(s), eta });
        eta += s.gap;
      }
      busy = true;
    }

    // Rolling: bars fall on wall-clock time from the moment the etas were
    // captured, so each lands on the hit line at the instant its sound is
    // scheduled. Paused, or in manual mode: the stack rests in even slots with
    // the next notes on the hit line, ready for the next tap.
    const timed = attracting || (store.rolling && upcoming.length > 1 && upcoming[1].eta > 0);
    const laneTime = timed && !attracting ? (now - refreshAt) / 1000 : 0;
    let bar = 0;
    lowestBarY = Infinity;
    for (const u of upcoming) {
      let y0: number;
      if (timed) {
        const eta = Math.max(0, u.eta - laneTime);
        y0 = KEY_H + 0.3 + eta * FALL_SPEED;
      } else {
        y0 = KEY_H + 0.35 + (u.distance + (1 - ease)) * BAR_SPACING;
      }
      if (y0 > KEY_H + laneHeight + 2) break;
      if (u.notes.some((n) => !n.percussion)) lowestBarY = Math.min(lowestBarY, y0);
      for (const n of u.notes) {
        if (n.percussion || bar >= MAX_BARS) continue;
        let midi = n.midi;
        while (midi < LOW) midi += 12;
        while (midi > HIGH) midi -= 12;
        const k = byMidi.get(midi);
        if (!k) continue;
        // bar length follows the note's written length, within readable limits
        const h = timed ? Math.min(2.6, Math.max(0.9, (n.duration ?? 0.3) * FALL_SPEED * 0.8)) : BAR_SPACING * 0.5;
        dummy.position.set(k.x, y0 + h / 2, k.black ? 0.4 : 0.2);
        dummy.scale.set(k.w * (k.black ? 0.95 : 0.66), h, 1);
        dummy.updateMatrix();
        barMesh.setMatrixAt(bar, dummy.matrix);
        // the imminent tap is brightest; further ones dim with distance
        const c = hsl(noteHue(n), 0.8, u.distance === 0 ? 0.6 : 0.5 - Math.min(0.14, u.distance * 0.025));
        aBarColor[bar * 3] = c.r;
        aBarColor[bar * 3 + 1] = c.g;
        aBarColor[bar * 3 + 2] = c.b;
        bar++;
      }
    }
    barMesh.count = bar;
    barMesh.instanceMatrix.needsUpdate = true;
    (barGeo.getAttribute("aColor") as InstancedBufferAttribute).needsUpdate = true;

    // flames: compact the live ones to the front so the draw count is exact
    let live = 0;
    for (const f of flames) {
      if (f.life <= 0 || !f.key) continue;
      f.life = Math.max(0, f.life - dt * 0.9);
      if (f.life <= 0) {
        f.key = null;
        continue;
      }
      // a column standing on the top edge of the key, shortening as it dies
      const h = 6.5 + f.life * 5.0;
      dummy.position.set(f.key.x, KEY_H - 0.2 + h / 2, 0.8);
      dummy.scale.set(f.key.w * (f.key.black ? 2.4 : 1.5), h, 1);
      dummy.updateMatrix();
      flameMesh.setMatrixAt(live, dummy.matrix);
      aFlameLife[live] = f.life;
      aFlameSeed[live] = f.seed;
      const c = hsl(f.hue, 0.95, 0.6);
      const k = f.dim ? 0.5 : 1; // additive, so half the colour is half the light
      aFlameColor[live * 3] = c.r * k;
      aFlameColor[live * 3 + 1] = c.g * k;
      aFlameColor[live * 3 + 2] = c.b * k;
      live++;
    }
    flameMesh.count = live;
    if (live) {
      busy = true;
      flameMesh.instanceMatrix.needsUpdate = true;
      (flameGeo.getAttribute("aLife") as InstancedBufferAttribute).needsUpdate = true;
      (flameGeo.getAttribute("aSeed") as InstancedBufferAttribute).needsUpdate = true;
      (flameGeo.getAttribute("aColor") as InstancedBufferAttribute).needsUpdate = true;
    }
    (flameMesh.material as ShaderMaterial).uniforms.uTime.value = t;

    // sparks: skip the whole pass when none are alive
    if (sparksAlive > 0) {
      busy = true;
      sparksAlive = 0;
      for (let i = 0; i < SPARKS; i++) {
        const s = sparks[i];
        if (s.life > 0) {
          s.life -= dt * 0.9;
          s.vy -= dt * 9;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (s.life > 0) sparksAlive++;
        }
        const l = Math.max(0, s.life);
        sparkPos[i * 3] = s.x;
        sparkPos[i * 3 + 1] = s.y;
        const c = hsl(s.hue, 0.9, 0.55 + 0.4 * l * l);
        const fade = Math.min(1, l * 2) * l * 1.5;
        sparkCol[i * 3] = c.r * fade;
        sparkCol[i * 3 + 1] = c.g * fade;
        sparkCol[i * 3 + 2] = c.b * fade;
        sparkSize[i] = s.size * (0.3 + 0.7 * l);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
      sparkGeo.attributes.aSize.needsUpdate = true;
    }

    // ambience
    const hm = hitLine.material as ShaderMaterial;
    (hm.uniforms.uHue.value as Color).copy(hsl(hue, 0.8, 0.6));
    hm.uniforms.uEnergy.value = energy;
    const lm = lane.material as ShaderMaterial;
    lm.uniforms.uTime.value = t;
    lm.uniforms.uIdle.value = idle ? 1 : 0;
    (lm.uniforms.uHue.value as Color).copy(hsl(hue, 0.7, 0.5));
    (lm.uniforms.uHue2.value as Color).copy(hsl(hue + 137.5, 0.7, 0.5));

    quietFor = busy ? 0 : quietFor + dt;

    renderer.info.reset();
    if (post) {
      renderer.setRenderTarget(post.target);
      renderer.render(scene, camera);
      post.render(t);
    } else {
      renderer.render(scene, camera);
    }
    frameCalls = renderer.info.render.calls;
  }
  let frameCalls = 0;
  let lowestBarY = Infinity; // world y of the nearest upcoming bar (probe / tests)

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const pw = Math.ceil(w * renderer.getPixelRatio());
    const ph = Math.ceil(h * renderer.getPixelRatio());
    if (post) post.setSize(pw, ph);
    else post = new Post(renderer, pw, ph);
    // Fit the keyboard width to the viewport; the lane takes whatever height
    // remains above it. Tall screens see more upcoming notes.
    const aspect = w / h;
    const viewH = width / aspect;
    camera.left = 0;
    camera.right = width;
    camera.bottom = 0;
    camera.top = viewH;
    camera.updateProjectionMatrix();
    laneHeight = Math.max(2, viewH - KEY_H);
    // point size is in device pixels: ~2 px per size unit at 1x, so sparks land at 4–15 px
    sparkMat.uniforms.uScale.value = (h / viewH) * Math.min(devicePixelRatio, 1.5) * 0.07;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  refresh();
  raf = requestAnimationFrame(frame);

  function pick(clientX: number, clientY: number): number | null {
    const r = canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * width;
    const y = (1 - (clientY - r.top) / r.height) * camera.top;
    if (y > KEY_H) return null;
    if (y > KEY_H - BLACK_H) {
      for (const k of keys) if (k.black && Math.abs(x - k.x) <= BLACK_W / 2) return k.midi;
    }
    for (const k of keys) if (!k.black && Math.abs(x - k.x) <= WHITE_W / 2) return k.midi;
    return null;
  }

  // Dev-only probe: draw calls and live instance counts, for the smoke tests.
  if (process.env.NODE_ENV !== "production") {
    renderer.info.autoReset = false;
    (window as unknown as { __tb?: () => unknown }).__tb = () => ({
      calls: frameCalls,
      lowestBarY,
      flames: flameMesh.count,
      bars: barMesh.count,
      sparksAlive,
      quietFor,
      pixelRatio: renderer.getPixelRatio(),
      size: [canvas.width, canvas.height],
    });
  }

  return {
    tap,
    pulse,
    nudge,
    pick,
    refresh,
    setHue: (h) => {
      hue = h;
    },
    setIdle: (v) => {
      idle = v;
      attractNext = 0; // a fresh start (with its pause) whenever attract resumes
    },
    setAttract: (steps) => {
      attract = steps;
      attractIdx = 0;
      attractNext = 0;
      if (!steps) refresh();
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      post?.dispose();
      renderer.dispose();
      keyGeo.dispose();
      barGeo.dispose();
      flameGeo.dispose();
      sparkGeo.dispose();
      sparkTex.dispose();
    },
  };
}

// ---------- materials ----------

function keyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute float aBlack; attribute float aPress; attribute vec3 aGlow;
      varying vec2 vUv; varying float vBlack; varying float vPress; varying vec3 vGlow;
      void main(){ vUv = uv; vBlack = aBlack; vPress = aPress; vGlow = aGlow;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vUv; varying float vBlack; varying float vPress; varying vec3 vGlow;
      void main(){
        // ---- white key: a lit top face, a darker front lip, bevelled sides ----
        // light comes from the top-left, so the left bevel is bright, the right one dark
        vec3 ivory = mix(vec3(0.80,0.78,0.74), vec3(0.88,0.88,0.86), smoothstep(0.0, 0.75, vUv.y));
        float lip = smoothstep(0.0, 0.075, vUv.y);           // 0 on the front face
        ivory *= mix(0.66, 1.0, lip);
        ivory += vec3(0.06) * smoothstep(0.075, 0.085, vUv.y) * (1.0 - smoothstep(0.085, 0.13, vUv.y)); // lip highlight
        float bevL = 1.0 - smoothstep(0.0, 0.07, vUv.x);
        float bevR = 1.0 - smoothstep(1.0, 0.93, vUv.x);
        ivory = mix(ivory, ivory * 1.05, bevL);
        ivory = mix(ivory, ivory * 0.70, bevR);
        // contact shadow where the black keys sit into the whites
        ivory *= 1.0 - (1.0 - vBlack) * 0.14 * smoothstep(0.58, 0.70, vUv.y);

        // ---- black key: glossy lacquer, highlight strip, dark front face ----
        vec3 ebony = mix(vec3(0.22,0.22,0.27), vec3(0.06,0.06,0.085), smoothstep(0.0, 0.55, vUv.y));
        ebony += vec3(0.22,0.22,0.26) * smoothstep(0.09, 0.15, vUv.y) * (1.0 - smoothstep(0.15, 0.24, vUv.y));
        ebony *= mix(0.45, 1.0, smoothstep(0.0, 0.09, vUv.y));
        float ebL = 1.0 - smoothstep(0.0, 0.16, vUv.x);
        float ebR = 1.0 - smoothstep(1.0, 0.84, vUv.x);
        ebony = mix(ebony, ebony * 1.35, ebL);
        ebony = mix(ebony, ebony * 0.45, ebR);

        vec3 base = mix(ivory, ebony, vBlack);
        // a hairline gap between keys
        float gap = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x);
        base *= mix(0.25, 1.0, gap);

        // ---- pressed: sink, then pour the part colour up from the base ----
        base *= 1.0 - vPress * 0.25;
        float pour = smoothstep(0.0, 1.0, vPress * 1.7 - vUv.y * 0.95);
        vec3 lit = vGlow * (0.95 + 0.35 * (1.0 - vBlack));
        vec3 col = mix(base, lit, pour * 0.92);
        // the very top of a pressed key is brightest, where the flame roots
        col += vGlow * vPress * pow(vUv.y, 8.0) * 0.5;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function laneMaterial(blackXs: number[]): ShaderMaterial {
  // guide lines only under the C and F keys (the left edge of each black-key group)
  const lines = blackXs.filter((_, i) => i % 5 === 0 || i % 5 === 2);
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIdle: { value: 1 },
      uLines: { value: lines },
      uHue: { value: new Color("#6b5cff") },
      uHue2: { value: new Color("#ff9a4a") },
    },
    defines: { N: String(Math.max(1, lines.length)) },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform float uIdle; uniform float uLines[N]; uniform vec3 uHue; uniform vec3 uHue2; varying vec2 vUv;
      void main(){
        // near-black with a whisper of blue, darker toward the top
        vec3 col = mix(vec3(0.024, 0.024, 0.038), vec3(0.010, 0.010, 0.018), vUv.y);
        // aurora: two slow bands in the part colours, drifting behind everything
        float a1 = sin(vUv.x * 3.1 + uTime * 0.11) * 0.5 + 0.5;
        float a2 = sin(vUv.x * 2.3 - uTime * 0.07 + 1.7) * 0.5 + 0.5;
        float band1 = exp(-pow((vUv.y - (0.62 + 0.10 * a1)) * 4.5, 2.0));
        float band2 = exp(-pow((vUv.y - (0.42 + 0.12 * a2)) * 5.0, 2.0));
        col += uHue * band1 * 0.055 * (0.7 + 0.3 * a2) + uHue2 * band2 * 0.04 * (0.7 + 0.3 * a1);
        // faint octave guide lines
        float line = 0.0;
        for (int i = 0; i < N; i++) { line += smoothstep(0.0014, 0.0, abs(vUv.x - uLines[i] + 0.0105)); }
        col += vec3(0.035, 0.035, 0.06) * clamp(line, 0.0, 1.0);
        // a soft glow resting on the hit line, breathing very slowly
        col += uHue * pow(1.0 - vUv.y, 6.0) * (0.10 + 0.03 * sin(uTime * 0.6));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function barMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute vec3 aColor; varying vec2 vUv; varying vec3 vColor;
      void main(){ vUv = uv; vColor = aColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vColor;
      void main(){
        // a rounded tile: solid colour, a lighter top edge, a bright rim
        vec2 p = abs(vUv - 0.5) * 2.0;
        float r = 0.42;
        vec2 q = max(p - (1.0 - r), 0.0);
        float d = length(q) / r;
        float a = 1.0 - smoothstep(0.88, 1.0, d);
        float rim = smoothstep(0.55, 0.95, d) * 0.55;
        float sheen = smoothstep(0.35, 1.0, vUv.y) * 0.25;
        vec3 col = vColor * (0.9 + sheen) + vec3(rim) * 0.6;
        gl_FragColor = vec4(col, a * 0.96);
      }`,
  });
}

function flameMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aLife; attribute vec3 aColor; attribute float aSeed;
      varying vec2 vUv; varying float vLife; varying vec3 vColor; varying float vSeed;
      void main(){ vUv = uv; vLife = aLife; vColor = aColor; vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uTime; varying vec2 vUv; varying float vLife; varying vec3 vColor; varying float vSeed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        if (vLife <= 0.0) discard;
        // turbulence scrolling upward, two octaves
        float n1 = noise(vec2(vUv.x * 3.0 + vSeed, vUv.y * 4.0 - uTime * 5.0 + vSeed));
        float n2 = noise(vec2(vUv.x * 7.0 + vSeed * 1.7, vUv.y * 9.0 - uTime * 9.0));
        float n = 0.65 * n1 + 0.35 * n2;
        float dx = abs(vUv.x - 0.5);
        // a tongue of fire: wide at the root, tapering toward the tip
        float taper = pow(1.0 - vUv.y * 0.85, 0.6);
        float w = 0.42 * taper;
        float fray = (n - 0.5) * 0.3 * vUv.y;
        float mantle = 1.0 - smoothstep(w * 0.35, w, dx + fray);
        float core = 1.0 - smoothstep(0.0, w * 0.4, dx + fray * 0.5);
        // the tip is ragged and drops as the flame dies
        float top = 0.55 + 0.45 * vLife;
        float tip = 1.0 - smoothstep(top - 0.45, top, vUv.y + (n - 0.5) * 0.3);
        float shape = max(mantle * 0.7, core) * tip;
        float a = shape * (0.35 + 0.65 * vLife);
        // white-hot root, the part colour above, hotter where the noise peaks
        vec3 col = vColor * (1.2 + 0.8 * n);
        col = mix(col, vec3(1.0, 0.97, 0.92) * 1.6, core * (1.0 - smoothstep(0.0, 0.5, vUv.y)));
        gl_FragColor = vec4(col * a, a);
      }`,
  });
}

// ---------- textures ----------

function sparkTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** Note names along the bottom of the white keys, C in bold like the reference. */
function labelTexture(keys: Key[], width: number): CanvasTexture {
  const scale = 48; // px per world unit
  const c = document.createElement("canvas");
  c.width = Math.ceil(width * scale);
  c.height = Math.ceil(0.9 * scale);
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const k of keys) {
    if (k.black) continue;
    const name = NAMES[k.midi % 12];
    const isC = name === "C";
    g.font = `${isC ? "700" : "500"} ${isC ? 15 : 12}px ui-sans-serif, system-ui, sans-serif`;
    g.fillStyle = isC ? "rgba(40,40,52,0.9)" : "rgba(90,90,105,0.75)";
    g.fillText(name, k.x * scale, c.height / 2);
  }
  const tex = new CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
