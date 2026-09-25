import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  SAADIYAT_BEARING,
  SAADIYAT_BOUNDS,
  SAADIYAT_CENTER,
  SAADIYAT_PITCH,
  SAADIYAT_ZOOM,
  campusPois,
  culturePois,
  cycleSpine,
  islandOutline,
  lastmileHeat,
  shuttleCorridor,
  visitorHeat,
} from '../data/saadiyat'
import {
  YAS_BEARING,
  YAS_BOUNDS,
  YAS_CENTER,
  YAS_PITCH,
  YAS_ZOOM,
  disneyHeat,
  disneyPois,
  highwayPressure,
  tramLine,
  yasOutline,
} from '../data/yas'
import {
  CALLOUT_PAD,
  EMIRATE_BEARING,
  EMIRATE_BOUNDS,
  EMIRATE_CENTER,
  EMIRATE_PITCH,
  EMIRATE_ZOOM,
  impactPlanById,
  impactPlans,
  type ImpactPlan,
  type ImpactPlanId,
} from '../data/impactPlans'
import type { MapFocus } from '../data/scenarios'

/** Public demo token (`pk.*`). Restrict URLs in the Mapbox dashboard. Override with VITE_MAPBOX_TOKEN. */
const FALLBACK_MAPBOX_TOKEN =
  'pk.eyJ1IjoicGl4b25hbCIsImEiOiJjbHJocDZvY2cwMXAzMm1zMWZnZDhxNngxIn0.PcC8G5xFaPmXUGOY2h2tmw'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN?.trim() || FALLBACK_MAPBOX_TOKEN
const STYLE =
  import.meta.env.VITE_MAPBOX_STYLE?.trim() ||
  'mapbox://styles/pixonal/cmnpx8l6b002y01qs7t6odrgt'

type Variant = 'bleed' | 'widget'

type Props = {
  layers: string[]
  variant?: Variant
  focus?: MapFocus
  selectedPlanId?: ImpactPlanId | null
  onSelectPlan?: (id: ImpactPlanId | null) => void
  onReady?: () => void
}

type ImpactMarker = {
  planId: ImpactPlanId
  marker: mapboxgl.Marker
  root: HTMLButtonElement
  stem: HTMLSpanElement
  chip: HTMLSpanElement
  title: HTMLSpanElement
  /** Preferred / current vertical stem length (px). */
  dist: number
}

const DRAG_PX = 5
const DOT_R = 5
const MIN_STEM = 18
const MAX_STEM = 280
const CHIP_GAP = 8
const MARKER_GAP = 8

export function MobilityMap({
  layers,
  variant = 'bleed',
  focus = 'saadiyat',
  selectedPlanId = null,
  onSelectPlan,
  onReady,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const layersRef = useRef(layers)
  const variantRef = useRef(variant)
  const focusRef = useRef(focus)
  const selectedRef = useRef(selectedPlanId)
  const onSelectPlanRef = useRef(onSelectPlan)
  const onReadyRef = useRef(onReady)
  const impactMarkersRef = useRef<ImpactMarker[]>([])
  const layoutRaf = useRef(0)
  layersRef.current = layers
  variantRef.current = variant
  focusRef.current = focus
  selectedRef.current = selectedPlanId
  onSelectPlanRef.current = onSelectPlan
  onReadyRef.current = onReady

  useEffect(() => {
    if (!TOKEN) {
      onReadyRef.current?.()
      return
    }
    if (!host.current || mapRef.current) return

    const start = cameraForFocus(focusRef.current)

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container: host.current,
      style: STYLE,
      ...start,
      attributionControl: false,
      antialias: true,
      interactive: true,
      dragPan: true,
      scrollZoom: true,
      boxZoom: true,
      dragRotate: true,
      pitchWithRotate: true,
      touchZoomRotate: true,
      doubleClickZoom: true,
      keyboard: true,
      fadeDuration: 0,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))

    let readyNotified = false
    const notifyReady = () => {
      if (readyNotified) return
      readyNotified = true
      requestAnimationFrame(() => onReadyRef.current?.())
    }

    const scheduleLayout = () => {
      cancelAnimationFrame(layoutRaf.current)
      layoutRaf.current = requestAnimationFrame(() => {
        layoutImpactCallouts(map, impactMarkersRef.current, selectedRef.current)
      })
    }

    const onStyleReady = () => {
      paintOverlays(map)
      applyLayers(map, layersRef.current, variantRef.current, focusRef.current)
      syncImpactMarkers(map, focusRef.current, selectedRef.current, impactMarkersRef, onSelectPlanRef, selectedRef)
      map.resize()
      frameRegion(map, focusRef.current, 0)
      scheduleLayout()
      map.once('idle', notifyReady)
      requestAnimationFrame(() => {
        map.resize()
        scheduleLayout()
        notifyReady()
      })
    }

    let pointerDown: { x: number; y: number } | null = null
    let dragged = false

    const onPointerDown = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      const point = 'point' in e ? e.point : null
      if (!point) return
      pointerDown = { x: point.x, y: point.y }
      dragged = false
    }
    const onPointerMove = (e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) => {
      if (!pointerDown) return
      const point = 'point' in e ? e.point : null
      if (!point) return
      if (Math.hypot(point.x - pointerDown.x, point.y - pointerDown.y) > DRAG_PX) dragged = true
    }
    const onPointerUp = () => {
      pointerDown = null
    }
    const onMapClick = () => {
      if (focusRef.current !== 'emirate') return
      if (dragged) {
        dragged = false
        return
      }
      onSelectPlanRef.current?.(null)
    }

    map.on('mousedown', onPointerDown)
    map.on('mousemove', onPointerMove)
    map.on('mouseup', onPointerUp)
    map.on('touchstart', onPointerDown)
    map.on('touchmove', onPointerMove)
    map.on('touchend', onPointerUp)
    map.on('click', onMapClick)
    map.on('move', scheduleLayout)
    map.on('zoom', scheduleLayout)
    map.on('rotate', scheduleLayout)
    map.on('pitch', scheduleLayout)
    // After ease/fit settles, one more layout with final projection (same vertical geometry as mid-move).
    map.on('moveend', scheduleLayout)
    map.on('idle', scheduleLayout)

    map.on('load', onStyleReady)
    map.on('style.load', onStyleReady)
    if (map.loaded()) onStyleReady()
    const resize = () => {
      map.resize()
      scheduleLayout()
    }
    window.addEventListener('resize', resize)
    const ro = new ResizeObserver(() => {
      map.resize()
      scheduleLayout()
    })
    ro.observe(host.current)
    const mapHost = host.current.closest('.map-host')
    if (mapHost instanceof HTMLElement) ro.observe(mapHost)
    const mo = new MutationObserver(() => {
      map.resize()
      scheduleLayout()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-mode'] })

    return () => {
      window.removeEventListener('resize', resize)
      ro.disconnect()
      mo.disconnect()
      cancelAnimationFrame(layoutRaf.current)
      clearImpactMarkers(impactMarkersRef)
      map.off('mousedown', onPointerDown)
      map.off('mousemove', onPointerMove)
      map.off('mouseup', onPointerUp)
      map.off('touchstart', onPointerDown)
      map.off('touchmove', onPointerMove)
      map.off('touchend', onPointerUp)
      map.off('click', onMapClick)
      map.off('move', scheduleLayout)
      map.off('zoom', scheduleLayout)
      map.off('rotate', scheduleLayout)
      map.off('pitch', scheduleLayout)
      map.off('moveend', scheduleLayout)
      map.off('idle', scheduleLayout)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.resize()
    frameRegion(map, focus, 1600)
    const start = performance.now()
    let raf = 0
    const tick = () => {
      map.resize()
      layoutImpactCallouts(map, impactMarkersRef.current, selectedRef.current)
      if (performance.now() - start < 800) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [variant, focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      applyLayers(map, layers, variant, focus)
      syncImpactMarkers(map, focus, selectedRef.current, impactMarkersRef, onSelectPlanRef, selectedRef)
      layoutImpactCallouts(map, impactMarkersRef.current, selectedRef.current)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [layers, variant, focus])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    paintImpactSelection(impactMarkersRef.current, selectedPlanId)
    layoutImpactCallouts(map, impactMarkersRef.current, selectedPlanId)
    if (focus !== 'emirate') return
    if (selectedPlanId) {
      const plan = impactPlanById(selectedPlanId)
      if (plan) easeToPlan(map, plan)
    } else {
      frameRegion(map, 'emirate', 900)
    }
  }, [selectedPlanId, focus])

  if (!TOKEN) {
    return <div className="map-missing">Add a Mapbox token to load the mobility map.</div>
  }

  return (
    <div className="map-frame">
      <div ref={host} className="map-canvas" />
    </div>
  )
}

const SAADIYAT_LAYERS = [
  'visitors-heat',
  'lastmile-heat',
  'shuttle-corridor',
  'cycle-spine',
  'pois-culture',
  'pois-campus',
]

const YAS_LAYERS = ['disney-heat', 'tram-line', 'highway-pressure', 'pois-disney']

const CONTEXT = {
  saadiyat: ['island-fill', 'island-line'],
  yas: ['yas-fill', 'yas-line'],
  emirate: [] as readonly string[],
} as const

function cameraForFocus(focus: MapFocus) {
  if (focus === 'yas') {
    return { center: YAS_CENTER, zoom: YAS_ZOOM, pitch: YAS_PITCH, bearing: YAS_BEARING }
  }
  if (focus === 'emirate') {
    return { center: EMIRATE_CENTER, zoom: EMIRATE_ZOOM, pitch: EMIRATE_PITCH, bearing: EMIRATE_BEARING }
  }
  return { center: SAADIYAT_CENTER, zoom: SAADIYAT_ZOOM, pitch: SAADIYAT_PITCH, bearing: SAADIYAT_BEARING }
}

function frameRegion(map: mapboxgl.Map, focus: MapFocus, duration: number) {
  if (focus === 'yas') {
    map.fitBounds(YAS_BOUNDS, {
      padding: { top: 48, right: 36, bottom: 72, left: 36 },
      pitch: YAS_PITCH,
      bearing: YAS_BEARING,
      duration,
      maxZoom: 12.6,
    })
    return
  }
  if (focus === 'emirate') {
    map.fitBounds(EMIRATE_BOUNDS, {
      padding: {
        top: CALLOUT_PAD.top,
        right: CALLOUT_PAD.right,
        bottom: CALLOUT_PAD.bottom,
        left: CALLOUT_PAD.left,
      },
      pitch: EMIRATE_PITCH,
      bearing: EMIRATE_BEARING,
      duration,
      maxZoom: 9.4,
    })
    return
  }
  map.fitBounds(SAADIYAT_BOUNDS, {
    padding: { top: 48, right: 36, bottom: 72, left: 36 },
    pitch: SAADIYAT_PITCH,
    bearing: SAADIYAT_BEARING,
    duration,
    maxZoom: 13.25,
  })
}

function easeToPlan(map: mapboxgl.Map, plan: ImpactPlan) {
  // Offset the focus slightly south so the vertical label+stem stack fits below the title.
  const pad = CALLOUT_PAD
  map.easeTo({
    center: plan.center,
    zoom: plan.zoom,
    pitch: EMIRATE_PITCH,
    bearing: EMIRATE_BEARING,
    padding: { top: pad.top + 48, bottom: pad.bottom + 24, left: pad.left, right: pad.right },
    offset: [0, 36],
    duration: 1100,
    essential: true,
  })
}

function clearImpactMarkers(ref: { current: ImpactMarker[] }) {
  for (const entry of ref.current) entry.marker.remove()
  ref.current = []
}

function syncImpactMarkers(
  map: mapboxgl.Map,
  focus: MapFocus,
  selectedId: ImpactPlanId | null,
  markersRef: { current: ImpactMarker[] },
  onSelectPlanRef: { current: ((id: ImpactPlanId | null) => void) | undefined },
  selectedPlanRef: { current: ImpactPlanId | null },
) {
  const want = focus === 'emirate'
  if (!want) {
    clearImpactMarkers(markersRef)
    return
  }
  if (markersRef.current.length === impactPlans.length) {
    paintImpactSelection(markersRef.current, selectedId)
    layoutImpactCallouts(map, markersRef.current, selectedId)
    return
  }
  clearImpactMarkers(markersRef)
  for (const plan of impactPlans) {
    const root = document.createElement('button')
    root.type = 'button'
    root.className = 'impact-callout'
    root.setAttribute('aria-label', plan.label)

    // Flex column in screen space: chip → vertical stem → dot. Dot anchors on the geo point.
    const stack = document.createElement('span')
    stack.className = 'impact-callout-stack'

    const chip = document.createElement('span')
    chip.className = 'impact-callout-chip'

    const title = document.createElement('span')
    title.className = 'impact-callout-title'
    title.textContent = plan.label
    chip.append(title)

    const stem = document.createElement('span')
    stem.className = 'impact-callout-stem'
    stem.setAttribute('aria-hidden', 'true')

    const dot = document.createElement('span')
    dot.className = 'impact-callout-dot'
    dot.setAttribute('aria-hidden', 'true')

    stack.append(chip, stem, dot)
    root.append(stack)

    root.addEventListener('click', (event) => {
      event.stopPropagation()
      onSelectPlanRef.current?.(plan.id)
    })

    const marker = new mapboxgl.Marker({
      element: root,
      anchor: 'center',
      offset: [0, 0],
      // Keep callout geometry in screen space — map pitch/bearing must not tilt the stem.
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport',
    })
      .setLngLat(plan.center)
      .addTo(map)

    markersRef.current.push({
      planId: plan.id,
      marker,
      root,
      stem,
      chip,
      title,
      dist: plan.labelDist,
    })
  }
  paintImpactSelection(markersRef.current, selectedId)
  layoutImpactCallouts(map, markersRef.current, selectedId)
}

function paintImpactSelection(markers: ImpactMarker[], selectedId: ImpactPlanId | null) {
  const hasSelection = selectedId != null
  for (const entry of markers) {
    const plan = impactPlanById(entry.planId)
    if (!plan) continue
    const selected = selectedId === entry.planId
    entry.root.classList.toggle('is-selected', selected)
    entry.root.classList.toggle('is-dimmed', hasSelection && !selected)
    entry.root.setAttribute('aria-pressed', selected ? 'true' : 'false')
    // Plan name only — never grow the chip with a note paragraph.
    entry.title.textContent = plan.label
  }
}

type ChipBox = {
  entry: ImpactMarker
  pinX: number
  pinY: number
  stem: number
  w: number
  h: number
}

function chipSize(label: string, chipEl?: HTMLElement): { w: number; h: number } {
  if (chipEl) {
    const rect = chipEl.getBoundingClientRect()
    if (rect.width > 8 && rect.height > 8) {
      return { w: rect.width, h: rect.height }
    }
  }
  const len = label.length
  const w = Math.min(268, Math.max(168, len * 7.4))
  const lines = Math.ceil((len * 6.8) / (w - 24))
  return { w, h: Math.max(32, 14 + lines * 17) }
}

function layoutImpactCallouts(
  map: mapboxgl.Map,
  markers: ImpactMarker[],
  selectedId: ImpactPlanId | null,
) {
  if (!markers.length) return

  const canvas = map.getCanvas()
  const viewW = canvas.clientWidth
  const viewH = canvas.clientHeight
  const pad = CALLOUT_PAD
  const DOT = DOT_R

  // Apply a temporary stem so measured chip sizes reflect the wider layout.
  for (const entry of markers) {
    entry.root.style.removeProperty('--stem-rot')
    entry.root.style.removeProperty('--chip-x')
    entry.root.style.removeProperty('--chip-y')
    entry.root.style.setProperty('--stem-len', `${entry.dist || 44}px`)
  }

  const boxes: ChipBox[] = markers.map((entry) => {
    const plan = impactPlanById(entry.planId)!
    const pin = map.project(plan.center)
    const size = chipSize(plan.label, entry.chip)
    const preferred = selectedId === entry.planId ? Math.max(plan.labelDist, 28) : plan.labelDist
    return {
      entry,
      pinX: pin.x,
      pinY: pin.y,
      stem: preferred,
      w: size.w,
      h: size.h,
    }
  })

  const chipBottom = (b: ChipBox) => b.pinY - DOT - b.stem
  const chipTop = (b: ChipBox) => chipBottom(b) - b.h
  const chipLeft = (b: ChipBox) => b.pinX - b.w / 2
  const chipRight = (b: ChipBox) => b.pinX + b.w / 2

  const overlapsX = (a: ChipBox, b: ChipBox) =>
    chipLeft(a) < chipRight(b) + CHIP_GAP && chipRight(a) > chipLeft(b) - CHIP_GAP

  const chipsOverlap = (a: ChipBox, b: ChipBox) => {
    if (!overlapsX(a, b)) return false
    return chipTop(a) < chipBottom(b) + CHIP_GAP && chipBottom(a) > chipTop(b) - CHIP_GAP
  }

  /** True if chip A covers marker B (the geographic center circle). */
  const chipCoversMarker = (chip: ChipBox, marker: ChipBox) => {
    if (chip === marker) return false
    const left = chipLeft(chip) - MARKER_GAP
    const right = chipRight(chip) + MARKER_GAP
    const top = chipTop(chip) - MARKER_GAP
    const bottom = chipBottom(chip) + MARKER_GAP
    return (
      marker.pinX > left &&
      marker.pinX < right &&
      marker.pinY > top &&
      marker.pinY < bottom
    )
  }

  const maxStemFor = (b: ChipBox) =>
    Math.max(MIN_STEM, Math.min(MAX_STEM, b.pinY - DOT - pad.top - b.h))

  const clampStem = (b: ChipBox) => {
    b.stem = Math.max(MIN_STEM, Math.min(maxStemFor(b), b.stem))
  }

  // Seed from preferred stems, then resolve collisions by lifting (longer stem) only.
  for (const b of boxes) clampStem(b)

  for (let pass = 0; pass < 48; pass++) {
    let moved = false

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const labelHit = chipsOverlap(a, b)
        const markHit = chipCoversMarker(a, b) || chipCoversMarker(b, a)
        if (!labelHit && !markHit) continue

        // Order: north = smaller screen Y (up).
        const north = a.pinY <= b.pinY ? a : b
        const south = north === a ? b : a

        if (labelHit) {
          // Put northern chip entirely above southern chip (+ gap).
          // northBottom <= southTop - GAP
          // north.pinY - DOT - north.stem <= chipTop(south) - CHIP_GAP
          const target = north.pinY - DOT - (chipTop(south) - CHIP_GAP)
          if (target > north.stem + 0.5) {
            const before = north.stem
            north.stem = target
            clampStem(north)
            if (north.stem > before + 0.5) moved = true
            // If clamp blocked the lift, shorten southern stem so its top drops.
            if (chipsOverlap(north, south)) {
              // southTop <= northBottom - GAP
              // south.pinY - DOT - south.stem - south.h <= chipBottom(north) - CHIP_GAP
              // -south.stem <= chipBottom(north) - CHIP_GAP - south.pinY + DOT + south.h
              // south.stem >= south.pinY - DOT - south.h - (chipBottom(north) - CHIP_GAP)
              const southTarget = south.pinY - DOT - south.h - (chipBottom(north) - CHIP_GAP)
              // Wait: we need southTop LOWER on screen = larger Y = shorter stem or...
              // southTop = south.pinY - DOT - south.stem - south.h
              // Want southTop >= northBottom + GAP  (south chip below north chip)
              // south.pinY - DOT - south.stem - south.h >= chipBottom(north) + CHIP_GAP
              // -south.stem >= chipBottom(north) + CHIP_GAP - south.pinY + DOT + south.h
              // south.stem <= south.pinY - DOT - south.h - chipBottom(north) - CHIP_GAP
              const maxSouth = south.pinY - DOT - south.h - chipBottom(north) - CHIP_GAP
              if (south.stem > maxSouth + 0.5) {
                const prev = south.stem
                south.stem = Math.max(MIN_STEM, maxSouth)
                clampStem(south)
                if (Math.abs(south.stem - prev) > 0.5) moved = true
              }
            }
          }
        }

        // Clear marker coverage by lengthening the covering chip's stem.
        for (const [chip, marker] of [
          [a, b],
          [b, a],
        ] as const) {
          if (!chipCoversMarker(chip, marker)) continue
          // chipBottom < marker.pinY - MARKER_GAP
          const need = chip.pinY - DOT - (marker.pinY - MARKER_GAP)
          if (need > chip.stem + 0.5) {
            const prev = chip.stem
            chip.stem = need
            clampStem(chip)
            if (chip.stem > prev + 0.5) moved = true
          }
        }
      }
    }

    if (!moved) break
  }

  // Final clamp into the map pane (title / attribution).
  for (const box of boxes) {
    clampStem(box)
    if (box.pinY + DOT > viewH - pad.bottom) {
      box.stem = Math.min(box.stem, Math.max(MIN_STEM, 40))
      clampStem(box)
    }
    box.entry.root.style.setProperty('--stem-len', `${Math.round(box.stem)}px`)
    box.entry.dist = box.stem
  }
}

function paintOverlays(map: mapboxgl.Map) {
  if (!map.getSource('island')) {
    map.addSource('island', { type: 'geojson', data: islandOutline })
  }
  if (!map.getSource('yas')) {
    map.addSource('yas', { type: 'geojson', data: yasOutline })
  }
  if (!map.getSource('shuttle')) {
    map.addSource('shuttle', { type: 'geojson', data: shuttleCorridor, lineMetrics: true })
  }
  if (!map.getSource('cycle')) {
    map.addSource('cycle', { type: 'geojson', data: cycleSpine, lineMetrics: true })
  }
  if (!map.getSource('visitors')) {
    map.addSource('visitors', { type: 'geojson', data: visitorHeat })
  }
  if (!map.getSource('lastmile')) {
    map.addSource('lastmile', { type: 'geojson', data: lastmileHeat })
  }
  if (!map.getSource('pois-culture')) {
    map.addSource('pois-culture', { type: 'geojson', data: culturePois })
  }
  if (!map.getSource('pois-campus')) {
    map.addSource('pois-campus', { type: 'geojson', data: campusPois })
  }
  if (!map.getSource('disney')) {
    map.addSource('disney', { type: 'geojson', data: disneyHeat })
  }
  if (!map.getSource('tram')) {
    map.addSource('tram', { type: 'geojson', data: tramLine, lineMetrics: true })
  }
  if (!map.getSource('highway')) {
    map.addSource('highway', { type: 'geojson', data: highwayPressure, lineMetrics: true })
  }
  if (!map.getSource('pois-disney')) {
    map.addSource('pois-disney', { type: 'geojson', data: disneyPois })
  }

  addOverlay(map, {
    id: 'island-fill',
    type: 'fill',
    source: 'island',
    paint: {
      'fill-color': '#e4b36a',
      'fill-opacity': 0.08,
    },
  })
  addOverlay(map, {
    id: 'island-line',
    type: 'line',
    source: 'island',
    paint: {
      'line-color': '#f0d2a8',
      'line-width': 1.4,
      'line-opacity': 0.55,
    },
  })
  addOverlay(map, {
    id: 'yas-fill',
    type: 'fill',
    source: 'yas',
    paint: {
      'fill-color': '#e4b36a',
      'fill-opacity': 0.08,
    },
  })
  addOverlay(map, {
    id: 'yas-line',
    type: 'line',
    source: 'yas',
    paint: {
      'line-color': '#f0d2a8',
      'line-width': 1.4,
      'line-opacity': 0.55,
    },
  })
  addOverlay(map, {
    id: 'visitors-heat',
    type: 'heatmap',
    source: 'visitors',
    paint: {
      'heatmap-weight': ['get', 'mag'],
      'heatmap-intensity': 1.4,
      'heatmap-radius': 42,
      'heatmap-opacity': 0.82,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(228,179,106,0)',
        0.2,
        'rgba(138,91,98,0.4)',
        0.5,
        'rgba(228,179,106,0.7)',
        0.85,
        'rgba(255,220,170,0.95)',
      ],
    },
  })
  addOverlay(map, {
    id: 'lastmile-heat',
    type: 'heatmap',
    source: 'lastmile',
    paint: {
      'heatmap-weight': ['get', 'mag'],
      'heatmap-intensity': 1.05,
      'heatmap-radius': 28,
      'heatmap-opacity': 0.8,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(61,74,92,0)',
        0.3,
        'rgba(80,140,170,0.45)',
        0.7,
        'rgba(180,220,200,0.85)',
      ],
    },
  })
  addOverlay(map, {
    id: 'disney-heat',
    type: 'heatmap',
    source: 'disney',
    paint: {
      'heatmap-weight': ['get', 'mag'],
      'heatmap-intensity': 1.35,
      'heatmap-radius': 46,
      'heatmap-opacity': 0.84,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(228,179,106,0)',
        0.2,
        'rgba(138,91,98,0.42)',
        0.55,
        'rgba(228,179,106,0.72)',
        0.85,
        'rgba(255,220,170,0.95)',
      ],
    },
  })
  addOverlay(map, {
    id: 'shuttle-corridor',
    type: 'line',
    source: 'shuttle',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 3.2,
      'line-opacity': 0.95,
      'line-gradient': [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        '#e4b36a',
        0.5,
        '#f4c9a8',
        1,
        '#8a5b62',
      ],
    },
  })
  addOverlay(map, {
    id: 'cycle-spine',
    type: 'line',
    source: 'cycle',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#9ad4c4',
      'line-width': 3,
      'line-dasharray': [1.2, 1.4],
      'line-opacity': 0.95,
    },
  })
  addOverlay(map, {
    id: 'tram-line',
    type: 'line',
    source: 'tram',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-width': 3.4,
      'line-opacity': 0.95,
      'line-gradient': [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        '#e4b36a',
        0.5,
        '#f4c9a8',
        1,
        '#8a5b62',
      ],
    },
  })
  addOverlay(map, {
    id: 'highway-pressure',
    type: 'line',
    source: 'highway',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#c47a7a',
      'line-width': 4.2,
      'line-opacity': 0.72,
      'line-dasharray': [1.6, 1.1],
    },
  })
  addOverlay(map, {
    id: 'pois-culture',
    type: 'circle',
    source: 'pois-culture',
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#f4d2a8',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#1a1420',
    },
  })
  addOverlay(map, {
    id: 'pois-campus',
    type: 'circle',
    source: 'pois-campus',
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#9ad4c4',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#1a1420',
    },
  })
  addOverlay(map, {
    id: 'pois-disney',
    type: 'circle',
    source: 'pois-disney',
    paint: {
      'circle-radius': 5.5,
      'circle-color': '#f4d2a8',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#1a1420',
    },
  })
}

function addOverlay(map: mapboxgl.Map, layer: mapboxgl.LayerSpecification) {
  if (map.getLayer(layer.id)) return
  try {
    map.addLayer({ ...layer, slot: 'top' })
  } catch {
    map.addLayer(layer)
  }
}

function applyLayers(map: mapboxgl.Map, layers: string[], variant: Variant, focus: MapFocus) {
  const all = [...CONTEXT.saadiyat, ...CONTEXT.yas, ...SAADIYAT_LAYERS, ...YAS_LAYERS]
  const context: readonly string[] = CONTEXT[focus]
  const showOverlays = focus !== 'emirate'
  for (const id of all) {
    if (!map.getLayer(id)) continue
    const wanted =
      showOverlays && variant === 'widget' && (context.includes(id) || layers.includes(id))
    map.setLayoutProperty(id, 'visibility', wanted ? 'visible' : 'none')
  }
}
