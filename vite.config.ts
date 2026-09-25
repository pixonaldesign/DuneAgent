import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const phosphorCsr = fileURLToPath(
  new URL('./node_modules/@phosphor-icons/react/dist/csr', import.meta.url),
)

const CLOCK_WARN_RE =
  /warn\(\s*(['"`])Clock: This module has been deprecated\. Please use THREE\.Timer instead\.\1\s*\);?\s*(\/\/[^\n]*)?/g

const TIMER_CLOCK = `class Clock {
	constructor( autoStart = true ) {
		this.autoStart = autoStart;
		this.startTime = 0;
		this.oldTime = 0;
		this.elapsedTime = 0;
		this.running = false;
		this._timer = new Timer();
	}

	start() {
		this._timer = new Timer();
		this.startTime = performance.now();
		this.oldTime = this.startTime;
		this.elapsedTime = 0;
		this.running = true;
	}

	stop() {
		this.getElapsedTime();
		this.running = false;
		this.autoStart = false;
	}

	getElapsedTime() {
		this.getDelta();
		return this.elapsedTime;
	}

	getDelta() {
		let diff = 0;

		if ( this.autoStart && ! this.running ) {
			this.start();
			return 0;
		}

		if ( this.running ) {
			this._timer.update();
			diff = this._timer.getDelta();
			this.oldTime = performance.now();
			this.elapsedTime = this._timer.getElapsed();
		}

		return diff;
	}

}
`

function patchDeprecatedClock(code: string) {
  let next = code
  const clockClass = next.indexOf('class Clock {')
  if (clockClass >= 0) {
    const spherical = next.indexOf('class Spherical {', clockClass)
    const clockExport = next.indexOf('export { Clock }', clockClass)
    if (spherical > clockClass) {
      next = `${next.slice(0, clockClass)}${TIMER_CLOCK}\n${next.slice(spherical)}`
    } else if (clockExport > clockClass) {
      next = `import { Timer } from './Timer.js';\n\n${TIMER_CLOCK}\nexport { Clock };\n`
    }
  }
  if (next.includes('Clock: This module has been deprecated')) {
    next = next.replace(CLOCK_WARN_RE, '')
  }
  return next === code ? null : next
}

function threeTimerClock(): Plugin {
  return {
    name: 'three-timer-clock',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/')
      if (
        !normalized.includes('/three/') &&
        !normalized.includes('three.module') &&
        !normalized.includes('three.core')
      ) {
        return null
      }
      const next = patchDeprecatedClock(code)
      if (next == null) return null
      return { code: next, map: null }
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [threeTimerClock(), react()],
  resolve: {
    alias: [
      {
        find: /^@phosphor-icons\/react\/([A-Z][\w]*)$/,
        replacement: path.join(phosphorCsr, '$1.es.js'),
      },
    ],
  },
  optimizeDeps: {
    include: [
      'mapbox-gl',
      'three',
      'gsap',
      'postprocessing',
      '@phosphor-icons/react',
      '@phosphor-icons/react/ArrowRight',
      '@phosphor-icons/react/ArrowsOut',
      '@phosphor-icons/react/Bicycle',
      '@phosphor-icons/react/Boat',
      '@phosphor-icons/react/Bus',
      '@phosphor-icons/react/Car',
      '@phosphor-icons/react/CurrencyCircleDollar',
      '@phosphor-icons/react/Lightbulb',
      '@phosphor-icons/react/MapPin',
      '@phosphor-icons/react/MapTrifold',
      '@phosphor-icons/react/RoadHorizon',
      '@phosphor-icons/react/SidebarSimple',
      '@phosphor-icons/react/TrafficSign',
      '@phosphor-icons/react/Train',
      '@phosphor-icons/react/Truck',
    ],
    rolldownOptions: {
      plugins: [threeTimerClock()],
    },
  },
})
