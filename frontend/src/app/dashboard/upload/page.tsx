'use client'
import { useState, useRef, DragEvent } from 'react'

const BROKER_FORMATS = [
  { name: 'Zerodha',  cols: 'trade_id, tradingsymbol, trade_type, …' },
  { name: 'Upstox',   cols: 'isin, instrument_token, average_price, …' },
  { name: 'AngelOne', cols: 'scripname, buyorsell, tradeprice, …' },
  { name: 'Fyers',    cols: 'symbol, qty, tradevalue, …' },
  { name: 'Dhan',     cols: 'exchange_segment, traded_quantity, …' },
  { name: 'Generic',  cols: 'date, instrument, pnl (minimum required)' },
]

export default function UploadPage() {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ accepted: number; rejected: number; broker_detected: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.csv')) setFile(dropped)
    else setError('Only CSV files are supported.')
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError(null)
    // Simulate API response
    setTimeout(() => {
      setResult({ accepted: 47, rejected: 2, broker_detected: 'Zerodha (auto-detected)' })
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 800 }}>

      <div>
        <div className="section-header"><span className="section-header-text">Import Trades via CSV</span></div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Upload your broker trade report. TradeIQ auto-detects the format and normalizes your data.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--color-amber-primary)' : 'var(--color-border)'}`,
          borderRadius: 6,
          padding: '3rem',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragging ? 'var(--color-amber-glow)' : 'var(--color-bg-card)',
          transition: 'all 0.15s ease',
        }}
      >
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem', opacity: 0.5 }}>↑</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.375rem' }}>
          {file ? file.name : 'Drop CSV file here or click to browse'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
          {file ? `${(file.size / 1024).toFixed(1)} KB — Ready to upload` : 'Supports Zerodha, Upstox, AngelOne, Fyers, Dhan, or Generic CSV'}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.75rem', background: 'var(--color-negative-dim)', border: '1px solid rgba(255,77,109,0.3)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-negative)' }}>
          {error}
        </div>
      )}

      {file && !result && (
        <button className="btn-primary" onClick={handleUpload} disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading ? 'Processing...' : 'Upload & Parse'}
        </button>
      )}

      {result && (
        <div className="terminal-card-amber">
          <div className="section-header"><span className="section-header-text">Import Complete</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <div className="data-label-amber">Broker Detected</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: 700, marginTop: '0.25rem' }}>{result.broker_detected}</div>
            </div>
            <div>
              <div className="data-label-amber">Trades Accepted</div>
              <div className="data-value data-value-positive">{result.accepted}</div>
            </div>
            <div>
              <div className="data-label-amber">Rows Rejected</div>
              <div className={`data-value ${result.rejected > 0 ? 'data-value-negative' : 'data-value-positive'}`}>{result.rejected}</div>
            </div>
          </div>
          <div style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Trades imported successfully. Analytics will update in the next refresh.
          </div>
          <button className="btn-ghost" style={{ marginTop: '1rem' }} onClick={() => { setFile(null); setResult(null) }}>
            Upload Another File
          </button>
        </div>
      )}

      {/* Supported Formats */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">Supported CSV Formats</span></div>
        <table className="terminal-table">
          <thead><tr><th>Broker</th><th>Required Columns</th><th>Status</th></tr></thead>
          <tbody>
            {BROKER_FORMATS.map(b => (
              <tr key={b.name}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{b.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{b.cols}</td>
                <td><span className="badge badge-green">Supported</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="disclaimer-banner" style={{ borderRadius: 4, border: '1px solid var(--color-border-amber)' }}>
        CSV files are parsed client-side and sent securely to your account. No data is shared with third parties.
      </div>
    </div>
  )
}
