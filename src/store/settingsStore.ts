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

  setAlertWarningPct: (v: number) => void
  setAlertCriticalPct: (v: number) => void
  setHideHighLeverageRiskWarning: (v: boolean) => void
  reset: () => void
}

const DEFAULTS = {
  alertWarningPct: 15,
  alertCriticalPct: 5,
  hideHighLeverageRiskWarning: false,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setAlertWarningPct: (v) => set({ alertWarningPct: clamp(v, 1, 50) }),
      setAlertCriticalPct: (v) => set({ alertCriticalPct: clamp(v, 0.5, 25) }),
      setHideHighLeverageRiskWarning: (v) => set({ hideHighLeverageRiskWarning: v }),
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
