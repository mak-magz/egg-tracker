# Feature 09: Chart library integration (Production trend by size)

**Status:** designed
**Owner sections:** PM → §1–2 · UX → §2.5 · Architect → §3 · Backend/Frontend → §4 · QA → §5

---

## 1. Story (PM)

As the farm owner, I want a smooth, responsive, touch-friendly production trend chart on my Production screen that clearly plots daily egg collection by size and rejects, so that barnside on my phone or in the farm office I can spot flock output patterns, seasonal trends, and reject spikes without visual distortion or touch issues.

As the farm owner, I want to tap or drag anywhere across a day on the trend chart and immediately see that date's exact collection breakdown in trays and loose eggs, so that I get quick clarity without having to scroll down to find the day card in the history list.

**Why now / spec reference:**
- **Product Goals:** Goal 1 ("Log production in seconds") and Goal 4 ("See the operation at a glance") in [`docs/egg-farm-app-product-doc.md`](../egg-farm-app-product-doc.md).
- **UI Specification:** [`docs/egg-farm-app-ui-spec.md`](../egg-farm-app-ui-spec.md) §4a (Production history & trend) and §0.3 (equal weight desktop + mobile, barnside phone touch).
- **Existing baseline:** In Feature 01 (`docs/features/01-production-logging.md`, AC20, AC33, AC38; §2.5 "Chart details"), the production trend was implemented as a custom hand-drawn SVG component (`ProductionTrendChart.vue`). While functional, custom SVG viewBox stretching and manual pointer hit-testing have UX limitations: touch dragging barnside can be clumsy, rendering lacks smooth transitions when changing date filters, and maintaining custom SVG geometry across various screen sizes is brittle.
- **Domain invariants:** Preserves all established domain rules from `GEMINI.md`:
  - Categories are data: sizes are per-farm, ordered by farm preference.
  - Rejects are always unsized and plotted as their own distinct series.
  - Displayed quantities strictly use the tenant's tray size setting via the canonical helper (`formatQty(eggs, eggsPerTray)`).
  - Client-side SPA / local-first architecture: chart must render efficiently in offline/PWA mode without server-side rendering dependencies.

---

## 2. Acceptance criteria (PM)

Terms used in these criteria:
- **Owner** means a signed-in, provisioned farm owner.
- **Mobile** means a viewport width of ~375px. **Desktop** means 1024px or wider.
- **The farm's sizes** are the farm's active sizes in their configured sort order, plus any archived size that has logged eggs within the active date range.
- **Tray size** is the farm's `eggs_per_tray` setting (e.g. 30).
- **Active date range** is the date span determined by the active filter: rolling 7 days ("Week"), rolling 30 days ("Month"), or custom "From – To".

### Layout & Responsiveness
- [ ] AC1: The chart component renders inside a card container titled **"Production trend by size"** on the Production screen (`/production`), positioned above the production day history list.
- [ ] AC2: The chart is fully responsive:
  - On mobile (~375px), the plot area has a fixed comfortable height (~140px) and spans the full card width without horizontal scrolling or clipping.
  - On desktop (≥1024px), the chart expands to fill the card container cleanly (~180px height) while maintaining proportional line weights and marker sizes.
  - Legend items wrap onto multiple rows if necessary without overflowing the card boundaries.
- [ ] AC3: When background data is refreshing (e.g. after adding or editing a day), a discreet loading spinner displays beside the caption without unmounting or jarring the chart layout.

### Data Series & Color Mapping
- [ ] AC4: The chart displays one line series per active farm size in the farm's configured sort order, followed by one line series for **Rejects**.
- [ ] AC5: An archived size appears in the chart if and only if it has eggs (> 0) recorded within the active date range. Archived sizes appear after all active sizes and before Rejects.
- [ ] AC6: Series colors strictly follow the farm size color assignment:
  - Each size uses its stable `colorSlot` mapping from `app/utils/size-colors.ts` (slots 0–9).
  - Slots 10+ use dashed styling or distinct markers to remain distinguishable.
  - The Rejects series is always styled in error red (`REJECT_COLOR` / `text-error`).
  - Active sizes with 0 eggs recorded on a particular day plot as 0 for that day.
- [ ] AC7: Both light mode and dark mode maintain accessible contrast (WCAG AA compliant) for all line strokes, markers, grid lines, and text labels against the card background.

### Timeline & Date Range Filtering
- [ ] AC8: The X-axis displays dates chronologically from left (oldest) to right (newest).
- [ ] AC9: Date labels along the horizontal axis format cleanly:
  - X-axis tick labels thin automatically so they never overlap or truncate (e.g. maximum 7 labels on mobile, 14 on desktop).
  - First label and month transitions display the short month name (e.g. "Aug 1", "Sep 1"); intermediate days display the day number (e.g. "2", "3").
- [ ] AC10: Changing date filters via the **Week** chip, **Month** chip, or custom date picker updates the chart series smoothly within 100ms without full-page reloads or layout shift.

### Touch & Pointer Interaction (Barnside Usability)
- [ ] AC11: **Touch scrubbing on mobile:** Tapping or dragging a finger across the chart area tracks to the nearest day index instantly.
- [ ] AC12: Vertical scrolling is preserved: dragging vertically across the chart does not get trapped or locked, allowing the owner to scroll through the screen smoothly on a phone (`touch-action: pan-y`).
- [ ] AC13: **Desktop interaction:** Hovering over the chart tracks the cursor to the nearest day. Keyboard navigation allows focusing the chart card and using `ArrowLeft` / `ArrowRight` to step across days, and `Escape` to close the tooltip.
- [ ] AC14: Tapping outside the chart or switching date ranges immediately dismisses the active tooltip.

### Interactive Tooltip & Quantities
- [ ] AC15: Selecting a day (touch or hover) displays an inspection indicator (vertical hairline) and a floating tooltip containing:
  - Header with formatted date (e.g. "Today · Aug 4" or "Aug 3, 2026").
  - A line item for each plotted size showing its color dot, size name, and quantity.
  - A line item for Rejects showing a red dot and quantity.
- [ ] AC16: All quantities in the tooltip are strictly formatted in trays + loose eggs via `formatQty(eggs, eggsPerTray)` using the farm's tray size setting:
  - Example (30 eggs/tray): 42 eggs displays as `1 tray + 12`; 30 eggs displays as `1 tray`; 5 eggs displays as `5 eggs`; 0 eggs displays as `0 eggs`.
  - QA checks that on a farm set to 24 eggs per tray, 29 eggs displays as `1 tray + 5`.
- [ ] AC17: The tooltip dynamically positions itself (flipping left or right) so that it remains completely visible inside the viewport and never clips off screen edges.

### Empty & Edge States
- [ ] AC18: **Zero days in range:** When no production records exist within the selected filter range, the chart displays a clean empty state message (`No production logged in this range` / `chartEmpty`) centered inside the card, with no broken axes, null errors, or canvas artifacts.
- [ ] AC19: **Single day in range:** When only one day has production in range, the chart renders properly (e.g. centered marker) without division-by-zero or infinite slope errors.
- [ ] AC20: **First-use state:** If the farm has never logged any production, the parent Production screen's first-use empty state takes precedence; the chart component mounts/unmounts cleanly without console errors.

### Performance & Client Invariants
- [ ] AC21: The chart library integrates cleanly with Nuxt 4 SPA mode (`ssr: false`) and Vite PWA offline caching without requiring Node server-side dependencies.
- [ ] AC22: Chart component memory is fully released on unmount (no retained animation frames, event listeners, or canvas/SVG memory leaks).
- [ ] AC23: Multi-tenant data privacy is preserved: the chart renders only data from the active tenant's local store. Signing out or switching farms completely clears prior chart data.

---

### Out of scope (Non-goals)

- **No database changes:** No tables, columns, indexes, or migrations are created or modified.
- **No server API changes:** No Nitro server routes or sync protocols are touched.
- **No new metrics:** Lay rate, hen counts, mortality, feed efficiency, flock age, and financial metrics remain out of scope for v1.
- **No chart type customization:** No user toggle to switch chart types (e.g. bar chart, pie chart, scatter plot).
- **No multi-metric overlays:** The chart tracks egg quantities by size and rejects only; no price or revenue overlay lines.
- **No pinch-to-zoom:** Zooming/panning within the chart is excluded to prevent gesture conflict with barnside mobile vertical scrolling.

---

## 2.5 UX design (UX Designer)

**Source of truth:** `docs/design/source/template.html` (Production screen markup ~6234–6258, chart card & legend), `app/components/ProductionTrendChart.vue`, and owner-confirmed decisions (spline curves, read-only legend, external filters).

This section defines the responsive, touch-friendly chart library integration designed for one-handed barnside mobile use in bright sunlight.

### 1. Confirmed Owner Decisions & Core Principles

1. **Line Style: Smooth Spline Curves:**
   - Flock production naturally follows organic biological curves. Smooth spline curves (monotone cubic / Catmull-Rom interpolation) provide effortless trend trajectory scanning at a glance without jagged polyline visual noise.
   - Point dots (diameter 6px–8px) mark exact collection days along the curve, ensuring discrete collection dates remain distinct.
2. **Legend: Read-Only (Non-Interactive):**
   - The legend sits prominently above the chart (desktop: top-right; mobile: top wrapped) as an informational color key.
   - **Toggling series off is intentionally disabled.** Barnside phone handling with wet, gloved, or dusty hands would trigger accidental taps, hiding size lines and creating confusion about flock output.
3. **Navigation & Touch Isolation:**
   - Date range navigation remains outside the chart via the existing **Week** / **Month** filter chips and date range picker.
   - Gestures inside the chart canvas are strictly dedicated to **tap & drag scrubbing** for day-by-day inspection.
   - Page vertical scrolling is 100% preserved (`touch-action: pan-y`). The chart never hijacks vertical swipe gestures.

---

### 2. Interaction Flow & Touch Scrubbing

```
Screen Load (Week/Month active) 
       │
       ▼
[ Smooth Spline Chart Visible ] ──( 0 taps: overall flock trajectory clear )
       │
       ├─► [ Single Tap on Day ] ───────► Snaps vertical hairline + shows tooltip (1 tap)
       │
       ├─► [ Drag / Scrub Across Days ] ─► Hairline glides continuously across points (1 drag)
       │
       └─► [ Tap Outside / Scroll ] ────► Tooltip dismisses instantly; normal scroll preserved
```

#### Inspection & Scrubbing Details
- **Activation:** Single tap anywhere within the plot area or horizontal drag across the plot activates the vertical hairline scrubber and snaps to the nearest calendar day data point.
- **Desktop Hover:** Mouse movement over the plot area positions the scrubber hairline and tooltip with 0 clicks.
- **Auto-Flipping Tooltip (No Edge Clipping):**
  - **Left half (X ≤ 50%):** Tooltip anchors to the right of the hairline (`left: calc(X% + 10px)`).
  - **Right half (X > 50%):** Tooltip anchors to the left of the hairline (`right: calc(100% - X% + 10px)`).
  - This guarantees the tooltip never clips past the ~375px mobile viewport edges.
- **Dismissal:**
  - Tapping outside the chart card dismisses the scrubber and tooltip immediately.
  - Moving mouse off chart canvas (desktop) dismisses it.
  - Tapping Week / Month filter chips or modifying dates clears active inspection.
  - Pressing `Escape` key closes tooltip.
- **Keyboard Navigation:**
  - Chart container is focusable (`tabindex="0"`, `role="region"`, `aria-label="Production trend by size"`).
  - `ArrowLeft` / `ArrowRight` steps the scrubber day-by-day.
  - `aria-live="polite"` announces active day's summary: *"Aug 3: Large 8 trays + 24, Medium 4 trays, Rejects 5 eggs"*.

---

### 3. Layouts & ASCII Wireframes

#### Mobile (~375px Viewport)
```
┌───────────────────────────────────────────┐
│ [ From  mm/dd/yyyy ] – [ To  mm/dd/yyyy ] │ UInput type="date"
│ (●Week●) ( Month )             [ Clear ]  │ Filter chips + Clear button
├───────────────────────────────────────────┤
│ ┌───────────────────────────────────────┐ │ UCard (rounded-2xl, p-5)
│ │ Production trend by size          (◌) │ │ Title (500 muted) · (◌) Refresh spinner
│ │ Aug 29 – Sep 4                        │ │ Date range caption (text-xs dimmed)
│ │                                       │ │
│ │ ● Small  ● Medium  ● Large            │ │ Read-only Legend (wrapped)
│ │ ● Jumbo  ● Rejects                    │ │ Size dots + labels
│ │ ┌───────────────────────────────────┐ │ │ Plot Area (height ~140px, touch-pan-y)
│ │ │           Tooltip                 │ │ │
│ │ │        ┌───────────────────────┐  │ │ │ Auto-flipping popover card:
│ │ │        │ Today · Sep 4         │  │ │ │ Date header (font-semibold)
│ │ │        │ ● Small   1 tray + 12 │  │ │ │ Size dot + Name + Qty (tabular-nums)
│ │ │        │ ● Medium  4 trays     │  │ │ │
│ │ │        │ ● Large   8 trays + 24│  │ │ │
│ │ │        │ ● Jumbo   1 tray + 10 │  │ │ │
│ │ │        │ ● Rejects 5 eggs      │  │ │ │ Red dot + text-error
│ │ │   ╭───╮└───────────────────────┘  │ │ │
│ │ │───╯   ╰───────●───────────────────│ │ │ Smooth spline curve + points
│ │ │  .  .  .  .  │| .  .  .  .  .  .  │ │ │ Vertical hairline scrubber
│ │ └──────────────┴┴───────────────────┘ │ │
│ │  29   30   31   1    2    3    4      │ │ X-axis day labels (thinned, ≤7 on mobile)
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

#### Desktop (≥1024px Viewport)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [ From mm/dd/yyyy ] – [ To mm/dd/yyyy ]  [Clear]  │  (●Week●) ( Month )     │
├─────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Production trend by size   Aug 29 – Sep 4   (◌)                         │ │
│ │                                ● Small  ● Medium  ● Large  ● Rejects    │ │ Read-only legend right
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │ Plot Area (height ~180px)
│ │ │                                                                     │ │ │
│ │ │                  ┌───────────────────────┐                          │ │ │ Hover Tooltip
│ │ │                  │ Wed, Sep 3            │                          │ │ │
│ │ │                  │ ● Small   1 tray + 12 │                          │ │ │
│ │ │                  │ ● Medium  4 trays     │                          │ │ │
│ │ │                  │ ● Large   8 trays + 24│                          │ │ │
│ │ │    ╭───╮         │ ● Rejects 5 eggs      │                          │ │ │
│ │ │───╭╯   ╰───╮     └──────────┬────────────┘                          │ │ │
│ │ │───╯        ╰───────────────●┴───────────────────────────────────────│ │ │ Smooth Splines
│ │ │  .   .   .   .   .   .   .  │|  .   .   .   .   .   .   .   .   .   │ │ │ Hairline Scrubber
│ │ └─────────────────────────────┴┴──────────────────────────────────────┘ │ │
│ │  Aug 29    30    31    Sep 1     2     3     4     5     6     7        │ │ Up to 14 labels
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Tooltip Layout & Copy Specification

- **Card Shell:** `rounded-lg bg-default px-3 py-2 text-xs shadow-lg ring-1 ring-default pointer-events-none z-20 min-w-[160px] max-w-[220px]`.
- **Date Header:** 
  - Today: `Today · Sep 4`
  - Current year: `Wed, Sep 3`
  - Other year: `Sep 3, 2025`
  - Class: `font-semibold text-highlighted border-b border-default/60 pb-1.5 mb-1.5`
- **Size Rows (in farm size order):**
  - Dot: `size-2 rounded-full shrink-0` with size color (solid for slots 0–9; ring/border for slot ≥10).
  - Name: `text-muted truncate flex-1 min-w-0 pr-2`
  - Amount: `formatQty(eggs, eggsPerTray)` (e.g. `8 trays + 24`, `1 tray`, `12 eggs`). Tabular numbers, `font-medium text-highlighted`.
- **Rejects Row (always bottom row):**
  - Dot: `size-2 rounded-full shrink-0 bg-red-600 dark:bg-red-400`
  - Name: `Rejects`
  - Amount: `formatQty(rejects, eggsPerTray)` formatted in `text-error font-medium tabular-nums`.

---

### 5. Screen States

| State | Visual Behavior | Copy / Call-to-Action |
|---|---|---|
| **Default Populated (Multi-day)** | Smooth continuous spline curves with coordinate dots across 2 to 30 days. Read-only legend at top. Scrubber line activates on tap/drag. | Title: `Production trend by size`<br>Caption: `{from} – {to}` |
| **Single-Day View (1 day in range)** | Splines cannot interpolate a curve with 1 point. Displays a centered vertical date column with circular markers for each size + Rejects. Tap/scrubber immediately active on that day. | Caption: `{date} · 1 day in range`<br>Day cards below show full breakdown. |
| **Empty Range (0 days in range)** | Card shell and header persist. Plot area displays friendly empty notice with quick filter recovery CTA. | Header: `Production trend by size`<br>Body: `No production logged in this date range.`<br>CTA: `[ Clear date filter ]` or `[ View last 30 days ]` |
| **Refreshing / Background Refetch** | Existing chart and curves remain fully rendered and interactive. Subtle spinning loader icon appears in header beside title. No UI flash or skeleton flicker. | Loader icon: `i-lucide-loader-circle animate-spin text-dimmed` (size-4). |
| **Initial Cold Loading** | Skeleton placeholder matching card geometry. | `USkeleton class="h-[206px] w-full rounded-2xl"` |

---

### 6. Accessibility & Barnside Ergonomics

- **Sunlight Contrast:**
  - Series strokes use Tailwind 600 shades in light mode (e.g., `blue-600`, `emerald-600`, `amber-600`, `purple-600`) to guarantee ≥ 4.5:1 contrast against white cards in outdoor glare.
  - Dark mode uses 400 shades (`blue-400`, `emerald-400`, etc.).
  - Rejects always use red (`text-error` / `red-600` light, `red-400` dark).
- **Stroke Width & Touch Bounds:**
  - Spline stroke width is 2.5px with 6px coordinate dots for fast visual acquisition.
  - Active scrubber zone spans the full card height (140px mobile / 180px desktop), offering an expansive tap target well above the 44px minimum.
- **Scroll Safety:**
  - CSS rule `touch-action: pan-y` applied to plot container. Horizontal scrubbing does not block or hitch vertical page scrolling.

---

### 7. Nuxt UI v4 Component Mapping

| UI Section | Nuxt UI v4 / Element Mapping | Notes |
|---|---|---|
| Chart Card | `UCard` with `:ui="{ body: 'flex flex-col gap-3 p-5' }"` | Matches Production day cards styling (`rounded-2xl`). |
| Card Title | `<h2 class="text-base font-medium text-muted">` | Sits in header flex row. |
| Range Caption | `<span class="text-xs text-dimmed">` | Displays active date span. |
| Refreshing Indicator | `UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-dimmed"` | Silent background refetch. |
| Read-only Legend | Semantic `<ul>` list with `<li>` dots and `text-xs text-muted font-medium` | Read-only; no click listeners. |
| Chart Canvas | Canvas or SVG element rendered via chosen library | Interactive scrubbing target. |
| Tooltip Popover | Floating card styled with `bg-default ring-1 ring-default shadow-lg rounded-lg` | Auto-flipping positioning based on X coordinate. |
| Empty State Recovery | `UButton variant="ghost" color="neutral" size="sm"` | `Clear date filter` CTA. |
| Initial Loader | `USkeleton class="h-[206px] w-full rounded-2xl"` | Cold load skeleton. |

---

## 3. Technical design (Architect)

### 3.1 Chart Library Selection & Evaluation

We evaluated candidate charting libraries against the project constraints: Nuxt 4 SPA mode (`ssr: false`), Vite bundling, offline PWA with Service Worker precaching, mobile barnside touch scrubbing (`touch-action: pan-y`), monotone cubic spline interpolation, custom HTML tooltip formatting with `formatQty`, and zero SSR/Node dependencies.

| Library | Min+Gzip Bundle | Vue 3 / Nuxt 4 Fit | Monotone Splines | Touch Scrubbing & `pan-y` | Custom Tooltip / DOM Popover | Verdict |
|---|---|---|---|---|---|---|
| **Chart.js v4 (Tree-Shaken)** | **~35 KB** | **Native Canvas (direct `shallowRef` wrapper)** | **Native (`cubicInterpolationMode: 'monotone'`, `tension: 0.35`)** | **Native (`interaction: { mode: 'index', intersect: false }`)** | **Native Headless Callback (`plugins.tooltip.external`)** | **Selected (Winner)** |
| **@unovis/vue** | ~58 KB | Official Vue wrapper | Supported via `CurveType.MonotoneX` | Requires `VisCrosshair`; gesture trapping issues on mobile | Custom tooltip component | Rejected (heavier bundle, D3 sub-deps, touch friction) |
| **Apache ECharts v5 (Tree-Shaken)** | ~110 KB | Canvas / SVG | Supported (`smooth: 0.3`) | Robust | Verbose DOM formatter | Rejected (excessive bundle footprint for a sparkline) |
| **ApexCharts** | ~135 KB | Wrapper component | Bezier smoothing | Known resize glitches and touch lag | HTML tooltip string | Rejected (heavy, known SPA resize memory leaks) |
| **uPlot** | ~12 KB | Manual Canvas integration | Polyline only (splines require manual bezier math) | Fast scrubbing | Plugin-based DOM overlays | Rejected (high implementation overhead for splines & dashed lines) |

#### Chosen Candidate: Tree-Shaken Chart.js v4 via Direct Vue 3 Wrapper

**Decision:** We choose **Chart.js v4** imported with modular tree-shaking and wrapped directly in `ProductionTrendChart.vue` using Vue 3 `useTemplateRef<HTMLCanvasElement>` and `shallowRef<Chart | null>`.

**Why direct Chart.js rather than `vue-chartjs`:**
1. **Zero unnecessary wrapper layers:** `vue-chartjs` adds another package dependency without providing value for our tailored sparkline UX.
2. **Deterministic lifecycle & memory reclamation (AC21, AC22):** Direct control over `chart.destroy()`, non-animating reactive updates (`chart.update('none')`), and pointer listeners guarantees zero memory leaks across route changes or farm switching.
3. **Headless external tooltip architecture:** Chart.js calculates exact coordinate hit-testing and day index snapping across all touch and pointer movements, then delegates rendering entirely to our Vue 3 template via `plugins.tooltip.external`. This ensures 100% adherence to §2.5 styling, auto-flipping, and `formatQty`.

**Tree-Shaking Module Registration:**
Only the bare minimum modules are imported and registered:
```ts
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
)
```
*Note: `Legend`, `Title`, `Filler`, and other controllers are excluded to minimize bundle size.*

---

### 3.2 Data Transformation & Utility Architecture

#### 1. Canvas Palette Synchronization (`app/utils/size-colors.ts`)
Canvas 2D contexts (`ctx.strokeStyle`) require concrete CSS color values (hex or rgb), unlike SVG which resolves Tailwind classes via `currentColor`. 

We extend `app/utils/size-colors.ts` with static hex constants mapped to Tailwind 600 (light mode) and 400 (dark mode) values, while retaining existing class names for DOM elements (legend dots and tooltip indicators):

```ts
export const SIZE_HEX_LIGHT = [
  '#2563eb', // 0 blue (info), seeded Small
  '#ca8a04', // 1 yellow (warning), seeded Medium
  '#16a34a', // 2 green (brand), seeded Large
  '#475569', // 3 slate (neutral), seeded Jumbo
  '#7c3aed', // 4 violet
  '#0891b2', // 5 cyan
  '#ea580c', // 6 orange
  '#db2777', // 7 pink
  '#4d7c0f', // 8 lime
  '#4f46e5', // 9 indigo
] as const

export const SIZE_HEX_DARK = [
  '#60a5fa', // 0 blue
  '#facc15', // 1 yellow
  '#4ade80', // 2 green
  '#94a3b8', // 3 slate
  '#a78bfa', // 4 violet
  '#22d3ee', // 5 cyan
  '#fb923c', // 6 orange
  '#f472b6', // 7 pink
  '#a3e635', // 8 lime
  '#818cf8', // 9 indigo
] as const

export const REJECT_HEX_LIGHT = '#dc2626'
export const REJECT_HEX_DARK = '#f87171'

export interface CanvasSeriesStyle {
  stroke: string
  dashed: boolean
}

export function sizeColorHex(slot: number, isDark: boolean): CanvasSeriesStyle {
  const palette = isDark ? SIZE_HEX_DARK : SIZE_HEX_LIGHT
  const s = Number.isInteger(slot) && slot >= 0 ? slot : 0
  return {
    stroke: palette[s % palette.length]!,
    dashed: s >= palette.length,
  }
}

export function rejectColorHex(isDark: boolean): string {
  return isDark ? REJECT_HEX_DARK : REJECT_HEX_LIGHT
}
```

#### 2. Chart Model & Dataset Mapping (`app/utils/production-chart.ts`)
The pure domain logic in `buildChartModel(daysNewestFirst, sizes)` remains the single source of truth for series sorting, archived size inclusion, and zero-filling.

A helper maps the `ChartModel` into Chart.js dataset configurations:
```ts
import type { ChartDataset } from 'chart.js'

export function toChartJsDatasets(model: ChartModel, isDark: boolean): ChartDataset<'line', number[]>[] {
  return model.series.map((s) => {
    const isRejects = s.key === REJECTS_SERIES_KEY
    const stroke = isRejects ? rejectColorHex(isDark) : sizeColorHex(s.colorSlot, isDark).stroke
    const dashed = isRejects ? false : s.dashed

    return {
      label: s.name,
      data: s.values,
      borderColor: stroke,
      borderWidth: 2.5,
      borderDash: dashed ? [5, 4] : [],
      cubicInterpolationMode: 'monotone',
      tension: 0.35,
      pointRadius: 3.5,
      pointHoverRadius: 5.5,
      pointBackgroundColor: stroke,
      pointBorderColor: isDark ? '#18181b' : '#ffffff',
      pointBorderWidth: 1.5,
    }
  })
}
```

---

### 3.3 Component Architecture (`app/components/ProductionTrendChart.vue`)

#### 1. Props Contract (Preserved)
```ts
const props = defineProps<{
  days: readonly ProductionDay[]
  today: IsoDate
  eggsPerTray: number
  from: IsoDate | null
  to: IsoDate | null
  refreshing?: boolean
}>()
```

#### 2. Layout & Template Structure
- Semantic `UCard` container with read-only legend.
- Interactive canvas with `touch-pan-y` styling.
- Hairline scrubber line aligned to `caretX`.
- Auto-flipping popover card with formatted date, size rows, and Rejects row in `formatQty(eggs, eggsPerTray)`.
- Screen reader accessibility region (`aria-live="polite"`).

---

### 3.4 Invariants at Risk & Safeguards

| Invariant / Rule | Risk | Architectural Protection |
|---|---|---|
| **Categories are data (farm size order)** | Chart libraries often sort series alphabetically or by value. | Series order is strictly derived from `buildChartModel`: active sizes by `sortOrder`, archived sizes if eggs > 0, followed by Rejects. |
| **Rejects are unsized and distinct** | Accidental sizing or color collision. | Rejects is hardcoded as `REJECTS_SERIES_KEY`, placed as the final dataset, colored `#dc2626` / `#f87171`, and marked non-dashed. |
| **Eggs are the stored unit** | Incorrect tray math in tooltip. | Tooltip rows display values strictly through `formatQty(eggs, props.eggsPerTray)`. |
| **Computed inventory unaffected** | Unintentional mutation of stock. | The chart is 100% read-only display. No mutations or API calls are dispatched. |
| **Barnside touch safety** | Chart capturing vertical drag and blocking page scroll. | `touch-action: pan-y` applied to both `<canvas>` and container. |
| **No client-side memory leaks** | Retained canvas contexts or Chart instances across route transitions. | `chart.destroy()` called in `onUnmounted()`. |

---

### 3.5 Tasks (Ordered Checklist)

- [x] `[FE] 1.` Install `chart.js` dependency via Bun (`bun add chart.js`).
- [x] `[FE] 2.` Extend `app/utils/size-colors.ts` with light and dark mode hex constants (`SIZE_HEX_LIGHT`, `SIZE_HEX_DARK`, `REJECT_HEX_LIGHT`, `REJECT_HEX_DARK`) and helper functions (`sizeColorHex`, `rejectColorHex`).
- [x] `[FE] 3.` Update `app/utils/production-chart.ts` with dataset generator (`toChartJsDatasets`), 7-day dashboard volume bar calculation (`buildDashboardBarDays`), and unit tests.
- [x] `[FE] 4.` Re-implement `app/components/ProductionTrendChart.vue`:
  - Register tree-shaken Chart.js modules (`LineController`, `LineElement`, `PointElement`, `LinearScale`, `CategoryScale`, `Tooltip`).
  - Wire canvas lifecycle (`useTemplateRef`, `onMounted`, `onBeforeUnmount`, `chart.destroy()`).
  - Implement headless external tooltip callback feeding Vue reactive state.
  - Implement auto-flipping popover card with `formatQty` and size color indicators.
  - Apply `touch-action: pan-y` and responsive layout.
  - Add keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`) and ARIA live region.
  - Implement `@nuxtjs/color-mode` synchronization.
- [x] `[FE] 5.` Create `app/components/DashboardProductionTrend.vue`:
  - Register tree-shaken Chart.js bar modules (`BarController`, `BarElement`, `CategoryScale`, `LinearScale`, `Tooltip`).
  - Highlight Today's bar in vibrant primary Golden Yolk (`#ca8a04` / `#facc15`), with past days in subtle translucent amber.
  - Render rounded top bar corners, clean zero-border styling, and custom tooltip with `formatQty`.
- [x] `[FE] 6.` Update `app/pages/index.vue`:
  - Replaced legacy CSS-height bars with `<DashboardProductionTrend>`.
  - Removed obsolete local `weekBars`, `weekDays`, `maxWeekEggs`, and date calculation logic.
- [x] `[FE] 7.` Run quality gates and visual verification (`bun run test:unit`, `bun run typecheck`, `bun run lint`, `bun run check:build`, Chrome DevTools MCP check on desktop & mobile).

---

## 4. Implementation notes (Devs)

- **Dependency & Bundle Optimization**: Installed `chart.js@4.6.1`. Leveraged tree-shaking by importing only the necessary controllers, elements, and scales (`LineController`, `BarController`, `LineElement`, `PointElement`, `BarElement`, `LinearScale`, `CategoryScale`, `Tooltip`), avoiding monolithic imports.
- **Palette & Theme Synchronization (`app/utils/size-colors.ts`)**: Added concrete hex color tables `SIZE_HEX_LIGHT`, `SIZE_HEX_DARK`, `REJECT_HEX_LIGHT`, and `REJECT_HEX_DARK` matching Tailwind 600 (light) and 400 (dark) tokens. Exposed `sizeColorHex(slot, isDark)` and `rejectColorHex(isDark)` for canvas 2D rendering.
- **Data Transformation Pipeline (`app/utils/production-chart.ts`)**:
  - `toChartJsDatasets(model, isDark)`: Transforms `ChartModel` into Chart.js datasets with smooth monotone cubic spline tension (`0.3`), stroke widths, dashed stroke pattern for slots ≥10, and circular coordinate points.
  - `buildDashboardBarDays(days, today)`: Computes the 7-day calendar window ending on `today` with weekday labels and production egg volume.
- **Production Trend Chart (`app/components/ProductionTrendChart.vue`)**:
  - Replaced hand-drawn SVG with Chart.js canvas line chart.
  - Implemented headless tooltip (`plugins.tooltip.external`) that communicates coordinate and data index to Vue reactive state, rendering an auto-flipping popover card using `formatQty(eggs, eggsPerTray)`.
  - Applied `touch-action: pan-y` on container and canvas to prevent blocking vertical page scrolling during mobile barnside operation.
  - Added full keyboard navigation (`ArrowLeft`, `ArrowRight`, `Escape`) and ARIA live region (`aria-live="polite"`).
  - Wired `@nuxtjs/color-mode` watcher calling `chart.update('none')` on theme toggle.
  - Cleaned up canvas resources with `chart.destroy()` in `onBeforeUnmount`.
- **Dashboard Bar Chart (`app/components/DashboardProductionTrend.vue`)**:
  - Created standalone reusable component for the Dashboard's 7-day production volume.
  - Today's bar is highlighted in solid primary yolk amber (`#ca8a04` / `#facc15`), with previous 6 days rendered in subtle translucent amber (`rgba(202, 138, 4, 0.22)` / `rgba(250, 204, 21, 0.25)`).
  - Formatted volume in trays + loose eggs via `formatQty` on hover/tap.
- **Dashboard Integration (`app/pages/index.vue`)**:
  - Replaced manual 50-line CSS bar calculations with `<DashboardProductionTrend :days="prod.days.value" :today="prod.today.value" :eggs-per-tray="trayEggs" />`.
- **Verification**:
  - 1,091 unit tests passing (`bun run test:unit`).
  - TypeScript typecheck passing (`bun run typecheck`).
  - ESLint passing with 0 warnings/errors (`bun run lint`).
  - Build leak audit passing (`bun run check:build`).
  - Visual verification performed in Chrome DevTools MCP on both desktop and mobile viewports.

---

## 5. QA report (QA)
_Pending QA review._
