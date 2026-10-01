import { getPhase, samplePalette, sunDirection } from './dayNight'
import { getSkyTravel } from './flyProgress'
import { getVoice, tickVoice, voiceAmp, voiceBlend } from '../voice'
import { readBands } from '../micSpectrum'
import { SKYLINE_ASPECT, SKYLINE_GRAINS, SKYLINE_WATER } from './skylineGrains'

/** Screen-space rise of the shared star field, matched to the camera fly. */
const FLY_SKY_LIFT = 0.38
/** Fully visible above this normalized y; gone by +0.14. Matches the idle fade. */
const STAR_FADE_START = 0.68
const STAR_FADE_END = STAR_FADE_START + 0.14
/** Share of the visible stars that leave the sky for the skyline. */
const DRAFT_SHARE = 0.86
/** Latest start of a star's flight, as a fraction of the gather. */
const GATHER_STAGGER = 0.32

const ROLE_IDLE = 0
const ROLE_SKY = 1
const ROLE_CITY = 2
const ROLE_REFL = 3

type Star = {
  x: number
  y: number
  r: number
  b: number
  tw: number
  ph: number
  glint: boolean
}

/**
 * One population for the idle night sky and the skyline. Sized so the stars
 * that sit below the tower tops after the fly can cover the city and
 * reflection dots, while the stars already above the towers stay in the sky.
 */
const FIELD_COUNT = 6200
const STARS: Star[] = makeStars(FIELD_COUNT)

const roleOf = new Uint8Array(STARS.length)
const slotOf = new Uint16Array(STARS.length)
const homeNx = new Float32Array(STARS.length)
const homeNy = new Float32Array(STARS.length)

let pauseOffset = 0
let frozenClock: number | null = null
let homesReady = false
/** Reflection columns across the plate, and the mirrored spectrum bands feeding them. */
const REFL_COLS = 112
const REFL_BANDS = REFL_COLS / 2
/** How far reflection dots pull toward their column's centre line. */
const REFL_COLUMN_SNAP = 0.7
/** Column length when silent, as a share of the full reflection. */
const REFL_REST = 0.14
/** Mouse parallax travel at full depth, as a share of the shorter viewport side. */
const PARALLAX = 0.014

const bandLevel = new Float32Array(REFL_BANDS)
const columnLevel = new Float32Array(REFL_COLS)
let columnsAt = 0

const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
let pointerAt = 0
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.tx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1
      pointer.ty = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1
    },
    { passive: true },
  )
}

const drawn: SkyStar[] = []
let drawnN = 0

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

function fract(v: number) {
  return v - Math.floor(v)
}

function hash(n: number) {
  return fract(Math.sin(n * 127.1 + 311.7) * 43758.5453)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function speechEnv(t: number, seed: number) {
  const burst = 0.18 + 0.82 * Math.max(0, Math.sin(t * (4.5 + seed * 0.8) + seed * 3.1)) ** 1.15
  const phrase = 0.4 + 0.6 * Math.max(0.12, Math.sin(t * (1.15 + seed * 0.2) + seed * 2))
  const pause = hash(Math.floor(t * (0.8 + seed * 0.2) + seed * 11)) > 0.18 ? 1 : 0.07
  return burst * phrase * pause
}

function voiceEnergy(t: number) {
  const e1 = speechEnv(t, 0.11)
  const e2 = speechEnv(t * 1.38 + 0.55, 0.52)
  const e3 = speechEnv(t * 0.9 + 1.4, 0.88)
  return Math.min(1, e1 * 0.52 + e2 * 0.33 + e3 * 0.22)
}

/** Stand-in spectrum while the mic is unavailable: speech-like bursts, louder low bands. */
function syntheticBands(time: number, out: Float32Array) {
  const n = out.length
  const body = voiceEnergy(time)
  for (let k = 0; k < n; k++) {
    const f = k / n
    const formant = 0.55 + 0.45 * Math.sin(time * (2.3 + f * 4.1) + k * 1.7) ** 2
    const lag = voiceEnergy(time - f * 0.12 + k * 0.013)
    out[k] = Math.min(1, (0.6 * body + 0.4 * lag) * formant * (1.05 - 0.55 * f))
  }
}

/**
 * Depth of each reflection column, 0 at the waterline. Columns mirror the
 * spectrum around the centre, so the voice's low end drops under the tallest towers.
 */
function updateColumns(time: number, amp: number) {
  if (!readBands(bandLevel)) syntheticBands(time, bandLevel)
  const dt = columnsAt === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, time - columnsAt))
  columnsAt = time
  const half = REFL_COLS / 2
  for (let c = 0; c < REFL_COLS; c++) {
    const band = Math.min(REFL_BANDS - 1, Math.floor((Math.abs(c + 0.5 - half) / half) * REFL_BANDS))
    const target = amp * (bandLevel[band] ?? 0)
    const cur = columnLevel[c] ?? 0
    const rate = target > cur ? 22 : 3.2
    columnLevel[c] = cur + (target - cur) * (1 - Math.exp(-dt * rate))
  }
}

function resetColumns() {
  columnLevel.fill(0)
  columnsAt = 0
}

/** Pointer position in −1…1, eased so the parallax glides. */
function tickPointer(time: number) {
  const dt = pointerAt === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, time - pointerAt))
  pointerAt = time
  const k = 1 - Math.exp(-dt * 4.5)
  pointer.x += (pointer.tx - pointer.x) * k
  pointer.y += (pointer.ty - pointer.y) * k
}

/** Idle position. The dismiss target is this same function at the frozen clock. */
function restNorm(star: Star, clock: number, travel: number) {
  const drift = (clock * 0.0028) % 1
  return {
    nx: (star.x + drift) % 1,
    ny: star.y + travel * FLY_SKY_LIFT,
  }
}

function starVis(star: Star, clock: number, starOpacity: number) {
  const twinkle = 0.88 + 0.12 * (0.5 + 0.5 * Math.sin(clock * star.tw + star.ph))
  const vis = Math.max(starOpacity, star.glint ? 0.2 : 0) * star.b * twinkle
  return { vis, gain: star.glint ? 1.9 : 1.05 }
}

function starAlpha(vis: number, gain: number, ny: number) {
  if (vis < 0.03) return 0
  const fade = 1 - Math.min(1, Math.max(0, (ny - STAR_FADE_START) / (STAR_FADE_END - STAR_FADE_START)))
  return vis * fade * gain
}

function starRadius(star: Star, unit: number) {
  return Math.max(0.85 * unit, star.r * unit)
}

function smoothstep(t: number) {
  const u = t < 0 ? 0 : t > 1 ? 1 : t
  return u * u * (3 - 2 * u)
}

function skylineFrame(w: number, h: number) {
  const inset = 0.035
  const availW = w * (1 - inset * 2)
  const availH = h * (1 - inset * 2)
  let dw = availW
  let dh = dw / SKYLINE_ASPECT
  if (dh > availH) {
    dh = availH
    dw = dh * SKYLINE_ASPECT
  }
  const ox = (w - dw) / 2
  const oy = (h - dh) / 2
  return { ox, oy, dw, dh, waterY: oy + SKYLINE_WATER * dh, px: dw / 1024 }
}

type Placement = ReturnType<typeof skylineFrame>

const PROX_COLS = 48

/** Coarse 0–1 map of how close each part of the screen is to the skyline. */
function skylineProximity(place: Placement, w: number, h: number) {
  const cols = PROX_COLS
  const rows = Math.max(2, Math.round((cols * h) / Math.max(1, w)))
  let grid = new Float32Array(cols * rows)
  const g = SKYLINE_GRAINS
  for (let k = 0; k < g.n; k++) {
    const sx = place.ox + (g.x[k] ?? 0) * place.dw
    const sy = place.oy + (g.y[k] ?? 0) * place.dh
    const c = Math.min(cols - 1, Math.max(0, Math.floor((sx / w) * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor((sy / h) * rows)))
    grid[r * cols + c] = (grid[r * cols + c] ?? 0) + 1
  }
  // A few box passes turn the occupancy into a soft halo around the city.
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0
        let n = 0
        for (let dr = -1; dr <= 1; dr++) {
          const rr = r + dr
          if (rr < 0 || rr >= rows) continue
          for (let dc = -1; dc <= 1; dc++) {
            const cc = c + dc
            if (cc < 0 || cc >= cols) continue
            sum += grid[rr * cols + cc] ?? 0
            n++
          }
        }
        next[r * cols + c] = sum / n
      }
    }
    grid = next
  }
  let max = 0
  for (const v of grid) if (v > max) max = v
  if (max > 0) for (let k = 0; k < grid.length; k++) grid[k] = (grid[k] ?? 0) / max
  return (nx: number, ny: number) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(nx * cols)))
    const r = Math.min(rows - 1, Math.max(0, Math.floor(ny * rows)))
    return grid[r * cols + c] ?? 0
  }
}

/**
 * Draft most visible stars into the skyline. Stars near the city are the
 * likeliest to go, so the sky thins gradually instead of along a cut line.
 * Drafted stars are matched to targets column by column, then top to bottom,
 * so every star flies to a part of the city near where it was.
 */
function captureAssignments(clock: number, w: number, h: number, travel: number) {
  const place = skylineFrame(w, h)
  const near = skylineProximity(place, w, h)
  const pool: { i: number; key: number }[] = []

  for (let i = 0; i < STARS.length; i++) {
    const star = STARS[i]
    if (!star) continue
    const rest = restNorm(star, clock, travel)
    homeNx[i] = rest.nx
    homeNy[i] = rest.ny
    roleOf[i] = ROLE_IDLE
    if (rest.ny < 0 || rest.ny >= STAR_FADE_END) continue
    roleOf[i] = ROLE_SKY
    const p = near(rest.nx, rest.ny)
    // Weighted sampling without replacement: larger weight, larger key.
    const weight = 0.2 + 14 * p * p
    pool.push({ i, key: Math.log(Math.max(1e-6, hash(i * 1.618 + 0.37))) / weight })
  }

  pool.sort((a, b) => b.key - a.key)
  const g = SKYLINE_GRAINS
  const n = Math.min(g.n, Math.round(pool.length * DRAFT_SHARE))
  const movers = pool.slice(0, n).map((p) => p.i)
  const targets = Array.from({ length: n }, (_, k) => k)
  movers.sort((a, b) => (homeNx[a] ?? 0) - (homeNx[b] ?? 0))
  targets.sort((a, b) => (g.x[a] ?? 0) - (g.x[b] ?? 0))

  const strips = Math.max(1, Math.round(Math.sqrt(n / 3)))
  for (let s = 0; s < strips; s++) {
    const lo = Math.floor((s * n) / strips)
    const hi = Math.floor(((s + 1) * n) / strips)
    const ms = movers.slice(lo, hi).sort((a, b) => (homeNy[a] ?? 0) - (homeNy[b] ?? 0))
    const ts = targets.slice(lo, hi).sort((a, b) => (g.y[a] ?? 0) - (g.y[b] ?? 0))
    for (let k = 0; k < ms.length; k++) {
      const i = ms[k] ?? 0
      const slot = ts[k] ?? 0
      slotOf[i] = slot
      roleOf[i] = (g.y[slot] ?? 0) > SKYLINE_WATER ? ROLE_REFL : ROLE_CITY
    }
  }

  homesReady = true
}

/** Parallax depth of a sky star: far stars barely move, near ones drift more. */
function skyDepth(i: number) {
  return 0.15 + 0.35 * hash(i * 5.13 + 0.9)
}

/** Per-star progress through the gather, staggered so the city condenses rather than snaps. */
function flight(i: number, blend: number) {
  const delay = GATHER_STAGGER * hash(i * 0.731 + 2.1)
  return smoothstep((blend - delay) / (1 - delay))
}

function beginStars() {
  drawnN = 0
}

function emit(x: number, y: number, r: number, a: number, glint: boolean, unit: number) {
  if (a < 0.04 || y < -8 * unit) return
  let s = drawn[drawnN]
  if (!s) {
    s = { x, y, r, a, glint }
    drawn[drawnN] = s
  } else {
    s.x = x
    s.y = y
    s.r = r
    s.a = a
    s.glint = glint
  }
  drawnN++
}

function finishStars() {
  drawn.length = drawnN
  return drawn
}

function paintIdle(clock: number, travel: number, w: number, h: number, unit: number, starOpacity: number) {
  beginStars()
  for (const star of STARS) {
    const rest = restNorm(star, clock, travel)
    const { vis, gain } = starVis(star, clock, starOpacity)
    emit(rest.nx * w, rest.ny * h, starRadius(star, unit), starAlpha(vis, gain, rest.ny), star.glint, unit)
  }
  return finishStars()
}

function paintGather(
  clock: number,
  time: number,
  w: number,
  h: number,
  unit: number,
  starOpacity: number,
  blend: number,
) {
  const place = skylineFrame(w, h)
  const g = SKYLINE_GRAINS
  // The city stays legible when the sky is too bright for the idle stars.
  const lum = 0.45 + 0.55 * starOpacity
  const skyDim = 1 - 0.3 * blend
  const sway = Math.min(w, h) * PARALLAX * blend
  const panX = -pointer.x * sway
  const panY = -pointer.y * sway * 0.5
  beginStars()
  for (let i = 0; i < STARS.length; i++) {
    const star = STARS[i]
    if (!star) continue
    const { vis, gain } = starVis(star, clock, starOpacity)
    const hx = (homeNx[i] ?? 0) * w
    const hy = (homeNy[i] ?? 0) * h
    const homeA = starAlpha(vis, gain, homeNy[i] ?? 0)
    const r = starRadius(star, unit)
    const kind = roleOf[i] ?? ROLE_IDLE

    if (kind === ROLE_CITY || kind === ROLE_REFL) {
      const slot = slotOf[i] ?? 0
      const gx = g.x[slot] ?? 0
      const gy = g.y[slot] ?? SKYLINE_WATER
      const gb = g.b[slot] ?? 0
      let tx = place.ox + gx * place.dw
      let ty: number
      let a = lum * (0.12 + 0.88 * gb ** 1.35)
      if (kind === ROLE_CITY) {
        ty = place.oy + gy * place.dh
        a *= 0.84 + 0.16 * Math.sin(time * (0.6 + star.tw) + star.ph)
      } else {
        const col = Math.min(REFL_COLS - 1, Math.floor(gx * REFL_COLS))
        const level = columnLevel[col] ?? 0
        const colX = place.ox + ((col + 0.5) / REFL_COLS) * place.dw
        tx = mix(tx, colX, REFL_COLUMN_SNAP) + Math.sin(time * 1.6 + gy * 160 + star.ph) * place.px * 0.4
        // Every dot stays lit; the column stretches and gathers with the voice.
        const stretch = REFL_REST + (1 - REFL_REST) * level
        ty = place.waterY + (gy - SKYLINE_WATER) * place.dh * stretch
        // Compressed columns stack dots, so ease brightness down to keep them from blowing out.
        a *= (0.5 + 0.5 * stretch) * (0.75 + 0.25 * Math.sin(time * (1.8 + star.tw) + gy * 240) ** 2)
      }
      const settledR = Math.max(0.7 * unit, place.px * (0.55 + 1.6 * gb * gb))
      const t = flight(i, blend)
      // A slight bow so the stars swirl in rather than slide on rails.
      const bow = Math.sin(Math.PI * t) * 0.16 * (hash(i * 3.7 + 0.2) - 0.5)
      const x = mix(hx, tx, t) - (ty - hy) * bow
      const y = mix(hy, ty, t) + (tx - hx) * bow
      const glint = t > 0.6 ? kind === ROLE_CITY && gb > 0.8 : star.glint
      // The skyline is the mid layer; stars still in flight carry their sky depth.
      const depthK = mix(skyDepth(i), 0.75, t)
      emit(x + panX * depthK, y + panY * depthK, mix(r, settledR, t), mix(homeA, Math.min(0.95, a), t), glint, unit)
    } else if (kind === ROLE_SKY) {
      const depthK = skyDepth(i)
      emit(hx + panX * depthK, hy + panY * depthK, r, homeA * skyDim, star.glint, unit)
    } else {
      emit(hx, hy, r, homeA, star.glint, unit)
    }
  }
  return finishStars()
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

  const travel = getSkyTravel()
  const extra = travel * h * FLY_SKY_LIFT

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
  tickVoice()
  const voice = getVoice()
  const active = voice.mode !== 'idle'
  const clock = skyTime(time, active)
  const blend = voiceBlend()
  const amp = voiceAmp()
  if (!active) {
    homesReady = false
    resetColumns()
  } else if (!homesReady || blend <= 0.001) {
    captureAssignments(clock, w, h, travel)
  }

  if (homesReady && blend > 0.001) {
    updateColumns(time, amp)
    tickPointer(time)
    frame.stars = paintGather(clock, time, w, h, unit, palette.starOpacity, blend)
  } else {
    frame.stars = paintIdle(clock, travel, w, h, unit, palette.starOpacity)
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
