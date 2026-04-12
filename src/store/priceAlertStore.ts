/**
 * priceAlertStore — user-defined price target alerts.
 *
 * Per-address localStorage persistence. Checked against live prices
 * by usePriceAlertWatcher hook.
 */

import { create } from 'zustand'

export interface PriceAlert {
  id: string
  market: string
  symbol: string
  condition: 'above' | 'below'
  targetPrice: number
  createdAt: number
  triggered: boolean
}

const STORAGE_PREFIX = 'price-alerts-'

function loadAlerts(address: string): PriceAlert[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${address.toLowerCase()}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAlerts(address: string, alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${address.toLowerCase()}`,
      JSON.stringify(alerts),
    )
  } catch { /* full */ }
}

interface PriceAlertState {
  alerts: PriceAlert[]
  currentAddress: string | null

  loadForAddress: (address: string) => void
  addAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => void
  removeAlert: (id: string) => void
  markTriggered: (id: string) => void
  clearAll: () => void
}

export const usePriceAlertStore = create<PriceAlertState>((set, get) => ({
  alerts: [],
  currentAddress: null,

  loadForAddress: (address) => {
    set({ alerts: loadAlerts(address), currentAddress: address })
  },

  addAlert: (alert) => {
    const { currentAddress, alerts } = get()
    const entry: PriceAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      triggered: false,
    }
    const updated = [entry, ...alerts]
    set({ alerts: updated })
    if (currentAddress) saveAlerts(currentAddress, updated)
  },

  removeAlert: (id) => {
    const { currentAddress, alerts } = get()
    const updated = alerts.filter(a => a.id !== id)
    set({ alerts: updated })
    if (currentAddress) saveAlerts(currentAddress, updated)
  },

  markTriggered: (id) => {
    const { currentAddress, alerts } = get()
    const updated = alerts.map(a =>
      a.id === id ? { ...a, triggered: true } : a,
    )
    set({ alerts: updated })
    if (currentAddress) saveAlerts(currentAddress, updated)
  },

  clearAll: () => {
    const { currentAddress } = get()
    set({ alerts: [] })
    if (currentAddress) {
      localStorage.removeItem(`${STORAGE_PREFIX}${currentAddress.toLowerCase()}`)
    }
  },
}))
