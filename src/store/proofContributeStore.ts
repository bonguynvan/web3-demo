/**
 * proofContributeStore — opt-in flag for community-proof contributions
 * plus a per-id dedup set so the same resolved signal is only uploaded
 * once even across reloads.
 *
 * The actual uploader lives in src/hooks/useProofContribute.ts; this
 * store is the tiny piece of state that needs to persist.
 */

import { create } from 'zustand'

const KEY = 'tc-proof-optin-v1'
const MAX_REMEMBERED_IDS = 5000

interface Persisted {
  enabled: boolean
  lastUploadedAt: number
  uploadedIds: string[]
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { enabled: false, lastUploadedAt: 0, uploadedIds: [] }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      enabled: parsed.enabled === true,
      lastUploadedAt: typeof parsed.lastUploadedAt === 'number' ? parsed.lastUploadedAt : 0,
      uploadedIds: Array.isArray(parsed.uploadedIds) ? parsed.uploadedIds.slice(-MAX_REMEMBERED_IDS) : [],
    }
  } catch {
    return { enabled: false, lastUploadedAt: 0, uploadedIds: [] }
  }
}

function persist(p: Persisted) {
  try {
    const trimmed: Persisted = {
      ...p,
      uploadedIds: p.uploadedIds.slice(-MAX_REMEMBERED_IDS),
    }
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch { /* storage full */ }
}

interface ProofContributeState {
  enabled: boolean
  lastUploadedAt: number
  uploadedIds: Set<string>
  setEnabled: (v: boolean) => void
  markUploaded: (ids: string[]) => void
}

const initial = load()

export const useProofContributeStore = create<ProofContributeState>((set, get) => ({
  enabled: initial.enabled,
  lastUploadedAt: initial.lastUploadedAt,
  uploadedIds: new Set(initial.uploadedIds),

  setEnabled: v => {
    const s = get()
    persist({
      enabled: v,
      lastUploadedAt: s.lastUploadedAt,
      uploadedIds: Array.from(s.uploadedIds),
    })
    set({ enabled: v })
  },

  markUploaded: ids => {
    const s = get()
    const next = new Set(s.uploadedIds)
    for (const id of ids) next.add(id)
    const now = Date.now()
    persist({
      enabled: s.enabled,
      lastUploadedAt: now,
      uploadedIds: Array.from(next),
    })
    set({ uploadedIds: next, lastUploadedAt: now })
  },
}))
