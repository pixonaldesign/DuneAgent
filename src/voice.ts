import { startMic, stopMic } from './micSpectrum'

export type VoiceMode = 'idle' | 'forming' | 'listening' | 'disbanding'

export type VoiceState = {
  mode: VoiceMode
  modeAt: number
}

export const VOICE_HOLD_MS = 240
export const VOICE_FORM_MS = 1200
export const VOICE_DISBAND_MS = 1100

let state: VoiceState = { mode: 'idle', modeAt: 0 }
const listeners = new Set<(next: VoiceState) => void>()

function emit() {
  for (const fn of listeners) fn(state)
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 4
}

export function getVoice(): VoiceState {
  return state
}

export function subscribeVoice(fn: (next: VoiceState) => void) {
  listeners.add(fn)
  fn(state)
  return () => {
    listeners.delete(fn)
  }
}

export function startVoice() {
  if (state.mode !== 'idle') return
  state = { mode: 'forming', modeAt: performance.now() }
  startMic()
  emit()
}

export function stopVoice() {
  if (state.mode !== 'forming' && state.mode !== 'listening') return
  state = { mode: 'disbanding', modeAt: performance.now() }
  stopMic()
  emit()
}

export function tickVoice(now = performance.now()) {
  if (state.mode === 'forming' && now - state.modeAt >= VOICE_HOLD_MS + VOICE_FORM_MS) {
    state = { mode: 'listening', modeAt: now }
    emit()
  } else if (state.mode === 'disbanding' && now - state.modeAt >= VOICE_DISBAND_MS) {
    state = { mode: 'idle', modeAt: now }
    emit()
  }
}

/** 0 = starfield, 1 = Abu Dhabi skyline. */
export function voiceBlend(now = performance.now()) {
  const { mode, modeAt } = state
  if (mode === 'idle') return 0
  if (mode === 'listening') return 1
  if (mode === 'forming') {
    const elapsed = now - modeAt
    if (elapsed <= VOICE_HOLD_MS) return 0
    return easeOut(Math.min(1, (elapsed - VOICE_HOLD_MS) / VOICE_FORM_MS))
  }
  return 1 - easeOut(Math.min(1, (now - modeAt) / VOICE_DISBAND_MS))
}

export function voiceAmp(now = performance.now()) {
  const { mode, modeAt } = state
  if (mode === 'idle') return 0
  if (mode === 'listening') return 1
  const elapsed = now - modeAt
  if (mode === 'forming') {
    const t = Math.min(1, Math.max(0, (elapsed - VOICE_HOLD_MS - VOICE_FORM_MS * 0.72) / (VOICE_FORM_MS * 0.28)))
    return easeOut(t)
  }
  return 1 - easeOut(Math.min(1, elapsed / (VOICE_DISBAND_MS * 0.38)))
}
