/**
 * settingsStore — user-controllable preferences persisted across sessions.
 *
 * Persisted fields:
 *   - alertWarningPct       — buffer % at which a "position at risk" toast fires
 *   - alertCriticalPct      — buffer % at which "liquidation imminent" fires
 *   - hideHighLeverageRiskWarning — once dismissed, the high-lev modal stops
 *
 * NOT persisted here:
 *   - theme (lives in themeStore — pre-existing, separate concern)
 *   - selected market / mode (lives in tradingStore + modeStore)
 *
 * Backed by zustand persist middleware → localStorage. Stored under a
 * versioned key so future shape changes can wipe old blobs without
 * crashing on hydration.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const STORAGE_KEY = 'perp-dex.settings.v1'

export interface SettingsState {
  /** Buffer % at which the "warning" liquidation toast fires. */
  alertWarningPct: number
  /** Buffer % at which the "critical / imminent" liquidation toast fires. */
  alertCriticalPct: number
  /** True after the user dismisses the high-leverage risk modal. */
  hideHighLeverageRiskWarning: boolean
  /** Desktop left sidebar collapsed to icons-only (60px vs 200px). */
  sidebarCollapsed: boolean

  setAlertWarningPct: (v: number) => void
  setAlertCriticalPct: (v: number) => void
  setHideHighLeverageRiskWarning: (v: boolean) => void
  setSidebarCollapsed: (v: boolean) => void
  toggleSidebar: () => void
  reset: () => void
}

const DEFAULTS = {
  alertWarningPct: 15,
  alertCriticalPct: 5,
  hideHighLeverageRiskWarning: false,
  sidebarCollapsed: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAlertWarningPct: (v) => set({ alertWarningPct: clamp(v, 1, 50) }),
      setAlertCriticalPct: (v) => set({ alertCriticalPct: clamp(v, 0.5, 25) }),
      setHideHighLeverageRiskWarning: (v) => set({ hideHighLeverageRiskWarning: v }),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      reset: () => set(DEFAULTS),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Migration on version mismatch: drop the persisted blob and start
      // fresh. We don't have any v0 to migrate from, so this is a no-op
      // today but keeps future bumps cheap.
      migrate: () => DEFAULTS,
    },
  ),
)

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}
