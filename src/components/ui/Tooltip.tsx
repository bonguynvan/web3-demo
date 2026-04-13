/**
 * Tooltip — hover-triggered explanation popover.
 *
 * Implementation choices:
 *   - Pure CSS positioning (no popper.js / floating-ui dependency)
 *   - 350ms hover delay so brushing past doesn't flash a tooltip
 *   - Portals through `position: fixed` to escape `overflow: hidden` parents
 *     (the trading layout has lots of clipped containers)
 *   - The trigger child renders inline; we wrap it in a span and attach
 *     pointer handlers there so the consumer doesn't have to forward refs
 *   - Auto-positions above/below based on viewport room — keeps the tooltip
 *     visible when triggered near the top or bottom of the screen
 *
 * Intentional non-features:
 *   - Click-to-pin (would need state management most callers don't want)
 *   - Rich content / arrows / theming hooks (string content covers 99% of
 *     metric explanations; can extend later if a real need shows up)
 */

import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const HOVER_DELAY_MS = 350
const OFFSET = 8

interface TooltipProps {
  /** Tooltip text body. Keep it to one or two short sentences. */
  content: string
  /** Optional title shown bold on top of the body */
  title?: string
  children: ReactNode
  /** Where the tooltip prefers to render. Falls back to the opposite side
   *  if the preferred side overflows the viewport. */
  side?: 'top' | 'bottom' | 'right'
}

export function Tooltip({ content, title, children, side = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelShow = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }

  const handleEnter = () => {
    cancelShow()
    showTimerRef.current = setTimeout(() => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()

      let pos: CSSProperties

      if (side === 'right') {
        // Position to the right of the trigger — used by the collapsed sidebar
        pos = {
          position: 'fixed',
          left: rect.right + OFFSET,
          top: rect.top + rect.height / 2,
          transform: 'translate(0, -50%)',
        }
      } else {
        const wantsTop = side === 'top'
        const placeOnTop = wantsTop && rect.top > 80
        pos = {
          position: 'fixed',
          left: rect.left + rect.width / 2,
          top: placeOnTop ? rect.top - OFFSET : rect.bottom + OFFSET,
          transform: placeOnTop ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
        }
      }

      // Position is computed in viewport coordinates because we render
      // through a portal at body level — no parent transform / scroll math.
      setPosition(pos)
      setOpen(true)
    }, HOVER_DELAY_MS)
  }

  const handleLeave = () => {
    cancelShow()
    setOpen(false)
  }

  // Hide on scroll / resize so the tooltip never floats next to a stale
  // position when the page reflows.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // Cleanup any pending show timer on unmount
  useEffect(() => () => cancelShow(), [])

  return (
    <>
      <span
        ref={triggerRef}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        className="inline-flex items-center"
      >
        {children}
      </span>

      {open && position && createPortal(
        <div
          className="z-[200] pointer-events-none max-w-[260px] bg-panel border border-border rounded-md shadow-2xl px-2.5 py-1.5"
          style={position}
          role="tooltip"
        >
          {title && (
            <div className="text-[11px] font-semibold text-text-primary mb-0.5">
              {title}
            </div>
          )}
          <div className="text-[10px] text-text-secondary leading-relaxed">
            {content}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
