/**
 * HotkeysModal — keyboard shortcut reference. Opens on `?` key.
 *
 * Listens at the window level so it works from any page. Skips while
 * typing in inputs/textarea/contenteditable so `?` characters in user
 * input don't trigger the modal.
 */

import { useEffect, useState } from 'react'
import { Modal } from './ui/Modal'

const GLOBAL: Array<{ keys: string[]; desc: string }> = [
  { keys: ['Cmd / Ctrl', 'K'], desc: 'Open the market quick-jump palette' },
  { keys: ['Cmd / Ctrl', 'L'], desc: 'Place a live order (vault must be unlocked)' },
  { keys: ['?'], desc: 'Show this hotkeys reference' },
  { keys: ['Esc'], desc: 'Close any open modal / dropdown' },
  { keys: ['↑', '↓'], desc: 'Navigate items in the market palette' },
  { keys: ['Enter'], desc: 'Confirm selection in palettes / forms' },
]

const ORDER_FORM: Array<{ keys: string[]; desc: string }> = [
  { keys: ['B'], desc: 'Long side' },
  { keys: ['S'], desc: 'Short side' },
  { keys: ['M'], desc: 'Market order' },
  { keys: ['L'], desc: 'Limit order' },
  { keys: ['1', '2', '3', '4', '5'], desc: 'Leverage presets (1× / 2× / 5× / 10× / 20×)' },
]

export function HotkeysModal() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null
        const tag = target?.tagName
        const editable = target?.isContentEditable
        if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <div className="p-4 space-y-5 text-sm">
        <Section title="Global">
          <List items={GLOBAL} />
        </Section>
        <Section title="Order form (focused on /trade)">
          <List items={ORDER_FORM} />
        </Section>
      </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function List({ items }: { items: Array<{ keys: string[]; desc: string }> }) {
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-surface/60">
          <span className="text-text-secondary text-xs">{item.desc}</span>
          <div className="flex items-center gap-1">
            {item.keys.map((k, j) => (
              <span key={j} className="flex items-center">
                {j > 0 && <span className="text-text-muted text-[10px] mx-1">+</span>}
                <kbd className="px-1.5 py-0.5 rounded bg-panel border border-border text-[10px] font-mono">
                  {k}
                </kbd>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
