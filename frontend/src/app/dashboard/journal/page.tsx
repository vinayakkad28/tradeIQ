'use client'
import { useDateRange } from '@/context/DateRangeContext'
import { Trade } from '@/lib/mockData'
import { useState } from 'react'

const EMOTION_EMOJI: Record<string, string> = {
  calm: '😌', confident: '💪', anxious: '😰', frustrated: '😤', bored: '😑', fomo: '🤑',
}

function TradeRow({ trade }: { trade: Trade }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{trade.date}</td>
        <td>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{trade.instrument}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{trade.segment} · {trade.direction}</div>
        </td>
        <td className="col-number" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {trade.entryTime}–{trade.exitTime}
        </td>
        <td className={`col-number ${trade.pnl >= 0 ? 'col-positive' : 'col-negative'}`}>
          {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toLocaleString('en-IN')}
        </td>
        <td>
          <span style={{ fontSize: '1rem' }}>{EMOTION_EMOJI[trade.emotion] || '😐'}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: '0.25rem', textTransform: 'capitalize' }}>{trade.emotion}</span>
        </td>
        <td>
          <span className={`badge ${trade.setupRating === 'A' ? 'badge-green' : trade.setupRating === 'B' ? 'badge-amber' : 'badge-red'}`}>{trade.setupRating}</span>
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            {!trade.followedPlan && <span className="badge badge-red" style={{ fontSize: '0.55rem' }}>Off-Plan</span>}
            {trade.stopLossMoved && <span className="badge badge-amber" style={{ fontSize: '0.55rem' }}>SL Moved</span>}
            {trade.reEntryAfterLoss && <span className="badge badge-red" style={{ fontSize: '0.55rem' }}>Revenge</span>}
            {trade.followedPlan && !trade.stopLossMoved && !trade.reEntryAfterLoss && <span className="badge badge-green" style={{ fontSize: '0.55rem' }}>Clean</span>}
          </div>
        </td>
        <td style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{expanded ? '▲' : '▼'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: '0.75rem', background: 'var(--color-bg-secondary)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
              <div><span className="data-label">Entry Price</span><div style={{ color: 'var(--color-text-primary)' }}>₹{trade.entryPrice}</div></div>
              <div><span className="data-label">Exit Price</span><div style={{ color: 'var(--color-text-primary)' }}>₹{trade.exitPrice}</div></div>
              <div><span className="data-label">Quantity</span><div style={{ color: 'var(--color-text-primary)' }}>{trade.quantity}</div></div>
              <div><span className="data-label">Day</span><div style={{ color: 'var(--color-text-primary)' }}>{trade.day}</div></div>
            </div>
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-card)', borderRadius: 3 }}>
              <span className="data-label" style={{ display: 'block', marginBottom: '0.25rem' }}>Add Notes</span>
              <textarea className="input-field" placeholder="What did you learn from this trade?" style={{ width: '100%', resize: 'vertical', minHeight: 60, fontSize: '0.75rem' }} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function JournalPage() {
  const { trades, insights } = useDateRange()
  const [filter, setFilter] = useState<'all' | 'wins' | 'losses' | 'revenge' | 'offplan'>('all')
  const [emotionFilter, setEmotionFilter] = useState<string>('all')

  const filtered = trades.filter(t => {
    if (filter === 'wins') return t.pnl > 0
    if (filter === 'losses') return t.pnl < 0
    if (filter === 'revenge') return t.reEntryAfterLoss
    if (filter === 'offplan') return !t.followedPlan
    return true
  }).filter(t => emotionFilter === 'all' || t.emotion === emotionFilter)

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total Trades', value: insights.totalTrades, cls: 'data-value-amber' },
          { label: 'Wins', value: insights.wins, cls: 'data-value-positive' },
          { label: 'Losses', value: insights.losses, cls: 'data-value-negative' },
          { label: 'Revenge Trades', value: insights.revengeTradeCount, cls: insights.revengeTradeCount > 0 ? 'data-value-negative' : 'data-value-positive' },
          { label: 'Off-Plan', value: trades.filter(t => !t.followedPlan).length, cls: 'data-value-amber' },
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
              {filtered.map(trade => <TradeRow key={trade.id} trade={trade} />)}
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
        Showing {filtered.length} of {trades.length} trades. Click any row to expand and add notes.
      </div>
    </div>
  )
}
