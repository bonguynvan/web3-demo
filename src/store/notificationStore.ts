/**
 * notificationStore — persistent notification history.
 *
 * Stores trade executions, settlements, price alerts, and liquidation
 * warnings. Per-address localStorage persistence, max 100 entries.
 */

import { create } from 'zustand'

export type NotificationType = 'trade' | 'settlement' | 'alert' | 'liquidation' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  timestamp: number
  read: boolean
}

const STORAGE_PREFIX = 'notifications-'
const MAX_ENTRIES = 100

function loadNotifications(address: string): Notification[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${address.toLowerCase()}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotifications(address: string, items: Notification[]): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${address.toLowerCase()}`,
      JSON.stringify(items.slice(0, MAX_ENTRIES)),
    )
  } catch { /* full */ }
}

interface NotificationState {
  notifications: Notification[]
  currentAddress: string | null
  unreadCount: number

  loadForAddress: (address: string) => void
  add: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  currentAddress: null,
  unreadCount: 0,

  loadForAddress: (address) => {
    const items = loadNotifications(address)
    set({
      notifications: items,
      currentAddress: address,
      unreadCount: items.filter(n => !n.read).length,
    })
  },

  add: (notification) => {
    const { currentAddress, notifications } = get()
    const entry: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      read: false,
    }
    const updated = [entry, ...notifications].slice(0, MAX_ENTRIES)
    set({
      notifications: updated,
      unreadCount: updated.filter(n => !n.read).length,
    })
    if (currentAddress) saveNotifications(currentAddress, updated)
  },

  markRead: (id) => {
    const { currentAddress, notifications } = get()
    const updated = notifications.map(n =>
      n.id === id ? { ...n, read: true } : n,
    )
    set({
      notifications: updated,
      unreadCount: updated.filter(n => !n.read).length,
    })
    if (currentAddress) saveNotifications(currentAddress, updated)
  },

  markAllRead: () => {
    const { currentAddress, notifications } = get()
    const updated = notifications.map(n => ({ ...n, read: true }))
    set({ notifications: updated, unreadCount: 0 })
    if (currentAddress) saveNotifications(currentAddress, updated)
  },

  clear: () => {
    const { currentAddress } = get()
    set({ notifications: [], unreadCount: 0 })
    if (currentAddress) {
      localStorage.removeItem(`${STORAGE_PREFIX}${currentAddress.toLowerCase()}`)
    }
  },
}))
