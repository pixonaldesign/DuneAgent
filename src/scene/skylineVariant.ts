export type SkylineVariant = 'city' | 'outline' | 'compact'

let variant: SkylineVariant = 'compact'
const listeners = new Set<(next: SkylineVariant) => void>()

export function getSkylineVariant() {
  return variant
}

export function setSkylineVariant(next: SkylineVariant) {
  if (next === variant) return
  variant = next
  for (const fn of listeners) fn(variant)
}

export function subscribeSkylineVariant(fn: (next: SkylineVariant) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
