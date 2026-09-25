import { useEffect, useRef } from 'react'
import { IS_GECKO } from '../browser'
import { latestDuneSnapshot } from '../scene/DuneCapture'
import { SkyRenderer } from '../scene/skyGL'
import { computeSky, latestSky } from '../scene/skyPaint'

/**
 * iOS Liquid Glass approximation (WWDC 2025 conceptual model):
 *   1. Dual Kawase / dual-filter blur (Bjørge, SIGGRAPH 2015 — same family as
 *      KWin/picom) for the frosted field. Replaces the old 11×11 box kernel,
 *      which only covered ~4px and read as chunky pixels.
 *   2. SDF-gradient refraction with a Snell-ish edge slope (convex lens /
 *      meniscus), plus a light chromatic split at the rim.
 *   3. Existing pane SDF coverage, rim spec, wash, and tucked contact shadow.
 *
 * Quality / perf: capture stays at CAPTURE_SCALE 1.0. The sky is redrawn in
 * this context from the visible sky's last frame; only the dune frame crosses
 * contexts. Gecko turns a canvas upload into a blocking readback, so there the
 * dunes arrive as DuneCapture's async 1/4-size snapshot instead. Frost lives
 * at 1/2 res after 3 Kawase downs + 2 Kawase ups (~26px-class blur, matching
 * --glass-blur). Composite samples that field with LINEAR at refracted UVs.
 */

const CAPTURE_SCALE = 1
const KAWASE_LEVELS = 3
const KAWASE_OFFSET = 1.2

const VS = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const KAWASE_DOWN_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uOffset;

void main() {
  vec2 o = uTexel * 0.5 * uOffset;
  vec4 color = texture2D(uTex, vUv) * 4.0;
  color += texture2D(uTex, vUv + vec2(-o.x, -o.y));
  color += texture2D(uTex, vUv + vec2( o.x, -o.y));
  color += texture2D(uTex, vUv + vec2(-o.x,  o.y));
  color += texture2D(uTex, vUv + vec2( o.x,  o.y));
  gl_FragColor = color / 8.0;
}
`

const KAWASE_UP_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uOffset;

void main() {
  vec2 o = uTexel * 0.5 * uOffset;
  vec4 color = vec4(0.0);
  color += texture2D(uTex, vUv + vec2(-o.x * 2.0, 0.0));
  color += texture2D(uTex, vUv + vec2( o.x * 2.0, 0.0));
  color += texture2D(uTex, vUv + vec2(0.0, -o.y * 2.0));
  color += texture2D(uTex, vUv + vec2(0.0,  o.y * 2.0));
  color += texture2D(uTex, vUv + vec2(-o.x, -o.y)) * 2.0;
  color += texture2D(uTex, vUv + vec2( o.x, -o.y)) * 2.0;
  color += texture2D(uTex, vUv + vec2(-o.x,  o.y)) * 2.0;
  color += texture2D(uTex, vUv + vec2( o.x,  o.y)) * 2.0;
  gl_FragColor = color / 12.0;
}
`

const DUNE_FS = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDune;
uniform float uDuneAlpha;
uniform float uPremultiplied;

void main() {
  vec4 dune = texture2D(uDune, vUv);
  vec3 rgb = uPremultiplied > 0.5 ? dune.rgb : dune.rgb * dune.a;
  gl_FragColor = vec4(rgb, dune.a) * uDuneAlpha;
}
`

const COMP_FS = `
precision highp float;

uniform vec3 iResolution;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform vec4 uPane[4];
uniform float uRadius[4];
uniform int uCount;
uniform float uHeaderSolid;
uniform float uHeaderFade;

const float NUM_ZERO = 0.0;
const float NUM_ONE = 1.0;
const float IOR = 1.48;
const float BEVEL_PX = 22.0;
const float CHROMA_PX = 1.6;
const float BODY_FROST = 0.78;
const float GLASS_TINT = 0.07;

float sdRoundBox(vec2 p, vec2 b, float r) {
  float rad = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + vec2(rad);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
}

vec2 sdfNormal(vec2 p, vec2 b, float r) {
  float e = 1.4;
  float dx = sdRoundBox(p + vec2(e, 0.0), b, r) - sdRoundBox(p - vec2(e, 0.0), b, r);
  float dy = sdRoundBox(p + vec2(0.0, e), b, r) - sdRoundBox(p - vec2(0.0, e), b, r);
  return normalize(vec2(dx, dy) + vec2(1.0e-5));
}

float lensSlope(float nd) {
  float cl = clamp(nd, 0.002, 0.998);
  float t = 1.0 - cl;
  return min(t / max(sqrt(max(1.0 - t * t, 0.0)), 0.002), 4.0);
}

vec4 sampleSrc(vec2 uv) {
  return texture2D(iChannel0, clamp(uv, 0.0, 1.0));
}

vec4 sampleBlur(vec2 uv) {
  return texture2D(iChannel1, clamp(uv, 0.0, 1.0));
}

vec4 sampleGlass(vec2 uv, float frost) {
  return mix(sampleSrc(uv), sampleBlur(uv), frost);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 uv = fragCoord / iResolution.xy;
  vec4 fragColor = vec4(NUM_ZERO);
  float best = NUM_ZERO;
  // Match .analysis-stack mask: dissolve glass under the chat header band.
  float yFromTop = iResolution.y - fragCoord.y;
  float headFade = uHeaderFade <= NUM_ZERO
    ? NUM_ONE
    : smoothstep(uHeaderSolid, uHeaderSolid + uHeaderFade, yFromTop);

  if (headFade <= 0.001) {
    discard;
  }

  for (int i = 0; i < 4; i++) {
    if (i < uCount) {
      vec2 center = uPane[i].xy;
      vec2 halfSize = uPane[i].zw;
      vec2 p = fragCoord - center;
      float sd = sdRoundBox(p, halfSize, uRadius[i]);

      if (sd < 3.0) {
        vec2 q = p / max(halfSize, vec2(NUM_ONE));
        float inset = max(min(halfSize.x, halfSize.y), NUM_ONE);
        float nd = clamp(-sd / inset, NUM_ZERO, NUM_ONE);
        float coverage = 1.0 - smoothstep(-1.2, 0.9, sd);
        float transition = smoothstep(NUM_ZERO, NUM_ONE, coverage) * headFade;

        if (transition > best) {
          best = transition;

          vec2 n = sdfNormal(p, halfSize, uRadius[i]);
          float slope = lensSlope(nd);
          float bendPx = slope * (1.0 - 1.0 / IOR) * BEVEL_PX;
          vec2 warp = -n * bendPx / iResolution.xy;
          vec2 lensUv = uv + warp;
          float frost = mix(BODY_FROST, 1.0, smoothstep(0.5, 0.0, nd));

          vec2 ca = n * slope * CHROMA_PX / iResolution.xy;
          vec4 acc;
          acc.r = sampleGlass(lensUv + ca, frost).r;
          acc.g = sampleGlass(lensUv, frost).g;
          acc.b = sampleGlass(lensUv - ca, frost).b;
          acc.a = NUM_ONE;

          float rim = smoothstep(-3.2, -0.4, sd) * (1.0 - smoothstep(-0.6, 1.0, sd));
          float lit = clamp(0.55 * q.y - 0.16 * q.x + 0.42, NUM_ZERO, NUM_ONE);
          float spec = rim * pow(lit, 1.8) * 0.16;
          float wash = nd * smoothstep(-0.2, 0.85, q.y) * 0.03;
          float contact = rim * smoothstep(0.2, -0.95, q.y) * 0.07;

          vec4 lighting = acc;
          lighting.rgb = clamp(lighting.rgb + spec + wash - contact, NUM_ZERO, NUM_ONE);
          lighting.rgb = mix(lighting.rgb, lighting.rgb * vec3(0.97, 0.96, 0.95), GLASS_TINT);

          vec4 mixed = mix(sampleSrc(uv), lighting, transition);
          mixed.a = transition;
          fragColor = mixed;
        }
      }
    }
  }

  if (best <= NUM_ZERO) {
    discard;
  }
  gl_FragColor = fragColor;
}
`

type Pane = {
  centerX: number
  centerY: number
  halfW: number
  halfH: number
  radius: number
}

type RT = {
  fb: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

type KawaseProg = {
  program: WebGLProgram
  tex: WebGLUniformLocation | null
  texel: WebGLUniformLocation | null
  offset: WebGLUniformLocation | null
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Liquid glass shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Liquid glass program:', gl.getProgramInfoLog(program))
    return null
  }
  return program
}

function paneVisible(el: HTMLElement) {
  if (el.closest('.voice-dim.is-off')) return false
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  }
  let node: HTMLElement | null = el
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    node = node.parentElement
  }
  return true
}

/** Resolve a length custom property on an element to CSS pixels. */
function cssVarPx(el: HTMLElement, name: string): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:var(${name});width:0;`
  el.appendChild(probe)
  const px = probe.getBoundingClientRect().height
  probe.remove()
  return px
}

type HeaderBand = { solid: number; fade: number }

const NO_BAND: HeaderBand = { solid: 0, fade: 0 }

/**
 * Header dissolve band matching `.analysis-stack` mask-image.
 * Returns CSS-pixel distances from the top of the viewport.
 */
function readHeaderFadeBand(stack: HTMLElement): HeaderBand {
  const solid = cssVarPx(stack, '--analysis-header-solid')
  const fade = cssVarPx(stack, '--analysis-fade')
  if (!(solid > 0) || !(fade > 0)) return NO_BAND
  return { solid, fade }
}

/**
 * Measuring the band inserts probe nodes (a forced reflow), so only re-measure
 * when an input to the band's CSS can have changed.
 */
function createHeaderBandCache() {
  let key = ''
  let band = NO_BAND
  return () => {
    const stack = document.querySelector<HTMLElement>('.analysis-stack')
    if (!stack) {
      key = ''
      return NO_BAND
    }
    const next = [
      window.innerWidth,
      window.innerHeight,
      document.documentElement.dataset.uiMode ?? '',
      stack.className,
    ].join('|')
    if (next !== key) {
      key = next
      band = readHeaderFadeBand(stack)
    }
    return band
  }
}

function readPanes(canvas: HTMLCanvasElement, hideBelow: number): Pane[] {
  const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
  const nodes = document.querySelectorAll<HTMLElement>('.liquid-glass')
  const panes: Pane[] = []
  nodes.forEach((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    if (!paneVisible(el)) return
    // Fully under the solid header mask — no glass pane to draw.
    if (hideBelow > 0 && rect.bottom <= hideBelow) return
    const radiusPx = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 24
    panes.push({
      centerX: (rect.left + rect.width / 2) * dpr,
      centerY: canvas.height - (rect.top + rect.height / 2) * dpr,
      halfW: (rect.width / 2) * dpr,
      halfH: (rect.height / 2) * dpr,
      radius: radiusPx * dpr,
    })
  })
  return panes.slice(0, 4)
}

function bindTexParams(gl: WebGLRenderingContext) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
}

function makeBlankTexture(gl: WebGLRenderingContext) {
  const tex = gl.createTexture()
  if (!tex) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
  bindTexParams(gl)
  return tex
}

function makeRT(gl: WebGLRenderingContext, w: number, h: number): RT | null {
  const tex = gl.createTexture()
  const fb = gl.createFramebuffer()
  if (!tex || !fb) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  bindTexParams(gl)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (!ok) {
    gl.deleteTexture(tex)
    gl.deleteFramebuffer(fb)
    return null
  }
  return { fb, tex, w, h }
}

function deleteRT(gl: WebGLRenderingContext, rt: RT | null) {
  if (!rt) return
  gl.deleteTexture(rt.tex)
  gl.deleteFramebuffer(rt.fb)
}

class LiquidGlassEngine {
  private gl: WebGLRenderingContext | null
  private down: KawaseProg | null = null
  private up: KawaseProg | null = null
  private comp: WebGLProgram | null = null
  private duneProg: {
    program: WebGLProgram
    dune: WebGLUniformLocation | null
    duneAlpha: WebGLUniformLocation | null
    premultiplied: WebGLUniformLocation | null
  } | null = null
  private sky: SkyRenderer | null = null
  private duneTex: WebGLTexture | null = null
  private duneVersion = -1
  private dunePremultiplied = false
  private srcRT: RT | null = null
  private levels: RT[] = []
  private headerBand = createHeaderBandCache()
  private captured = false
  private uniforms: {
    resolution: WebGLUniformLocation | null
    src: WebGLUniformLocation | null
    blur: WebGLUniformLocation | null
    count: WebGLUniformLocation | null
    pane: WebGLUniformLocation | null
    radius: WebGLUniformLocation | null
    headerSolid: WebGLUniformLocation | null
    headerFade: WebGLUniformLocation | null
  } | null = null
  private raf = 0
  private running = false
  private canvas: HTMLCanvasElement
  private quad: WebGLBuffer | null = null
  private rtW = 0
  private rtH = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    })  }

  start() {
    const gl = this.gl
    if (!gl) return false

    const downProg = link(gl, VS, KAWASE_DOWN_FS)
    const upProg = link(gl, VS, KAWASE_UP_FS)
    const compProg = link(gl, VS, COMP_FS)
    const duneProg = link(gl, VS, DUNE_FS)
    this.sky = SkyRenderer.create(gl)
    if (!downProg || !upProg || !compProg || !duneProg || !this.sky) return false

    this.down = {
      program: downProg,
      tex: gl.getUniformLocation(downProg, 'uTex'),
      texel: gl.getUniformLocation(downProg, 'uTexel'),
      offset: gl.getUniformLocation(downProg, 'uOffset'),
    }
    this.up = {
      program: upProg,
      tex: gl.getUniformLocation(upProg, 'uTex'),
      texel: gl.getUniformLocation(upProg, 'uTexel'),
      offset: gl.getUniformLocation(upProg, 'uOffset'),
    }
    this.comp = compProg
    this.duneProg = {
      program: duneProg,
      dune: gl.getUniformLocation(duneProg, 'uDune'),
      duneAlpha: gl.getUniformLocation(duneProg, 'uDuneAlpha'),
      premultiplied: gl.getUniformLocation(duneProg, 'uPremultiplied'),
    }

    this.quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    this.duneTex = makeBlankTexture(gl)
    this.uniforms = {
      resolution: gl.getUniformLocation(compProg, 'iResolution'),
      src: gl.getUniformLocation(compProg, 'iChannel0'),
      blur: gl.getUniformLocation(compProg, 'iChannel1'),
      count: gl.getUniformLocation(compProg, 'uCount'),
      pane: gl.getUniformLocation(compProg, 'uPane[0]'),
      radius: gl.getUniformLocation(compProg, 'uRadius[0]'),
      headerSolid: gl.getUniformLocation(compProg, 'uHeaderSolid'),
      headerFade: gl.getUniformLocation(compProg, 'uHeaderFade'),
    }

    gl.clearColor(0, 0, 0, 0)

    document.documentElement.classList.add('has-liquid-glass')
    this.running = true
    this.resize()
    window.addEventListener('resize', this.resize)
    this.raf = requestAnimationFrame(this.frame)
    return true
  }

  destroy() {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    document.documentElement.classList.remove('has-liquid-glass')
    const gl = this.gl
    if (gl) {
      this.releaseTargets(gl)
      if (this.duneTex) gl.deleteTexture(this.duneTex)
      if (this.down) gl.deleteProgram(this.down.program)
      if (this.up) gl.deleteProgram(this.up.program)
      if (this.comp) gl.deleteProgram(this.comp)
      if (this.duneProg) gl.deleteProgram(this.duneProg.program)
      if (this.quad) gl.deleteBuffer(this.quad)
      this.sky?.dispose()
    }
    this.sky = null
    this.duneTex = null
    this.down = null
    this.up = null
    this.comp = null
    this.duneProg = null
    this.quad = null
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.gl
    if (!gl || !this.quad) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  }

  private releaseTargets(gl: WebGLRenderingContext) {
    deleteRT(gl, this.srcRT)
    this.srcRT = null
    this.levels.forEach((rt) => deleteRT(gl, rt))
    this.levels = []
    this.rtW = 0
    this.rtH = 0
    this.captured = false
  }

  private ensureTargets(w: number, h: number) {
    const gl = this.gl
    if (!gl) return false
    if (this.srcRT && this.levels.length === KAWASE_LEVELS && this.rtW === w && this.rtH === h) return true
    this.releaseTargets(gl)

    this.srcRT = makeRT(gl, w, h)
    if (!this.srcRT) return false
    let lw = w
    let lh = h
    for (let i = 0; i < KAWASE_LEVELS; i++) {
      lw = Math.max(1, lw >> 1)
      lh = Math.max(1, lh >> 1)
      const rt = makeRT(gl, lw, lh)
      if (!rt) {
        this.releaseTargets(gl)
        return false
      }
      this.levels.push(rt)
    }
    this.rtW = w
    this.rtH = h
    return this.levels.length === KAWASE_LEVELS
  }

  private resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(window.innerWidth * dpr * CAPTURE_SCALE))
    const h = Math.max(1, Math.round(window.innerHeight * dpr * CAPTURE_SCALE))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  /** Refreshes the dune texture; returns the layer's effective opacity (0 when it isn't drawn). */
  private uploadDune(gl: WebGLRenderingContext) {
    const dune = document.querySelector<HTMLCanvasElement>('.dune-canvas canvas')
    if (!dune || dune.width < 2) return 0
    const host = dune.parentElement
    const opacity = host ? Number.parseFloat(getComputedStyle(host).opacity || '1') : 1
    if (!(opacity > 0.04)) return 0

    if (IS_GECKO) {
      const snap = latestDuneSnapshot()
      if (!snap) return 0
      if (snap.version !== this.duneVersion) {
        this.duneVersion = snap.version
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
        gl.bindTexture(gl.TEXTURE_2D, this.duneTex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, snap.w, snap.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, snap.data)
        bindTexParams(gl)
      }
      this.dunePremultiplied = true
      return opacity
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.bindTexture(gl.TEXTURE_2D, this.duneTex)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, dune)
    } catch {
      // WebGL canvases may be origin-tainted; the sky still reads as glass.
      return 0
    }
    bindTexParams(gl)
    this.dunePremultiplied = false
    return opacity
  }

  private captureBackdrop() {
    const gl = this.gl
    const prog = this.duneProg
    const dest = this.srcRT
    if (!gl || !prog || !dest || !this.sky) return false
    const duneAlpha = this.uploadDune(gl)

    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fb)
    const frame = latestSky() ?? computeSky(dest.w, dest.h)
    this.sky.render(frame, dest.w, dest.h)
    if (!(duneAlpha > 0)) return true

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(prog.program)
    this.bindQuad(prog.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.duneTex)
    gl.uniform1i(prog.dune, 0)
    gl.uniform1f(prog.duneAlpha, duneAlpha)
    gl.uniform1f(prog.premultiplied, this.dunePremultiplied ? 1 : 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return true
  }

  private drawKawase(prog: KawaseProg, src: WebGLTexture, srcW: number, srcH: number, dest: RT) {
    const gl = this.gl
    if (!gl) return
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fb)
    gl.viewport(0, 0, dest.w, dest.h)
    gl.useProgram(prog.program)
    this.bindQuad(prog.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(prog.tex, 0)
    gl.uniform2f(prog.texel, 1 / srcW, 1 / srcH)
    gl.uniform1f(prog.offset, KAWASE_OFFSET)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private blurBackdrop() {
    const gl = this.gl
    const src = this.srcRT
    if (!gl || !src || !this.down || !this.up) return false

    gl.disable(gl.BLEND)
    this.drawKawase(this.down, src.tex, src.w, src.h, this.levels[0])
    for (let i = 1; i < this.levels.length; i++) {
      const prev = this.levels[i - 1]
      this.drawKawase(this.down, prev.tex, prev.w, prev.h, this.levels[i])
    }
    for (let i = this.levels.length - 1; i > 0; i--) {
      const level = this.levels[i]
      this.drawKawase(this.up, level.tex, level.w, level.h, this.levels[i - 1])
    }
    return true
  }

  private frame = () => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    const gl = this.gl
    const uniforms = this.uniforms
    if (!gl || !this.comp || !uniforms) return

    this.resize()
    const band = this.headerBand()
    const panes = readPanes(this.canvas, band.solid)
    if (!panes.length || !this.ensureTargets(this.canvas.width, this.canvas.height)) {
      this.captured = false
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return
    }

    this.captured = this.captureBackdrop() && this.blurBackdrop()
    if (!this.captured || !this.srcRT) return

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    gl.useProgram(this.comp)
    this.bindQuad(this.comp)
    gl.uniform3f(uniforms.resolution, this.canvas.width, this.canvas.height, 1)
    gl.uniform1i(uniforms.count, panes.length)

    const dpr = this.canvas.width / Math.max(this.canvas.clientWidth, 1)
    gl.uniform1f(uniforms.headerSolid, band.solid * dpr)
    gl.uniform1f(uniforms.headerFade, band.fade * dpr)

    const paneData = new Float32Array(16)
    const radiusData = new Float32Array(4)
    panes.forEach((pane, i) => {
      paneData[i * 4] = pane.centerX
      paneData[i * 4 + 1] = pane.centerY
      paneData[i * 4 + 2] = pane.halfW
      paneData[i * 4 + 3] = pane.halfH
      radiusData[i] = pane.radius
    })
    gl.uniform4fv(uniforms.pane, paneData)
    gl.uniform1fv(uniforms.radius, radiusData)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.srcRT.tex)
    gl.uniform1i(uniforms.src, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.levels[0].tex)
    gl.uniform1i(uniforms.blur, 1)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

export function LiquidGlassLayer() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const engine = new LiquidGlassEngine(canvas)
    const ok = engine.start()
    if (!ok) engine.destroy()
    return () => engine.destroy()
  }, [])

  return <canvas ref={ref} className="liquid-glass-layer" aria-hidden />
}
