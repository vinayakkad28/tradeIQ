'use client'
import { useState, useEffect } from 'react'
import { analyticsAPI } from '@/lib/api'
import { useDateRange } from '@/context/DateRangeContext'

type Cell = { label: string; pnl: number; trades: number; avgPnl: number }

const HOURS = ['09', '10', '11', '12', '13', '14', '15']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

// Color scale: red → white → green
function pnlColor(pnl: number, maxAbs: number): string {
  if (maxAbs === 0) return 'rgba(255,255,255,0.05)'
  const ratio = Math.min(1, Math.abs(pnl) / maxAbs)
  if (pnl > 0) return `rgba(0,214,143,${0.15 + ratio * 0.65})`
  if (pnl < 0) return `rgba(255,77,109,${0.15 + ratio * 0.65})`
  return 'rgba(255,255,255,0.04)'
}

export default function HeatmapPage() {
  const { range } = useDateRange()
  const [hourCells, setHourCells] = useState<Cell[]>([])
  const [dayCells, setDayCells] = useState<Cell[]>([])
  const [instrCells, setInstrCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'hour' | 'day' | 'instrument'>('hour')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      analyticsAPI.heatmap(range, 'hour'),
      analyticsAPI.heatmap(range, 'day'),
      analyticsAPI.heatmap(range, 'instrument'),
    ]).then(([h, d, i]) => {
      setHourCells(h.data.cells ?? [])
      setDayCells(d.data.cells ?? [])
      setInstrCells(i.data.cells ?? [])
    }).catch(() => {
      setHourCells([])
      setDayCells([])
      setInstrCells([])
    }).finally(() => setLoading(false))
  }, [range])

  const cells = tab === 'hour' ? hourCells : tab === 'day' ? dayCells : instrCells
  const maxAbs = Math.max(...cells.map(c => Math.abs(c.pnl)), 1)
  const totalPnL = cells.reduce((s, c) => s + c.pnl, 0)
  const bestCell = cells.reduce((best, c) => c.avgPnl > (best?.avgPnl ?? -Infinity) ? c : best, cells[0])
  const worstCell = cells.reduce((worst, c) => c.avgPnl < (worst?.avgPnl ?? Infinity) ? c : worst, cells[0])

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div>
        <div className="section-header"><span className="section-header-text">Trade Heatmap</span></div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Visualize where you make and lose money — by time, day, or instrument.
        </p>
      </div>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Total P&L', value: `${totalPnL >= 0 ? '+' : ''}₹${totalPnL.toLocaleString('en-IN')}`, cls: totalPnL >= 0 ? 'data-value-positive' : 'data-value-negative' },
          { label: 'Best Slot', value: bestCell ? `${bestCell.label} (+₹${bestCell.avgPnl.toFixed(0)} avg)` : '—', cls: 'data-value-amber' },
          { label: 'Worst Slot', value: worstCell ? `${worstCell.label} (₹${worstCell.avgPnl.toFixed(0)} avg)` : '—', cls: 'data-value-negative' },
        ].map(s => (
          <div key={s.label} className="terminal-card">
            <div className="data-label">{s.label}</div>
            <div className={`data-value ${s.cls}`} style={{ fontSize: '1rem', marginTop: '0.25rem' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['hour', 'day', 'instrument'] as const).map(t => (
          <button
            key={t}
            className={`range-pill ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'hour' ? 'By Hour' : t === 'day' ? 'By Day' : 'By Instrument'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Computing heatmap...</div>
        </div>
      ) : (
        <>
          {/* Grid Heatmap */}
          {tab === 'hour' ? (
            <HourDayGrid hourCells={hourCells} dayCells={dayCells} maxAbs={maxAbs} />
          ) : (
            <CellGrid cells={cells} maxAbs={maxAbs} />
          )}

          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Loss</span>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} style={{
                width: 24, height: 14, borderRadius: 2,
                background: i < 3 ? `rgba(255,77,109,${0.8 - i * 0.2})` : i === 3 ? 'rgba(255,255,255,0.05)' : `rgba(0,214,143,${0.2 + (i - 3) * 0.2})`,
              }} />
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Profit</span>
          </div>

          {/* Detail table */}
          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Breakdown Table</span></div>
            <table className="terminal-table">
              <thead>
                <tr>
                  <th>{tab === 'hour' ? 'Hour' : tab === 'day' ? 'Day' : 'Instrument'}</th>
                  <th>Trades</th>
                  <th>Total P&L</th>
                  <th>Avg P&L</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {[...cells].sort((a, b) => b.avgPnl - a.avgPnl).map(cell => (
                  <tr key={cell.label}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{cell.label}</td>
                    <td>{cell.trades}</td>
                    <td className={cell.pnl >= 0 ? 'data-value-positive' : 'data-value-negative'} style={{ fontSize: '0.8rem' }}>
                      {cell.pnl >= 0 ? '+' : ''}₹{cell.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td className={cell.avgPnl >= 0 ? 'data-value-positive' : 'data-value-negative'} style={{ fontSize: '0.8rem' }}>
                      {cell.avgPnl >= 0 ? '+' : ''}₹{cell.avgPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </td>
                    <td>
                      <span className={`badge ${cell.avgPnl > 500 ? 'badge-green' : cell.avgPnl > 0 ? 'badge-amber' : 'badge-red'}`}>
                        {cell.avgPnl > 500 ? 'EDGE' : cell.avgPnl > 0 ? 'OK' : 'AVOID'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function HourDayGrid({ hourCells, dayCells, maxAbs }: { hourCells: Cell[], dayCells: Cell[], maxAbs: number }) {
  const hourMap = Object.fromEntries(hourCells.map(c => [c.label.slice(0, 2), c]))
  const dayMap = Object.fromEntries(dayCells.map(c => [c.label, c]))

  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      {/* Hour grid */}
      <div className="terminal-card" style={{ flex: 1, minWidth: 300 }}>
        <div className="section-header"><span className="section-header-text">By Hour (IST)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '0.5rem' }}>
          {HOURS.map(hour => {
            const cell = hourMap[hour]
            return (
              <div key={hour} style={{
                background: cell ? pnlColor(cell.pnl, maxAbs) : 'rgba(255,255,255,0.03)',
                border: '1px solid var(--color-border)',
                borderRadius: 4, padding: '0.5rem',
                textAlign: 'center', cursor: 'default',
              }}
                title={cell ? `${cell.trades} trades · Avg ₹${cell.avgPnl.toFixed(0)}` : 'No trades'}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{hour}:00</div>
                {cell ? (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: cell.pnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)', marginTop: '0.15rem' }}>
                    {cell.pnl >= 0 ? '+' : ''}₹{Math.abs(cell.pnl) >= 1000 ? (cell.pnl / 1000).toFixed(1) + 'K' : cell.pnl.toFixed(0)}
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>—</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day grid */}
      <div className="terminal-card" style={{ flex: 1, minWidth: 280 }}>
        <div className="section-header"><span className="section-header-text">By Weekday</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
          {DAYS.map(day => {
            const cell = dayMap[day]
            const width = cell ? Math.min(100, Math.abs(cell.pnl) / Math.max(...dayCells.map(c => Math.abs(c.pnl)), 1) * 100) : 0
            return (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', width: 30, color: 'var(--color-text-secondary)' }}>{day}</span>
                <div style={{ flex: 1, height: 24, background: 'rgba(255,255,255,0.04)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    width: `${width}%`, height: '100%', borderRadius: 3,
                    background: cell && cell.pnl >= 0 ? 'rgba(0,214,143,0.4)' : 'rgba(255,77,109,0.4)',
                  }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', width: 70, textAlign: 'right', color: cell && cell.pnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                  {cell ? `${cell.pnl >= 0 ? '+' : ''}₹${cell.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CellGrid({ cells, maxAbs }: { cells: Cell[], maxAbs: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
      {cells.map(cell => (
        <div key={cell.label} style={{
          background: pnlColor(cell.pnl, maxAbs),
          border: '1px solid var(--color-border)',
          borderRadius: 6, padding: '0.75rem',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>{cell.label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: cell.pnl >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
            {cell.pnl >= 0 ? '+' : ''}₹{Math.abs(cell.pnl) >= 1000 ? (cell.pnl / 1000).toFixed(1) + 'K' : cell.pnl.toFixed(0)}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{cell.trades} trades</div>
        </div>
      ))}
    </div>
  )
}

