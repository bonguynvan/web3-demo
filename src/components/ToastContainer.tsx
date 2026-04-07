/**
 * ToastContainer — renders toast notifications stacked in bottom-right.
 *
 * Features:
 * - Auto-dismiss with progress bar
 * - Slide-in animation
 * - Color-coded by type (success=green, error=red, warning=amber, info=blue)
 * - Click to dismiss
 * - Pause timer on hover
 */

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore, type Toast, type ToastType } from '../store/toastStore'
import { cn } from '../lib/format'

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS: Record<ToastType, { icon: string; border: string; bg: string; progress: string }> = {
  success: {
    icon: 'text-white',
    border: 'border-long',
    bg: 'bg-[#166534]',
    progress: 'bg-long',
  },
  error: {
    icon: 'text-white',
    border: 'border-short',
    bg: 'bg-[#7f1d1d]',
    progress: 'bg-short',
  },
  warning: {
    icon: 'text-white',
    border: 'border-amber-500',
    bg: 'bg-[#78350f]',
    progress: 'bg-amber-400',
  },
  info: {
    icon: 'text-white',
    border: 'border-accent',
    bg: 'bg-[#2e1065]',
    progress: 'bg-accent',
  },
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)

  return (
    <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore(s => s.remove)
  const [progress, setProgress] = useState(100)
  const [paused, setPaused] = useState(false)
  const [exiting, setExiting] = useState(false)
  const startRef = useRef(Date.now())
  const remainingRef = useRef(toast.duration)

  const Icon = ICONS[toast.type]
  const colors = COLORS[toast.type]

  useEffect(() => {
    if (toast.duration === 0 || paused) return

    const tick = () => {
      const elapsed = Date.now() - startRef.current
      const remaining = remainingRef.current - elapsed
      const pct = Math.max(0, (remaining / toast.duration) * 100)
      setProgress(pct)

      if (remaining <= 0) {
        handleDismiss()
      } else {
        requestAnimationFrame(tick)
      }
    }

    startRef.current = Date.now()
    const raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, toast.duration])

  const handleDismiss = () => {
    setExiting(true)
    setTimeout(() => remove(toast.id), 200)
  }

  const handleMouseEnter = () => {
    setPaused(true)
    remainingRef.current = remainingRef.current - (Date.now() - startRef.current)
  }

  const handleMouseLeave = () => {
    startRef.current = Date.now()
    setPaused(false)
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleDismiss}
      className={cn(
        'pointer-events-auto w-[340px] rounded-lg border shadow-2xl cursor-pointer',
        'transition-all duration-200',
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0',
        'animate-[slideIn_0.2s_ease-out]',
        colors.border,
        colors.bg,
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className={cn('w-5 h-5 shrink-0 mt-0.5', colors.icon)} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white">{toast.title}</div>
          {toast.message && (
            <div className="text-xs text-white/70 mt-0.5 truncate">{toast.message}</div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDismiss() }}
          className="text-white/50 hover:text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      {toast.duration > 0 && (
        <div className="h-0.5 bg-border/30 rounded-b-lg overflow-hidden">
          <div
            className={cn('h-full transition-none', colors.progress)}
            style={{ width: `${progress}%`, opacity: 0.6 }}
          />
        </div>
      )}
    </div>
  )
}
