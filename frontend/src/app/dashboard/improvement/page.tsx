'use client'
import { useDateRange } from '@/context/DateRangeContext'

export default function ImprovementPage() {
  const { insights } = useDateRange()
  const { allInsights, iqScore, iqBreakdown, planComplianceRate, revengeTradeCount,
    stopLossMovedCount, boredomTradeCount, morningEdge, afternoonCost, edgeZoneLabel } = insights

  const rules = [
    {
      rule: 'Trade only 09:00–12:30',
      rationale: `Your morning edge = ₹${morningEdge.toLocaleString('en-IN')}. Afternoon sessions = ₹${afternoonCost.toLocaleString('en-IN')}.`,
      impact: Math.abs(afternoonCost),
      status: afternoonCost < -500 ? 'critical' : 'ok',
    },
    {
      rule: '15-min cooling off after any loss',
      rationale: `You had ${revengeTradeCount} revenge trades. Revenge trade win rate is ${insights.revengeTradeWinRate.toFixed(0)}% vs ${insights.normalTradeWinRate.toFixed(0)}% normally.`,
      impact: insights.revengeCost,
      status: revengeTradeCount > 2 ? 'critical' : revengeTradeCount > 0 ? 'warning' : 'ok',
    },
    {
      rule: 'Never move your stop-loss wider',
      rationale: `${stopLossMovedCount} SL moves detected. Cost: ₹${insights.stopLossMovingCost.toFixed(0)}.`,
      impact: Math.max(0, insights.stopLossMovingCost),
      status: stopLossMovedCount > 2 ? 'critical' : stopLossMovedCount > 0 ? 'warning' : 'ok',
    },
    {
      rule: `Trade only ${edgeZoneLabel} duration setups`,
      rationale: `This holding window has the highest win rate. Deviating erodes your edge.`,
      impact: 0,
      status: 'ok',
    },
    {
      rule: 'Write setup reason before every trade',
      rationale: `Plan compliance: ${planComplianceRate.toFixed(0)}%. Unplanned trades cost ₹${insights.complianceCost.toFixed(0)}.`,
      impact: insights.complianceCost,
      status: planComplianceRate < 60 ? 'critical' : planComplianceRate < 80 ? 'warning' : 'ok',
    },
    {
      rule: 'Stop trading when feeling bored',
      rationale: `${boredomTradeCount} boredom trades found. Win rate: ${insights.boredomTradeWinRate.toFixed(0)}%.`,
      impact: Math.abs(insights.boredomTradePnl),
      status: boredomTradeCount > 3 ? 'critical' : boredomTradeCount > 0 ? 'warning' : 'ok',
    },
  ]

  const statusColor = (s: string) => s === 'critical' ? 'var(--color-negative)' : s === 'warning' ? 'var(--color-amber-primary)' : 'var(--color-positive)'
  const statusBadge = (s: string) => s === 'critical' ? 'badge-red' : s === 'warning' ? 'badge-amber' : 'badge-green'
  const statusLabel = (s: string) => s === 'critical' ? 'CRITICAL' : s === 'warning' ? 'IMPROVE' : 'PASSING'

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* IQ Score Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '1rem' }}>
        <div className="terminal-card-amber" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <div className="data-label-amber">Overall TradeIQ Score</div>
          <div className="data-value-xl" style={{
            fontSize: '4rem',
            color: iqScore >= 70 ? 'var(--color-positive)' : iqScore >= 50 ? 'var(--color-amber-primary)' : 'var(--color-negative)'
          }}>{iqScore}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {iqScore >= 70 ? 'Strong trader' : iqScore >= 50 ? 'Developing trader' : 'Needs work'}
          </div>
        </div>
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">Score Breakdown</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Win Rate (30%)', score: iqBreakdown.winRateScore, color: 'var(--color-positive)', weight: 0.30 },
              { label: 'Discipline (30%)', score: iqBreakdown.disciplineScore, color: 'var(--color-accent-indigo)', weight: 0.30 },
              { label: 'Risk Management (20%)', score: iqBreakdown.riskScore, color: 'var(--color-amber-primary)', weight: 0.20 },
              { label: 'Consistency (20%)', score: iqBreakdown.consistencyScore, color: 'var(--color-accent-cyan)', weight: 0.20 },
            ].map(item => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span className="data-label">{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: item.color, fontWeight: 700 }}>{item.score.toFixed(0)}/100</span>
                </div>
                <div className="progress-track" style={{ height: 5 }}>
                  <div className="progress-fill" style={{ width: `${item.score}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority Insights */}
      <div>
        <div className="section-header"><span className="section-header-text">Priority Improvements (by Impact)</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {allInsights.map((insight, i) => (
            <div key={insight.title} className="terminal-card" style={{ borderLeft: `3px solid ${insight.severity === 'critical' ? 'var(--color-negative)' : insight.severity === 'warning' ? 'var(--color-amber-primary)' : 'var(--color-positive)'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>#{i + 1}</span>
                    <span className={`badge ${insight.severity === 'critical' ? 'badge-red' : insight.severity === 'warning' ? 'badge-amber' : 'badge-green'}`}>
                      {insight.severity.toUpperCase()}
                    </span>
                    <span className="badge badge-muted">{insight.category.toUpperCase()}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>{insight.title}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>{insight.description}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-amber-primary)', borderLeft: '2px solid var(--color-amber-primary)', paddingLeft: '0.5rem' }}>
                    Action: {insight.actionText}
                  </div>
                </div>
                {insight.impactAmount > 0 && (
                  <div style={{ textAlign: 'right', marginLeft: '1rem', flexShrink: 0 }}>
                    <div className="data-label">Recoverable</div>
                    <div className="data-value data-value-negative" style={{ fontSize: '1.1rem' }}>₹{insight.impactAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trading Rules Checklist */}
      <div>
        <div className="section-header"><span className="section-header-text">Your Personal Trading Rules</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rules.map((rule, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.875rem 1rem',
              background: 'var(--color-bg-card)', border: '1px solid',
              borderColor: rule.status === 'ok' ? 'rgba(0,214,143,0.15)' : rule.status === 'critical' ? 'rgba(255,77,109,0.2)' : 'rgba(245,158,11,0.2)',
              borderRadius: 4,
            }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: statusColor(rule.status), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <span style={{ fontSize: '0.6rem', color: '#000', fontWeight: 800 }}>
                  {rule.status === 'ok' ? '✓' : rule.status === 'critical' ? '✕' : '!'}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{rule.rule}</span>
                  <span className={`badge ${statusBadge(rule.status)}`}>{statusLabel(rule.status)}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>{rule.rationale}</div>
              </div>
              {rule.impact > 100 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="data-label">Impact</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-negative)', fontWeight: 700 }}>₹{rule.impact.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
