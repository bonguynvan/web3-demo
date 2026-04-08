/**
 * Theme store — controls dark/light mode for the entire app.
 *
 * Persists choice in localStorage. Applies `data-theme` attribute to <html>.
 * Chart library theme is switched separately via chart.setTheme().
 */

import { create } from 'zustand'

export type AppTheme = 'dark' | 'light'

interface ThemeState {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
  toggleTheme: () => void
}

function getInitialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem('app-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {}
  return 'dark'
}

function applyTheme(theme: AppTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
  try { localStorage.setItem('app-theme', theme) } catch {}
}

// Apply on load
applyTheme(getInitialTheme())

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => { applyTheme(theme); set({ theme }) },
  toggleTheme: () => set(state => {
    const next = state.theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    return { theme: next }
  }),
}))
