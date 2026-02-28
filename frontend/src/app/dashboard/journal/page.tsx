'use client'
import { useDateRange } from '@/context/DateRangeContext'
import { useState, useEffect } from 'react'
import { tradesAPI } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

const EMOTION_EMOJI: Record<string, string> = {
  calm: '😌', confident: '💪', anxious: '😰', frustrated: '😤', bored: '😑', fomo: '🤑',
}

// Normalise a trade from either the mock format or the API format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTrade(t: any) {
  return {
    id: t.id,
    date: t.date ?? t.trade_date?.slice(0, 10),
    instrument: t.instrument,
    segment: t.segment ?? '',
    direction: t.direction ?? '',
    entryTime: t.entryTime ?? t.entry_time?.slice(11, 16) ?? '--:--',
    exitTime: t.exitTime ?? t.exit_time?.slice(11, 16) ?? '--:--',
    pnl: t.pnl ?? t.net_pnl ?? 0,
    emotion: t.emotion ?? '',
    setupRating: t.setupRating ?? t.setup_rating ?? '',
    followedPlan: t.followedPlan ?? t.followed_plan ?? true,
    stopLossMoved: t.stopLossMoved ?? t.stop_loss_moved ?? false,
    reEntryAfterLoss: t.reEntryAfterLoss ?? t.re_entry_after_loss ?? false,
    entryPrice: t.entryPrice ?? t.entry_price ?? 0,
    exitPrice: t.exitPrice ?? t.exit_price ?? 0,
    quantity: t.quantity ?? 0,
    day: t.day ?? new Date(t.date ?? t.trade_date).toLocaleDateString('en-US', { weekday: 'short' }),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TradeRow({ trade }: { trade: any }) {
  const [expanded, setExpanded] = useState(false)
  const t = normalizeTrade(trade)
  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{t.date}</td>
        <td>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{t.instrument}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{t.segment} · {t.direction}</div>
        </td>
        <td className="col-number" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {t.entryTime}–{t.exitTime}
        </td>
        <td className={`col-number ${t.pnl >= 0 ? 'col-positive' : 'col-negative'}`}>
          {t.pnl >= 0 ? '+' : ''}₹{t.pnl.toLocaleString('en-IN')}
        </td>
        <td>
          <span style={{ fontSize: '1rem' }}>{EMOTION_EMOJI[t.emotion] || '😐'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem', textTransform: 'capitalize' }}>{t.emotion || '—'}</span>
        </td>
        <td>
          <span className={`badge ${t.setupRating === 'A' ? 'badge-green' : t.setupRating === 'B' ? 'badge-amber' : 'badge-red'}`}>{t.setupRating || '—'}</span>
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {!t.followedPlan && <span className="badge badge-red" style={{ fontSize: '0.55rem' }}>Off-Plan</span>}
            {t.stopLossMoved && <span className="badge badge-amber" style={{ fontSize: '0.55rem' }}>SL Moved</span>}
            {t.reEntryAfterLoss && <span className="badge badge-red" style={{ fontSize: '0.55rem' }}>Revenge</span>}
            {t.followedPlan && !t.stopLossMoved && !t.reEntryAfterLoss && <span className="badge badge-green" style={{ fontSize: '0.55rem' }}>Clean</span>}
          </div>
        </td>
        <td style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0.75rem', background: 'var(--color-bg-secondary)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              <div><span className="data-label">Entry Price</span><div style={{ color: 'var(--color-text-primary)' }}>₹{t.entryPrice}</div></div>
              <div><span className="data-label">Exit Price</span><div style={{ color: 'var(--color-text-primary)' }}>₹{t.exitPrice}</div></div>
              <div><span className="data-label">Quantity</span><div style={{ color: 'var(--color-text-primary)' }}>{t.quantity}</div></div>
              <div><span className="data-label">Day</span><div style={{ color: 'var(--color-text-primary)' }}>{t.day}</div></div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function JournalPage() {
  const { insights, hasRealData, range } = useDateRange()
  const { isAuthenticated } = useAuth()
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses' | 'revenge' | 'offplan'>('all')
  const [emotionFilter, setEmotionFilter] = useState<string>('all')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [apiTrades, setApiTrades] = useState<any[]>([])
  const [loadingTrades, setLoadingTrades] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !hasRealData) return
    setLoadingTrades(true)
    tradesAPI.list({ limit: 500 })
      .then(res => setApiTrades(res.data.trades ?? res.data.data ?? []))
      .catch(() => setApiTrades([]))
      .finally(() => setLoadingTrades(false))
  }, [isAuthenticated, hasRealData, range])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceTrades: any[] = hasRealData && apiTrades.length > 0 ? apiTrades : []

  const filtered = sourceTrades
    .map(normalizeTrade)
    .filter(t => {
      if (filter === 'wins') return t.pnl > 0
      if (filter === 'losses') return t.pnl < 0
      if (filter === 'revenge') return t.reEntryAfterLoss
      if (filter === 'offplan') return !t.followedPlan
      return true
    })
    .filter(t => emotionFilter === 'all' || t.emotion === emotionFilter)

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Trades', value: insights.totalTrades, cls: 'data-value-amber' },
          { label: 'Wins', value: insights.wins, cls: 'data-value-positive' },
          { label: 'Losses', value: insights.losses, cls: 'data-value-negative' },
          { label: 'Revenge Trades', value: insights.revengeTradeCount, cls: insights.revengeTradeCount > 0 ? 'data-value-negative' : 'data-value-positive' },
          { label: 'Shown', value: filtered.length, cls: 'data-value-amber' },
        ].map(s => (
          <div key={s.label} className="kpi-card">
            <span className="data-label">{s.label}</span>
            <span className={`data-value ${s.cls}`} style={{ fontSize: '1.5rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="data-label" style={{ marginRight: '0.25rem' }}>Filter:</span>
        {(['all', 'wins', 'losses', 'revenge', 'offplan'] as const).map(f => (
          <button key={f} className={`range-pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'offplan' ? 'Off-Plan' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="data-label" style={{ marginLeft: '0.5rem', marginRight: '0.25rem' }}>Emotion:</span>
        {['all', 'calm', 'confident', 'anxious', 'frustrated', 'bored'].map(e => (
          <button key={e} className={`range-pill ${emotionFilter === e ? 'active' : ''}`} onClick={() => setEmotionFilter(e)}>
            {e === 'all' ? 'All' : `${EMOTION_EMOJI[e]} ${e}`}
          </button>
        ))}
      </div>

      {/* Trade Table */}
      <div className="terminal-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Instrument</th>
                <th className="col-number">Time</th>
                <th className="col-number">P&L</th>
                <th>Emotion</th>
                <th>Setup</th>
                <th>Flags</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loadingTrades ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading trades...</td></tr>
              ) : (
                filtered.map(trade => <TradeRow key={trade.id} trade={trade} />)
              )}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            No trades match the current filter.
          </div>
        )}
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
        {!hasRealData
          ? 'Connect a broker or upload trades to see your journal.'
          : `Showing ${filtered.length} of ${sourceTrades.length} trades. Click any row to expand.`}
      </div>
    </div>
  )
}
