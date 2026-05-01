/**
 * TelegramConfigModal — wire signal alerts to a Telegram chat.
 *
 * The user enters their bot token + chat id, hits Test to verify, and
 * toggles delivery on. Both fields persist to localStorage via
 * saveTelegramConfig.
 */

import { useState, useEffect } from 'react'
import { X, Send, Check, AlertCircle } from 'lucide-react'
import { Modal } from './ui/Modal'
import {
  loadTelegramConfig,
  saveTelegramConfig,
  sendTelegramMessage,
} from '../lib/telegram'
import { cn } from '../lib/format'

interface Props {
  open: boolean
  onClose: () => void
}

type TestState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

export function TelegramConfigModal({ open, onClose }: Props) {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' })

  useEffect(() => {
    if (!open) return
    const cfg = loadTelegramConfig()
    setBotToken(cfg.botToken)
    setChatId(cfg.chatId)
    setEnabled(cfg.enabled)
    setTestState({ kind: 'idle' })
  }, [open])

  const handleSave = () => {
    saveTelegramConfig({
      botToken: botToken.trim(),
      chatId: chatId.trim(),
      enabled,
    })
    onClose()
  }

  const handleTest = async () => {
    setTestState({ kind: 'sending' })
    const result = await sendTelegramMessage(
      botToken.trim(),
      chatId.trim(),
      '✅ TradingDek connected. You will receive high-confidence signals here.',
    )
    if (result.ok) setTestState({ kind: 'success' })
    else setTestState({ kind: 'error', message: result.error ?? 'unknown' })
  }

  const canTest = botToken.trim().length > 0 && chatId.trim().length > 0

  return (
    <Modal open={open} onClose={onClose} title="Telegram alerts">
      <div className="p-4 space-y-4">
        <div className="bg-surface/60 rounded-md p-3 text-xs text-text-secondary leading-relaxed">
          <div className="font-medium text-text-primary mb-1.5">Quick setup</div>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Open Telegram, message <span className="font-mono text-accent">@BotFather</span>, send <span className="font-mono">/newbot</span>, copy the bot token.</li>
            <li>Start a chat with your new bot (send any message to it).</li>
            <li>Visit <span className="font-mono break-all">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> in your browser to find your chat id.</li>
            <li>Paste both below, hit Test, then Save.</li>
          </ol>
        </div>

        <Field label="Bot token">
          <input
            type="password"
            value={botToken}
            onChange={e => { setBotToken(e.target.value); setTestState({ kind: 'idle' }) }}
            placeholder="123456789:ABCdef..."
            className="w-full bg-panel border border-border rounded px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
            autoComplete="off"
          />
        </Field>

        <Field label="Chat id">
          <input
            type="text"
            value={chatId}
            onChange={e => { setChatId(e.target.value); setTestState({ kind: 'idle' }) }}
            placeholder="-1001234567890 or 123456789"
            className="w-full bg-panel border border-border rounded px-3 py-2 text-xs font-mono text-text-primary outline-none focus:border-accent"
            autoComplete="off"
          />
        </Field>

        <label className="flex items-center justify-between bg-surface/60 rounded-md px-3 py-2.5 cursor-pointer">
          <div>
            <div className="text-xs font-medium text-text-primary">Enable Telegram alerts</div>
            <div className="text-[10px] text-text-muted mt-0.5">Send signals at ≥60% confidence</div>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-accent cursor-pointer"
          />
        </label>

        {testState.kind === 'success' && (
          <div className="flex items-center gap-2 text-xs text-long bg-long/10 border border-long/30 rounded-md px-3 py-2">
            <Check className="w-3.5 h-3.5" />
            Test message delivered.
          </div>
        )}
        {testState.kind === 'error' && (
          <div className="flex items-start gap-2 text-xs text-short bg-short/10 border border-short/30 rounded-md px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <div>Test failed.</div>
              <div className="text-[10px] text-text-muted mt-0.5 break-all">{testState.message}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleTest}
            disabled={!canTest || testState.kind === 'sending'}
            className={cn(
              'flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer',
              'bg-surface border border-border text-text-primary hover:bg-panel-light',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            <Send className="w-3.5 h-3.5" />
            {testState.kind === 'sending' ? 'Sending…' : 'Test'}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Save
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] text-text-muted uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
