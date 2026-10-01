import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { DuneCanvas } from './scene/DuneCanvas'
import { SkyBackdrop } from './scene/SkyBackdrop'
import { FLY_SECONDS } from './scene/CameraRig'
import { playFlyRise, setFlyProgress } from './scene/flyProgress'
import { Begin } from './ui/Begin'
import { ScenarioCards } from './ui/KpiDeck'
import { PromptBar } from './ui/PromptBar'
import { AgentReply } from './ui/AgentReply'
import { AgentText } from './ui/AgentText'
import { LiquidGlassLayer } from './ui/GlassLayer'
import { CommandMenu } from './ui/CommandMenu'
import type { ImpactPlanId } from './data/impactPlans'
import { impactPlanById } from './data/impactPlans'
import { briefingSummary, scenarioById, titleForPrompt, type ScenarioId } from './data/scenarios'
import { getVoice, stopVoice, subscribeVoice } from './voice'
import { asset } from './asset'
import { SidebarSimple } from '@phosphor-icons/react/SidebarSimple'
import { ArrowsOut } from '@phosphor-icons/react/ArrowsOut'

const MobilityMap = lazy(async () => {
  const mod = await import('./map/MobilityMap')
  return { default: mod.MobilityMap }
})

type Phase = 'landing' | 'flying' | 'briefing' | 'analysis' | 'split' | 'technical' | 'techEntry'

const FLY_MS = FLY_SECONDS * 1000
const HANDOFF_MS = 1050

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good Morning, Your Excellency'
  if (h < 17) return 'Good Afternoon, Your Excellency'
  return 'Good Evening, Your Excellency'
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('landing')
  const [replyId, setReplyId] = useState<ScenarioId | null>(null)
  const [chatTitle, setChatTitle] = useState<string | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [keepDunes, setKeepDunes] = useState(true)
  const [cardsReady, setCardsReady] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [mapHidden, setMapHidden] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<ImpactPlanId | null>(null)
  const [planTurns, setPlanTurns] = useState<
    { key: number; planId: ImpactPlanId; label: string; reply: string }[]
  >([])
  const planTurnKey = useRef(0)
  const [voicing, setVoicing] = useState(() => getVoice().mode !== 'idle')
  const flyTimer = useRef(0)
  const hello = greeting()

  useEffect(() => subscribeVoice((s) => setVoicing(s.mode !== 'idle')), [])

  useEffect(() => {
    return () => window.clearTimeout(flyTimer.current)
  }, [])

  useEffect(() => {
    if (phase === 'landing' || phase === 'flying' || phase === 'techEntry') return
    if (!keepDunes) return
    const id = window.setTimeout(() => setKeepDunes(false), HANDOFF_MS)
    return () => window.clearTimeout(id)
  }, [phase, keepDunes])

  useEffect(() => {
    if (phase !== 'briefing') setCardsReady(false)
  }, [phase])

  useEffect(() => {
    if (phase === 'landing' || phase === 'techEntry') setFlyProgress(0)
    else if (phase !== 'flying') setFlyProgress(1)
  }, [phase])

  useEffect(() => {
    if (phase === 'landing' || phase === 'flying' || phase === 'techEntry') return
    void import('./map/MobilityMap')
  }, [phase])

  function begin() {
    playFlyRise(FLY_SECONDS)
    setKeepDunes(true)
    setPhase('flying')
    window.clearTimeout(flyTimer.current)
    flyTimer.current = window.setTimeout(() => setPhase('briefing'), FLY_MS)
  }

  function beginTechnical() {
    window.clearTimeout(flyTimer.current)
    setKeepDunes(true)
    setPhase('techEntry')
  }

  function back() {
    // Leave recording before the page changes so the skyline disbands
    // instead of staying formed on the screen we return to.
    stopVoice()
    if (phase === 'techEntry') {
      setPhase('landing')
      setKeepDunes(true)
      return
    }
    if (phase === 'analysis' || phase === 'split' || phase === 'technical') {
      setReplyId(null)
      setChatTitle(null)
      setAsked(null)
      setSelectedPlanId(null)
      setPlanTurns([])
      setMapHidden(false)
      setPhase('briefing')
    } else if (phase === 'briefing') {
      window.clearTimeout(flyTimer.current)
      setPhase('landing')
      setKeepDunes(true)
    }
  }

  const openAnalysis = useCallback((id: ScenarioId, text?: string) => {
    setReplyId(id)
    setChatTitle(titleForPrompt(id, text))
    setAsked(text ?? scenarioById(id).questions[0])
    setSelectedPlanId(null)
    setPlanTurns([])
    setMapHidden(false)
    setPhase('analysis')
  }, [])

  const onSelectPlan = useCallback((id: ImpactPlanId | null) => {
    setSelectedPlanId(id)
    if (!id) return
    const plan = impactPlanById(id)
    if (!plan) return
    planTurnKey.current += 1
    setPlanTurns((turns) => [
      ...turns,
      {
        key: planTurnKey.current,
        planId: id,
        label: plan.label,
        reply: plan.reply,
      },
    ])
  }, [])

  /** Clear map focus only — keep the plan chat thread intact. */
  const resetMapView = useCallback(() => {
    setSelectedPlanId(null)
  }, [])

  const goSplit = useCallback(() => {
    setPhase((current) => (current === 'analysis' ? 'split' : current))
  }, [])

  const goTechnical = useCallback(() => {
    setPhase((current) =>
      current === 'analysis' || current === 'split' ? 'technical' : current,
    )
  }, [])

  const onPrompt = useCallback(
    (id: ScenarioId, text: string) => {
      openAnalysis(id, text)
    },
    [openAnalysis],
  )

  const onMapReady = useCallback(() => setMapReady(true), [])

  const inChat = phase === 'briefing' || phase === 'analysis' || phase === 'split' || phase === 'technical'
  const inReply = phase === 'analysis' || phase === 'split' || phase === 'technical'
  const mapRevealed = (phase === 'split' || phase === 'technical') && replyId !== null
  const splitLayout = mapRevealed && !mapHidden
  const showDunes = phase === 'landing' || phase === 'flying' || phase === 'techEntry' || keepDunes
  const dunesFading = showDunes && phase !== 'landing' && phase !== 'flying' && phase !== 'techEntry'
  const mapMounted = Boolean(replyId) && inReply
  const showMapPane = splitLayout
  const layers = replyId ? scenarioById(replyId).mapLayers : []

  useEffect(() => {
    if (!mapMounted) setMapReady(false)
  }, [mapMounted])

  useEffect(() => {
    if (mapRevealed) setMapReady(true)
  }, [mapRevealed])

  useEffect(() => {
    const root = document.documentElement
    if (phase === 'technical') root.dataset.evidenceMode = 'technical'
    else delete root.dataset.evidenceMode
    if (phase === 'techEntry') root.dataset.entry = 'technical'
    else delete root.dataset.entry
  }, [phase])

  const stageName = splitLayout ? 'split' : inReply ? 'analysis' : phase

  return (
    <div
      className={`app stage-${stageName}${phase === 'technical' ? ' is-technical' : ''}${voicing ? ' is-voicing' : ''}`}
    >
      <SkyBackdrop />
      {showDunes ? <DuneCanvas flying={phase === 'flying'} fading={dunesFading} /> : null}

      {mapMounted && replyId ? (
        <div
          className={
            showMapPane && mapReady ? 'map-host is-ready' : mapHidden && mapRevealed ? 'map-host is-stowed' : 'map-host'
          }
        >
          <Suspense fallback={null}>
            <MobilityMap
              layers={layers}
              variant="widget"
              focus={scenarioById(replyId).mapFocus}
              selectedPlanId={replyId === 'landuse' ? selectedPlanId : null}
              onSelectPlan={replyId === 'landuse' ? onSelectPlan : undefined}
              onReady={onMapReady}
            />
          </Suspense>
        </div>
      ) : null}

      <LiquidGlassLayer />

      <div className="ui">
        <AnimatePresence>
          {phase === 'landing' ? <Begin key="begin" onBegin={begin} onTechnical={beginTechnical} /> : null}
        </AnimatePresence>

        {phase === 'techEntry' ? (
          <div className="tech-entry-stub">
            <button type="button" className="back-btn" onClick={back} aria-label="Back">
              <img src={asset('icons/back.svg')} alt="" width={32} height={32} />
            </button>
          </div>
        ) : null}

        {inChat ? (
          <div className="chat-header">
            <button type="button" className="back-btn" onClick={back} aria-label="Back">
              <img src={asset('icons/back.svg')} alt="" width={32} height={32} />
            </button>
            {inReply && chatTitle ? <h1 className="chat-title">{chatTitle}</h1> : null}
            {mapRevealed ? (
              <button
                type="button"
                className="map-panel-btn"
                onClick={() => setMapHidden((hidden) => !hidden)}
                aria-label={mapHidden ? 'Show map' : 'Hide map'}
                aria-pressed={!mapHidden}
              >
                <SidebarSimple size={22} weight="regular" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {showMapPane && mapReady ? (
          <div className="map-chrome">
            <div className="map-title">{scenarioById(replyId).mapTitle}</div>
          </div>
        ) : null}

        {showMapPane && mapReady && replyId === 'landuse' ? (
          <div className="map-reset-slot">
            <AnimatePresence>
              {selectedPlanId ? (
                <motion.button
                  key="reset-map"
                  type="button"
                  className="map-reset-btn glass liquid-glass"
                  onClick={resetMapView}
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 18 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ArrowsOut className="map-reset-icon" size={18} weight="regular" aria-hidden />
                  Reset map view
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        <div className={voicing ? 'voice-dim is-off' : 'voice-dim'}>
          {phase === 'briefing' ? (
            <motion.div
              className="briefing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <h1 className="greeting">{hello}</h1>
              <AgentText
                className="brief-summary"
                text={briefingSummary}
                onComplete={() => setCardsReady(true)}
              />
              <AnimatePresence>
                {cardsReady ? <ScenarioCards key="scenarios" onPick={openAnalysis} /> : null}
              </AnimatePresence>
            </motion.div>
          ) : null}

          {inReply && replyId ? (
            <div className={splitLayout ? 'analysis-stack is-split' : 'analysis-stack'}>
              <div className="question-chip">
                {asked ?? scenarioById(replyId).questions[0]}
              </div>
              <AgentReply
                key={replyId}
                id={replyId}
                onRevealed={goSplit}
                onSeeMap={goTechnical}
                technical={phase === 'technical'}
                planTurns={planTurns}
                onSelectPlan={onSelectPlan}
              />
            </div>
          ) : null}
        </div>

        {inChat ? <PromptBar shifted={splitLayout} onSubmit={onPrompt} /> : null}
      </div>
      <CommandMenu />
    </div>
  )
}
