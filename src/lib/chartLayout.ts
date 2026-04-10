/**
 * Chart layout persistence — wraps the chart-libs save/load with indicator
 * support that the underlying ChartStateManager doesn't currently include.
 *
 * Background: Chart.saveState() in @tradecanvas/chart (../chart-lib/packages/library/src/Chart.ts)
 * does NOT pass `getIndicators` to ChartStateManager.capture(). So indicators
 * (added via chart.addIndicator(...)) survive a `getDrawings` snapshot but
 * are dropped on the floor. We work around it by bundling the indicator list
 * (via chart.getActiveIndicators()) into our own envelope alongside the
 * native chart state JSON.
 */

import type { Chart } from '@tradecanvas/chart'

const STORAGE_KEY = 'perp-dex.chart-layout.v1'
const FILE_VERSION = 1

interface SavedIndicator {
  id: string
  params: Record<string, unknown>
}

interface ChartLayoutEnvelope {
  version: number
  savedAt: number
  /** JSON string returned by chart.saveState() — drawings, theme, type, alerts */
  chartState: string
  /** Indicators captured separately because chart-libs drops them */
  indicators: SavedIndicator[]
}

function captureIndicators(chart: Chart): SavedIndicator[] {
  try {
    return chart.getActiveIndicators().map(({ id, params }) => ({ id, params }))
  } catch {
    return []
  }
}

function applyIndicators(chart: Chart, indicators: SavedIndicator[]): void {
  // Drop everything currently active so loading is idempotent.
  for (const active of chart.getActiveIndicators()) {
    try {
      chart.removeIndicator(active.instanceId)
    } catch {
      // ignore — best-effort
    }
  }
  for (const ind of indicators) {
    try {
      chart.addIndicator(ind.id, ind.params as Record<string, number | string | boolean>)
    } catch {
      // skip indicators that fail to re-add (renamed, removed, etc.)
    }
  }
}

function buildEnvelope(chart: Chart): ChartLayoutEnvelope | null {
  const chartState = chart.saveState()
  if (!chartState) return null
  return {
    version: FILE_VERSION,
    savedAt: Date.now(),
    chartState,
    indicators: captureIndicators(chart),
  }
}

function applyEnvelope(chart: Chart, envelope: ChartLayoutEnvelope): void {
  if (envelope.version !== FILE_VERSION) {
    throw new Error(`Unsupported chart layout version: ${envelope.version}`)
  }
  chart.loadState(envelope.chartState)
  applyIndicators(chart, envelope.indicators ?? [])
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Save the chart layout (drawings + indicators + theme + chart type) to localStorage. */
export function saveLayoutToStorage(chart: Chart): boolean {
  const envelope = buildEnvelope(chart)
  if (!envelope) return false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

/** Restore the chart layout from localStorage. Returns false if nothing stored. */
export function loadLayoutFromStorage(chart: Chart): boolean {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
  if (!raw) return false

  try {
    const envelope = JSON.parse(raw) as ChartLayoutEnvelope
    applyEnvelope(chart, envelope)
    return true
  } catch {
    // Corrupt blob — clear it so we don't fail forever.
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    return false
  }
}

/** True if there's a saved layout in localStorage. */
export function hasStoredLayout(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

/** Clear the stored layout. */
export function clearStoredLayout(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** Trigger a browser download of the chart layout as JSON. */
export function downloadLayoutFile(chart: Chart, filename = 'chart-layout.json'): boolean {
  const envelope = buildEnvelope(chart)
  if (!envelope) return false
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  return true
}

/** Open a file picker and load the selected layout into the chart. */
export function loadLayoutFromFile(chart: Chart): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        reject(new Error('No file selected'))
        return
      }
      try {
        const text = await file.text()
        const envelope = JSON.parse(text) as ChartLayoutEnvelope
        applyEnvelope(chart, envelope)
        resolve()
      } catch (err) {
        reject(err)
      }
    }
    input.click()
  })
}
