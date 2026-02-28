'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { DateRangeProvider, useDateRange, DateRange } from '@/context/DateRangeContext'
import { useAuth } from '@/context/AuthContext'

const NAV_GROUPS = [
  {
    label: 'Analytics',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '◈' },
      { href: '/dashboard/performance', label: 'Performance', icon: '◎' },
      { href: '/dashboard/behavioral', label: 'Behavioral', icon: '◉', alert: true },
      { href: '/dashboard/risk', label: 'Risk', icon: '◐' },
      { href: '/dashboard/heatmap', label: 'Heatmap', icon: '▦' },
    ],
  },
  {
    label: 'Market',
    items: [
      { href: '/dashboard/market', label: 'Market Overview', icon: '◉' },
    ],
  },
  {
    label: 'Improvement',
    items: [
      { href: '/dashboard/improvement', label: 'Action Plan', icon: '◆' },
      { href: '/dashboard/journal', label: 'Trade Journal', icon: '◇' },
      { href: '/dashboard/report', label: 'Weekly Report', icon: '◈' },
      { href: '/dashboard/alerts', label: 'Alerts', icon: '◎' },
    ],
  },
  {
    label: 'Data',
    items: [
      { href: '/dashboard/upload', label: 'Import Trades', icon: '↑' },
      { href: '/dashboard/brokers', label: 'Brokers', icon: '⇌' },
      { href: '/dashboard/tax', label: 'Tax Calculator', icon: '₹' },
      { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
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
  const { range, setRange, insights, isLoading, hasRealData } = useDateRange()
  const { user, logout } = useAuth()
  const router = useRouter()
  const pnlPos = insights.totalPnl >= 0

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  // Initials from name or email
  const initials = user
    ? (user.full_name
        ? user.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : user.email.slice(0, 2).toUpperCase())
    : 'DM'

  return (
    <header className="dashboard-header" style={{ justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-amber-primary)', letterSpacing: '-0.01em' }}>
          TRADE<span style={{ color: 'var(--color-text-primary)' }}>IQ</span>
        </span>
        {!hasRealData && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-amber-dim)', background: 'rgba(245,158,11,0.08)', padding: '0.15rem 0.4rem', borderRadius: 3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            No Data
          </span>
        )}
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
        {isLoading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Loading...
          </div>
        ) : (
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
        )}
        <div
          className="user-avatar"
          title={user ? `${user.full_name || user.email} · ${user.plan} plan · Sign out` : 'Demo mode'}
          onClick={user ? handleLogout : undefined}
          style={{ cursor: user ? 'pointer' : 'default', userSelect: 'none' }}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const { insights, hasRealData } = useDateRange()
  const { user } = useAuth()

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Demo User'
  const planLabel = user?.plan ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1) + ' Plan' : 'Demo Mode'

  return (
    <aside className="sidebar" style={{ height: '100%', overflowY: 'auto', position: 'sticky', top: 48, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 48px)' }}>
      <div className="user-card">
        <div className="user-avatar">{displayName.slice(0, 2).toUpperCase()}</div>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>{displayName}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--color-amber-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{planLabel}</div>
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

      {!hasRealData && (
        <div style={{ margin: '0.5rem', padding: '0.625rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 4 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-amber-primary)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Demo Data</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
            Upload a CSV or connect a broker to see your real analytics.
          </div>
          <Link href="/dashboard/upload" style={{ display: 'block', marginTop: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-amber-primary)', textDecoration: 'none' }}>
            Import trades →
          </Link>
        </div>
      )}

      <div className="disclaimer-banner" style={{ margin: '0.5rem', borderRadius: 4 }}>
        For educational use only. Not investment advice.
      </div>
    </aside>
  )
}

function SessionGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Only redirect if auth has finished loading and user is not authenticated
    // We allow unauthenticated users to see the dashboard in demo mode
    // (they can click "Demo (no login)" from login page)
    if (!isLoading && !isAuthenticated) {
      // Don't redirect — allow demo mode
      // If you want strict auth, uncomment:
      // router.push('/login')
    }
  }, [isAuthenticated, isLoading, router])

  return <>{children}</>
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
    <SessionGuard>
      <DateRangeProvider>
        <DashboardInner>{children}</DashboardInner>
      </DateRangeProvider>
    </SessionGuard>
  )
}
