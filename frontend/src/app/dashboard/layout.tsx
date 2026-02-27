'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DateRangeProvider, useDateRange, DateRange } from '@/context/DateRangeContext'

const NAV_GROUPS = [
  {
    label: 'Analytics',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '◈' },
      { href: '/dashboard/performance', label: 'Performance', icon: '◎' },
      { href: '/dashboard/behavioral', label: 'Behavioral', icon: '◉', alert: true },
      { href: '/dashboard/risk', label: 'Risk', icon: '◐' },
    ],
  },
  {
    label: 'Improvement',
    items: [
      { href: '/dashboard/improvement', label: 'Action Plan', icon: '◆' },
      { href: '/dashboard/journal', label: 'Trade Journal', icon: '◇' },
      { href: '/dashboard/report', label: 'Weekly Report', icon: '◈' },
    ],
  },
  {
    label: 'Data',
    items: [
      { href: '/dashboard/upload', label: 'Import Trades', icon: '↑' },
      { href: '/dashboard/brokers', label: 'Brokers', icon: '⇌' },
    ],
  },
]

const RANGES: { label: string; value: DateRange }[] = [
  { label: '7D', value: '7d' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: 'ALL', value: 'all' },
]

function DashboardHeader() {
  const { range, setRange, insights } = useDateRange()
  const pnlPos = insights.totalPnl >= 0
  return (
    <header className="dashboard-header" style={{ justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-amber-primary)', letterSpacing: '-0.01em' }}>
          TRADE<span style={{ color: 'var(--color-text-primary)' }}>IQ</span>
        </span>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {RANGES.map(r => (
            <button
              key={r.value}
              className={`range-pill ${range === r.value ? 'active' : ''}`}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div className="metric-block">
            <span className="data-label">Net P&L</span>
            <span className={`data-value-sm ${pnlPos ? 'data-value-positive' : 'data-value-negative'}`}>
              {pnlPos ? '+' : ''}₹{insights.totalPnl.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="metric-block">
            <span className="data-label">Win Rate</span>
            <span className="data-value-sm data-value-amber">{insights.winRate.toFixed(1)}%</span>
          </div>
          <div className="metric-block">
            <span className="data-label">IQ Score</span>
            <span className="data-value-sm" style={{ color: insights.iqScore >= 70 ? 'var(--color-positive)' : insights.iqScore >= 50 ? 'var(--color-amber-primary)' : 'var(--color-negative)' }}>
              {insights.iqScore}
            </span>
          </div>
        </div>
        <div className="user-avatar">VK</div>
      </div>
    </header>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { insights } = useDateRange()
  return (
    <aside className="sidebar" style={{ height: '100%', overflowY: 'auto', position: 'sticky', top: 48, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 48px)' }}>
      <div className="user-card">
        <div className="user-avatar">VK</div>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>Vinayak K.</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--color-amber-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Trader Plan</div>
        </div>
      </div>

      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          {group.items.map(item => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className={`sidebar-link ${isActive ? 'active' : ''}`}>
                <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.alert && insights.revengeTradeCount > 0 && (
                  <span className="nav-alert-dot" style={{ background: 'var(--color-negative)' }} />
                )}
              </Link>
            )
          })}
        </div>
      ))}

      <div style={{ padding: '1.25rem 1rem 0.5rem' }}>
        <div className="section-header">
          <span className="section-header-text">Quick Stats</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { label: 'Trades', value: String(insights.totalTrades) },
            { label: 'Profit Factor', value: insights.profitFactor.toFixed(2) },
            { label: 'Max Drawdown', value: `₹${insights.maxDrawdown.toLocaleString('en-IN')}` },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="data-label">{s.label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="disclaimer-banner" style={{ margin: '0.5rem', borderRadius: 4 }}>
        For educational use only. Not investment advice.
      </div>
    </aside>
  )
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      <DashboardHeader />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, overflowX: 'hidden', minHeight: 'calc(100vh - 48px)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DateRangeProvider>
      <DashboardInner>{children}</DashboardInner>
    </DateRangeProvider>
  )
}
