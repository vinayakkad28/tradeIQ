'use client'
import Link from 'next/link'
import { useDateRange } from '@/context/DateRangeContext'
import { InfoTooltip } from '@/components/InfoTooltip'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'

function fmt(n: number) {
  return (n >= 0 ? '+' : '') + '₹' + Math.abs(n).toLocaleString('en-IN')
}

export default function DashboardOverview() {
  const { insights, hasRealData } = useDateRange()
  const { totalPnl, winRate, expectancy, profitFactor, totalTrades, wins, losses,
    avgWin, avgLoss, maxDrawdown, maxDrawdownPct, equityCurve, primaryInsight,
    iqScore, iqBreakdown, revengeTradeCount, stopLossMovedCount,
    planComplianceRate, boredomTradeCount, mostExpensiveDays, weeklyTrend } = insights

  const pnlPos = totalPnl >= 0
  const isNewUser = !hasRealData

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Getting Started — shown when user has no real trade data */}
      {isNewUser && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(109,43,255,0.12) 0%, rgba(0,214,143,0.06) 100%)',
          border: '1px solid rgba(109,43,255,0.3)',
          borderRadius: 6,
          padding: '2rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem' }}>⚡</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  Welcome to TradeIQ
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '1.25rem', maxWidth: 520 }}>
                No trade data yet. Connect your broker or upload a trade CSV to start tracking real insights — win rate, P&amp;L breakdown, behavioral patterns, and your personalised TradeIQ Score.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link href="/dashboard/brokers" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  ⟳ Connect Broker
                </Link>
                <Link href="/dashboard/upload" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  ↑ Upload CSV
                </Link>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', minWidth: 240 }}>
              {[
                { icon: '📊', label: 'Real P&L Analytics', desc: 'Accurate entry/exit tracking' },
                { icon: '🧠', label: 'Behavioural Flags', desc: 'Revenge trades, SL-moving, more' },
                { icon: '📅', label: 'Daily Sync', desc: 'Auto-import every morning at 6 AM' },
                { icon: '📓', label: 'Trade Journal', desc: 'Tag emotions, setups, notes' },
              ].map(f => (
                <div key={f.label} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 4, padding: '0.625rem 0.75rem' }}>
                  <div style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{f.icon}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{f.label}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: '0.15rem', lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
            All metrics will show zeros until trades are imported · Connect a broker or upload a CSV to get started
          </div>
        </div>
      )}

      {/* Primary Alert — only show when user has real data */}
      {!isNewUser && primaryInsight && primaryInsight.title !== 'No data yet' && (
        <div className="terminal-card-amber pulse-alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span className="badge badge-red">ALERT</span>
              <span className="data-label-amber">{primaryInsight.category.toUpperCase()}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>
              {primaryInsight.title}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', maxWidth: 600 }}>
              {primaryInsight.description}
            </div>
            <div style={{ marginTop: '0.625rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-amber-primary)', borderLeft: '2px solid var(--color-amber-primary)', paddingLeft: '0.5rem' }}>
              Fix: {primaryInsight.actionText}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div className="data-label-amber">ESTIMATED IMPACT</div>
            <div className="data-value-xl data-value-negative">₹{primaryInsight.impactAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{primaryInsight.impactLabel}</div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Net P&L', value: fmt(totalPnl), cls: pnlPos ? 'data-value-positive' : 'data-value-negative', tip: 'Sum of all closed trade P&L in the selected period.' },
          { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, cls: winRate >= 55 ? 'data-value-positive' : 'data-value-amber', tip: '% of trades with positive P&L. Formula: Wins ÷ Total Trades × 100.' },
          { label: 'Expectancy', value: `₹${expectancy.toFixed(0)}`, cls: expectancy >= 0 ? 'data-value-positive' : 'data-value-negative', tip: 'Avg P&L per trade placed repeatedly. Formula: (Win Rate × Avg Win) − (Loss Rate × Avg Loss). Positive = edge.' },
          { label: 'Profit Factor', value: profitFactor.toFixed(2), cls: profitFactor >= 1.5 ? 'data-value-positive' : profitFactor >= 1 ? 'data-value-amber' : 'data-value-negative', tip: 'Gross profit ÷ gross loss. >1.5 is good, >2 is excellent, <1 means net negative.' },
          { label: 'Avg Win', value: `₹${avgWin.toFixed(0)}`, cls: 'data-value-positive', tip: 'Average P&L of winning trades only.' },
          { label: 'Avg Loss', value: `-₹${avgLoss.toFixed(0)}`, cls: 'data-value-negative', tip: 'Average loss magnitude of losing trades. Lower is better.' },
          { label: 'Max Drawdown', value: `₹${maxDrawdown.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: 'data-value-negative', tip: 'Largest peak-to-trough equity drop. Formula: max(peak cumulative P&L − current cumulative P&L).' },
        ].map(kpi => (
          <div key={kpi.label} className="kpi-card">
            <span className="data-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
              {kpi.label}<InfoTooltip text={kpi.tip} />
            </span>
            <span className={`data-value ${kpi.cls}`} style={{ fontSize: '1.1rem' }}>{kpi.value}</span>
          </div>
        ))}
      </div>

      {/* IQ Score + Equity Curve */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: '0.75rem', flexWrap: 'wrap' }}>
        {/* IQ Score */}
        <div className="terminal-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="section-header">
            <span className="section-header-text" style={{ display: 'inline-flex', alignItems: 'center' }}>
              TradeIQ Score<InfoTooltip text="Composite score (0–100): Win Rate 30% + Plan Discipline 30% + Risk Mgmt 20% + Consistency 20%." />
            </span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="data-value-xl" style={{
              color: iqScore >= 70 ? 'var(--color-positive)' : iqScore >= 50 ? 'var(--color-amber-primary)' : 'var(--color-negative)',
              fontSize: '3.5rem'
            }}>{iqScore}</div>
            <div className="data-label" style={{ marginTop: '0.25rem' }}>out of 100</div>
          </div>
          {[
            { label: 'Win Rate', score: iqBreakdown.winRateScore, color: 'var(--color-positive)', tip: 'Win Rate × 1.5, capped at 100. Weight: 30% of IQ Score.' },
            { label: 'Discipline', score: iqBreakdown.disciplineScore, color: 'var(--color-accent-indigo)', tip: '% of trades where you followed your pre-defined plan. Weight: 30% of IQ Score.' },
            { label: 'Risk Mgmt', score: iqBreakdown.riskScore, color: 'var(--color-amber-primary)', tip: '100 if zero SL moves. Penalised 2pts per SL move as % of total trades. Weight: 20%.' },
            { label: 'Consistency', score: iqBreakdown.consistencyScore, color: 'var(--color-accent-cyan)', tip: 'Based on Profit Factor: ≥1.5→100, ≥1.0→70, else 40. Weight: 20% of IQ Score.' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="data-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {item.label}<InfoTooltip text={item.tip} />
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{item.score.toFixed(0)}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${item.score}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Equity Curve */}
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Equity Curve</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={equityCurve} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={pnlPos ? '#00d68f' : '#ff4d6d'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={pnlPos ? '#00d68f' : '#ff4d6d'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#4a4a6a', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}
                labelStyle={{ color: '#8888aa' }}
                formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString('en-IN')}`, 'Cumulative']}
              />
              <Area type="monotone" dataKey="cumulative" stroke={pnlPos ? '#00d68f' : '#ff4d6d'} fill="url(#eqGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Behavioral Flags + Weekly P&L */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {/* Behavioral Flags */}
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Behavioral Flags</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { label: 'Revenge Trades', value: revengeTradeCount, severity: revengeTradeCount > 3 ? 'red' : revengeTradeCount > 0 ? 'amber' : 'green', icon: '⚠', tip: 'Trades entered immediately after a losing trade. Statistically negative expectancy — avoid.' },
              { label: 'SL Moved', value: stopLossMovedCount, severity: stopLossMovedCount > 3 ? 'red' : stopLossMovedCount > 0 ? 'amber' : 'green', icon: '↕', tip: 'Trades where stop loss was adjusted after entry — signals emotional decision-making.' },
              { label: 'Boredom Trades', value: boredomTradeCount, severity: boredomTradeCount > 3 ? 'red' : boredomTradeCount > 0 ? 'amber' : 'green', icon: '⊘', tip: "Trades tagged with 'bored' emotion. Often lack a clear setup and have poor expectancy." },
              { label: 'Plan Compliance', value: `${planComplianceRate.toFixed(0)}%`, severity: planComplianceRate >= 75 ? 'green' : planComplianceRate >= 50 ? 'amber' : 'red', icon: '✓', tip: '% of trades where followed_plan = true. Below 70% indicates reactive, unstructured trading.' },
            ].map(flag => (
              <div key={flag.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--color-bg-secondary)', borderRadius: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{flag.icon}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center' }}>
                    {flag.label}<InfoTooltip text={flag.tip} />
                  </span>
                </div>
                <span className={`badge badge-${flag.severity === 'red' ? 'red' : flag.severity === 'amber' ? 'amber' : 'green'}`}>{flag.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly P&L Bar */}
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Weekly P&L Trend</span></div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyTrend} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="week" tick={{ fill: '#4a4a6a', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false}
                tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fill: '#4a4a6a', fontSize: 9, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}
                formatter={(v: number | undefined) => [`₹${(v ?? 0).toLocaleString('en-IN')}`, 'P&L']}
              />
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {weeklyTrend.map((entry, i) => (
                  <Cell key={i} fill={entry.pnl >= 0 ? '#00d68f' : '#ff4d6d'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Win/Loss summary + Most Expensive Days */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Trade Summary</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { label: 'Total Trades', value: String(totalTrades), color: 'var(--color-text-primary)' },
              { label: 'Wins', value: String(wins), color: 'var(--color-positive)' },
              { label: 'Losses', value: String(losses), color: 'var(--color-negative)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div className="data-label">{s.label}</div>
                <div className="data-value" style={{ color: s.color, fontSize: '1.75rem' }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0' }}>
            <div style={{ height: 6, width: `${winRate}%`, background: 'var(--color-positive)', borderRadius: '2px 0 0 2px', transition: 'width 0.8s ease' }} />
            <div style={{ height: 6, flex: 1, background: 'var(--color-negative)', borderRadius: '0 2px 2px 0' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-positive)' }}>{winRate.toFixed(1)}% wins</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-negative)' }}>{(100 - winRate).toFixed(1)}% losses</span>
          </div>
        </div>

        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Most Expensive Days</span></div>
          <table className="terminal-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="col-number">P&L</th>
                <th>Triggers</th>
              </tr>
            </thead>
            <tbody>
              {mostExpensiveDays.slice(0, 5).map(day => (
                <tr key={day.date}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{day.date}</td>
                  <td className="col-number col-negative">₹{Math.abs(day.pnl).toLocaleString('en-IN')}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {day.triggers.slice(0, 2).map(t => (
                        <span key={t} className="badge badge-red" style={{ fontSize: '0.55rem' }}>{t}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
