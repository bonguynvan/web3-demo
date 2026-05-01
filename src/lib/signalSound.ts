/**
 * signalSound — short Web Audio tone for new high-confidence signals.
 *
 * Generates a 0.15s sine ping per call. Reuses a lazy AudioContext;
 * browsers require user gesture before first sound — call ensureAudio()
 * from a click handler to unlock playback on iOS/Safari.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Win = window as Window & { webkitAudioContext?: typeof AudioContext }
  const Ctor = window.AudioContext ?? Win.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  return ctx
}

export function ensureAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

export function playSignalTone(direction: 'long' | 'short' = 'long'): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()

  const now = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()

  osc.type = 'sine'
  osc.frequency.value = direction === 'long' ? 660 : 440

  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(now)
  osc.stop(now + 0.16)
}
