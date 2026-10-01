import { SKY_BAND_STOPS, SKY_VEIL_ANGLE, type SkyFrame } from './skyPaint'

/**
 * GPU twin of `drawSky2D`. Gecko rasterises 2D canvas on the CPU, where a
 * full-screen gradient stack per frame costs tens of milliseconds.
 * Renders into whatever framebuffer is bound; positions are in the frame's
 * pixel space (y down) and scale to the target size.
 */

const FULLSCREEN_VS = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const stop = (i: number) => (SKY_BAND_STOPS[i] ?? 1).toFixed(3)

const GRADIENT_FS = `
precision highp float;
uniform vec2 uTarget;
uniform vec2 uSrc;
uniform float uExtra;
uniform vec3 uBand[7];
uniform vec3 uGlow;
uniform vec3 uSun;
uniform float uSunI;
uniform vec3 uBloom;
uniform vec3 uDisc;
uniform float uCloudAmt;
uniform vec3 uCloud0;
uniform vec3 uCloud1;
uniform float uVeilAlpha;
uniform vec2 uVeilOrigin;

vec3 band(float t) {
  if (t < ${stop(1)}) return mix(uBand[0], uBand[1], t / ${stop(1)});
  if (t < ${stop(2)}) return mix(uBand[1], uBand[2], (t - ${stop(1)}) / (${stop(2)} - ${stop(1)}));
  if (t < ${stop(3)}) return mix(uBand[2], uBand[3], (t - ${stop(2)}) / (${stop(3)} - ${stop(2)}));
  if (t < ${stop(4)}) return mix(uBand[3], uBand[4], (t - ${stop(3)}) / (${stop(4)} - ${stop(3)}));
  if (t < ${stop(5)}) return mix(uBand[4], uBand[5], (t - ${stop(4)}) / (${stop(5)} - ${stop(4)}));
  return mix(uBand[5], uBand[6], (t - ${stop(5)}) / (1.0 - ${stop(5)}));
}

vec3 over(vec3 dst, vec3 src, float a) {
  return mix(dst, src, clamp(a, 0.0, 1.0));
}

vec3 cloud(vec3 c, vec2 p, vec3 cl) {
  vec2 d = p - cl.xy;
  if (abs(d.x) > cl.z || abs(d.y) > cl.z * 0.35) return c;
  float t = clamp(length(d) / cl.z, 0.0, 1.0);
  return over(c, uGlow, uCloudAmt * (1.0 - t));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uTarget.y - gl_FragCoord.y) * (uSrc / uTarget);
  float h = uSrc.y;
  vec3 c = band(clamp(p.y / (h + uExtra), 0.0, 1.0));

  float tb = clamp(length(p - uBloom.xy) / uBloom.z, 0.0, 1.0);
  float ab = tb < 0.45 ? mix(0.28, 0.08, tb / 0.45) : mix(0.08, 0.0, (tb - 0.45) / 0.55);
  c = over(c, uGlow, ab);

  float td = clamp(length(p - uDisc.xy) / uDisc.z, 0.0, 1.0);
  float a0 = min(0.9, 0.22 + uSunI * 0.2);
  vec3 dc;
  float da;
  if (td < 0.1) {
    dc = uSun;
    da = mix(a0, 0.28 * uSunI, td / 0.1);
  } else if (td < 0.36) {
    float k = (td - 0.1) / 0.26;
    dc = mix(uSun, uGlow, k);
    da = mix(0.28 * uSunI, 0.12 * uSunI, k);
  } else {
    float k = (td - 0.36) / 0.64;
    dc = mix(uGlow, uSun, k);
    da = mix(0.12 * uSunI, 0.0, k);
  }
  c = over(c, dc, da);

  if (uCloudAmt > 0.02) {
    c = cloud(c, p, uCloud0);
    c = cloud(c, p, uCloud1);
  }

  if (uVeilAlpha > 0.0) {
    vec2 d = p - uVeilOrigin;
    float cs = cos(${SKY_VEIL_ANGLE.toFixed(4)});
    float sn = sin(${SKY_VEIL_ANGLE.toFixed(4)});
    float lx = cs * d.x + sn * d.y;
    float ly = -sn * d.x + cs * d.y;
    float hh = h * 0.09;
    if (abs(lx) <= uSrc.x && abs(ly) <= hh) {
      float t = (ly + hh) / (2.0 * hh);
      float k = t < 0.5 ? t * 2.0 : (1.0 - t) * 2.0;
      vec3 vc = mix(vec3(140.0, 170.0, 210.0), vec3(190.0, 214.0, 240.0), k) / 255.0;
      c = over(c, vc, k * 0.22 * uVeilAlpha);
    }
  }

  gl_FragColor = vec4(c, 1.0);
}
`

const STAR_VS = `
attribute vec2 aCenter;
attribute vec2 aCorner;
attribute vec3 aStar;
attribute float aTint;
uniform vec2 uSrc;
varying vec2 vOff;
varying vec3 vStar;
varying float vTint;

void main() {
  float ext = aStar.x + 1.5;
  vOff = aCorner * ext;
  vStar = aStar;
  vTint = aTint;
  vec2 p = aCenter + vOff;
  gl_Position = vec4(p.x / uSrc.x * 2.0 - 1.0, 1.0 - p.y / uSrc.y * 2.0, 0.0, 1.0);
}
`

const STAR_FS = `
precision highp float;
uniform vec3 uStar;
uniform vec3 uTint;
uniform float uPxScale;
varying vec2 vOff;
varying vec3 vStar;
varying float vTint;

float cover(float d, float r) {
  return clamp((r - d) * uPxScale + 0.5, 0.0, 1.0);
}

void main() {
  float d = length(vOff);
  vec3 col = mix(uStar, uTint, vTint) * vStar.y * cover(d, vStar.x);
  col += vec3(230.0, 240.0, 255.0) / 255.0 * vStar.z * cover(d, vStar.x * 0.4);
  gl_FragColor = vec4(col, 0.0);
}
`

const GLOW_VS = `
attribute vec2 aPos;
attribute vec3 aGlow;
uniform vec2 uSrc;
varying vec3 vGlow;

void main() {
  vGlow = aGlow;
  gl_Position = vec4(aPos.x / uSrc.x * 2.0 - 1.0, 1.0 - aPos.y / uSrc.y * 2.0, 0.0, 1.0);
}
`

/** vGlow: x = offset across in half-widths, y = 0 at the bright end … 1 at the tip, z = strength. */
const GLOW_FS = `
precision highp float;
uniform vec3 uGlowRgb;
varying vec3 vGlow;

void main() {
  float u = vGlow.x;
  float fall = pow(1.0 - clamp(vGlow.y, 0.0, 1.0), 1.6);
  float halo = exp(-u * u * 0.6) * 0.35;
  float core = exp(-u * u * 9.0) * 0.7;
  vec3 col = (uGlowRgb * halo + mix(uGlowRgb, vec3(1.0), 0.6) * core) * vGlow.z * fall;
  gl_FragColor = vec4(col, 0.0);
}
`

/** Glow quads extend this many half-widths either side of the segment. */
const GLOW_EXTENT = 3
const GLOW_FLOATS = 5

const CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]
const FLOATS_PER_VERTEX = 8

function hexVec(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Sky shader:', gl.getShaderInfoLog(shader))
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
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Sky program:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

export class SkyRenderer {
  private gl: WebGLRenderingContext
  private gradient: WebGLProgram
  private star: WebGLProgram
  private glow: WebGLProgram
  private quad: WebGLBuffer
  private starBuf: WebGLBuffer
  private glowBuf: WebGLBuffer
  private starData = new Float32Array(0)
  private glowData = new Float32Array(0)
  private g: Record<string, WebGLUniformLocation | null>
  private s: Record<string, WebGLUniformLocation | null>
  private l: Record<string, WebGLUniformLocation | null>
  private aPosition: number
  private aCenter: number
  private aCorner: number
  private aStar: number
  private aTint: number
  private aGlowPos: number
  private aGlow: number

  static create(gl: WebGLRenderingContext) {
    const gradient = link(gl, FULLSCREEN_VS, GRADIENT_FS)
    const star = link(gl, STAR_VS, STAR_FS)
    const glow = link(gl, GLOW_VS, GLOW_FS)
    const quad = gl.createBuffer()
    const starBuf = gl.createBuffer()
    const glowBuf = gl.createBuffer()
    if (!gradient || !star || !glow || !quad || !starBuf || !glowBuf) return null
    return new SkyRenderer(gl, gradient, star, glow, quad, starBuf, glowBuf)
  }

  private constructor(
    gl: WebGLRenderingContext,
    gradient: WebGLProgram,
    star: WebGLProgram,
    glow: WebGLProgram,
    quad: WebGLBuffer,
    starBuf: WebGLBuffer,
    glowBuf: WebGLBuffer,
  ) {
    this.gl = gl
    this.gradient = gradient
    this.star = star
    this.glow = glow
    this.quad = quad
    this.starBuf = starBuf
    this.glowBuf = glowBuf
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const uniforms = (program: WebGLProgram, names: string[]) =>
      Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]))
    this.g = uniforms(gradient, [
      'uTarget',
      'uSrc',
      'uExtra',
      'uBand[0]',
      'uGlow',
      'uSun',
      'uSunI',
      'uBloom',
      'uDisc',
      'uCloudAmt',
      'uCloud0',
      'uCloud1',
      'uVeilAlpha',
      'uVeilOrigin',
    ])
    this.s = uniforms(star, ['uSrc', 'uStar', 'uTint', 'uPxScale'])
    this.l = uniforms(glow, ['uSrc', 'uGlowRgb'])
    this.aPosition = gl.getAttribLocation(gradient, 'position')
    this.aCenter = gl.getAttribLocation(star, 'aCenter')
    this.aCorner = gl.getAttribLocation(star, 'aCorner')
    this.aStar = gl.getAttribLocation(star, 'aStar')
    this.aTint = gl.getAttribLocation(star, 'aTint')
    this.aGlowPos = gl.getAttribLocation(glow, 'aPos')
    this.aGlow = gl.getAttribLocation(glow, 'aGlow')
  }

  /** Draws `frame` over the whole of the bound framebuffer, sized `targetW`×`targetH`. */
  render(frame: SkyFrame, targetW: number, targetH: number) {
    const gl = this.gl
    gl.viewport(0, 0, targetW, targetH)
    gl.disable(gl.BLEND)

    const g = this.g
    gl.useProgram(this.gradient)
    gl.uniform2f(g.uTarget, targetW, targetH)
    gl.uniform2f(g.uSrc, frame.w, frame.h)
    gl.uniform1f(g.uExtra, frame.extra)
    gl.uniform3fv(g['uBand[0]'], frame.band.flatMap(hexVec))
    gl.uniform3fv(g.uGlow, hexVec(frame.glow))
    gl.uniform3fv(g.uSun, hexVec(frame.sunColor))
    gl.uniform1f(g.uSunI, frame.sunIntensity)
    gl.uniform3f(g.uBloom, frame.bloom.x, frame.bloom.y, frame.bloom.r)
    gl.uniform3f(g.uDisc, frame.disc.x, frame.disc.y, frame.disc.r)
    gl.uniform1f(g.uCloudAmt, frame.cloudAmt)
    const [c0, c1] = frame.clouds
    gl.uniform3f(g.uCloud0, c0?.x ?? 0, c0?.y ?? 0, c0?.r ?? 1)
    gl.uniform3f(g.uCloud1, c1?.x ?? 0, c1?.y ?? 0, c1?.r ?? 1)
    gl.uniform1f(g.uVeilAlpha, frame.veilAlpha)
    gl.uniform2f(g.uVeilOrigin, frame.veilOrigin.x, frame.veilOrigin.y)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(this.aPosition)
    gl.vertexAttribPointer(this.aPosition, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disableVertexAttribArray(this.aPosition)

    this.renderGlows(frame)

    const count = this.fillStars(frame)
    if (!count) return
    const s = this.s
    gl.useProgram(this.star)
    gl.uniform2f(s.uSrc, frame.w, frame.h)
    gl.uniform3f(s.uStar, frame.starRgb[0] / 255, frame.starRgb[1] / 255, frame.starRgb[2] / 255)
    gl.uniform3f(s.uTint, frame.glowRgb[0] / 255, frame.glowRgb[1] / 255, frame.glowRgb[2] / 255)
    gl.uniform1f(s.uPxScale, targetW / Math.max(frame.w, 1))
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf)
    gl.bufferData(gl.ARRAY_BUFFER, this.starData.subarray(0, count * 6 * FLOATS_PER_VERTEX), gl.DYNAMIC_DRAW)
    const stride = FLOATS_PER_VERTEX * 4
    const attribs: [number, number, number][] = [
      [this.aCenter, 2, 0],
      [this.aCorner, 2, 8],
      [this.aStar, 3, 16],
      [this.aTint, 1, 28],
    ]
    for (const [loc, size, offset] of attribs) {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset)
    }
    gl.drawArrays(gl.TRIANGLES, 0, count * 6)
    for (const [loc] of attribs) gl.disableVertexAttribArray(loc)
    gl.disable(gl.BLEND)
  }

  private renderGlows(frame: SkyFrame) {
    const gl = this.gl
    const needed = frame.glows.length * 6 * GLOW_FLOATS
    if (!needed || frame.glowGain <= 0) return
    if (this.glowData.length < needed) this.glowData = new Float32Array(needed)
    const data = this.glowData
    let o = 0
    const put = (x: number, y: number, u: number, v: number, a: number) => {
      data[o++] = x
      data[o++] = y
      data[o++] = u
      data[o++] = v
      data[o++] = a
    }
    const e = GLOW_EXTENT
    for (const seg of frame.glows) {
      const len = Math.hypot(seg.x1 - seg.x0, seg.y1 - seg.y0) || 1
      const nx = (-(seg.y1 - seg.y0) / len) * seg.hw * e
      const ny = ((seg.x1 - seg.x0) / len) * seg.hw * e
      const a = seg.a * frame.glowGain
      // Two triangles: (start −n, start +n, end −n) and (end −n, start +n, end +n).
      put(seg.x0 - nx, seg.y0 - ny, -e, 0, a)
      put(seg.x0 + nx, seg.y0 + ny, e, 0, a)
      put(seg.x1 - nx, seg.y1 - ny, -e, 1, a)
      put(seg.x1 - nx, seg.y1 - ny, -e, 1, a)
      put(seg.x0 + nx, seg.y0 + ny, e, 0, a)
      put(seg.x1 + nx, seg.y1 + ny, e, 1, a)
    }
    gl.useProgram(this.glow)
    gl.uniform2f(this.l.uSrc, frame.w, frame.h)
    gl.uniform3f(this.l.uGlowRgb, frame.glowRgb[0] / 255, frame.glowRgb[1] / 255, frame.glowRgb[2] / 255)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.glowBuf)
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.DYNAMIC_DRAW)
    const stride = GLOW_FLOATS * 4
    gl.enableVertexAttribArray(this.aGlowPos)
    gl.vertexAttribPointer(this.aGlowPos, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aGlow)
    gl.vertexAttribPointer(this.aGlow, 3, gl.FLOAT, false, stride, 8)
    gl.drawArrays(gl.TRIANGLES, 0, o / GLOW_FLOATS)
    gl.disableVertexAttribArray(this.aGlowPos)
    gl.disableVertexAttribArray(this.aGlow)
    gl.disable(gl.BLEND)
  }

  private fillStars(frame: SkyFrame) {
    const needed = frame.stars.length * 6 * FLOATS_PER_VERTEX
    if (this.starData.length < needed) this.starData = new Float32Array(needed)
    const data = this.starData
    let n = 0
    let o = 0
    for (const star of frame.stars) {
      if (star.a < 0.04) continue
      const main = Math.min(0.95, star.a)
      const glint = star.glint && star.a > 0.16 ? Math.min(0.82, star.a * 0.55) : 0
      for (let v = 0; v < 6; v++) {
        data[o++] = star.x
        data[o++] = star.y
        data[o++] = CORNERS[v * 2] ?? 0
        data[o++] = CORNERS[v * 2 + 1] ?? 0
        data[o++] = star.r
        data[o++] = main
        data[o++] = glint
        data[o++] = star.tint
      }
      n++
    }
    return n
  }

  dispose() {
    const gl = this.gl
    gl.deleteProgram(this.gradient)
    gl.deleteProgram(this.star)
    gl.deleteProgram(this.glow)
    gl.deleteBuffer(this.quad)
    gl.deleteBuffer(this.starBuf)
    gl.deleteBuffer(this.glowBuf)
  }
}
