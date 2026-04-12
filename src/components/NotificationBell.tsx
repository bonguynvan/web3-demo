/**
 * NotificationBell — bell icon with unread badge and dropdown panel.
 */

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useTranslation } from 'react-i18next'
import { Bell, Inbox, Zap, TrendingUp, AlertTriangle, Info } from 'lucide-react'
import { useNotificationStore, type Notification, type NotificationType } from '../store/notificationStore'
import { cn } from '../lib/format'
import { Dropdown } from './ui/Dropdown'

const TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  trade: TrendingUp,
  settlement: Zap,
  alert: Bell,
  liquidation: AlertTriangle,
  info: Info,
}

const TYPE_COLORS: Record<NotificationType, string> = {
  trade: 'text-accent',
  settlement: 'text-long',
  alert: 'text-yellow-400',
  liquidation: 'text-short',
  info: 'text-text-muted',
}

export function NotificationBell() {
  const { t } = useTranslation('common')
  const { address } = useAccount()
  const {
    notifications,
    unreadCount,
    loadForAddress,
    markAllRead,
    clear,
  } = useNotificationStore()

  useEffect(() => {
    if (address) loadForAddress(address)
  }, [address, loadForAddress])

  return (
    <Dropdown
      trigger={
        <div className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-short text-white text-[9px] font-bold rounded-full px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      }
      align="right"
      width="min-w-[320px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-semibold text-text-primary">Notifications</span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[10px] text-accent hover:text-accent/80 cursor-pointer"
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clear}
              className="text-[10px] text-text-muted hover:text-short cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="max-h-[300px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2" onClick={e => e.stopPropagation()}>
            <Inbox className="w-5 h-5 text-text-muted" />
            <span className="text-[10px] text-text-muted">No notifications yet</span>
          </div>
        ) : (
          notifications.slice(0, 20).map(notif => (
            <NotificationRow key={notif.id} notification={notif} />
          ))
        )}
      </div>
    </Dropdown>
  )
}

function NotificationRow({ notification }: { notification: Notification }) {
  const Icon = TYPE_ICONS[notification.type]
  const color = TYPE_COLORS[notification.type]

  return (
    <div className={cn(
      'flex items-start gap-2.5 px-3 py-2.5 border-b border-border/50 hover:bg-panel-light transition-colors',
      !notification.read && 'bg-accent/5',
    )}>
      <div className={cn('mt-0.5 shrink-0', color)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-text-primary truncate">{notification.title}</div>
        <div className="text-[10px] text-text-muted truncate">{notification.message}</div>
        <div className="text-[9px] text-text-muted mt-0.5">{formatRelative(notification.timestamp)}</div>
      </div>
      {!notification.read && (
        <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1.5" />
      )}
    </div>
  )
}

function formatRelative(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
