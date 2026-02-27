'use client'
import { useDateRange } from '@/context/DateRangeContext'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

export default function BehavioralPage() {
  const { insights } = useDateRange()
  const {
    revengeTradeCount, revengeTradeWinRate, normalTradeWinRate, revengeTradePnl, revengeCost,
    revengeAsPercentOfLosses, avgTradesPerDay, maxTradesInDay, overtradingDays,
    stopLossMovedCount, stopLossMovedAvgPnl, stopLossHeldAvgPnl, stopLossMovingCost,
    boredomTradeCount, boredomTradeWinRate, boredomTradePnl, planComplianceRate,
    plannedTradeWinRate, unplannedTradeWinRate, complianceCost, emotionBreakdown,
    bestSelfAvgPnl, overallAvgPnl, bestSelfMultiplier,
  } = insights

  const comparisonData = [
    { name: 'Planned', winRate: plannedTradeWinRate, fill: '#00d68f' },
    { name: 'Unplanned', winRate: unplannedTradeWinRate, fill: '#ff4d6d' },
    { name: 'Revenge', winRate: revengeTradeWinRate, fill: '#ff4d6d' },
    { name: 'Calm', winRate: emotionBreakdown.find(e => e.emotion === 'calm')?.winRate || 0, fill: '#00d68f' },
    { name: 'Boredom', winRate: boredomTradeWinRate, fill: '#f59e0b' },
  ]

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Section: Revenge Trading */}
      <div>
        <div className="section-header"><span className="section-header-text">Revenge Trading</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="terminal-card-amber">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                { label: 'Revenge Trades', value: revengeTradeCount, cls: revengeTradeCount > 0 ? 'data-value-negative' : 'data-value-positive' },
                { label: 'Win Rate', value: `${revengeTradeWinRate.toFixed(0)}%`, cls: 'data-value-negative' },
                { label: 'Total Cost', value: `₹${revengeCost.toLocaleString('en-IN')}`, cls: 'data-value-negative' },
              ].map(m => (
                <div key={m.label}>
                  <div className="data-label-amber">{m.label}</div>
                  <div className={`data-value ${m.cls}`} style={{ fontSize: '1.25rem' }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '0.625rem', background: 'rgba(255,77,109,0.08)', borderRadius: 3, borderLeft: '2px solid var(--color-negative)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Normal trade win rate: <span style={{ color: 'var(--color-positive)' }}>{normalTradeWinRate.toFixed(0)}%</span>
                {' '}vs revenge: <span style={{ color: 'var(--color-negative)' }}>{revengeTradeWinRate.toFixed(0)}%</span>.
                {' '}{revengeAsPercentOfLosses.toFixed(0)}% of your total losses are from revenge trades.
              </span>
            </div>
          </div>

          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Win Rate Comparison</span></div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={comparisonData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(0)}%`, 'Win Rate']} />
                <Bar dataKey="winRate" radius={[2,2,0,0]}>
                  {comparisonData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section: Overtrading */}
      <div>
        <div className="section-header"><span className="section-header-text">Overtrading Analysis</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {[
            { label: 'Avg Trades/Day', value: avgTradesPerDay.toFixed(1), cls: avgTradesPerDay > 3 ? 'data-value-negative' : 'data-value-amber' },
            { label: 'Max in One Day', value: String(maxTradesInDay), cls: maxTradesInDay > 5 ? 'data-value-negative' : 'data-value-amber' },
            { label: 'Overtrading Days', value: String(overtradingDays), cls: overtradingDays > 2 ? 'data-value-negative' : overtradingDays > 0 ? 'data-value-amber' : 'data-value-positive' },
          ].map(m => (
            <div key={m.label} className="kpi-card">
              <span className="data-label">{m.label}</span>
              <span className={`data-value ${m.cls}`} style={{ fontSize: '1.25rem' }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section: Stop-Loss Discipline */}
      <div>
        <div className="section-header"><span className="section-header-text">Stop-Loss Discipline</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="terminal-card">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {[
                { label: 'SL Moved', value: String(stopLossMovedCount), cls: stopLossMovedCount > 0 ? 'data-value-negative' : 'data-value-positive' },
                { label: 'Avg P&L (moved)', value: `₹${stopLossMovedAvgPnl.toFixed(0)}`, cls: stopLossMovedAvgPnl >= 0 ? 'data-value-positive' : 'data-value-negative' },
                { label: 'Avg P&L (held)', value: `₹${stopLossHeldAvgPnl.toFixed(0)}`, cls: stopLossHeldAvgPnl >= 0 ? 'data-value-positive' : 'data-value-negative' },
              ].map(m => (
                <div key={m.label}>
                  <div className="data-label">{m.label}</div>
                  <div className={`data-value-sm ${m.cls}`}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '1rem', padding: '0.625rem', background: 'var(--color-bg-secondary)', borderRadius: 3 }}>
              <span className="data-label">Total cost of moving stop-losses: </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: stopLossMovingCost > 0 ? 'var(--color-negative)' : 'var(--color-positive)', fontWeight: 700 }}>
                ₹{Math.abs(stopLossMovingCost).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">SL Held vs Moved</span></div>
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={[
                { name: 'SL Held', avgPnl: stopLossHeldAvgPnl },
                { name: 'SL Moved', avgPnl: stopLossMovedAvgPnl },
              ]} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${v}`} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }} formatter={(v: number | undefined) => [`₹${(v ?? 0).toFixed(0)}`, 'Avg P&L']} />
                <Bar dataKey="avgPnl" radius={[2,2,0,0]}>
                  <Cell fill="#00d68f" fillOpacity={0.8} />
                  <Cell fill="#ff4d6d" fillOpacity={0.8} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Section: Emotion Breakdown */}
      <div>
        <div className="section-header"><span className="section-header-text">Emotion vs Performance</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {emotionBreakdown.map(e => (
            <div key={e.emotion} className="kpi-card" style={{ borderLeft: e.avgPnl >= 0 ? '3px solid var(--color-positive)' : '3px solid var(--color-negative)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{e.emoji}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{e.emotion}</div>
                  <div className="data-label">{e.tradeCount} trades</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div>
                  <div className="data-label">Win Rate</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: e.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-negative)', fontWeight: 600 }}>{e.winRate.toFixed(0)}%</div>
                </div>
                <div>
                  <div className="data-label">Avg P&L</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: e.avgPnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)', fontWeight: 600 }}>₹{e.avgPnl.toFixed(0)}</div>
                </div>
              </div>
              <div className="progress-track" style={{ marginTop: '0.5rem' }}>
                <div className="progress-fill" style={{ width: `${e.winRate}%`, background: e.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-negative)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Best Self */}
      <div className="terminal-card-amber">
        <div className="section-header"><span className="section-header-text">Your Best Self Analysis</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div>
            <div className="data-label-amber">Overall Avg P&L</div>
            <div className={`data-value ${overallAvgPnl >= 0 ? 'data-value-positive' : 'data-value-negative'}`}>₹{overallAvgPnl.toFixed(0)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>per trade average</div>
          </div>
          <div>
            <div className="data-label-amber">Best Self Avg P&L</div>
            <div className="data-value data-value-amber">₹{bestSelfAvgPnl.toFixed(0)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>calm + A-setup + planned</div>
          </div>
          <div>
            <div className="data-label-amber">Multiplier</div>
            <div className="data-value data-value-amber">{bestSelfMultiplier.toFixed(1)}×</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>when trading at your best</div>
          </div>
        </div>
      </div>

      {/* Plan Compliance */}
      <div>
        <div className="section-header"><span className="section-header-text">Plan Compliance</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
          <div className="kpi-card">
            <span className="data-label">Compliance Rate</span>
            <span className={`data-value-xl ${planComplianceRate >= 75 ? 'data-value-positive' : planComplianceRate >= 50 ? 'data-value-amber' : 'data-value-negative'}`}>
              {planComplianceRate.toFixed(0)}%
            </span>
            <div className="progress-track" style={{ marginTop: '0.5rem' }}>
              <div className="progress-fill" style={{ width: `${planComplianceRate}%`, background: planComplianceRate >= 75 ? 'var(--color-positive)' : planComplianceRate >= 50 ? 'var(--color-amber-primary)' : 'var(--color-negative)' }} />
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
              Unplanned trade cost: ₹{complianceCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="terminal-card">
            <table className="terminal-table">
              <thead><tr><th>Trade Type</th><th className="col-number">Win Rate</th><th className="col-number">Delta</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span className="badge badge-green">Planned</span></td>
                  <td className="col-number col-positive">{plannedTradeWinRate.toFixed(0)}%</td>
                  <td className="col-number col-positive">Baseline</td>
                </tr>
                <tr>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span className="badge badge-red">Unplanned</span></td>
                  <td className="col-number col-negative">{unplannedTradeWinRate.toFixed(0)}%</td>
                  <td className="col-number col-negative">-{(plannedTradeWinRate - unplannedTradeWinRate).toFixed(0)} pts</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
