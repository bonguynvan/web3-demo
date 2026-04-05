import { useRef } from 'react'
import { perfMonitor } from './perfMonitor'

/**
 * Drop this into any component to track how often it re-renders.
 * Results show up in the PerfOverlay.
 */
export function useRenderCount(componentName: string) {
  const count = useRef(0)
  count.current++
  perfMonitor.recordRender(componentName)
  return count.current
}
