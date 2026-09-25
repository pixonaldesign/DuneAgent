import { IS_GECKO } from '../browser'

/**
 * Motion `filter: blur()` keyframes. Gecko rasterises each animated filter as
 * its own layer, so per-word blur streams stall there; fall back to the
 * opacity/transform part of the animation.
 */
export function blur(px: number): { filter?: string } {
  return IS_GECKO ? {} : { filter: `blur(${px}px)` }
}
