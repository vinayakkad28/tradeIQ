'use client'
import { useState } from 'react'

const SUPPORTED_BROKERS = [
  { id: 'zerodha',  name: 'Zerodha',   description: 'Kite API — OAuth 2.0', logo: 'Z', color: '#387ed1' },
  { id: 'upstox',   name: 'Upstox',    description: 'Upstox Pro API v2',    logo: 'U', color: '#7ac231' },
  { id: 'angelone', name: 'AngelOne',  description: 'SmartAPI REST',        logo: 'A', color: '#f77f00' },
  { id: 'fyers',    name: 'Fyers',     description: 'Fyers API v3',         logo: 'F', color: '#1e6fd9' },
  { id: 'dhan',     name: 'Dhan',      description: 'Dhan HQ Trading API',  logo: 'D', color: '#6d2bff' },
]

type Connection = {
  id: string
  brokerName: string
  displayName: string
  status: 'connected' | 'expired' | 'error'
  lastSyncedAt: string
  tradeCount: number
}

const MOCK_CONNECTIONS: Connection[] = [
  { id: '1', brokerName: 'zerodha', displayName: 'Zerodha — Vinayak K.', status: 'connected', lastSyncedAt: '2025-12-01T06:00:00Z', tradeCount: 47 },
]

export default function BrokersPage() {
  const [connections] = useState<Connection[]>(MOCK_CONNECTIONS)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)

  const handleConnect = (brokerId: string) => {
    setConnecting(brokerId)
    setTimeout(() => {
      setConnecting(null)
      alert(`OAuth flow would redirect to ${brokerId} in production`)
    }, 1000)
  }

  const handleSync = (connId: string) => {
    setSyncing(connId)
    setTimeout(() => setSyncing(null), 2000)
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Connected Accounts */}
      <div>
        <div className="section-header"><span className="section-header-text">Connected Accounts</span></div>
        {connections.length === 0 ? (
          <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>No broker connected yet.</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Connect a broker below to auto-import trades.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {connections.map(conn => {
              const broker = SUPPORTED_BROKERS.find(b => b.id === conn.brokerName)
              return (
                <div key={conn.id} className="terminal-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: broker?.color || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>
                      {broker?.logo}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{conn.displayName}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        Last sync: {new Date(conn.lastSyncedAt).toLocaleDateString('en-IN')} · {conn.tradeCount} trades imported
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className={`badge ${conn.status === 'connected' ? 'badge-green' : 'badge-red'}`}>{conn.status.toUpperCase()}</span>
                    <button
                      className="btn-ghost"
                      onClick={() => handleSync(conn.id)}
                      disabled={syncing === conn.id}
                    >
                      {syncing === conn.id ? 'Syncing...' : '⇌ Sync Now'}
                    </button>
                    <button className="btn-ghost" style={{ color: 'var(--color-negative)', borderColor: 'rgba(255,77,109,0.2)' }}>
                      Disconnect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Connection */}
      <div>
        <div className="section-header"><span className="section-header-text">Add Broker Connection</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {SUPPORTED_BROKERS.map(broker => {
            const isConnected = connections.some(c => c.brokerName === broker.id)
            return (
              <div key={broker.id} className="terminal-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: broker.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: '#fff' }}>
                    {broker.logo}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{broker.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{broker.description}</div>
                  </div>
                </div>
                {isConnected ? (
                  <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>CONNECTED</span>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => handleConnect(broker.id)}
                    disabled={connecting === broker.id}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {connecting === broker.id ? 'Connecting...' : `Connect ${broker.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Info */}
      <div className="terminal-card-amber">
        <div className="section-header"><span className="section-header-text">How Broker Sync Works</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { step: '01', title: 'OAuth Authorization', desc: 'Click Connect. You\'ll be redirected to your broker to authorize TradeIQ (read-only access to trade history).' },
            { step: '02', title: 'Auto Import', desc: 'TradeIQ pulls your last 6 months of trades. Auto-detects segment, instrument type, P&L, and timing.' },
            { step: '03', title: 'Daily Sync', desc: 'Trades sync automatically every morning at 6 AM IST. Or click Sync Now for immediate refresh.' },
          ].map(item => (
            <div key={item.step}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-amber-primary)', opacity: 0.4, lineHeight: 1 }}>{item.step}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '0.375rem' }}>{item.title}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
