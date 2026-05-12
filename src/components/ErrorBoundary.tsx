import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { report } from '../lib/errorReporter'

interface Props {
  children: ReactNode
  name: string
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Panel-level error boundary.
 *
 * Why per-panel, not per-app?
 * If the orderbook crashes (e.g., bad data from WS), the chart and positions
 * should keep working. Traders need to be able to close positions even if
 * one panel breaks. This is critical for a trading UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack)
    report(error, {
      kind: 'react',
      meta: {
        boundary: this.props.name,
        componentStack: info.componentStack?.slice(0, 2000),
      },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-panel rounded-lg border border-border p-4 gap-3">
          <AlertTriangle className="w-8 h-8 text-short" />
          <div className="text-sm text-text-primary font-medium">{this.props.name} Error</div>
          <div className="text-xs text-text-muted text-center max-w-[200px]">
            {this.state.error?.message || 'An unexpected error occurred'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
