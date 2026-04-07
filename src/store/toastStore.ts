/**
 * Toast notification store — manages stack of toast messages.
 *
 * Usage:
 *   import { useToast } from '../store/toastStore'
 *   const toast = useToast()
 *   toast.success('Position opened', 'Long ETH 10x — $10,000')
 *   toast.error('Transaction failed', 'Slippage exceeded')
 *   toast.warning('Near liquidation', 'ETH-PERP long is at 92% margin usage')
 *   toast.info('Funding payment', '-$2.35 funding charged')
 */

import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number // ms, 0 = persistent
  createdAt: number
}

interface ToastState {
  toasts: Toast[]
  add: (type: ToastType, title: string, message?: string, duration?: number) => string
  remove: (id: string) => void
  clear: () => void
}

let nextId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  add: (type, title, message, duration) => {
    const id = `toast-${++nextId}`
    const defaultDuration = type === 'error' ? 6000 : type === 'warning' ? 5000 : 4000
    const toast: Toast = {
      id,
      type,
      title,
      message,
      duration: duration ?? defaultDuration,
      createdAt: Date.now(),
    }
    set(state => ({ toasts: [...state.toasts.slice(-9), toast] })) // max 10
    return id
  },

  remove: (id) => {
    set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }))
  },

  clear: () => set({ toasts: [] }),
}))

/** Convenience hook with typed methods */
export function useToast() {
  const { add, remove, clear } = useToastStore()
  return {
    success: (title: string, message?: string) => add('success', title, message),
    error: (title: string, message?: string) => add('error', title, message),
    warning: (title: string, message?: string) => add('warning', title, message),
    info: (title: string, message?: string) => add('info', title, message),
    remove,
    clear,
  }
}
