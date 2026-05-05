/**
 * venueLinks — deep-link URLs to a venue's own trade page for a given
 * market id.
 *
 * The "TradingView lane" positioning: research and signals here,
 * execution wherever the user already has an account. No keys, no
 * custody, no trust ask.
 */

import type { VenueId } from '../adapters/types'

interface VenueLink {
  url: string
  label: string
}

/**
 * Returns null when the market id doesn't map to a public trade URL
 * on the given venue (exotic shapes, unknown venue).
 */
export function venueTradeLink(marketId: string, venue: VenueId): VenueLink | null {
  if (venue === 'binance') {
    const m = /^([A-Z0-9]+)\/([A-Z0-9]+)$/.exec(marketId)
    if (!m) return null
    return {
      url: `https://www.binance.com/en/trade/${m[1]}_${m[2]}`,
      label: 'Trade on Binance',
    }
  }

  if (venue === 'hyperliquid') {
    const m = /^([A-Z0-9]+)(?:-PERP)?$/.exec(marketId)
    if (!m) return null
    return {
      url: `https://app.hyperliquid.xyz/trade/${m[1]}`,
      label: 'Trade on Hyperliquid',
    }
  }

  return null
}
