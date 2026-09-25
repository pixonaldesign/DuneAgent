import { getPhase, samplePalette, sunDirection } from './dayNight'
import { getSkyTravel } from './flyProgress'
import { getVoice, tickVoice, voiceAmp, voiceBlend } from '../voice'

/** Screen-space rise of the shared star field, matched to the camera fly. */
const FLY_SKY_LIFT = 0.38

type Star = {
  x: number
  y: number
  r: number
  b: number
  tw: number
  ph: number
  glint: boolean
}

const STARS: Star[] = makeStars(280)

type FrozenStar = {
  starIndex: number
  nx: number
  ny: number
}

let frozenStars: FrozenStar[] | null = null
let pauseOffset = 0
let frozenClock: number | null = null

function skyTime(real: number, active: boolean) {
  if (active) {
    if (frozenClock == null) frozenClock = real - pauseOffset
    return frozenClock
  }
  if (frozenClock != null) {
    pauseOffset = real - frozenClock
    frozenClock = null
  }
  return real - pauseOffset
}

function captureFreeze(clock: number) {
  const drift = (clock * 0.0028) % 1
  const lift = getSkyTravel() * FLY_SKY_LIFT
  const rows = STARS.map((star, starIndex) => ({
    starIndex,
    nx: (star.x + drift) % 1,
    ny: star.y + lift,
  }))
  rows.sort((a, b) => a.nx - b.nx || a.ny - b.ny)
  frozenStars = rows
}

function spacedLineXs(rows: FrozenStar[], w: number, unit: number) {
  const n = rows.length
  const xs = rows.map((row) => row.nx)
  const rad = rows.map((row) => {
    const star = STARS[row.starIndex]
    return Math.max(0.85 * unit, (star?.r ?? 1) * unit) / w
  })
  const pad = 1.35
  const extra = 2 / w
  const gap = (i: number, j: number) => ((rad[i] ?? 0) + (rad[j] ?? 0)) * pad + extra
  const left = 0.016
  const right = 0.984

  for (let i = 1; i < n; i++) {
    const minX = (xs[i - 1] ?? 0) + gap(i - 1, i)
    xs[i] = Math.max(xs[i] ?? 0, minX)
  }
  const last = n - 1
  xs[last] = Math.min(xs[last] ?? 1, right - (rad[last] ?? 0))
  for (let i = n - 2; i >= 0; i--) {
    const maxX = (xs[i + 1] ?? 1) - gap(i, i + 1)
    xs[i] = Math.min(xs[i] ?? 0, maxX)
  }
  xs[0] = Math.max(xs[0] ?? 0, left + (rad[0] ?? 0))
  for (let i = 1; i < n; i++) {
    xs[i] = Math.max(xs[i] ?? 0, (xs[i - 1] ?? 0) + gap(i - 1, i), left + (rad[i] ?? 0))
  }

  const first = xs[0] ?? left
  const end = xs[last] ?? right
  const overflow = end + (rad[last] ?? 0) - right
  if (overflow > 0) {
    const span = end - first
    const fit = right - left - (rad[0] ?? 0) - (rad[last] ?? 0)
    if (span > 0 && fit > 0) {
      const s = Math.min(1, fit / span)
      const origin = left + (rad[0] ?? 0)
      for (let i = 0; i < n; i++) xs[i] = origin + ((xs[i] ?? 0) - first) * s
    }
  }
  return xs
}

function fract(v: number) {
  return v - Math.floor(v)
}

function hash(n: number) {
  return fract(Math.sin(n * 127.1 + 311.7) * 43758.5453)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function valueNoise(x: number) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return mix(hash(i), hash(i + 1), u) * 2 - 1
}

function field(u: number, seed: number) {
  return (
    valueNoise(u * 18.5 + seed) * 0.26 +
    valueNoise(u * 41.0 + seed * 2.2) * 0.34 +
    valueNoise(u * 88.0 + seed * 0.7) * 0.24 +
    valueNoise(u * 165.0 + seed * 3.4) * 0.16
  )
}

function speechEnv(t: number, seed: number) {
  const burst = 0.18 + 0.82 * Math.max(0, Math.sin(t * (4.5 + seed * 0.8) + seed * 3.1)) ** 1.15
  const phrase = 0.4 + 0.6 * Math.max(0.12, Math.sin(t * (1.15 + seed * 0.2) + seed * 2))
  const pause = hash(Math.floor(t * (0.8 + seed * 0.2) + seed * 11)) > 0.18 ? 1 : 0.07
  return burst * phrase * pause
}

function voiceLift(u: number, t: number) {
  const band = Math.floor(u * 13)
  const region = speechEnv(t * 1.15 + hash(band) * 7, 0.18 + hash(band + 2) * 0.7)
  const e1 = speechEnv(t, 0.11)
  const e2 = speechEnv(t * 1.38 + 0.55, 0.52)
  const e3 = speechEnv(t * 0.9 + 1.4, 0.88)
  let y = field(u, 1.12) * (0.28 + 0.72 * e1)
  y += field(u, 5.4) * e2 * 0.75
  y += field(u, 9.1) * e3 * 0.4
  y *= 0.2 + 0.8 * region
  y = Math.sign(y) * Math.abs(y) ** 0.68
  y += (hash(u * 240 + Math.floor(t * 26)) * 2 - 1) * e2 * 0.14
  return Math.max(-1, Math.min(1, y * 1.55))
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a: number,
  glint: boolean,
  sr: number,
  sg: number,
  sb: number,
) {
  if (a < 0.04) return
  ctx.fillStyle = `rgba(${sr},${sg},${sb},${Math.min(0.95, a)})`
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  if (glint && a > 0.16) {
    ctx.fillStyle = `rgba(230,240,255,${Math.min(0.82, a * 0.55)})`
    ctx.beginPath()
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function makeStar(rand: () => number, x: number, y: number, glint: boolean): Star {
  return {
    x,
    y,
    r: glint ? 1.2 + rand() * 1.5 : 0.6 + rand() ** 2 * 1.0,
    b: glint ? 0.78 + rand() * 0.22 : 0.38 + rand() * 0.5,
    tw: 0.5 + rand() * 2.2,
    ph: rand() * Math.PI * 2,
    glint,
  }
}

function makeStars(count: number): Star[] {
  const stars: Star[] = []
  let seed = 17
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  for (let i = 0; i < count; i++) {
    const glint = i < 16 || rand() > 0.92
    const y = rand() < 0.58 ? rand() ** 1.25 * 0.38 : 0.16 + rand() * 0.5
    stars.push(makeStar(rand, rand(), y, glint))
  }
  // Seed a band above the fold so a downward fly drift reveals more sky
  // instead of an empty strip that then snaps back to the viewport top.
  const overflow = FLY_SKY_LIFT + 0.12
  const extra = Math.round(count * 0.58 * (overflow / 0.38))
  for (let i = 0; i < extra; i++) {
    stars.push(makeStar(rand, rand(), -rand() * overflow, i < 8 || rand() > 0.92))
  }
  return stars
}

function hexRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a)
  const [br, bg, bb] = hexRgb(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

export const SKY_BAND_STOPS = [0, 0.12, 0.3, 0.52, 0.7, 0.86, 1] as const
/** Rotation of the Milky-Way veil, radians (canvas convention, y down). */
export const SKY_VEIL_ANGLE = -0.36

type Circle = { x: number; y: number; r: number }

export type SkyStar = { x: number; y: number; r: number; a: number; glint: boolean }

/** Everything needed to draw one sky frame, in the pixel space of a `w`×`h` target. */
export type SkyFrame = {
  w: number
  h: number
  extra: number
  band: string[]
  glow: string
  sunColor: string
  sunIntensity: number
  bloom: Circle
  disc: Circle
  cloudAmt: number
  clouds: Circle[]
  veilAlpha: number
  veilOrigin: { x: number; y: number }
  starRgb: [number, number, number]
  stars: SkyStar[]
}

let latest: SkyFrame | null = null

/** Last frame computed by the visible sky, so other layers can redraw it without re-ticking voice state. */
export function latestSky() {
  return latest
}

/** Advances sky state (voice, freeze clock) — call once per displayed frame. */
export function computeSky(w: number, h: number, time = performance.now() / 1000): SkyFrame {
  const palette = samplePalette(getPhase())
  const sun = sunDirection(palette)
  const breathe = 0.5 + 0.5 * Math.sin(time * 0.16)
  const zenith = palette.skyZenith
  const horizon = palette.skyHorizon
  const glow = palette.skyGlow
  const unit = Math.max(1, w / 1920)

  const lift = getSkyTravel()
  const extra = lift * h * FLY_SKY_LIFT

  const frame: SkyFrame = {
    w,
    h,
    extra,
    band: [
      zenith,
      mixHex(zenith, horizon, 0.16),
      mixHex(zenith, horizon, 0.38 + breathe * 0.04),
      mixHex(zenith, horizon, 0.72),
      mixHex(horizon, glow, 0.22),
      mixHex(horizon, glow, 0.62),
      glow,
    ],
    glow,
    sunColor: palette.sunColor,
    sunIntensity: palette.sunIntensity,
    bloom: { x: w * (0.5 + sun[0] * 0.1), y: h * 1.08 + extra, r: Math.max(w, h) * 0.78 },
    disc: {
      x: w * (0.5 + sun[0] * 0.34),
      y: h * (1 - (0.08 + Math.max(0, sun[1]) * 0.56)) + extra,
      r: Math.max(w, h) * (0.2 + palette.sunIntensity * 0.07),
    },
    cloudAmt: (1 - palette.starOpacity) * 0.09,
    clouds: [0, 1].map((i) => ({
      x: w * (0.28 + i * 0.4 + Math.sin(time * 0.025 + i * 2.1) * 0.05),
      y: h * (0.58 + i * 0.08 + Math.sin(time * 0.03 + i) * 0.03) + extra,
      r: w * 0.38,
    })),
    veilAlpha: palette.starOpacity > 0.05 ? palette.starOpacity * 0.1 : 0,
    veilOrigin: { x: w * 0.5, y: h * 0.2 + extra },
    starRgb: hexRgb(mixHex('#e8f0f8', palette.sunColor, 0.18)),
    stars: [],
  }
  const stars = frame.stars

  tickVoice()
  const voice = getVoice()
  const active = voice.mode !== 'idle'
  const clock = skyTime(time, active)
  if (active && !frozenStars) captureFreeze(clock)
  if (!active) frozenStars = null
  const blend = voiceBlend()
  const amp = voiceAmp()

  const drift = (clock * 0.0028) % 1

  if (frozenStars && blend > 0.001) {
    const center = h * 0.44
    const waveH = h * 0.18
    const lineXs = spacedLineXs(frozenStars, w, unit)

    frozenStars.forEach((frozen, i) => {
      const star = STARS[frozen.starIndex]
      if (!star) return
      const twinkle = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(clock * star.tw + star.ph))
      const liveVis = Math.max(palette.starOpacity, star.glint ? 0.2 : 0) * star.b * twinkle
      const liveFade = 1 - Math.min(1, Math.max(0, (frozen.ny - 0.68) / 0.14))
      const liveA = liveVis * liveFade * (star.glint ? 1.9 : 1.05)
      const linedA = Math.max(liveA, (0.42 + star.b * 0.5) * (star.glint ? 1.25 : 1))
      const a = mix(liveA, linedA, blend)
      const homeY = frozen.ny * h
      const u = lineXs[i] ?? frozen.nx
      const linedY = center + voiceLift(u, time) * amp * waveH
      stars.push({
        x: mix(frozen.nx, u, blend) * w,
        y: mix(homeY, linedY, blend),
        r: Math.max(0.85 * unit, star.r * unit),
        a,
        glint: star.glint,
      })
    })
  } else {
    for (const star of STARS) {
      const twinkle = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(clock * star.tw + star.ph))
      const vis = Math.max(palette.starOpacity, star.glint ? 0.2 : 0) * star.b * twinkle
      if (vis < 0.03) continue
      const ny = star.y + lift * FLY_SKY_LIFT
      const x = ((star.x + drift) % 1) * w
      const y = ny * h
      if (y < -8 * unit) continue
      const fade = 1 - Math.min(1, Math.max(0, (ny - 0.68) / 0.14))
      const a = vis * fade * (star.glint ? 1.9 : 1.05)
      const r = Math.max(0.85 * unit, star.r * unit)
      stars.push({ x, y, r, a, glint: star.glint })
    }
  }

  latest = frame
  return frame
}

export function drawSky2D(ctx: CanvasRenderingContext2D, f: SkyFrame) {
  const { w, h, extra, glow } = f
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const band = ctx.createLinearGradient(0, 0, 0, h + extra)
  SKY_BAND_STOPS.forEach((stop, i) => band.addColorStop(stop, f.band[i] ?? glow))
  ctx.fillStyle = band
  ctx.fillRect(0, 0, w, h)

  const { bloom, disc } = f
  const horizonBloom = ctx.createRadialGradient(bloom.x, bloom.y, 0, bloom.x, bloom.y, bloom.r)
  horizonBloom.addColorStop(0, rgba(glow, 0.28))
  horizonBloom.addColorStop(0.45, rgba(glow, 0.08))
  horizonBloom.addColorStop(1, rgba(glow, 0))
  ctx.fillStyle = horizonBloom
  ctx.fillRect(0, 0, w, h)

  const sunGrad = ctx.createRadialGradient(disc.x, disc.y, 0, disc.x, disc.y, disc.r)
  sunGrad.addColorStop(0, rgba(f.sunColor, Math.min(0.9, 0.22 + f.sunIntensity * 0.2)))
  sunGrad.addColorStop(0.1, rgba(f.sunColor, 0.28 * f.sunIntensity))
  sunGrad.addColorStop(0.36, rgba(glow, 0.12 * f.sunIntensity))
  sunGrad.addColorStop(1, rgba(f.sunColor, 0))
  ctx.fillStyle = sunGrad
  ctx.fillRect(0, 0, w, h)

  if (f.cloudAmt > 0.02) {
    for (const c of f.clouds) {
      const cloud = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r)
      cloud.addColorStop(0, rgba(glow, f.cloudAmt))
      cloud.addColorStop(1, rgba(glow, 0))
      ctx.fillStyle = cloud
      ctx.fillRect(c.x - c.r, c.y - c.r * 0.35, c.r * 2, c.r * 0.7)
    }
  }

  if (f.veilAlpha > 0) {
    ctx.save()
    ctx.translate(f.veilOrigin.x, f.veilOrigin.y)
    ctx.rotate(SKY_VEIL_ANGLE)
    ctx.globalAlpha = f.veilAlpha
    const veil = ctx.createLinearGradient(0, -h * 0.09, 0, h * 0.09)
    veil.addColorStop(0, 'rgba(140, 170, 210, 0)')
    veil.addColorStop(0.5, 'rgba(190, 214, 240, 0.22)')
    veil.addColorStop(1, 'rgba(140, 170, 210, 0)')
    ctx.fillStyle = veil
    ctx.fillRect(-w, -h * 0.09, w * 2, h * 0.18)
    ctx.restore()
  }

  const [sr, sg, sb] = f.starRgb
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const s of f.stars) drawStar(ctx, s.x, s.y, s.r, s.a, s.glint, sr, sg, sb)
  ctx.restore()
}
