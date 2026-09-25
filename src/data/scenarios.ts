export type ScenarioId = 'transit' | 'roads' | 'tolls' | 'landuse'
export type MapFocus = 'saadiyat' | 'yas' | 'emirate'

export const briefingSummary =
  'Abu Dhabi is becoming a stacked network of rail, water, and shared fleets. Demand is absorbed on those layers — not new lanes on the highway.'

export type Scenario = {
  id: ScenarioId
  number: string
  title: string
  blurb: string
  image: string
  questions: string[]
  reply: string
  analysis: string[]
  mapLayers: string[]
  mapFocus: MapFocus
  mapTitle: string
}

export const scenarios: Scenario[] = [
  {
    id: 'transit',
    number: '01',
    title: 'Mass Transit',
    blurb: 'Explore metro, BRT, shuttles and multi-modal connectivity.',
    image: 'images/mass-transit.jpg',
    questions: ['Demand-led 2040 metro network', 'Final STMP metro extension'],
    reply:
      'By 2040 Saadiyat is a completed cultural island, not a Louvre-and-hotel hop. Guggenheim Abu Dhabi (from December 2026), Zayed National Museum, the Natural History Museum, teamLab Phenomena, and Dar al Funoon sit with Louvre on one walkable spine. The 2024 pattern — private cars onto the island, taxis for the last kilometre — does not survive that density. A timed Cultural District shuttle, a coastal cycle and e-mobility spine, and a water taxi to downtown absorb the peak, while the map’s heat settles along the museum head of the island instead of the hotel driveway.',
    analysis: [
      'Five anchors on one shore means a high-frequency shuttle loop, not more parking at each gate.',
      'Most on-island hops stay under 4 km — cycling, e-shuttle, and ferry territory once the coastal spine is continuous.',
      'Tie the loop to downtown and Zayed International so visitors never need a private car the moment they leave the museum steps.',
    ],
    mapLayers: ['visitors-heat', 'shuttle-corridor', 'cycle-spine', 'pois-culture'],
    mapFocus: 'saadiyat',
    mapTitle: 'Saadiyat Island, 2040 — Cultural District heat, shuttle loop, and coastal spine',
  },
  {
    id: 'tolls',
    number: '02',
    title: 'Policy and Demand Management',
    blurb: 'Price a crossing, shift when people travel, and read today’s pressure.',
    image: 'images/road-tolls.png',
    questions: [
      'Road congestion in 2026 observed',
      'Remote work — all white-collar staff, 2025 base',
    ],
    reply:
      'Corridor pricing is how Abu Dhabi keeps the 2030 visitor surge off a wider Sheikh Zayed Road. A gantry network on the E10, airport approach, and island bridges can peak-price the car while the tram and cultural shuttle stay free at the same hour. Construction freight for Yas North pays a night rate; daytime guest traffic is steered onto rail. The map’s heat band is the price signal — where delay concentrates, the toll should rise, and where a station or shuttle already exists, the toll should make that the cheaper door-to-door choice.',
    analysis: [
      'Price the bottleneck, not the whole emirate — E10, island bridges, and the airport approach are the three gates that set delay.',
      'Align peak tolls with tram and shuttle headways so the cheaper path is always the public one.',
      'Night freight discounts keep Disney-era haulage off the visitor peak without adding lanes.',
    ],
    mapLayers: ['disney-heat', 'tram-line', 'highway-pressure', 'pois-disney'],
    mapFocus: 'yas',
    mapTitle: 'Abu Dhabi corridors — peak pricing, haul routes, and rail alternatives',
  },
  {
    id: 'roads',
    number: '03',
    title: 'Roads',
    blurb: 'Understand road capacity, traffic flow and bottlenecks.',
    image: 'images/roads.jpg',
    questions: ['Road project ROI — 2040'],
    reply:
      'Disneyland Abu Dhabi lands on Yas’s waterfront in the early 2030s, on an island that already saw 38 million visits in 2024. Construction — typically four to six years after design — will overlap the build of Tram Line 4, the 100 km/h light rail from Zayed International through Yas, Al Raha, and the airport corridor, rated at about 6,630 passengers an hour. The risk is a double peak: haulage and workforce on the same E10/airport roads that already feed Ferrari World, Warner Bros., SeaWorld, and F1. The map shows that pressure as a heat band on Yas North and the airport approach. The move is to open the tram before the park, keep construction freight on a night haul route, and hold guest traffic on rail rather than on Sheikh Zayed Road.',
    analysis: [
      'Yas North construction and today’s parks cannot share one unseparated highway peak — dedicated haul gates and night freight are the construction-phase rule.',
      'Tram Line 4 (works from 2026, service targeted 2030) has to be live before Disney gates, or opening-year demand lands on cars.',
      'Park-and-ride at Al Raha and the airport, plus a 20-minute air-rail hop from Terminal A, keep the island’s existing 38 million visits from colliding with a seventh global Disney resort.',
    ],
    mapLayers: ['disney-heat', 'tram-line', 'highway-pressure', 'pois-disney'],
    mapFocus: 'yas',
    mapTitle: 'Yas Island — Disneyland construction pressure and Tram Line 4',
  },
  {
    id: 'landuse',
    number: '04',
    title: 'Land Use',
    blurb: 'Explore density, mixed-use plots and waterfront last-mile.',
    image: 'images/land-use.jpg',
    questions: ['Explore impact plans'],
    reply:
      'Land use is where Abu Dhabi’s next density, housing, and waterfront last-mile actually land — from coastal masterplans to inland re-cuts. Choose a plan from the list, or from the map tooltips, to read the local impact.',
    analysis: [],
    mapLayers: ['impact-plans'],
    mapFocus: 'emirate',
    mapTitle: 'Abu Dhabi — impact plans across the emirate',
  },
]

export function matchScenario(text: string): ScenarioId {
  const t = text.toLowerCase().trim()
  const exact = scenarios.find((s) => s.questions.some((q) => q.toLowerCase() === t))
  if (exact) return exact.id

  // Land use before yas/road so "Yas Framework Plan" cannot steal Roads.
  if (
    t.includes('land use') ||
    t.includes('land-use') ||
    t.includes('landuse') ||
    t.includes('zoning') ||
    t.includes('density') ||
    t.includes('mixed-use') ||
    t.includes('mixed use') ||
    t.includes('waterfront') ||
    t.includes('plot') ||
    t.includes('mussafah') ||
    t.includes('hudayriat') ||
    t.includes('rawdah') ||
    t.includes('aamerah') ||
    t.includes('zayed city') ||
    t.includes('luluat') ||
    t.includes('saadiyat marina') ||
    t.includes('framework plan') ||
    t.includes('impact plan') ||
    t.includes('masterplan') ||
    t.includes('explore impact')
  ) {
    return 'landuse'
  }

  if (
    t.includes('toll') ||
    t.includes('pricing') ||
    t.includes('salik') ||
    t.includes('charge') ||
    t.includes('remote work') ||
    t.includes('congestion in 2026') ||
    t.includes('demand management') ||
    t.includes('policy and demand')
  ) {
    return 'tolls'
  }

  if (
    t.includes('stmp') ||
    t.includes('metro network') ||
    t.includes('demand-led') ||
    t.includes('metro extension') ||
    t.includes('mass transit')
  ) {
    return 'transit'
  }

  if (
    t.includes('disney') ||
    t.includes('disneyland') ||
    t.includes('yas') ||
    t.includes('construction') ||
    t.includes('congest') ||
    t.includes('traffic') ||
    t.includes('travel time') ||
    t.includes('bottleneck') ||
    t.includes('highway') ||
    t.includes('road') ||
    t.includes('roi')
  ) {
    return 'roads'
  }
  return 'transit'
}

export function scenarioById(id: ScenarioId): Scenario {
  return scenarios.find((s) => s.id === id) ?? scenarios[0]
}

/** Scenario title, or a short line derived from a freeform question. */
export function titleForPrompt(id: ScenarioId, text?: string): string {
  const scenario = scenarioById(id)
  if (!text) return scenario.title
  const trimmed = text.trim()
  if (scenario.questions.some((q) => q.toLowerCase() === trimmed.toLowerCase())) return scenario.title
  const known = scenarios.find((s) => s.questions.some((q) => q.toLowerCase() === trimmed.toLowerCase()))
  if (known) return known.title
  const cleaned = trimmed.replace(/[?!.,]+$/g, '').trim()
  if (!cleaned) return scenario.title
  if (cleaned.length <= 42) return cleaned
  const cut = cleaned.slice(0, 42)
  const at = cut.lastIndexOf(' ')
  return `${at > 18 ? cut.slice(0, at) : cut}…`
}
