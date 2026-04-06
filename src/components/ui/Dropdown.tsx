import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { cn } from '../../lib/format'

interface DropdownProps {
  trigger: ReactNode
  children: ReactNode
  active?: boolean
  width?: string
  maxHeight?: string
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, children, active, width, maxHeight, align = 'left' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, close])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, close])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors cursor-pointer',
          active || open
            ? 'text-accent bg-accent-dim'
            : 'text-text-muted hover:text-text-primary hover:bg-panel-light'
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            'absolute top-full mt-1 bg-panel border border-border rounded-lg shadow-2xl z-30 py-1 overflow-y-auto',
            align === 'right' ? 'right-0' : 'left-0',
            width ?? 'min-w-[160px]',
            maxHeight ?? '',
          )}
          onClick={close}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function DropdownItem({ onClick, active, children }: {
  onClick?: () => void
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer',
        active ? 'text-accent bg-accent-dim' : 'text-text-secondary hover:bg-panel-light'
      )}
    >
      {children}
    </button>
  )
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1 text-[10px] text-text-muted uppercase tracking-wider">
      {children}
    </div>
  )
}
