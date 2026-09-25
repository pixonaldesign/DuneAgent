/** Firefox and forks (Zen, LibreWolf, …) — engines with slower readback and CSS filter paths. */
export const IS_GECKO = typeof CSS !== 'undefined' && CSS.supports('-moz-appearance', 'none')
