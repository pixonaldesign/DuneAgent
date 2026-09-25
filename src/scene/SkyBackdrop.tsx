import { useEffect, useRef } from 'react'
import { SkyRenderer } from './skyGL'
import { computeSky, drawSky2D } from './skyPaint'

export function SkyBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false })
    const sky = gl ? SkyRenderer.create(gl) : null
    const ctx = sky ? null : canvas.getContext('2d', { alpha: false })
    if (!sky && !ctx) return

    let raf = 0
    let running = true

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(window.innerWidth * dpr))
      const h = Math.max(1, Math.round(window.innerHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    const frame = (now: number) => {
      if (!running) return
      resize()
      const next = computeSky(canvas.width, canvas.height, now / 1000)
      if (sky) sky.render(next, canvas.width, canvas.height)
      else if (ctx) drawSky2D(ctx, next)
      raf = requestAnimationFrame(frame)
    }

    window.addEventListener('resize', resize)
    resize()
    raf = requestAnimationFrame(frame)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      sky?.dispose()
    }
  }, [])

  return <canvas ref={ref} className="sky-backdrop" aria-hidden />
}
