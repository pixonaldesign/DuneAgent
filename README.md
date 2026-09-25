# Dune — Dynamic Urban Network Engine

Cinematic **executive** shell for an Abu Dhabi mobility briefing. Three.js night dunes, Old Standard TT titles, Schibsted Grotesk body, Kawase/SDF liquid glass, and a viewport-split Mapbox pane.

This README is **agent-facing**. Teams have imported this work and flattened it into generic Inter/16px cards with box-shadows. If you are a coding agent, treat the sections **Agent: do not restyle** and **What is real (design law)** as binding. Honor the platform 100%. Do not “clean up,” “simplify,” or “make it more production-ready” by replacing tokens, fonts, glass, layout, or motion.

The product is a **designed prototype**. Several paths are intentional stubs. Do not invent a technical dashboard, live STT, or an LLM because a button exists.

---

## Agent: do not restyle

These are hard rules. Violating any of them is a regression, not an improvement.

1. **Do not change the typeface stack.** Only **Old Standard TT** (serif display/titles) and **Schibsted Grotesk** (sans body/UI). Never Inter, never system-ui as the designed face, never a third family for “readability.”
2. **Do not flatten type or spacing to generic 16px / 1.5 / 24px cards.** Every size and gap lives in `src/index.css` tokens (`--type-*`, `--space-*`, `--chrome-*`, `--split-*`, `--content-width`). Edit tokens, not one-off pixels on components — and do not collapse showcase clamps into desktop values.
3. **Default UI mode is Showcase** (`html[data-ui-mode="showcase"]`). Desktop is a compact variant toggled via **⌘K / Ctrl+K**, persisted as `localStorage['dune-ui-mode']`. Do not delete either mode. Do not make desktop the default.
4. **Liquid glass is the material.** Elements marked `.liquid-glass` are refracted panes (Kawase frost + SDF lens in `GlassLayer.tsx`) plus a **subtle CSS rim**: 1px `--glass-stroke` (`rgba(255, 255, 255, 0.22)`) and `inset 0 1px 0 rgba(255, 255, 255, 0.28)` catch light. Do **not** replace them with `box-shadow: 0 8px 32px`, four-corner drop shadows, `filter: blur` on the card itself, or a flat `rgba` panel. Allowed CSS shadows on glass: that **inset highlight** and the **tucked bottom contact** (`0 12px 16px -14px`). Nothing else.
5. **Landing is a centered cinematic stack:** DUNE logo → two-line serif title → **Executive / Full System** cards with Phosphor `ArrowRight`. Do not relabel them Agent / Technical. Do not turn this into a marketing nav, a left-aligned hero, or a single CTA.
6. **Topic cards are Figma, not Bootstrap.** **Four** equal columns (Mass Transit, Policy and Demand Management, Roads, **Land Use**). Padding `--space-card` (8px showcase / 12px desktop), **4:3** heroes (`--hero-aspect`), title overlaid on the photo, body with a **~24px gap** between blurb and topics (content height — do not restore a tall `min-height` void), 2-line blurb min-height, hover arrow + dim siblings (**75ms hover-intent delay**; leave cancels immediately; `:focus-visible` stays immediate), **20% white / `plus-lighter`** question rules. Type: title **40px showcase / 30px desktop**, blurb **24 / 18**, questions **16 / 14** (`--type-ui`). Hierarchy is **title > blurb > questions**. Do not invert it. Do not drop back to three cards. Topic counts differ by card (2 / 2 / 1 / 1); row `align-items: stretch` keeps equal height to the tallest. Land Use’s single action is **Explore impact plans** — the nine impact plans live in the agent transcript and map, not on the card.
7. **Greeting is always “Your Excellency”** — `Good Morning|Afternoon|Evening, Your Excellency`. Do not substitute a first name, “Welcome,” or a generic hello. **`briefingSummary` is two generic sentences** (stacked network / not new lanes). No visitor counts, ridership stats, or 2030/2040 figures in that line.
8. **Agent copy streams on the fast cadence in `agentCadence.ts`.** Do not swap `AgentText` / `AgentReply` word-blur for instant text, a typewriter at 40ms, or a markdown renderer.
9. **The map is a viewport split, not a rounded card.** Showcase **40vw content / 60vw map**. Desktop **33vw / 66vw**. `border-radius: 0`, `box-shadow: none`. It is **not** an inset widget with 16px radius.
10. **Back from a reply returns to briefing** (clears the thread). It does **not** collapse the map. Map show/hide is the `SidebarSimple` panel toggle, and that button exists **only after the chat title + map are revealed**.
11. **The map mounts with every reply.** “See evidence on map” is a **mode flag** (`phase === 'technical'`). It does not open a different layout or a technical dashboard.
12. **Night dune colors are law:** sand `#23395c`, zenith `#0a1824`, horizon `#122038`, moon `#bad7fd`. Do not warm them into orange sand or magenta dusk unless the user asks.
13. **Content column is `--content-width`:** `85vw`, and from 1920px `min(75vw, 1440px)`. Centered with `left: 50%; translate: -50%`. Do not lock a 720px article column.
14. **One Vite tab:** `http://localhost:5173/`. Never spawn a second Simple Browser / IDE browser for this app. List tabs, reuse the existing 5173 instance, lock, work in place, unlock.
15. **Do not “finish” stubs.** Full System, technical evidence mode, voice STT, and LLM replies are **not** incomplete accidents. Leave them stubbed unless the user explicitly asks you to build the real thing — and then design them; do not drop in a generic dashboard.

If a design-system instinct conflicts with a token or a class in this repo, **the repo wins**.

---

## What is mock / stub (do not treat as production-complete)

| Surface | Reality | Evidence |
| --- | --- | --- |
| **Voice input** | Mock. Mic starts a constellation animation, then plays a **canned transcript** — the first Mass Transit question — word-by-word. No `getUserMedia`, no Web Speech API, no hardware STT. | `PromptBar.tsx`: `TRANSCRIPT = scenarios[0].questions[0]`. `voice.ts` is a `forming → listening → disbanding` timer. `vite-env.d.ts` declares `SpeechRecognition` types that **nothing calls**. |
| **Agent replies** | Canned copy. `matchScenario()` is keyword routing (`land use` / `zoning` / `density` → `landuse`; `toll` / `disney` / `road` → id), then `scenarios[id].reply` + `.analysis`. Not an LLM, not streamed from a server. | `src/data/scenarios.ts` |
| **Thinking copy** | Four rotating phrases on a 1.6s interval (`Reading the corridor…`, etc.). Cosmetic. | `AgentReply.tsx` `THINK_PHRASES` |
| **Takeaway icons** | First-match regex on the bullet string (`tram` → Train, `toll` → CurrencyCircleDollar). Fallback `Lightbulb`. | `src/ui/takeawayIcon.ts` |
| **Map data** | Styled Mapbox + **local GeoJSON** (Saadiyat / Yas / emirate impact pins). Heat, corridors, and POIs are authored in `saadiyat.ts` / `yas.ts`; land-use callouts in `impactPlans.ts`. Interactive pan / zoom / rotate. | `MobilityMap.tsx` |
| **Mapbox token** | `VITE_MAPBOX_TOKEN` **or** the public `pk.*` fallback already in source. Optional `VITE_MAPBOX_STYLE`. If both are empty, a “Add a Mapbox token…” placeholder shows. | `MobilityMap.tsx` `FALLBACK_MAPBOX_TOKEN` |
| **Full System landing path** | Stub. `beginTechnical()` → `phase === 'techEntry'`. Same dunes as landing plus a back button (`.tech-entry-stub`). **No technical dashboard, no sidebar, no KPIs.** `html[data-entry="technical"]` is a flag only. | `App.tsx`, `Begin.tsx` |
| **See evidence on map** | Mode switch only. Sets `phase` to `technical`, `html[data-evidence-mode="technical"]`, `.is-technical` on `.app`, and `.is-active` on the CTA. **No designed technical UI.** The split map is already visible. | `App.tsx` `goTechnical`, `AgentReply` `onSeeMap` |
| **CMD+K color picker** | Wired (`duneColors` + `localStorage['dune-colors']`) but **hidden** (`{false && …}`). Do not surface it unless asked. Night defaults remain the designed look. | `CommandMenu.tsx` |
| **Day/night cycle** | Real renderer, presentation loop. Palettes lerp over 90s (`DUSK → BLUE_HOUR → NIGHT`). First frame is the night hold (`INITIAL_PHASE = 0.66`). Not a user-facing time-of-day control. | `dayNight.ts`, `palettes.ts` |
| **Chat persistence** | None. Back to briefing clears `replyId`, title, asked text, and map. Refresh returns to landing. | `App.tsx` `back()` |

When you add a real backend, **keep the shell**. Replace the data source behind `scenarios` / `matchScenario` / `TRANSCRIPT`. Do not restyle the briefing to look like a chat product.

---

## What is real (honor as design law)

### Showcase vs desktop (`dune-ui-mode`)

| | Showcase (default) | Desktop |
| --- | --- | --- |
| How | `index.html` + inline boot script. `localStorage['dune-ui-mode'] !== 'desktop'` | ⌘K / Ctrl+K → pick **Desktop** |
| Intent | Cinematic presentation | Compact agentic UI |
| Type | Clamps: display up to 96px, title 48, lead 32, body 28 | Fixed ramp: 48 / 24 / 16 / 15 / 14 / 12 |
| Tracking / leading | Title −0.05em / 1.1 | Title −0.02em / 1.25; body 1.5 |
| Chrome | 40px inset | 24px inset |
| Card pad | **8px** (`--space-card`, Figma) | **12px** |
| Split | **40vw / 60vw** | **33vw / 66vw** |
| Prompt | `16px 16px 16px 20px` | `8px 10px 8px 14px` |

CSS: `:root` holds desktop numbers. `html[data-ui-mode='showcase']` overrides. `CommandMenu` writes `document.documentElement.dataset.uiMode` and dispatches `resize` so Mapbox refits.

Do not introduce a third mode. Do not persist mode anywhere except `dune-ui-mode`.

### Type and spacing tokens

Named ramp in `src/index.css` (comments: AES Display / Title / Lead / Body / UI / Caption):

```text
--type-display   48px          showcase clamp(40px, 5vw, 96px)
--type-title     24px          showcase clamp(28px, 2.5vw, 48px)
--type-title-sm  16px          showcase clamp(18px, 1.25vw, 24px)
--type-lead      16px          showcase clamp(18px, 1.67vw, 32px)
--type-body      15px          showcase clamp(16px, 1.46vw, 28px)
--type-ui        14px          showcase 16px
--type-caption   12px
--chat-title-size 22px         showcase clamp(24px, 2.2vw, 40px)
```

Topic **card type** is hardcoded, not the greeting tokens. Title **30px desktop / 40px showcase** so the photo title outranks the **18px / 24px** blurb. Questions use `--type-ui` (**14 / 16**). Do not “fix” hierarchy by tying the card title to `--type-title`, and do not restore the old 48 / 28 showcase sizes.

Content width:

```text
--content-width: 85vw;
@media (min-width: 1920px) { --content-width: min(75vw, 1440px); }
```

Briefing and analysis stacks are `width: var(--content-width)` and horizontally centered. On split, analysis + prompt pin to the **left** column (`--split-content` minus chrome). Below 1100px the split becomes a vertical stack (map from 46% down). Do not apply the mobile stack at desktop widths.

### Liquid glass (Kawase + SDF)

`LiquidGlassLayer` (`src/ui/GlassLayer.tsx`) is a full-viewport WebGL canvas (`z-index: 4`) that:

1. Captures the sky canvas + dune WebGL canvas into a backdrop.
2. Dual Kawase pyramid: **3 downs + 2 ups**, offset 1.2 — ~26px frost matching `--glass-blur`.
3. Composites up to **4** `.liquid-glass` panes via rounded-box SDF, Snell-ish bevel (`IOR 1.48`, `BEVEL_PX 22`), rim chromatic split, wash, and a **tucked contact** (not a drop shadow).

CSS contract:

```css
.glass { fill + 1px --glass-stroke (0.22) + inset 0 1px 0 rgba(255,255,255,0.28) + blur(26px) }
.has-liquid-glass .liquid-glass {
  background: rgba(0, 0, 0, 0.1);
  border: 1px solid var(--glass-stroke); /* keep the rim; do not set transparent */
  backdrop-filter: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28), /* top-edge catch light */
    0 12px 16px -14px rgba(8, 6, 10, 0.32);  /* tucked bottom contact */
}
```

**Forbidden:** four-corner shadows, extra `box-shadow` on cards/chips/prompt, `filter: drop-shadow` on panes, raising `--glass-blur` by stacking CSS blur on top of the shader, dropping the inset rim.

Allowed exceptions already in CSS: prompt listening ring (inset highlight + `0 0 0 1px` + bottom contact) and `box-shadow: none` on the map host / Mapbox popup.

Mark a surface `.glass.liquid-glass` to opt into the shader. The engine skips panes inside `.voice-dim.is-off`.

### Landing

`Begin.tsx` — centered column, not a page grid.

1. **Kicker:** `public/icons/dune-logo.png` (intrinsic 635×193), height `clamp(52px, 8.4vh, 96px)`, width locked to aspect.
2. **Title** (Old Standard TT, `--sand` `#d4deea`, clamp 40–96, tracking −0.05em, leading 1.1), two lines exactly:

   > The Agentic Co-Pilot for  
   > the Future of Abu Dhabi

3. **Two entry cards** in a row, liquid glass, Phosphor `ArrowRight` 18 regular on the label row:
   - **Executive** — wireframe preview of agent bars + prompt pill → `begin()` → fly → briefing.
   - **Full System** — wireframe sidebar + dot → `beginTechnical()` → **stub** (`techEntry`).

Cards use `--entry-card-gap` (38px showcase / 16px desktop), radius 20/16, preview 286×161 / 180×101. Keep the wireframe previews; they are the designed illustration, not leftover gray boxes.

### Topic cards

`ScenarioCards` in `KpiDeck.tsx` (filename is historical — these are **scenario cards**, not a KPI deck). **Four** equal columns.

**Structure, top to bottom:**

1. **Hero** — `aspect-ratio: 4 / 3` (`--hero-aspect`), 20px radius, photo `object-fit: cover`, cyan fade `linear-gradient(180deg, transparent 52.4%, rgba(59, 239, 255, 0.8))`, **number + title** (serif) sitting on the fade. `onLoad` may set the hero to the image’s natural ratio; CSS default must remain 4:3. Transit hero is the current `mass-transit.jpg` (replaced). Land Use is `land-use.jpg`.
2. **Body** — 12px inner pad, **~24px gap** between blurb and questions (content-sized; do not stretch the body to fill leftover viewport height).
3. **Blurb** — sans, **18px desktop / 24px showcase**, **`min-height: 2em * line-height`** so a one-line blurb does not collapse the card. Do not “fix” height by deleting the min-height.
4. **Questions** — topic rows under the blurb (counts vary: Mass Transit 2, Policy and Demand Management 2, Roads 1, Land Use 1). Separators are `border-top: 1px solid rgba(255, 255, 255, 0.2)` + **`mix-blend-mode: plus-lighter`** (the 20% plus-lighter rule). Hover/focus: siblings `opacity: 0.32`, active row `opacity: 1`, Phosphor `ArrowRight` 16 slides in from the right — with a **75ms hover-intent delay** on enter (leave is immediate; `:focus-visible` is immediate). Land Use opens analysis with **Explore impact plans**; the nine impact plans are selected in the transcript list and map tooltips, not as card rows.

Card chrome: `padding: var(--space-card)` (8 showcase / 12 desktop), `border-radius: 24px`, `gap: 8px`, content height (no 590px floor), `.glass.liquid-glass`. The four cards stay equal via row stretch to the tallest.

Do not put the title under the photo. Do not move questions above the blurb. Do not collapse to three cards.

### Greeting and agent cadence

After the Executive fly-in (`FLY_SECONDS = 2.8`):

- Clocked greeting from `App.greeting()` — always **Your Excellency**.
- `briefingSummary` streams through `AgentText`. Two generic sentences, no stats:

  > Abu Dhabi is becoming a stacked network of rail, water, and shared fleets. Demand is absorbed on those layers — not new lanes on the highway.

- Cards mount only when that stream completes (`cardsReady`).

Shared timings in `src/ui/agentCadence.ts`:

```text
THINK_DELAY    0.8s
THINK_FADE     0.22s
WORD_STAGGER   0.028s
WORD_DURATION  0.22s
WORD_BLUR      3px
WORD_EASE      cubic-bezier(0.22, 1, 0.36, 1)
```

`AgentReply` thinks for `THINK_DELAY`, then streams the canned paragraph, then staggers takeaways (`0.2s` pause, `0.15s` per bullet). “See evidence on map” appears after the last bullet + `0.25s` hold.

**Do not slow this down.** The cadence is a design decision (fast, blurred words), not a bug.

### Map and chrome

Phase sequence for a question:

```text
landing → flying → briefing → analysis → split → (optional) technical
                                      ↘ techEntry (Full System stub)
```

- `openAnalysis` sets the scenario, title, asked line, and `phase = 'analysis'`. Map **mounts immediately** (`mapMounted = replyId && inReply`) so tiles load under the glass.
- `onRevealed` (`goSplit`) fires after `THINK_DELAY` — layout becomes **split**, map fades in (`.map-host.is-ready`). This is “map appears with every reply.”
- **See evidence on map** calls `goTechnical`. Same split. Flag only.
- Header: back (rotated `back.svg`) + serif `chat-title` + **panel toggle** (`SidebarSimple`) once `mapRevealed`. Toggle sets `mapHidden` (`.map-host.is-stowed`). It does **not** change phase.
- **Back** from analysis / split / technical → **briefing**, clearing the thread. Back from briefing or techEntry → landing. Never implement “back = hide map.”

Split geometry (CSS, not a React grid):

```css
.map-host { inset: 0 0 0 var(--split-content); border-radius: 0; box-shadow: none; }
/* showcase --split-content: 40vw;  desktop: 33vw */
```

Map title sits in `.map-chrome` over the map column (serif, `--chat-title-size`). Prompt bar recenters into the left column when `shifted` (`.prompt-bar.shifted`).

`MobilityMap` variant used by the app is `"widget"`. Focus `saadiyat` | `yas` | `emirate` from the scenario. Overlay ids (heat / line / POI) come from `scenario.mapLayers`. Land Use uses `emirate` + impact callouts (dot + stem + dark chip) — no Saadiyat heat/shuttle layers on that view. A 1px hairline (`rgba(255,255,255,0.14)`) marks the split between chat and map (`pointer-events: none`).

### Dune colors

Night hold — `DEFAULT_DUNE_COLORS` / `NIGHT` in `palettes.ts`:

| Token | Hex | Role |
| --- | --- | --- |
| Sand | `#23395c` | Lit dune (`sandLit`) |
| Zenith | `#0a1824` | Sky top, `html/body` background, `.sky-backdrop` |
| Horizon | `#122038` | Sky at the ridge |
| Moon | `#bad7fd` | Cool moonlight (`sunColor`) |

`applyDuneColors()` overwrites the sampled palette each frame. Page chrome ink is `--sand: #d4deea` (title wash), not the 3D sand hex. Do not conflate them.

### Fonts

Loaded in `index.html` from Google Fonts, nothing else:

```
Old Standard TT  400 + italic
Schibsted Grotesk 400 + 600
```

CSS:

```css
--serif: 'Old Standard TT', 'Times New Roman', serif;
--sans: 'Schibsted Grotesk', system-ui, sans-serif;
```

Serif: landing title, greeting, chat/map titles, scenario number/title.  
Sans: everything else (summary, blurbs, questions, reply, prompt, command menu).  
`Times New Roman` / `system-ui` are fallbacks only. **Inter must never appear** in HTML, CSS, or a component.

### One Vite tab

Dev server is **`http://localhost:5173/`**. Parallel agents share **one** Cursor Simple Browser tab. See `.cursor/rules/reuse-one-browser-tab.mdc`:

1. `browser_tabs` `list`.
2. If 5173 (or the current Vite URL) exists, **select and reuse**. Navigate in place if the path is wrong.
3. Open a new tab only if the list is empty **and** no IDE browser already shows this app.
4. Lock before interacting; unlock when finished. Never `newTab: true` “to have your own session.”

---

## Phase machine (exact)

`App.tsx` `Phase`:

| Phase | What the user sees | How they got here |
| --- | --- | --- |
| `landing` | Dunes + `Begin` | First paint; back from briefing / techEntry |
| `flying` | Dunes rise, UI gone (`FLY_MS = 2800`) | Executive |
| `briefing` | Greeting, streamed summary, four cards, prompt | Fly timer; back from a reply |
| `analysis` | Question chip + thinking/reply; map mounting off-screen | Card question or prompt submit |
| `split` | Left column + map (40/60 or 33/66) | Auto after `THINK_DELAY` |
| `technical` | Same split; evidence CTA pressed | “See evidence on map” |
| `techEntry` | Dunes + back only | Full System |

`stageName` on `.app` is `split` | `analysis` | or the raw phase. CSS hooks: `.stage-flying`, `.stage-split`, `.is-technical`, `.is-voicing`.

Dunes stay mounted `HANDOFF_MS = 1050` after leaving landing/flying/techEntry, then unmount. Sky backdrop stays forever.

---

## Voice (visual is real; speech is fake)

`voice.ts` state machine:

```text
idle → (mic) forming  --240ms hold + 1200ms form--> listening
     → (mic again) disbanding --1100ms--> idle
```

While not idle, `.app.is-voicing` dims the briefing/reply (`.voice-dim.is-off`) and fades the map. `skyPaint.ts` freezes the starfield and interpolates it into a **horizontal constellation** (`voiceBlend` 0→1, `voiceAmp` for brightness). That animation is designed and must stay.

On stop, `PromptBar` streams the canned line:

> Demand-led 2040 metro network

140ms/word, 180ms first-word delay, 380ms settle, then the textarea is editable. Submit runs `matchScenario`. Placeholder: `Tell me which topic you’d like to ask about` / `Listening…`.

Do not wire `webkitSpeechRecognition` in passing. If you add real STT, keep this animation and the prompt chrome.

---

## Content

`src/data/scenarios.ts` — four scenarios. Land Use (`landuse`) opens with one card action (**Explore impact plans**); the nine impact plans are listed in the agent transcript and as map tooltips (`src/data/impactPlans.ts`, `MapFocus: 'emirate'`). Other cards keep canned reply + takeaways.

| id | Title | Topics | Map |
| --- | --- | --- | --- |
| `transit` | Mass Transit | 2 metro topics | Saadiyat cultural heat, shuttle, cycle spine |
| `tolls` | Policy and Demand Management | 2 policy topics | Yas overlays (pricing narrative) |
| `roads` | Roads | 1 ROI topic | Yas Disney heat, tram, highway pressure |
| `landuse` | Land Use | Explore impact plans | Emirate overview + impact pins (no Saadiyat overlays) |

Hero images: `public/images/mass-transit.jpg` (replaced), `roads.jpg`, `road-tolls.png`, `land-use.jpg`.

`titleForPrompt` uses the scenario title for known questions; freeform text becomes a ≤42-character chat title.

Keyword router (`matchScenario`): exact question match first; else land-use / impact / masterplan / framework plan / place keywords → `landuse` **before** the yas/road branch; remote work / congestion in 2026 / toll → `tolls`; stmp / metro network → `transit`; disney/yas/road/roi/… → `roads`; else `transit`.

---

## File map

```text
index.html                 Fonts, data-ui-mode boot, noindex
src/main.tsx               CSS + Dune mark CSS vars
src/App.tsx                Phase machine, greeting, chrome, map host
src/index.css              Design tokens + all layout (the stylesheet is the spec)
src/asset.ts               BASE_URL-safe public paths
src/voice.ts               Mock voice state + constellation blends
src/vite-env.d.ts          VITE_MAPBOX_* ; unused SpeechRecognition types

src/data/scenarios.ts      Canned briefing, cards, replies, map layer ids
src/data/impactPlans.ts    Land-use impact plan pins + emirate camera
src/data/saadiyat.ts       Local GeoJSON + camera for Saadiyat
src/data/yas.ts            Local GeoJSON + camera for Yas
src/data/palettes.ts       DUSK / BLUE_HOUR / NIGHT
src/data/duneColors.ts     Night defaults + optional localStorage override

src/ui/Begin.tsx           Landing — Executive / Full System
src/ui/KpiDeck.tsx         ScenarioCards (topic cards)
src/ui/PromptBar.tsx       Glass prompt + mock mic transcript
src/ui/AgentText.tsx       Word-blur stream
src/ui/AgentReply.tsx      Think → reply → takeaways (or land-use plan list) → evidence CTA
src/ui/agentCadence.ts     Shared stream timing
src/ui/takeawayIcon.ts     Keyword → Phosphor icon
src/ui/ThinkingMark.tsx    Chromatic Dune mark (WebGL, CSS fallback)
src/ui/GlassLayer.tsx      Kawase + SDF liquid glass
src/ui/CommandMenu.tsx     ⌘K Showcase / Desktop

src/map/MobilityMap.tsx    Mapbox widget, local overlays, impact pins, token fallback

src/scene/DuneCanvas.tsx   R3F canvas
src/scene/CameraRig.tsx    Landing orbit + 2.8s fly
src/scene/DuneTerrain.tsx  Sand mesh
src/scene/SandMaterialMesh.tsx
src/scene/sandGeometry.ts
src/scene/SandParticles.tsx
src/scene/CycleLights.tsx
src/scene/dayNight.ts      90s palette loop, night hold
src/scene/skyPaint.ts      2D sky + voice constellation
src/scene/SkyBackdrop.tsx
src/scene/flyProgress.ts   Shared fly 0→1
src/scene/terrain.ts

public/icons/              Logo, mic, send, stop, back, dune marks
public/images/             Card heroes
.cursor/rules/reuse-one-browser-tab.mdc
```

Do not rename `KpiDeck.tsx` in a drive-by. The export that matters is `ScenarioCards`.

---

## Scripts, env, how to run

Requires Node 22+ (CI uses 22). npm.

```bash
npm install
npm run dev          # Vite → http://localhost:5173/
npm run build        # tsc -b && vite build
npm run preview      # preview the production build
npm run lint         # oxlint
```

### Environment

No `.env` is required to run. Optional Vite vars (`src/vite-env.d.ts`):

| Variable | Purpose |
| --- | --- |
| `VITE_MAPBOX_TOKEN` | Overrides the public `pk.*` fallback in `MobilityMap.tsx` |
| `VITE_MAPBOX_STYLE` | Overrides `mapbox://styles/pixonal/cmnpx8l6b002y01qs7t6odrgt` |
| `VITE_BASE` | Asset base. Local `/`. GitHub Pages workflow sets `/DuneAgent/` |

Create `.env.local` if you need a restricted token. **Never commit `.env` / `.env.*` secrets** (`.gitignore` already excludes them). The public fallback `pk` in source is an intentional demo token — restrict its URLs in the Mapbox dashboard; do not treat it as a leaked secret that must be stripped.

Pages deploy: `.github/workflows/pages.yml` (`npm ci`, `vite build` with `VITE_BASE` + optional Mapbox vars from GitHub Actions variables).

### First-run check

1. One tab to `http://localhost:5173/` — landing, night dunes, two glass cards.
2. ⌘K / Ctrl+K — **Mode only** (Showcase / Desktop). Showcase is selected by default (`dune-ui-mode` fallback). The Dune color picker stays hidden (`{false && …}`); night hexes stay sand `#23395c`, zenith `#0a1824`, horizon `#122038`, moon `#bad7fd`. Switch Desktop; type and split tighten; switch back.
3. Executive → 2.8s fly → “Good …, Your Excellency” → two-sentence summary (no stats) → **four** cards, Land Use last.
4. Open a question — thinking mark, word-blur reply, map splits in (~0.8s), prompt recenters.
5. Back → briefing (cards still there), not a collapsed map.
6. Mic → constellation + canned first question. Full System → dunes + back only.

---

## Stack (do not swap casually)

React 19 + Vite 8 + TypeScript. Motion for UI presence. R3F / Three r186 + GSAP for dunes. `mapbox-gl` 3 for the evidence pane. Phosphor icons (regular weight, explicit imports — see `vite.config.ts` `optimizeDeps`). Oxlint, not ESLint.

`vite.config.ts` patches Three’s deprecated `Clock` to `Timer` so the console stays clean. Keep that plugin if you bump Three.

---

## If you are about to restyle

Stop. Re-read **Agent: do not restyle**. Diff `src/index.css` tokens and the Figma-named comments before touching a component. If the request is “make it look like a normal app,” the answer is no — this is the Dune shell. If the request is “wire a real model,” keep every class and token above and replace only `scenarios.ts` / `matchScenario` / the mic transcript.
