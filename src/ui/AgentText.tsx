import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import {
  WORD_BLUR,
  WORD_DURATION,
  WORD_EASE,
  WORD_STAGGER,
  streamDoneAt,
  wordDelay,
} from './agentCadence'
import { blur } from './motionBlur'

type Props = {
  text: string
  className?: string
  onComplete?: () => void
  /** Skip THINK_DELAY — for follow-up remarks after the main reply. */
  immediate?: boolean
}

/** Word-by-word stream used for agent-style copy (briefing summary, replies). */
export function AgentText({ text, className, onComplete, immediate = false }: Props) {
  const words = text.split(' ')
  const doneAt = immediate
    ? Math.max(words.length - 1, 0) * WORD_STAGGER + WORD_DURATION
    : streamDoneAt(words.length)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const t = window.setTimeout(() => onCompleteRef.current?.(), doneAt * 1000)
    return () => window.clearTimeout(t)
  }, [text, doneAt])

  return (
    <p className={className}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          className="word"
          initial={{ opacity: 0, ...blur(WORD_BLUR) }}
          animate={{ opacity: 1, ...blur(0) }}
          transition={{
            delay: immediate ? i * WORD_STAGGER : wordDelay(i),
            duration: WORD_DURATION,
            ease: WORD_EASE,
          }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  )
}
