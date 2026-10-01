import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { matchScenario, scenarios, type ScenarioId } from '../data/scenarios'
import { getVoice, startVoice, stopVoice, subscribeVoice } from '../voice'
import { asset } from '../asset'
import { blur } from './motionBlur'

const TRANSCRIPT = scenarios[0].questions[0]
const WORDS = TRANSCRIPT.split(/\s+/).filter(Boolean)
const WORD_MS = 140
const FIRST_WORD_DELAY_MS = 180
const SETTLE_MS = 380

type Props = {
  onSubmit: (id: ScenarioId, text: string) => void
  shifted?: boolean
}

export function PromptBar({ onSubmit, shifted = false }: Props) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(getVoice)
  const [shown, setShown] = useState(0)
  const [streaming, setStreaming] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const pendingTranscript = useRef(false)
  const startedAt = useRef(0)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const growRef = useRef<HTMLDivElement | null>(null)
  const voicing = voice.mode !== 'idle'
  const stopping = voice.mode === 'disbanding'

  useEffect(() => subscribeVoice(setVoice), [])

  function beginTranscript() {
    if (streaming) return
    pendingTranscript.current = false
    startedAt.current = performance.now()
    setShown(0)
    setText('')
    setStreaming(true)
  }

  useEffect(() => {
    if (voice.mode !== 'disbanding' || !pendingTranscript.current) return
    // The mic button starts the transcript itself. A stop from Back
    // should drop the pending recording instead of filling the prompt.
    pendingTranscript.current = false
  }, [voice.mode])

  useEffect(() => {
    if (!streaming) return
    let raf = 0
    let settle = 0
    const tick = () => {
      const elapsed = performance.now() - startedAt.current
      const next = elapsed < FIRST_WORD_DELAY_MS ? 0 : Math.min(WORDS.length, 1 + Math.floor((elapsed - FIRST_WORD_DELAY_MS) / WORD_MS))
      setShown(next)
      if (next < WORDS.length) {
        raf = window.requestAnimationFrame(tick)
        return
      }
      settle = window.setTimeout(() => {
        setText(TRANSCRIPT)
        setStreaming(false)
        window.requestAnimationFrame(() => fieldRef.current?.focus())
      }, SETTLE_MS)
    }
    raf = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(settle)
    }
  }, [streaming])

  useLayoutEffect(() => {
    const box = growRef.current
    if (!box) return
    const measure = () => {
      const line = parseFloat(getComputedStyle(box).lineHeight) || 31
      setExpanded(box.scrollHeight > line * 1.35)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [streaming, shown, text])

  useLayoutEffect(() => {
    const el = fieldRef.current
    if (!el || streaming) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text, streaming])

  function toggleMic() {
    if (voice.mode === 'idle') {
      pendingTranscript.current = true
      setStreaming(false)
      setShown(0)
      setText('')
      startVoice()
      return
    }
    if (voice.mode === 'forming' || voice.mode === 'listening') {
      if (pendingTranscript.current) beginTranscript()
      stopVoice()
    }
  }

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || voicing || streaming) return
    onSubmit(matchScenario(trimmed), trimmed)
    setText('')
    setShown(0)
    setExpanded(false)
  }

  const busy = voicing || streaming
  const canSend = Boolean(text.trim()) && !busy
  const barClass = [
    'prompt-bar',
    'glass',
    'liquid-glass',
    shifted ? 'shifted' : '',
    voicing ? 'is-listening' : '',
    streaming ? 'is-transcribing' : '',
    expanded ? 'is-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const sendClass = ['send-btn', canSend ? 'is-active' : 'is-idle', busy ? 'is-busy' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className={barClass}
      data-shown={shown}
      initial={{ y: 18 }}
      animate={{ y: 0 }}
      transition={{ delay: 0.35, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="prompt-field" ref={growRef}>
        {streaming ? (
          <div className="prompt-transcript" aria-live="polite" aria-label="Question">
            {WORDS.slice(0, shown).map((word, i) => (
              <motion.span
                key={`${word}-${i}`}
                className="word"
                initial={{ opacity: 0, ...blur(8), y: 5 }}
                animate={{ opacity: 1, ...blur(0), y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {word}
              </motion.span>
            ))}
            <span className="transcript-caret" aria-hidden />
          </div>
        ) : (
          <textarea
            ref={fieldRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={voicing ? 'Listening…' : 'Tell me which topic you’d like to ask about'}
            aria-label="Question"
            readOnly={voicing}
          />
        )}
      </div>
      <div className="prompt-icons">
        <button
          type="button"
          className={voicing ? 'icon-btn live' : 'icon-btn'}
          onClick={toggleMic}
          disabled={stopping}
          aria-label={voicing ? 'Stop listening' : 'Ask with voice'}
        >
          <img src={voicing ? asset('icons/stop.svg') : asset('icons/mic.svg')} alt="" width={22} height={22} />
        </button>
        <button type="button" className={sendClass} onClick={submit} disabled={!canSend} aria-label="Send">
          <img src={asset('icons/send.svg')} alt="" width={32} height={32} />
        </button>
      </div>
    </motion.div>
  )
}
