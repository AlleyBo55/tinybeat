// A small post-processing chain: bloom, vignette, film grain. Six passes, all
// but the last at quarter resolution. Written by hand so the page ships no
// post-processing library.

import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
  type Texture,
} from "three";

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  private sceneRT: WebGLRenderTarget;
  private brightRT: WebGLRenderTarget;
  private blurRT: WebGLRenderTarget;
  private quad: Mesh;
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: ShaderMaterial;
  private blur: ShaderMaterial;
  private composite: ShaderMaterial;
  private texel = new Vector2();

  constructor(private renderer: WebGLRenderer, width: number, height: number) {
    const opts = { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false } as const;
    this.sceneRT = new WebGLRenderTarget(width, height, { ...opts, depthBuffer: true, samples: 4 });
    this.brightRT = new WebGLRenderTarget(Math.ceil(width / 4), Math.ceil(height / 4), opts);
    this.blurRT = new WebGLRenderTarget(Math.ceil(width / 4), Math.ceil(height / 4), opts);

    this.bright = new ShaderMaterial({
      // Only emissive things bloom: flames, bars, sparks. Keys stay below this.
      uniforms: { tScene: { value: null }, uThreshold: { value: 0.86 }, uKnee: { value: 0.3 } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tScene; uniform float uThreshold; uniform float uKnee; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tScene, vUv).rgb;
          float l = max(max(c.r, c.g), c.b);
          float w = smoothstep(uThreshold, uThreshold + uKnee, l);
          gl_FragColor = vec4(c * w, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.blur = new ShaderMaterial({
      uniforms: { tInput: { value: null }, uDir: { value: new Vector2(1, 0) }, uTexel: { value: this.texel } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tInput; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
        void main(){
          vec2 d = uDir * uTexel;
          vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
          c += texture2D(tInput, vUv + d * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tInput, vUv - d * 1.3846153846).rgb * 0.3162162162;
          c += texture2D(tInput, vUv + d * 3.2307692308).rgb * 0.0702702703;
          c += texture2D(tInput, vUv - d * 3.2307692308).rgb * 0.0702702703;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.composite = new ShaderMaterial({
      uniforms: { tScene: { value: null }, tBloom: { value: null }, uStrength: { value: 0.55 }, uTime: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uStrength; uniform float uTime; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
        void main(){
          vec3 scene = texture2D(tScene, vUv).rgb;
          vec3 bloom = texture2D(tBloom, vUv).rgb;
          vec3 col = scene + bloom * uStrength;
          // soft vignette
          vec2 p = vUv - 0.5;
          col *= 1.0 - dot(p, p) * 0.55;
          // fine grain, barely there
          col += (hash(gl_FragCoord.xy) - 0.5) * 0.028;
          // gentle roll-off so additive stacks do not clip to flat white
          col = col / (1.0 + col * 0.12);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.setSize(width, height);
  }

  /** Render into the scene target; call render() afterwards to present. */
  get target(): WebGLRenderTarget {
    return this.sceneRT;
  }

  setSize(width: number, height: number): void {
    this.sceneRT.setSize(width, height);
    const w = Math.max(1, Math.ceil(width / 4));
    const h = Math.max(1, Math.ceil(height / 4));
    this.brightRT.setSize(w, h);
    this.blurRT.setSize(w, h);
    this.texel.set(1 / w, 1 / h);
  }

  render(time: number): void {
    const r = this.renderer;
    // bright pass -> brightRT
    this.pass(this.bright, { tScene: this.sceneRT.texture }, this.brightRT);
    // two blur iterations, widening each time
    for (let i = 0; i < 2; i++) {
      (this.blur.uniforms.uDir.value as Vector2).set(1 + i, 0);
      this.pass(this.blur, { tInput: this.brightRT.texture }, this.blurRT);
      (this.blur.uniforms.uDir.value as Vector2).set(0, 1 + i);
      this.pass(this.blur, { tInput: this.blurRT.texture }, this.brightRT);
    }
    // composite to the canvas
    this.composite.uniforms.uTime.value = time % 100;
    this.pass(this.composite, { tScene: this.sceneRT.texture, tBloom: this.brightRT.texture }, null);
    r.setRenderTarget(null);
  }

  private pass(material: ShaderMaterial, textures: Record<string, Texture>, target: WebGLRenderTarget | null): void {
    for (const [k, v] of Object.entries(textures)) material.uniforms[k].value = v;
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.brightRT.dispose();
    this.blurRT.dispose();
    this.quad.geometry.dispose();
    this.bright.dispose();
    this.blur.dispose();
    this.composite.dispose();
  }
}
