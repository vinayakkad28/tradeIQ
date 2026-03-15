'use client'
import { useDateRange } from '@/context/DateRangeContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'

export default function PerformancePage() {
  const { insights } = useDateRange()
  const {
    pnlByHour, pnlByDay, morningEdge, afternoonCost, bestHour, worstHour,
    holdingBuckets, edgeZoneLabel, segmentBreakdown, instrumentBreakdown,
    setupBreakdown, bestWindowCounterfactual,
  } = insights

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div>
        <div className="section-header"><span className="section-header-text">Time Performance Analysis</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Morning Edge (<10:00)', value: `₹${morningEdge.toLocaleString('en-IN')}`, pos: morningEdge >= 0 },
            { label: 'Afternoon Cost (>14:00)', value: `₹${Math.abs(afternoonCost).toLocaleString('en-IN')}`, pos: afternoonCost >= 0, suffix: afternoonCost < 0 ? ' cost' : ' gain' },
            { label: 'Best Hour', value: `${String(bestHour).padStart(2,'0')}:00`, pos: true },
            { label: 'Worst Hour', value: `${String(worstHour).padStart(2,'0')}:00`, pos: false },
          ].map(kpi => (
            <div key={kpi.label} className="kpi-card">
              <span className="data-label">{kpi.label}</span>
              <span className={`data-value ${kpi.pos ? 'data-value-positive' : 'data-value-negative'}`} style={{ fontSize: '1.1rem' }}>
                {kpi.value}{kpi.suffix || ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly P&L */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">P&L by Hour</span></div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pnlByHour} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }}
              formatter={(v: number | undefined, name: string | undefined) => [`₹${(v ?? 0).toLocaleString('en-IN')}`, name ?? '']}
            />
            <Bar dataKey="totalPnl" radius={[2, 2, 0, 0]}>
              {pnlByHour.map((h, i) => (
                <Cell key={i} fill={h.totalPnl >= 0 ? '#00d68f' : '#ff4d6d'} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: '0.75rem' }}>
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Hour</th>
                <th className="col-number">Trades</th>
                <th className="col-number">Win Rate</th>
                <th className="col-number">Avg P&L</th>
                <th className="col-number">Total P&L</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {pnlByHour.map(h => (
                <tr key={h.hour}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{h.label}</td>
                  <td className="col-number">{h.tradeCount}</td>
                  <td className="col-number" style={{ color: h.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-secondary)' }}>{h.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${h.avgPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{h.avgPnl.toFixed(0)}</td>
                  <td className={`col-number ${h.totalPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{h.totalPnl.toLocaleString('en-IN')}</td>
                  <td>
                    <span className={`badge ${h.verdict === 'Edge Window' ? 'badge-green' : h.verdict === 'Marginal' ? 'badge-amber' : 'badge-red'}`}>
                      {h.verdict}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Day of Week + Counterfactual */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">P&L by Day of Week</span></div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={pnlByDay} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{ fill: '#4a4a6a', fontSize: 11, fontFamily: 'monospace' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 11 }} formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString('en-IN')}`, 'P&L']} />
              <Bar dataKey="totalPnl" radius={[2,2,0,0]}>
                {pnlByDay.map((d, i) => <Cell key={i} fill={d.totalPnl >= 0 ? '#00d68f' : '#ff4d6d'} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="terminal-card-amber">
          <div className="section-header"><span className="section-header-text">Best Window Counterfactual</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <div className="data-label-amber">If you traded only</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-amber-primary)' }}>{bestWindowCounterfactual.windowLabel}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <div className="data-label">Actual P&L</div>
                <div className={`data-value-sm ${bestWindowCounterfactual.totalPnl >= 0 ? 'data-value-positive' : 'data-value-negative'}`}>
                  ₹{bestWindowCounterfactual.totalPnl.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="data-label">Window P&L</div>
                <div className="data-value-sm data-value-amber">₹{bestWindowCounterfactual.bestWindowPnl.toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border-amber)', paddingTop: '0.75rem' }}>
              <div className="data-label-amber">Potential Improvement</div>
              <div className={`data-value ${bestWindowCounterfactual.gain >= 0 ? 'data-value-positive' : 'data-value-negative'}`}>
                {bestWindowCounterfactual.gain >= 0 ? '+' : ''}₹{Math.abs(bestWindowCounterfactual.gain).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Holding Duration */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">Holding Duration Analysis</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {holdingBuckets.map(b => (
            <div key={b.label} className={`kpi-card ${b.isEdgeZone ? 'positive' : ''}`} style={{ border: b.isEdgeZone ? '1px solid var(--color-positive)' : undefined }}>
              {b.isEdgeZone && <span className="badge badge-green" style={{ marginBottom: '0.25rem' }}>EDGE ZONE</span>}
              <span className="data-label">{b.label}</span>
              <span className="data-value" style={{ fontSize: '1.1rem' }}>{b.tradeCount} trades</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: b.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>{b.winRate.toFixed(0)}% WR</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: b.avgPnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>₹{b.avgPnl.toFixed(0)} avg</span>
              </div>
              <div className="progress-track" style={{ marginTop: '0.375rem' }}>
                <div className="progress-fill progress-fill-amber" style={{ width: `${b.pct}%` }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{b.pct.toFixed(0)}% of trades</span>
            </div>
          ))}
        </div>
      </div>

      {/* Segment + Setup */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">By Segment</span></div>
          <table className="terminal-table">
            <thead><tr><th>Segment</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th><th className="col-number">Avg P&L</th><th className="col-number">Total P&L</th></tr></thead>
            <tbody>
              {segmentBreakdown.map(s => (
                <tr key={s.segment}>
                  <td><span className="badge badge-indigo">{s.segment}</span></td>
                  <td className="col-number">{s.tradeCount}</td>
                  <td className="col-number" style={{ color: s.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-secondary)' }}>{s.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${s.avgPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{s.avgPnl.toFixed(0)}</td>
                  <td className={`col-number ${s.totalPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{s.totalPnl.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">By Setup Rating</span></div>
          <table className="terminal-table">
            <thead><tr><th>Rating</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th><th className="col-number">Avg P&L</th><th className="col-number">Total P&L</th></tr></thead>
            <tbody>
              {setupBreakdown.map(s => (
                <tr key={s.rating}>
                  <td><span className={`badge ${s.rating === 'A' ? 'badge-green' : s.rating === 'B' ? 'badge-amber' : 'badge-red'}`}>{s.rating}-Setup</span></td>
                  <td className="col-number">{s.tradeCount}</td>
                  <td className="col-number" style={{ color: s.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-secondary)' }}>{s.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${s.avgPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{s.avgPnl.toFixed(0)}</td>
                  <td className={`col-number ${s.totalPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{s.totalPnl.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instrument breakdown */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">By Instrument</span></div>
        <table className="terminal-table">
          <thead><tr><th>Instrument</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th><th className="col-number">Avg P&L</th><th className="col-number">Total P&L</th><th>Share</th></tr></thead>
          <tbody>
            {instrumentBreakdown.map(inst => {
              const totalPnlAbs = Math.abs(insights.totalPnl) || 1
              const share = Math.abs(inst.totalPnl) / (instrumentBreakdown.reduce((s, i) => s + Math.abs(i.totalPnl), 0) || 1) * 100
              return (
                <tr key={inst.instrument}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{inst.instrument}</td>
                  <td className="col-number">{inst.tradeCount}</td>
                  <td className="col-number" style={{ color: inst.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-text-secondary)' }}>{inst.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${inst.avgPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{inst.avgPnl.toFixed(0)}</td>
                  <td className={`col-number ${inst.totalPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{inst.totalPnl.toLocaleString('en-IN')}</td>
                  <td style={{ minWidth: 80 }}>
                    <div className="progress-track"><div className="progress-fill progress-fill-amber" style={{ width: `${share}%` }} /></div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{share.toFixed(0)}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
