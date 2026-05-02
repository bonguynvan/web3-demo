/**
 * userBackup — export/import all TradingDek user state as one JSON.
 *
 * Covers bots, trade ledger, signal settings, thresholds, performance
 * tracker, panel preferences, and onboarding flag. Pure localStorage
 * operations — no server round-trip. Lets users migrate their setup
 * across browsers or share strategies (with bot ledger included).
 *
 * Forward-compat: a future schema migration can read older `v` numbers
 * and translate. Bumping `v` invalidates older backups deliberately.
 */

const BACKUP_VERSION = 1

/** All localStorage keys included in a backup. Add new ones here. */
const BACKUP_KEYS = [
  'tc-bots-v1',
  'tc-signal-settings-v1',
  'tc-signal-thresholds-v1',
  'tc-signal-performance-v1',
  'tc-signal-min-conf-v1',
  'tc-signal-sound-v1',
  'tc-signal-solo-source-v1',
  'tc-bots-sort-v1',
  'tc-onboarded-v1',
] as const

export interface BackupEnvelope {
  v: number
  exportedAt: string
  data: Record<string, string>
}

export function buildBackup(): BackupEnvelope {
  const data: Record<string, string> = {}
  for (const key of BACKUP_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v != null) data[key] = v
    } catch { /* ignore */ }
  }
  return {
    v: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
}

export function downloadBackup(): void {
  const env = buildBackup()
  const json = JSON.stringify(env, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  a.href = url
  a.download = `tradingdek-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface ImportResult {
  ok: boolean
  imported?: number
  error?: string
}

export function importBackup(json: string): ImportResult {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch {
    return { ok: false, error: 'Not valid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Backup root is not an object' }
  }
  const env = parsed as Partial<BackupEnvelope>
  if (env.v !== BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version ${env.v} (expected ${BACKUP_VERSION})` }
  }
  if (!env.data || typeof env.data !== 'object') {
    return { ok: false, error: 'Backup is missing data field' }
  }

  let imported = 0
  for (const key of BACKUP_KEYS) {
    const v = env.data[key]
    if (typeof v !== 'string') continue
    try {
      localStorage.setItem(key, v)
      imported += 1
    } catch { /* full or denied */ }
  }
  return { ok: true, imported }
}
