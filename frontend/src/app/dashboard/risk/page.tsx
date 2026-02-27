'use client'
import { useDateRange } from '@/context/DateRangeContext'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export default function RiskPage() {
  const { insights } = useDateRange()
  const {
    maxDrawdown, maxDrawdownPct, equityCurve, profitFactor, expectancy,
    avgWin, avgLoss, winRate, totalTrades, mostExpensiveDays, weeklyTrend,
  } = insights

  const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0
  const kellyPct = winRate / 100 - (1 - winRate / 100) / riskRewardRatio
  const kellyDisplay = isFinite(kellyPct) ? (kellyPct * 100).toFixed(1) : 'N/A'

  const drawdownData = equityCurve.map((p, i) => {
    const peak = equityCurve.slice(0, i + 1).reduce((m, x) => Math.max(m, x.cumulative), 0)
    return {
      date: p.date,
      drawdown: peak > 0 ? ((peak - p.cumulative) / peak * 100) : 0,
      cumulative: p.cumulative,
    }
  })

  const worstWeek = weeklyTrend.reduce((w, cur) => cur.pnl < w.pnl ? cur : w, weeklyTrend[0])
  const bestWeek = weeklyTrend.reduce((b, cur) => cur.pnl > b.pnl ? cur : b, weeklyTrend[0])

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Core Risk KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Max Drawdown', value: `₹${maxDrawdown.toLocaleString('en-IN')}`, cls: 'data-value-negative' },
          { label: 'Drawdown %', value: `${maxDrawdownPct.toFixed(1)}%`, cls: maxDrawdownPct > 20 ? 'data-value-negative' : maxDrawdownPct > 10 ? 'data-value-amber' : 'data-value-positive' },
          { label: 'Profit Factor', value: profitFactor.toFixed(2), cls: profitFactor >= 1.5 ? 'data-value-positive' : profitFactor >= 1 ? 'data-value-amber' : 'data-value-negative' },
          { label: 'Risk:Reward', value: riskRewardRatio.toFixed(2), cls: riskRewardRatio >= 1.5 ? 'data-value-positive' : riskRewardRatio >= 1 ? 'data-value-amber' : 'data-value-negative' },
          { label: 'Kelly %', value: `${kellyDisplay}%`, cls: 'data-value-amber' },
        ].map(kpi => (
          <div key={kpi.label} className="kpi-card">
            <span className="data-label">{kpi.label}</span>
            <span className={`data-value ${kpi.cls}`} style={{ fontSize: '1.1rem' }}>{kpi.value}</span>
          </div>
        ))}
      </div>

      {/* Drawdown Curve */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">Drawdown Chart</span></div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={drawdownData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff4d6d" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ff4d6d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `${v.toFixed(0)}%`} />
            <ReferenceLine y={10} stroke="rgba(245,158,11,0.3)" strokeDasharray="4 4" />
            <ReferenceLine y={20} stroke="rgba(255,77,109,0.3)" strokeDasharray="4 4" />
            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Drawdown']} />
            <Area type="monotone" dataKey="drawdown" stroke="#ff4d6d" fill="url(#ddGrad)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 20, height: 1, background: 'rgba(245,158,11,0.5)', borderTop: '1px dashed rgba(245,158,11,0.5)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>10% warning</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <div style={{ width: 20, height: 1, borderTop: '1px dashed rgba(255,77,109,0.5)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>20% danger</span>
          </div>
        </div>
      </div>

      {/* Win/Loss Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Win vs Loss Analysis</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { label: 'Average Win', value: `₹${avgWin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, pct: 100, color: 'var(--color-positive)' },
              { label: 'Average Loss', value: `-₹${avgLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, pct: avgLoss > 0 ? (avgLoss / avgWin) * 100 : 0, color: 'var(--color-negative)' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span className="data-label">{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: item.color, fontWeight: 600 }}>{item.value}</span>
                </div>
                <div className="progress-track" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(100, item.pct)}%`, background: item.color }} />
                </div>
              </div>
            ))}
            <div style={{ padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 3 }}>
              <div className="data-label">Expectancy</div>
              <div className={`data-value-sm ${expectancy >= 0 ? 'data-value-positive' : 'data-value-negative'}`}>
                {expectancy >= 0 ? '+' : ''}₹{expectancy.toFixed(0)} per trade
              </div>
            </div>
          </div>
        </div>

        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Weekly Performance</span></div>
          <table className="terminal-table">
            <thead><tr><th>Week</th><th className="col-number">P&L</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th></tr></thead>
            <tbody>
              {weeklyTrend.map(w => (
                <tr key={w.week} style={{ background: w.week === worstWeek?.week ? 'rgba(255,77,109,0.04)' : w.week === bestWeek?.week ? 'rgba(0,214,143,0.04)' : undefined }}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    {w.week.slice(5)}
                    {w.week === bestWeek?.week && <span className="badge badge-green" style={{ marginLeft: 4, fontSize: '0.55rem' }}>BEST</span>}
                    {w.week === worstWeek?.week && <span className="badge badge-red" style={{ marginLeft: 4, fontSize: '0.55rem' }}>WORST</span>}
                  </td>
                  <td className={`col-number ${w.pnl >= 0 ? 'col-positive' : 'col-negative'}`}>{w.pnl >= 0 ? '+' : ''}₹{w.pnl.toLocaleString('en-IN')}</td>
                  <td className="col-number">{w.trades}</td>
                  <td className="col-number" style={{ color: w.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-secondary)' }}>{w.winRate.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expensive days */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">Most Expensive Days — Root Cause Analysis</span></div>
        <table className="terminal-table">
          <thead><tr><th>Date</th><th className="col-number">P&L</th><th>Behavioral Triggers</th><th>Severity</th></tr></thead>
          <tbody>
            {mostExpensiveDays.map(d => (
              <tr key={d.date}>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{d.date}</td>
                <td className="col-number col-negative">-₹{Math.abs(d.pnl).toLocaleString('en-IN')}</td>
                <td>
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {d.triggers.map(t => <span key={t} className="badge badge-red" style={{ fontSize: '0.6rem' }}>{t}</span>)}
                    {d.triggers.length === 0 && <span className="badge badge-muted">Market conditions</span>}
                  </div>
                </td>
                <td>
                  <span className={`badge ${d.triggers.length >= 2 ? 'badge-red' : 'badge-amber'}`}>
                    {d.triggers.length >= 2 ? 'High' : 'Medium'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
