import { Fragment } from 'react'
import { motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react/ArrowRight'
import { scenarios, type ScenarioId } from '../data/scenarios'
import { asset } from '../asset'
import { blur } from './motionBlur'

type Props = {
  onPick: (id: ScenarioId, question: string) => void
}

export function ScenarioCards({ onPick }: Props) {
  return (
    <motion.div
      className="scenario-row"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {scenarios.map((s, i) => (
        <motion.article
          key={s.id}
          className="scenario-card glass liquid-glass"
          initial={{ opacity: 0, y: 16, ...blur(8) }}
          animate={{ opacity: 1, y: 0, ...blur(0) }}
          transition={{ delay: 0.08 + i * 0.1, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="scenario-hero">
            <img
              className="scenario-hero-img"
              src={asset(s.image)}
              alt=""
              onLoad={(e) => {
                const img = e.currentTarget
                const hero = img.closest('.scenario-hero')
                if (hero instanceof HTMLElement && img.naturalWidth && img.naturalHeight) {
                  hero.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`
                }
              }}
            />
            <div className="scenario-hero-fade" aria-hidden />
            <div className="scenario-hero-copy">
              <span className="scenario-num">{s.number}</span>
              <h2 className="scenario-title">{s.title}</h2>
            </div>
          </div>
          <div className="scenario-body">
            <p className="scenario-blurb">{s.blurb}</p>
            <div className="scenario-qs">
              {s.questions.map((question, qi) => (
                <Fragment key={question}>
                  {qi > 0 ? <div className="scenario-q-rule" aria-hidden /> : null}
                  <button
                    type="button"
                    className="scenario-option"
                    onClick={() => onPick(s.id, question)}
                  >
                    <span className="scenario-option-label">{question}</span>
                    <ArrowRight className="scenario-option-arrow" size={16} weight="regular" aria-hidden />
                  </button>
                </Fragment>
              ))}
            </div>
          </div>
        </motion.article>
      ))}
    </motion.div>
  )
}
