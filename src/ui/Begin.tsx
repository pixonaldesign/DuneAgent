import { motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react/ArrowRight'
import { asset } from '../asset'
import { blur } from './motionBlur'

type Props = {
  onBegin: () => void
  onTechnical: () => void
}

function EntryArrow() {
  return <ArrowRight className="entry-arrow" size={18} weight="regular" aria-hidden />
}

export function Begin({ onBegin, onTechnical }: Props) {
  return (
    <motion.div
      className="landing"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, ...blur(12) }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      <img
        className="landing-kicker"
        src={asset('icons/dune-logo.png')}
        alt="DUNE — Dynamic Urban Network Engine by BCG X"
        width={635}
        height={193}
      />
      <h1 className="landing-title">
        The Agentic Co-Pilot for
        <br />
        the Future of Abu Dhabi
      </h1>
      <div className="landing-entries">
        <button type="button" className="entry-card glass liquid-glass" onClick={onBegin}>
          <span className="entry-preview entry-preview--agent" aria-hidden>
            <span className="entry-bar entry-bar--a" />
            <span className="entry-bar entry-bar--b" />
            <span className="entry-pill" />
          </span>
          <span className="entry-label">
            Executive
            <EntryArrow />
          </span>
        </button>
        <button type="button" className="entry-card glass liquid-glass" onClick={onTechnical}>
          <span className="entry-preview entry-preview--technical" aria-hidden>
            <span className="entry-sidebar">
              <span className="entry-bar entry-bar--c" />
              <span className="entry-bar entry-bar--d" />
            </span>
            <span className="entry-dot" />
          </span>
          <span className="entry-label">
            Full System
            <EntryArrow />
          </span>
        </button>
      </div>
    </motion.div>
  )
}
