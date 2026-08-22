'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from './Icon'
import type { IconName } from './Icon'
import { useAccount, useDisconnect } from '@/lib/wallet'
import { shortAddr } from '@/lib/api'

const navItems: { label: string; icon: IconName; href: string; badge?: boolean }[] = [
  { label: 'Overview',   icon: 'grid',     href: '/' },
  { label: 'Treasury',   icon: 'wallet',   href: '/treasury' },
  { label: 'Proposals',  icon: 'file',     href: '/proposals', badge: true },
  { label: 'Members',    icon: 'activity', href: '/members' },
  { label: 'CFO Chat',   icon: 'zap',      href: '/cfo' },
  { label: 'Policies',   icon: 'shield',   href: '/policies' },
  { label: 'Activity',   icon: 'clock',    href: '/activity' },
]

export default function Sidebar({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><span /></span>
        <span>CFOx</span>
        <small>cfo</small>
      </div>

      <div className="workspace">
        <div className="workspace-avatar">AC</div>
        <div><strong>Acme Corp</strong><span>Operations workspace</span></div>
        <Icon name="more" size={16} />
      </div>

      <nav className="nav-list" aria-label="Main navigation">
        <p className="nav-label">Workspace</p>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge && pendingCount > 0 && <b>{pendingCount}</b>}
            </Link>
          )
        })}
        <p className="nav-label nav-label-lower">Manage</p>
        <Link href="/settings" className={`nav-item ${pathname === '/settings' ? 'active' : ''}`}>
          <Icon name="settings" />
          <span>Settings</span>
        </Link>
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-dot">?</span>
          <div><strong>Need a hand?</strong><span>Read the CFO guide</span></div>
          <Icon name="arrow" size={15} />
        </div>

        {isConnected && address ? (
          <div className="user-row" style={{ cursor: 'pointer' }} onClick={() => disconnect()} title="Disconnect wallet">
            <div className="user-avatar" style={{ fontSize: 9 }}>🔗</div>
            <div>
              <strong style={{ fontFamily: 'monospace', fontSize: 11 }}>{shortAddr(address)}</strong>
              <span>Connected · click to disconnect</span>
            </div>
          </div>
        ) : (
          <div className="user-row">
            <div className="user-avatar">JD</div>
            <div><strong>Not connected</strong><span>Connect wallet above</span></div>
          </div>
        )}
      </div>
    </aside>
  )
}