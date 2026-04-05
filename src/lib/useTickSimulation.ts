import { useEffect } from 'react'
import { useTradingStore } from '../store/tradingStore'

export function useTickSimulation(intervalMs: number = 500) {
  const tickPrice = useTradingStore(s => s.tickPrice)

  useEffect(() => {
    const id = setInterval(tickPrice, intervalMs)
    return () => clearInterval(id)
  }, [tickPrice, intervalMs])
}
