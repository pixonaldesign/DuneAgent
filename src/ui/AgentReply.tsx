import { Fragment, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react/ArrowRight'
import { MapTrifold } from '@phosphor-icons/react/MapTrifold'
import { impactPlans, type ImpactPlanId } from '../data/impactPlans'
import { scenarioById, type ScenarioId } from '../data/scenarios'
import { iconForTakeaway } from './takeawayIcon'
import { ThinkingMark } from './ThinkingMark'
import { AgentText } from './AgentText'
import { THINK_DELAY, THINK_FADE, WORD_BLUR, WORD_DURATION, WORD_EASE, streamDoneAt, wordDelay } from './agentCadence'
import { blur } from './motionBlur'

export type PlanTurn = {
  key: number
  planId: ImpactPlanId
  label: string
  reply: string
}

type Props = {
  id: ScenarioId
  onRevealed: () => void
  onSeeMap: () => void
  technical?: boolean
  planTurns?: PlanTurn[]
  onSelectPlan?: (id: ImpactPlanId | null) => void
}

const THINK_PHRASE_MS = 1600
const THINK_PHRASES = [
  'Reading the corridor…',
  'Tracing peak flows…',
  'Weighing last-mile options…',
  'Mapping the coastal spine…',
]
const BULLET_PAUSE = 0.2
const BULLET_STAGGER = 0.15
const BULLET_DURATION = 0.28
const HOLD_AFTER = 0.25

function paragraphDoneAt(wordCount: number) {
  return streamDoneAt(wordCount)
}

function bulletDelay(wordCount: number, index: number) {
  return paragraphDoneAt(wordCount) + BULLET_PAUSE + index * BULLET_STAGGER
}

function kickerDelay(wordCount: number) {
  return Math.max(paragraphDoneAt(wordCount) + BULLET_PAUSE - 0.18, paragraphDoneAt(wordCount))
}

function replyDoneAt(wordCount: number, bulletCount: number) {
  const lastBulletStart = bulletDelay(wordCount, Math.max(bulletCount - 1, 0))
  return lastBulletStart + BULLET_DURATION + HOLD_AFTER
}

function ThinkingCopy() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      setIndex((n) => (n + 1) % THINK_PHRASES.length)
    }, THINK_PHRASE_MS)
    return () => window.clearInterval(t)
  }, [])

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={THINK_PHRASES[index]}
        className="thinking-copy"
        initial={{ opacity: 0, ...blur(6) }}
        animate={{ opacity: 1, ...blur(0) }}
        exit={{ opacity: 0, ...blur(6) }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      >
        {THINK_PHRASES[index]}
      </motion.span>
    </AnimatePresence>
  )
}

export function AgentReply({
  id,
  onRevealed,
  onSeeMap,
  technical = false,
  planTurns = [],
  onSelectPlan,
}: Props) {
  const scenario = scenarioById(id)
  const isLandUse = id === 'landuse'
  const words = scenario.reply.split(' ')
  const listCount = isLandUse ? impactPlans.length : scenario.analysis.length
  const doneAt = replyDoneAt(words.length, listCount)
  const onRevealedRef = useRef(onRevealed)
  onRevealedRef.current = onRevealed
  const [thinking, setThinking] = useState(true)
  const [mapCta, setMapCta] = useState(false)
  const threadEndRef = useRef<HTMLDivElement | null>(null)
  const hasPlanProse = isLandUse && planTurns.length > 0
  // Land Use: only with a plan prose reply. Other scenarios: after the opening stream.
  const showEvidenceBtn = isLandUse ? hasPlanProse && mapCta : mapCta

  useEffect(() => {
    const t = window.setTimeout(() => onRevealedRef.current(), THINK_DELAY * 1000)
    return () => window.clearTimeout(t)
  }, [id])

  useEffect(() => {
    if (isLandUse) {
      // Hide on the list-only turn; reveal with the latest plan prose reply.
      setMapCta(planTurns.length > 0)
      return
    }
    setMapCta(false)
    const t = window.setTimeout(() => setMapCta(true), doneAt * 1000)
    return () => window.clearTimeout(t)
  }, [id, doneAt, isLandUse, planTurns.length])

  useEffect(() => {
    setThinking(true)
    const t = window.setTimeout(() => setThinking(false), THINK_DELAY * 1000)
    return () => window.clearTimeout(t)
  }, [id])

  useEffect(() => {
    if (!planTurns.length) return
    const end = threadEndRef.current
    if (!end) return
    const scroller = end.closest('.analysis-stack')
    // Keep the newest turn in view inside the single transcript scroller.
    end.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (scroller instanceof HTMLElement) {
      requestAnimationFrame(() => {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [planTurns.length])

  const evidenceButton = showEvidenceBtn ? (
    <motion.button
      key="see-map"
      type="button"
      className={`map-evidence-btn glass liquid-glass${technical ? ' is-active' : ''}`}
      onClick={onSeeMap}
      aria-pressed={technical}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <MapTrifold className="map-evidence-icon" size={18} weight="regular" aria-hidden />
      See evidence on map
    </motion.button>
  ) : null

  return (
    <div className="analysis-copy">
      <AnimatePresence>
        {thinking ? (
          <motion.div
            key="thinking"
            className="thinking-slot"
            initial={{ opacity: 0, ...blur(8) }}
            animate={{ opacity: 1, ...blur(0) }}
            exit={{ opacity: 0, ...blur(10) }}
            transition={{ duration: THINK_FADE, ease: [0.22, 1, 0.36, 1] }}
            aria-label="Thinking"
          >
            <ThinkingMark />
            <ThinkingCopy />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p className="reply-text">
        {words.map((word, i) => (
          <motion.span
            key={`${word}-${i}`}
            className="word"
            initial={{ opacity: 0, ...blur(WORD_BLUR) }}
            animate={{ opacity: 1, ...blur(0) }}
            transition={{
              delay: wordDelay(i),
              duration: WORD_DURATION,
              ease: WORD_EASE,
            }}
          >
            {word}
          </motion.span>
        ))}
      </p>
      {isLandUse ? (
        <div className="analysis-takeaways impact-plans">
          <motion.h3
            className="analysis-kicker"
            initial={{ opacity: 0, ...blur(8) }}
            animate={{ opacity: 1, ...blur(0) }}
            transition={{ delay: kickerDelay(words.length), duration: BULLET_DURATION }}
          >
            Impact plans
          </motion.h3>
          <div className="impact-plan-list">
            {impactPlans.map((plan, i) => {
              return (
                <Fragment key={plan.id}>
                  {i > 0 ? <div className="scenario-q-rule" aria-hidden /> : null}
                  <motion.div
                    initial={{ opacity: 0, ...blur(8) }}
                    animate={{ opacity: 1, ...blur(0) }}
                    transition={{ delay: bulletDelay(words.length, i), duration: BULLET_DURATION }}
                  >
                    <button
                      type="button"
                      className="scenario-option impact-plan-option"
                      onClick={(event) => {
                        onSelectPlan?.(plan.id)
                        event.currentTarget.blur()
                      }}
                    >
                      <span className="scenario-option-label">{plan.label}</span>
                      <ArrowRight className="scenario-option-arrow" size={16} weight="regular" aria-hidden />
                    </button>
                  </motion.div>
                </Fragment>
              )
            })}
          </div>
          <div className="plan-thread" aria-live="polite">
            {planTurns.map((turn, i) => {
              const isLatest = i === planTurns.length - 1
              return (
                <div key={turn.key} className="plan-turn">
                  <div className="plan-turn-ask">{turn.label}</div>
                  <AgentText className="reply-text plan-remark-text" text={turn.reply} immediate />
                  {isLatest ? <AnimatePresence>{evidenceButton}</AnimatePresence> : null}
                </div>
              )
            })}
            <div ref={threadEndRef} />
          </div>
        </div>
      ) : (
        <div className="analysis-takeaways">
          <motion.h3
            className="analysis-kicker"
            initial={{ opacity: 0, ...blur(8) }}
            animate={{ opacity: 1, ...blur(0) }}
            transition={{ delay: kickerDelay(words.length), duration: BULLET_DURATION }}
          >
            Key takeaways
          </motion.h3>
          <ul className="analysis">
            {scenario.analysis.map((line, i) => {
              const Icon = iconForTakeaway(line)
              return (
                <motion.li
                  key={line}
                  initial={{ opacity: 0, ...blur(8) }}
                  animate={{ opacity: 1, ...blur(0) }}
                  transition={{ delay: bulletDelay(words.length, i), duration: BULLET_DURATION }}
                >
                  <Icon className="analysis-icon" size={20} weight="regular" aria-hidden />
                  <span>{line}</span>
                </motion.li>
              )
            })}
          </ul>
          <AnimatePresence>{evidenceButton}</AnimatePresence>
        </div>
      )}
    </div>
  )
}
