/**
 * BotImportModal — paste a portable JSON, validate, save as a new bot.
 *
 * Pairs with the per-bot Share button which copies portable JSON to
 * clipboard. Together they let users swap strategies via Discord /
 * Twitter / etc without an account system.
 */

import { useState, useEffect } from 'react'
import { X, Upload, Check, AlertCircle } from 'lucide-react'
import { Modal } from './ui/Modal'
import { useBotStore } from '../store/botStore'
import { importBot, type ImportResult } from '../bots/portable'
import { cn } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
}

export function BotImportModal({ open, onClose }: Props) {
  const addBot = useBotStore(s => s.addBot)
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  useEffect(() => {
    if (!open) {
      setText('')
      setResult(null)
    }
  }, [open])

  const handlePreview = () => {
    setResult(importBot(text))
  }

  const handleImport = () => {
    if (!result || !result.ok) return
    addBot({
      ...result.config,
      enabled: true,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Import bot">
      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <div className="text-[11px] text-text-muted leading-relaxed">
          Paste portable bot JSON (the format the Share button copies).
          Click Preview to validate, then Import to save as a new bot.
        </div>

        <textarea
          value={text}
          onChange={e => { setText(e.target.value); setResult(null) }}
          placeholder='{"v":1,"name":"Confluence Sniper",...}'
          rows={10}
          spellCheck={false}
          className="w-full bg-panel border border-border rounded px-3 py-2 text-[11px] font-mono text-text-primary outline-none focus:border-accent resize-y"
        />

        {result?.ok === false && (
          <div className="flex items-start gap-2 text-xs text-short bg-short/10 border border-short/30 rounded-md px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <div>Could not import.</div>
              <div className="text-[10px] text-text-muted mt-0.5">{result.error}</div>
            </div>
          </div>
        )}

        {result?.ok && (
          <div className="bg-long/10 border border-long/30 rounded-md p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-long font-medium">
              <Check className="w-3.5 h-3.5" />
              {result.config.name}
            </div>
            <div className="text-[11px] text-text-muted">
              {result.config.allowedSources.length === 0 ? 'any source' : result.config.allowedSources.join(' / ')}
              {' · '}min conf {Math.round(result.config.minConfidence * 100)}%
              {' · '}${result.config.positionSizeUsd}/trade
              {' · '}{result.config.holdMinutes}m hold
              {' · '}max {result.config.maxTradesPerDay}/day
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handlePreview}
            disabled={!text.trim()}
            className={cn(
              'flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              'bg-surface border border-border text-text-primary hover:bg-panel-light',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            Preview
          </button>
          <button
            onClick={handleImport}
            disabled={!result?.ok}
            className={cn(
              'flex items-center justify-center gap-1.5 flex-1 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              'bg-accent text-white hover:bg-accent/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Upload className="w-3.5 h-3.5" />
            Import as new bot
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-md bg-surface border border-border text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Modal>
  )
}
