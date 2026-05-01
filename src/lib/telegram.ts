/**
 * Telegram alert helpers — browser-direct via api.telegram.org.
 *
 * The user creates a bot via @BotFather, starts a chat with it (or adds
 * it to a group), and pastes the bot token + chat id into our settings
 * UI. Both are persisted to localStorage and never leave the browser
 * except as the body of the POST to telegram.org.
 *
 * Why no backend: Telegram allows browser-direct sendMessage with CORS,
 * the user's bot token controls only their own bot, and there's no
 * shared secret to leak. Same pattern as Slack's incoming webhooks.
 */

const STORAGE_KEY = 'tc-telegram-v1'

export interface TelegramConfig {
  botToken: string
  chatId: string
  enabled: boolean
}

const DEFAULT: TelegramConfig = { botToken: '', chatId: '', enabled: false }

export function loadTelegramConfig(): TelegramConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<TelegramConfig>
    return {
      botToken: parsed.botToken ?? '',
      chatId: parsed.chatId ?? '',
      enabled: parsed.enabled ?? false,
    }
  } catch {
    return DEFAULT
  }
}

export function saveTelegramConfig(cfg: TelegramConfig): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch { /* full */ }
  // Notify listeners (useTelegramAlerts hook) to re-read on toggle.
  window.dispatchEvent(new Event(TELEGRAM_CONFIG_EVENT))
}

export const TELEGRAM_CONFIG_EVENT = 'telegram-config-update'

export interface SendResult {
  ok: boolean
  error?: string
}

export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<SendResult> {
  if (!token || !chatId) return { ok: false, error: 'missing token or chat id' }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    const data = await res.json() as { ok: boolean; description?: string }
    if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network error' }
  }
}
