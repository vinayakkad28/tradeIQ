'use client'
import { useDateRange } from '@/context/DateRangeContext'

export default function ReportPage() {
  const { insights } = useDateRange()
  const {
    totalPnl, winRate, totalTrades, wins, losses, expectancy, profitFactor,
    maxDrawdown, allInsights, planComplianceRate, revengeTradeCount,
    stopLossMovedCount, boredomTradeCount, emotionBreakdown, setupBreakdown,
    weeklyTrend, iqScore, bestSelfAvgPnl, overallAvgPnl,
  } = insights

  const pnlPos = totalPnl >= 0
  const topInsight = allInsights[0]
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="section-header-text" style={{ fontFamily: 'var(--font-mono)' }}>WEEKLY TRADING PERFORMANCE REPORT</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Generated: {date} · Vinayak K. · Trader Plan</div>
        </div>
        <button className="btn-primary no-print" onClick={() => window.print()}>↓ Print / Export PDF</button>
      </div>

      {/* Header Summary */}
      <div className="terminal-card-amber print-report">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
          {[
            { label: 'Net P&L', value: `${pnlPos ? '+' : ''}₹${totalPnl.toLocaleString('en-IN')}`, cls: pnlPos ? 'data-value-positive' : 'data-value-negative' },
            { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, cls: 'data-value-amber' },
            { label: 'Total Trades', value: String(totalTrades), cls: 'data-value-amber' },
            { label: 'Profit Factor', value: profitFactor.toFixed(2), cls: profitFactor >= 1.5 ? 'data-value-positive' : 'data-value-amber' },
            { label: 'Expectancy', value: `₹${expectancy.toFixed(0)}`, cls: expectancy >= 0 ? 'data-value-positive' : 'data-value-negative' },
            { label: 'TradeIQ Score', value: String(iqScore), cls: iqScore >= 70 ? 'data-value-positive' : iqScore >= 50 ? 'data-value-amber' : 'data-value-negative' },
          ].map(m => (
            <div key={m.label}>
              <div className="data-label-amber">{m.label}</div>
              <div className={`data-value ${m.cls}`} style={{ fontSize: '1.25rem' }}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Insight */}
      {topInsight && (
        <div>
          <div className="section-header"><span className="section-header-text">Top Priority This Week</span></div>
          <div className="terminal-card" style={{ borderLeft: '3px solid var(--color-negative)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>{topInsight.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{topInsight.description}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-amber-primary)', borderLeft: '2px solid var(--color-amber-primary)', paddingLeft: '0.5rem' }}>
                  Next week action: {topInsight.actionText}
                </div>
              </div>
              {topInsight.impactAmount > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="data-label">Recoverable</div>
                  <div className="data-value data-value-negative" style={{ fontSize: '1.5rem' }}>₹{topInsight.impactAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Behavioral Scorecard */}
      <div>
        <div className="section-header"><span className="section-header-text">Behavioral Scorecard</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
          {[
            {
              label: 'Plan Compliance',
              value: `${planComplianceRate.toFixed(0)}%`,
              target: '≥ 80%',
              pass: planComplianceRate >= 80,
              delta: planComplianceRate - 80,
            },
            {
              label: 'Revenge Trades',
              value: String(revengeTradeCount),
              target: '0',
              pass: revengeTradeCount === 0,
              delta: -revengeTradeCount,
            },
            {
              label: 'SL Discipline',
              value: String(stopLossMovedCount),
              target: '0 moves',
              pass: stopLossMovedCount === 0,
              delta: -stopLossMovedCount,
            },
            {
              label: 'Boredom Trades',
              value: String(boredomTradeCount),
              target: '0',
              pass: boredomTradeCount === 0,
              delta: -boredomTradeCount,
            },
          ].map(item => (
            <div key={item.label} className={`kpi-card ${item.pass ? 'positive' : 'alert'}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="data-label">{item.label}</span>
                <span className={`badge ${item.pass ? 'badge-green' : 'badge-red'}`}>{item.pass ? 'PASS' : 'FAIL'}</span>
              </div>
              <div className={`data-value ${item.pass ? 'data-value-positive' : 'data-value-negative'}`} style={{ fontSize: '1.5rem' }}>{item.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Target: {item.target}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Emotion + Setup Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Emotion Performance</span></div>
          <table className="terminal-table">
            <thead><tr><th>Emotion</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th><th className="col-number">Avg P&L</th></tr></thead>
            <tbody>
              {emotionBreakdown.map(e => (
                <tr key={e.emotion}>
                  <td>{e.emoji} <span style={{ textTransform: 'capitalize' }}>{e.emotion}</span></td>
                  <td className="col-number">{e.tradeCount}</td>
                  <td className="col-number" style={{ color: e.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{e.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${e.avgPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{e.avgPnl.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Setup Quality</span></div>
          <table className="terminal-table">
            <thead><tr><th>Rating</th><th className="col-number">Trades</th><th className="col-number">Win Rate</th><th className="col-number">Total P&L</th></tr></thead>
            <tbody>
              {setupBreakdown.map(s => (
                <tr key={s.rating}>
                  <td><span className={`badge ${s.rating === 'A' ? 'badge-green' : s.rating === 'B' ? 'badge-amber' : 'badge-red'}`}>{s.rating}-Setup</span></td>
                  <td className="col-number">{s.tradeCount}</td>
                  <td className="col-number" style={{ color: s.winRate >= 55 ? 'var(--color-positive)' : 'var(--color-negative)' }}>{s.winRate.toFixed(0)}%</td>
                  <td className={`col-number ${s.totalPnl >= 0 ? 'col-positive' : 'col-negative'}`}>₹{s.totalPnl.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Best Self */}
      <div className="terminal-card-amber">
        <div className="section-header"><span className="section-header-text">Best Self Projection</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div>
            <div className="data-label-amber">Overall Avg P&L / Trade</div>
            <div className={`data-value ${overallAvgPnl >= 0 ? 'data-value-positive' : 'data-value-negative'}`}>₹{overallAvgPnl.toFixed(0)}</div>
          </div>
          <div>
            <div className="data-label-amber">Best Self Avg P&L / Trade</div>
            <div className="data-value data-value-amber">₹{bestSelfAvgPnl.toFixed(0)}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>calm + A-setup + planned</div>
          </div>
          <div>
            <div className="data-label-amber">Unlocked Potential (Monthly)</div>
            <div className="data-value data-value-amber">₹{((bestSelfAvgPnl - overallAvgPnl) * totalTrades).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>if all trades were at best self</div>
          </div>
        </div>
      </div>

      <div className="disclaimer-banner" style={{ borderRadius: 4, border: '1px solid var(--color-border-amber)' }}>
        THIS REPORT IS FOR SELF-IMPROVEMENT PURPOSES ONLY — NOT INVESTMENT ADVICE — PAST PERFORMANCE DOES NOT GUARANTEE FUTURE RESULTS — SEBI REGISTRATION NOT HELD
      </div>
    </div>
  )
}
