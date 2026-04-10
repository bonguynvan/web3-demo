/**
 * Drawer — slide-out side panel for mobile menus.
 *
 * Differences from <Modal />:
 *   - Full-height column anchored to the left or right edge
 *   - Slides in horizontally instead of fading in centered
 *   - Single column body (no separate footer slot — actions live inline)
 *
 * Otherwise the same primitives apply: Escape closes, click-outside the
 * panel closes, body scroll locks while open, content portals to body.
 */

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/format'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Side to anchor the drawer to. Defaults to right. */
  side?: 'left' | 'right'
  /** Drawer width — defaults to 280px. Pass any Tailwind width class. */
  widthClass?: string
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = 'right',
  widthClass = 'w-[280px]',
}: DrawerProps) {
  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll while open so the page underneath doesn't scroll along
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const node = (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'fixed top-0 bottom-0 bg-panel border-border shadow-2xl flex flex-col',
          widthClass,
          side === 'right' ? 'right-0 border-l animate-[slideInRight_0.2s_ease-out]' : 'left-0 border-r animate-[slideInLeftEdge_0.2s_ease-out]',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
