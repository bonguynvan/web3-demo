/**
 * Modal — overlay dialog with backdrop + escape-to-close + click-outside.
 *
 * Scope:
 *   - Controlled (parent owns `open`)
 *   - Escape closes
 *   - Click on backdrop closes (not on the content)
 *   - Click inside content does not bubble up and dismiss
 *   - Locks body scroll while open
 *   - Title is required (accessibility + visual anchor)
 *   - Children render as the body; parent composes action buttons
 *
 * Intentionally NOT in scope:
 *   - Focus trap with tab cycling (rare enough here that Escape is the main
 *     exit; users tab through native controls and out of the dialog is fine)
 *   - Transition animations (can add later — Tailwind's built-in classes
 *     flicker on mount without framer-motion)
 *   - Stacking / portal to a named container (a single <body>-level render
 *     covers the current call sites)
 */

import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/format'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Max width class — defaults to `max-w-md` */
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-md' }: ModalProps) {
  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Lock body scroll so the backdrop doesn't allow scrolling the page behind
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'w-full bg-panel border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col',
          maxWidth,
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-panel-light transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Footer (optional) */}
        {footer && (
          <div className="px-4 py-3 border-t border-border bg-surface/30 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
