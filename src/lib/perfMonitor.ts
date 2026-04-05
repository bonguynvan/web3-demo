/**
 * Performance monitoring for real-time trading UI.
 *
 * Tracks FPS, render counts per component, update throughput,
 * memory usage, and dropped frames — the metrics that matter
 * when you're pushing 1000+ updates/sec through React.
 */

export interface PerfSnapshot {
  fps: number
  frameTime: number        // ms per frame (avg)
  droppedFrames: number    // frames that took > 16.67ms
  memoryMB: number         // JS heap used (Chrome only)
  updatesPerSec: number    // how many state updates actually happened
  rendersPerSec: Record<string, number>  // per-component render counts
}

type PerfListener = (snapshot: PerfSnapshot) => void

class PerfMonitor {
  private frameCount = 0
  private lastFrameTime = 0
  private frameTimes: number[] = []
  private droppedFrames = 0
  private updateCount = 0
  private renderCounts: Record<string, number> = {}
  private listeners: PerfListener[] = []
  private rafId = 0
  private intervalId = 0
  private running = false

  start() {
    if (this.running) return
    this.running = true
    this.lastFrameTime = performance.now()
    this.tick()

    // Snapshot every second
    this.intervalId = window.setInterval(() => {
      const snapshot = this.takeSnapshot()
      this.listeners.forEach(fn => fn(snapshot))
      this.reset()
    }, 1000)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
    clearInterval(this.intervalId)
  }

  private tick = () => {
    if (!this.running) return
    const now = performance.now()
    const dt = now - this.lastFrameTime
    this.lastFrameTime = now
    this.frameCount++
    this.frameTimes.push(dt)
    if (dt > 16.67) this.droppedFrames++
    this.rafId = requestAnimationFrame(this.tick)
  }

  /** Call this every time a Zustand state update happens */
  recordUpdate() {
    this.updateCount++
  }

  /** Call this from useRenderCount() hook inside components */
  recordRender(componentName: string) {
    this.renderCounts[componentName] = (this.renderCounts[componentName] || 0) + 1
  }

  subscribe(fn: PerfListener) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }

  private takeSnapshot(): PerfSnapshot {
    const avgFrameTime = this.frameTimes.length > 0
      ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      : 0

    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const memoryMB = memory ? memory.usedJSHeapSize / 1024 / 1024 : 0

    return {
      fps: this.frameCount,
      frameTime: +avgFrameTime.toFixed(2),
      droppedFrames: this.droppedFrames,
      memoryMB: +memoryMB.toFixed(1),
      updatesPerSec: this.updateCount,
      rendersPerSec: { ...this.renderCounts },
    }
  }

  private reset() {
    this.frameCount = 0
    this.frameTimes = []
    this.droppedFrames = 0
    this.updateCount = 0
    this.renderCounts = {}
  }
}

export const perfMonitor = new PerfMonitor()
