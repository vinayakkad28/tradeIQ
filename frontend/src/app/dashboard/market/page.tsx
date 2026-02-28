'use client'
import { useState, useEffect, useCallback } from 'react'

const MARKET_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:8080'

async function fetchMarket(path: string) {
  const res = await fetch(`${MARKET_BASE}/api/v1/market${path}`)
  return res.json()
}

type IndexData = {
  index: string
  last: number
  change: number
  percentChange: number
  open: number
  high: number
  low: number
}

type OptionRow = {
  strikePrice: number
  expiryDate: string
  CE?: { openInterest: number; lastPrice: number; impliedVolatility: number; totalTradedVolume: number; changeinOpenInterest: number }
  PE?: { openInterest: number; lastPrice: number; impliedVolatility: number; totalTradedVolume: number; changeinOpenInterest: number }
}

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']

export default function MarketPage() {
  const [indices, setIndices] = useState<IndexData[]>([])
  const [vix, setVix] = useState<{ vix: number; change: number; percent_change: number } | null>(null)
  const [fiiDii, setFiiDii] = useState<{ category: string; buyValue: number; sellValue: number; netValue: number }[]>([])
  const [optionChain, setOptionChain] = useState<OptionRow[]>([])
  const [expiries, setExpiries] = useState<string[]>([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [underlying, setUnderlying] = useState(0)
  const [pcrOI, setPcrOI] = useState(0)
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY')
  const [loading, setLoading] = useState(true)
  const [optLoading, setOptLoading] = useState(false)
  const [gainers, setGainers] = useState<{ symbol: string; ltp: number; pChange: number }[]>([])
  const [losers, setLosers] = useState<{ symbol: string; ltp: number; pChange: number }[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadIndices = useCallback(async () => {
    try {
      const [idxData, vixData, fiiData, glData] = await Promise.all([
        fetchMarket('/indices'),
        fetchMarket('/vix'),
        fetchMarket('/fii-dii'),
        fetchMarket('/gainers-losers'),
      ])
      setIndices(idxData.data ?? [])
      setVix(vixData)
      setFiiDii((fiiData.data ?? []).slice(0, 4))
      setGainers(glData.gainers ?? [])
      setLosers(glData.losers ?? [])
      setLastUpdated(new Date())
    } catch {
      // fallback already handled by server
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOptionChain = useCallback(async (symbol: string, expiry?: string) => {
    setOptLoading(true)
    try {
      const path = `/option-chain?symbol=${symbol}${expiry ? `&expiry=${encodeURIComponent(expiry)}` : ''}`
      const data = await fetchMarket(path)
      setOptionChain(data.data ?? [])
      setExpiries(data.expiry_dates ?? [])
      setUnderlying(data.underlying ?? 0)
      setPcrOI(data.pcr_oi ?? 0)
      if (!expiry && data.expiry_dates?.length > 0) {
        setSelectedExpiry(data.expiry_dates[0])
      }
    } catch {
      setOptionChain([])
    } finally {
      setOptLoading(false)
    }
  }, [])

  useEffect(() => {
    loadIndices()
    const interval = setInterval(loadIndices, 60000) // refresh every 60s
    return () => clearInterval(interval)
  }, [loadIndices])

  useEffect(() => {
    loadOptionChain(selectedSymbol)
  }, [selectedSymbol, loadOptionChain])

  useEffect(() => {
    if (selectedExpiry) loadOptionChain(selectedSymbol, selectedExpiry)
  }, [selectedExpiry, selectedSymbol, loadOptionChain])

  // ATM strikes (5 above + 5 below underlying)
  const atmStrikes = optionChain
    .filter(r => !selectedExpiry || r.expiryDate === selectedExpiry)
    .sort((a, b) => a.strikePrice - b.strikePrice)
  const atmIdx = atmStrikes.findIndex(r => r.strikePrice >= underlying)
  const displayStrikes = atmStrikes.slice(Math.max(0, atmIdx - 8), atmIdx + 8)

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="section-header"><span className="section-header-text">Market Overview</span></div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Live NSE data · {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN')}` : 'Loading...'}
          </p>
        </div>
        {vix && (
          <div style={{ textAlign: 'right' }}>
            <div className="data-label">INDIA VIX</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800,
              color: vix.vix > 20 ? 'var(--color-negative)' : vix.vix > 15 ? 'var(--color-amber-primary)' : 'var(--color-positive)',
            }}>
              {vix.vix.toFixed(2)}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: vix.change >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
              {vix.change >= 0 ? '+' : ''}{vix.change.toFixed(2)} ({vix.percent_change.toFixed(2)}%)
            </div>
          </div>
        )}
      </div>

      {/* Indices grid */}
      {loading ? (
        <div className="terminal-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Fetching live data from NSE...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {indices.filter(i => i.index !== 'INDIA VIX').map(idx => {
            const pos = idx.change >= 0
            return (
              <div key={idx.index} className="terminal-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{idx.index}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {idx.last.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: pos ? 'var(--color-positive)' : 'var(--color-negative)', fontWeight: 700 }}>
                    {pos ? '▲' : '▼'} {pos ? '+' : ''}{idx.change.toFixed(2)} ({pos ? '+' : ''}{idx.percentChange.toFixed(2)}%)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>H: {idx.high?.toLocaleString('en-IN') ?? '—'}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>L: {idx.low?.toLocaleString('en-IN') ?? '—'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FII/DII */}
      {fiiDii.length > 0 && (
        <div className="terminal-card">
          <div className="section-header"><span className="section-header-text">FII / DII Activity</span></div>
          <table className="terminal-table">
            <thead><tr><th>Category</th><th>Buy (₹Cr)</th><th>Sell (₹Cr)</th><th>Net (₹Cr)</th></tr></thead>
            <tbody>
              {fiiDii.map((row, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{row.category}</td>
                  <td>{(row.buyValue / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td>{(row.sellValue / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                  <td className={row.netValue >= 0 ? 'data-value-positive' : 'data-value-negative'} style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    {row.netValue >= 0 ? '+' : ''}{(row.netValue / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gainers / Losers */}
      {(gainers.length > 0 || losers.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[{ title: 'Top Gainers', data: gainers, pos: true }, { title: 'Top Losers', data: losers, pos: false }].map(({ title, data, pos }) => (
            <div key={title} className="terminal-card">
              <div className="section-header"><span className="section-header-text">{title}</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {data.slice(0, 5).map((s: { symbol: string; ltp: number; pChange: number }) => (
                  <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{s.symbol}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{s.ltp?.toLocaleString('en-IN')}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: pos ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                        {pos ? '+' : ''}{s.pChange?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Option Chain */}
      <div className="terminal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div className="section-header" style={{ margin: 0 }}><span className="section-header-text">Option Chain</span></div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {SYMBOLS.map(sym => (
                <button key={sym} className={`range-pill ${selectedSymbol === sym ? 'active' : ''}`} onClick={() => setSelectedSymbol(sym)}>{sym}</button>
              ))}
            </div>
            {expiries.length > 0 && (
              <select
                value={selectedExpiry}
                onChange={e => setSelectedExpiry(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0.2rem 0.4rem' }}
              >
                {expiries.map(exp => <option key={exp} value={exp}>{exp}</option>)}
              </select>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
          <div className="data-label">Underlying: <span style={{ color: 'var(--color-text-primary)', fontWeight: 700 }}>{underlying.toLocaleString('en-IN')}</span></div>
          <div className="data-label">PCR (OI): <span style={{ color: pcrOI > 1.2 ? 'var(--color-positive)' : pcrOI < 0.8 ? 'var(--color-negative)' : 'var(--color-amber-primary)', fontWeight: 700 }}>{pcrOI.toFixed(2)}</span></div>
        </div>

        {optLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading option chain...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="terminal-table" style={{ fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ background: 'rgba(0,214,143,0.05)' }}>CE OI</th>
                  <th style={{ background: 'rgba(0,214,143,0.05)' }}>CE Chg OI</th>
                  <th style={{ background: 'rgba(0,214,143,0.05)' }}>CE LTP</th>
                  <th style={{ background: 'rgba(0,214,143,0.05)' }}>CE IV</th>
                  <th style={{ fontWeight: 800, color: 'var(--color-amber-primary)' }}>STRIKE</th>
                  <th style={{ background: 'rgba(255,77,109,0.05)' }}>PE IV</th>
                  <th style={{ background: 'rgba(255,77,109,0.05)' }}>PE LTP</th>
                  <th style={{ background: 'rgba(255,77,109,0.05)' }}>PE Chg OI</th>
                  <th style={{ background: 'rgba(255,77,109,0.05)' }}>PE OI</th>
                </tr>
              </thead>
              <tbody>
                {displayStrikes.map(row => {
                  const isATM = row.strikePrice === Math.round(underlying / 50) * 50
                  return (
                    <tr key={row.strikePrice} style={isATM ? { background: 'rgba(245,158,11,0.06)', fontWeight: 700 } : {}}>
                      <td style={{ background: 'rgba(0,214,143,0.03)', color: 'var(--color-text-secondary)' }}>{row.CE?.openInterest?.toLocaleString('en-IN') ?? '—'}</td>
                      <td style={{ background: 'rgba(0,214,143,0.03)', color: (row.CE?.changeinOpenInterest ?? 0) >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                        {row.CE?.changeinOpenInterest != null ? (row.CE.changeinOpenInterest >= 0 ? '+' : '') + row.CE.changeinOpenInterest.toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={{ background: 'rgba(0,214,143,0.03)', color: 'var(--color-positive)', fontWeight: 700 }}>{row.CE?.lastPrice?.toFixed(2) ?? '—'}</td>
                      <td style={{ background: 'rgba(0,214,143,0.03)', color: 'var(--color-text-muted)' }}>{row.CE?.impliedVolatility?.toFixed(1) ?? '—'}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--color-amber-primary)', textAlign: 'center' }}>{row.strikePrice.toLocaleString('en-IN')}</td>
                      <td style={{ background: 'rgba(255,77,109,0.03)', color: 'var(--color-text-muted)' }}>{row.PE?.impliedVolatility?.toFixed(1) ?? '—'}%</td>
                      <td style={{ background: 'rgba(255,77,109,0.03)', color: 'var(--color-negative)', fontWeight: 700 }}>{row.PE?.lastPrice?.toFixed(2) ?? '—'}</td>
                      <td style={{ background: 'rgba(255,77,109,0.03)', color: (row.PE?.changeinOpenInterest ?? 0) >= 0 ? 'var(--color-positive)' : 'var(--color-negative)' }}>
                        {row.PE?.changeinOpenInterest != null ? (row.PE.changeinOpenInterest >= 0 ? '+' : '') + row.PE.changeinOpenInterest.toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={{ background: 'rgba(255,77,109,0.03)', color: 'var(--color-text-secondary)' }}>{row.PE?.openInterest?.toLocaleString('en-IN') ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="disclaimer-banner" style={{ borderRadius: 4, border: '1px solid var(--color-border-amber)' }}>
        Market data sourced from NSE India. For educational purposes only. Not investment advice.
      </div>
    </div>
  )
}
