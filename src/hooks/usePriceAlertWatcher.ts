/**
 * usePriceAlertWatcher — checks active price alerts against live prices.
 *
 * Fires toast + notification when a target is hit. Uses ref-based tracking
 * to prevent duplicate fires (same pattern as useLiquidationAlerts).
 */

import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { usePrices } from './usePrices'
import { usePriceAlertStore } from '../store/priceAlertStore'
import { useNotificationStore } from '../store/notificationStore'
import { useToast } from '../store/toastStore'
import { formatUsd } from '../lib/format'

export function usePriceAlertWatcher() {
  const { address } = useAccount()
  const { getPrice } = usePrices()
  const toast = useToast()

  const alerts = usePriceAlertStore(s => s.alerts)
  const markTriggered = usePriceAlertStore(s => s.markTriggered)
  const loadAlerts = usePriceAlertStore(s => s.loadForAddress)
  const addNotification = useNotificationStore(s => s.add)

  // Track which alerts we've already fired to prevent duplicates
  const firedRef = useRef<Set<string>>(new Set())

  // Load alerts when address changes
  useEffect(() => {
    if (address) {
      loadAlerts(address)
      firedRef.current.clear()
    }
  }, [address, loadAlerts])

  // Check alerts against prices
  useEffect(() => {
    for (const alert of alerts) {
      if (alert.triggered) continue
      if (firedRef.current.has(alert.id)) continue

      const priceData = getPrice(alert.market)
      if (!priceData?.price) continue

      const currentPrice = priceData.price
      const hit =
        (alert.condition === 'above' && currentPrice >= alert.targetPrice) ||
        (alert.condition === 'below' && currentPrice <= alert.targetPrice)

      if (hit) {
        firedRef.current.add(alert.id)
        markTriggered(alert.id)

        const title = `${alert.symbol} ${alert.condition === 'above' ? '↑' : '↓'} $${formatUsd(alert.targetPrice)}`
        const message = `${alert.symbol} is now $${formatUsd(currentPrice)}`

        toast.success(title, message)
        addNotification({ type: 'alert', title, message })
      }
    }
  }, [alerts, getPrice, markTriggered, toast, addNotification])
}
