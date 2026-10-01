import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  getSkylineVariant,
  setSkylineVariant,
  subscribeSkylineVariant,
  type SkylineVariant,
} from '../scene/skylineVariant'

const OPTIONS: { id: SkylineVariant; label: string }[] = [
  { id: 'city', label: 'Skyline' },
  { id: 'outline', label: 'Outline' },
  { id: 'compact', label: 'Compact' },
]

export function SkylineSwitch() {
  const [variant, setVariant] = useState(getSkylineVariant)

  useEffect(() => subscribeSkylineVariant(setVariant), [])

  return (
    <motion.div
      className="skyline-switch glass liquid-glass"
      role="radiogroup"
      aria-label="Voice visual"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={variant === option.id}
          className={variant === option.id ? 'skyline-switch-opt is-on' : 'skyline-switch-opt'}
          onClick={() => setSkylineVariant(option.id)}
        >
          {option.label}
        </button>
      ))}
    </motion.div>
  )
}
