/**
 * Live microphone spectrum while the user is recording. Bands are
 * log-spaced across the speech range and normalised to 0–1.
 * `live()` is false until the mic is granted, so callers can fall back.
 */

const MIN_HZ = 90
const MAX_HZ = 7000
const FLOOR_DB = -88
const RANGE_DB = 52

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let stream: MediaStream | null = null
let bins: Float32Array<ArrayBuffer> | null = null
let session = 0
/** Per-band noise floor, in normalised level; rises this much per second. */
const NOISE_RISE = 0.06
let noise = new Float32Array(0)
let readAt = 0

export function startMic() {
  stopMic()
  const id = ++session
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC || !navigator.mediaDevices?.getUserMedia) return
  // Created inside the click so the context is allowed to run.
  const audio = new AC()
  ctx = audio
  void audio.resume()
  navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .then((media) => {
      if (id !== session) {
        for (const t of media.getTracks()) t.stop()
        return
      }
      stream = media
      const node = audio.createAnalyser()
      node.fftSize = 4096
      node.smoothingTimeConstant = 0.55
      audio.createMediaStreamSource(media).connect(node)
      analyser = node
      bins = new Float32Array(node.frequencyBinCount)
    })
    .catch(() => {})
}

export function stopMic() {
  session++
  if (stream) for (const t of stream.getTracks()) t.stop()
  stream = null
  analyser = null
  bins = null
  noise = new Float32Array(0)
  readAt = 0
  if (ctx) void ctx.close().catch(() => {})
  ctx = null
}

export function micLive() {
  return analyser != null
}

/** Fills `out` with band levels, lowest frequency first. Returns false without a live mic. */
export function readBands(out: Float32Array) {
  if (!analyser || !bins || !ctx) return false
  analyser.getFloatFrequencyData(bins)
  const n = out.length
  if (noise.length !== n) noise = new Float32Array(n).fill(1)
  const now = performance.now()
  const dt = readAt === 0 ? 0 : Math.min(0.1, (now - readAt) / 1000)
  readAt = now
  const hzPerBin = ctx.sampleRate / analyser.fftSize
  for (let k = 0; k < n; k++) {
    const f0 = MIN_HZ * (MAX_HZ / MIN_HZ) ** (k / n)
    const f1 = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((k + 1) / n)
    const b0 = Math.max(1, Math.floor(f0 / hzPerBin))
    const b1 = Math.max(b0 + 1, Math.ceil(f1 / hzPerBin))
    let sum = 0
    for (let b = b0; b < b1; b++) sum += bins[b] ?? FLOOR_DB
    const db = sum / (b1 - b0)
    // Speech rolls off with frequency; tilt so the upper bands still move.
    const tilt = 14 * (k / n)
    const raw = Math.min(1, Math.max(0, (db + tilt - FLOOR_DB) / RANGE_DB))
    // Room hum sits under speech: drop to it instantly, creep up slowly.
    const floor = Math.min(raw, (noise[k] ?? raw) + dt * NOISE_RISE)
    noise[k] = floor
    out[k] = Math.min(1, Math.max(0, (raw - floor - 0.03) / 0.42))
  }
  return true
}
