/**
 * VenueSwitcher — dropdown to switch trading venues.
 *
 * Lives next to the market selector in Web3Header. Reads the active
 * venue via useActiveVenue so it stays in sync with any other code
 * path that flips the venue programmatically.
 */

import { ChevronDown } from 'lucide-react'
import { Dropdown } from './ui/Dropdown'
import { listAdapters, setActiveVenue } from '../adapters/registry'
import { useActiveVenue } from '../hooks/useActiveVenue'
import { cn } from '../lib/format'

export function VenueSwitcher() {
  const activeId = useActiveVenue()
  const adapters = listAdapters()
  const active = adapters.find(a => a.id === activeId)

  return (
    <Dropdown
      trigger={
        <>
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Venue</span>
          <span className="text-xs font-medium text-text-primary ml-1">
            {active?.displayName ?? activeId}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
        </>
      }
      width="min-w-[220px]"
    >
      {adapters.map(adapter => {
        const tags: string[] = []
        if (adapter.capabilities.perp) tags.push('perps')
        if (adapter.capabilities.spot) tags.push('spot')
        if (!adapter.capabilities.trading) tags.push('read-only')
        return (
          <button
            key={adapter.id}
            onClick={() => setActiveVenue(adapter.id)}
            className={cn(
              'flex items-center justify-between w-full px-4 py-2.5 hover:bg-panel-light transition-colors cursor-pointer text-left',
              adapter.id === activeId && 'bg-panel-light',
            )}
          >
            <div>
              <div className="text-sm font-medium text-text-primary">{adapter.displayName}</div>
              <div className="text-[10px] text-text-muted">{tags.join(' · ')}</div>
            </div>
            {adapter.id === activeId && (
              <span className="text-[10px] text-accent">●</span>
            )}
          </button>
        )
      })}
    </Dropdown>
  )
}
