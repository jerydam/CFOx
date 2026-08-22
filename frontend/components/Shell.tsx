'use client'

import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function Shell({ children, pendingCount = 0 }: { children: ReactNode; pendingCount?: number }) {
  return (
    <main className="app-shell">
      <Sidebar pendingCount={pendingCount} />
      <section className="content">
        <Topbar />
        <div className="page-content">{children}</div>
      </section>
    </main>
  )
}
