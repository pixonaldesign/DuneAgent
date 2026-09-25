export type ImpactPlanId =
  | 'mussafah'
  | 'saadiyat'
  | 'hudayriat'
  | 'saadiyat-marina'
  | 'yas'
  | 'zayed-city'
  | 'luluat'
  | 'rawdah'
  | 'aamerah'

export type ImpactPlan = {
  id: ImpactPlanId
  label: string
  shortName: string
  center: [number, number]
  /** Spoken agent paragraph when this plan is selected (not shown on the map chip). */
  reply: string
  /** Neighborhood zoom; Al Aamerah uses a slightly wider frame. */
  zoom: number
  /** Preferred vertical stem length in px at overview (label sits above the pin). */
  labelDist: number
}

export const impactPlans: ImpactPlan[] = [
  {
    id: 'mussafah',
    label: 'Mussafah development impact',
    shortName: 'Mussafah',
    center: [54.49, 24.35],
    reply:
      'Mussafah’s industrial and logistics growth reshapes last-mile freight on the southern corridor — keep haulage on dedicated night windows so daytime visitor peaks stay clear.',
    zoom: 12.2,
    labelDist: 44,
  },
  {
    id: 'saadiyat',
    label: 'Saadiyat Island land-use comparison',
    shortName: 'Saadiyat Island',
    center: [54.43, 24.54],
    reply:
      'On Saadiyat, the cultural shore versus inland mixed-use is the land-use rule — put density inland so last-mile stays on foot and shuttle, not on the museum driveway.',
    zoom: 12.4,
    labelDist: 72, // Saadiyat — taller preferred stem so marina can sit below
  },
  {
    id: 'hudayriat',
    label: 'Al Hudayriat masterplan impact',
    shortName: 'Al Hudayriat',
    center: [54.14, 24.42],
    reply:
      'Al Hudayriat’s leisure and residential plots pull weekend demand across the western bridges — time the crossings and hold spare capacity for the island peak.',
    zoom: 12.1,
    labelDist: 48,
  },
  {
    id: 'saadiyat-marina',
    label: 'Saadiyat Marina District impact',
    shortName: 'Saadiyat Marina',
    center: [54.405, 24.525],
    reply:
      'Saadiyat Marina tightens the waterfront loop with berths and ground-floor retail — keep driveway hotels off the shore so the marina stays walkable.',
    zoom: 12.6,
    labelDist: 36, // Marina — short stem; Saadiyat lifts above
  },
  {
    id: 'yas',
    label: 'Yas Framework Plan impact',
    shortName: 'Yas',
    center: [54.605, 24.49],
    reply:
      'The Yas Framework Plan sets entertainment and resort density that loads the airport approach — rail and park-and-ride have to absorb the peak before more lanes do.',
    zoom: 12.2,
    labelDist: 48,
  },
  {
    id: 'zayed-city',
    label: 'Zayed City Framework Plan impact',
    shortName: 'Zayed City',
    center: [54.64, 24.395],
    reply:
      'Zayed City sits between the airport and MBZ City as a new urban frame for housing and employment — build the transit spine with the plots, not after them.',
    zoom: 12.0,
    labelDist: 44,
  },
  {
    id: 'luluat',
    label: 'Luluat Al Raha masterplan impact',
    shortName: 'Luluat Al Raha',
    center: [54.628, 24.438],
    reply:
      'Luluat Al Raha adds reclaimed waterfront living on the eastern shore spine — last-mile should stay on the coastal loop, not a private-car spur.',
    zoom: 12.3,
    labelDist: 52,
  },
  {
    id: 'rawdah',
    label: 'Eastern Al Rawdah housing impact',
    shortName: 'Eastern Al Rawdah',
    center: [54.398, 24.462],
    reply:
      'Eastern Al Rawdah housing inland of the cultural islands shifts school and retail trip patterns — plan those local loops before the residential peak arrives.',
    zoom: 12.4,
    labelDist: 48,
  },
  {
    id: 'aamerah',
    label: 'Al Aamerah housing re-cut impact',
    shortName: 'Al Aamerah',
    center: [55.538, 24.236],
    reply:
      'Al Aamerah is a housing re-cut in Al Ain — about 6,080 homes — that widens the eastern demand footprint and needs its own local service, not a long highway commute by default.',
    zoom: 11.4,
    labelDist: 44,
  },
]

/** Bounds that frame all nine impact pins (Abu Dhabi coast through Al Ain). */
export const EMIRATE_BOUNDS: [[number, number], [number, number]] = [
  [54.05, 24.12],
  [55.72, 24.62],
]

export const EMIRATE_CENTER: [number, number] = [54.72, 24.38]
export const EMIRATE_ZOOM = 8.6
export const EMIRATE_PITCH = 28
export const EMIRATE_BEARING = -12

/** Screen insets so callouts clear map title (top) and attribution (bottom). */
export const CALLOUT_PAD = { top: 72, right: 36, bottom: 56, left: 36 }

export function impactPlanById(id: ImpactPlanId | null | undefined): ImpactPlan | undefined {
  if (!id) return undefined
  return impactPlans.find((p) => p.id === id)
}
