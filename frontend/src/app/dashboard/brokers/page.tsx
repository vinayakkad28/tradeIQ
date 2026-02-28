'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { brokerAPI } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

const SUPPORTED_BROKERS = [
  { id: 'zerodha',  name: 'Zerodha',   description: 'Kite API — OAuth 2.0',       logo: 'Z', color: '#387ed1', tokenBased: false },
  { id: 'upstox',   name: 'Upstox',    description: 'Upstox Pro API v2',           logo: 'U', color: '#7ac231', tokenBased: false },
  { id: 'angelone', name: 'AngelOne',  description: 'SmartAPI REST',               logo: 'A', color: '#f77f00', tokenBased: false },
  { id: 'fyers',    name: 'Fyers',     description: 'Fyers API v3',                logo: 'F', color: '#1e6fd9', tokenBased: false },
  { id: 'dhan',     name: 'Dhan',      description: 'Dhan HQ v2 — OAuth 2.0',      logo: 'D', color: '#6d2bff', tokenBased: false },
]

type Connection = {
  id: string
  broker_name: string
  display_name: string
  status: 'connected' | 'expired' | 'error'
  last_synced_at: string | null
  trade_count: number
}

// Separate component so useSearchParams() is inside a Suspense boundary
function OAuthCallbackHandler({ onMessage, onRefresh, isAuthenticated }: {
  onMessage: (msg: string) => void
  onRefresh: () => void
  isAuthenticated: boolean
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const broker = searchParams.get('broker')
    const error = searchParams.get('error')

    if (error) {
      onMessage(`OAuth failed: ${error}. Please try again.`)
      return
    }

    if (code && state && broker && isAuthenticated) {
      brokerAPI.callback(broker, code, state)
        .then(() => {
          onMessage(`${broker} connected successfully! Fetching your trades...`)
          onRefresh()
        })
        .catch(err => {
          onMessage(err?.response?.data?.message || 'OAuth token exchange failed. Please try again.')
        })
      window.history.replaceState({}, '', '/dashboard/brokers')
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function BrokersPage() {
  const { isAuthenticated } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(true)

  const fetchConnections = async () => {
    if (!isAuthenticated) { setLoadingList(false); return }
    try {
      const res = await brokerAPI.list()
      setConnections(res.data.brokers ?? res.data.data ?? [])
    } catch {
      setConnections([])
    } finally {
      setLoadingList(false)
    }
  }

  const handleOAuthMessage = (msg: string) => {
    setSyncMessage(msg)
    setTimeout(() => setSyncMessage(null), 5000)
  }

  useEffect(() => { fetchConnections() }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (brokerId: string) => {
    if (!isAuthenticated) {
      window.location.href = '/login'
      return
    }
    setConnecting(brokerId)
    try {
      const res = await brokerAPI.connect(brokerId)
      const oauthUrl = res.data.oauth_url ?? res.data.data?.oauth_url
      if (oauthUrl && oauthUrl !== '#') {
        window.location.href = oauthUrl
      } else {
        setSyncMessage(`OAuth flow for ${brokerId} is coming soon. Use CSV import for now.`)
        setTimeout(() => setSyncMessage(null), 4000)
      }
    } catch {
      setSyncMessage('Connection failed. Please try again.')
      setTimeout(() => setSyncMessage(null), 3000)
    } finally {
      setConnecting(null)
    }
  }

  const handleSync = async (connId: string) => {
    setSyncing(connId)
    setSyncMessage(null)
    try {
      const res = await brokerAPI.sync(connId)
      const count = res.data.trades_synced ?? res.data.data?.trades_synced ?? 0
      setSyncMessage(`Synced ${count} new trade(s) successfully.`)
      fetchConnections()
    } catch {
      setSyncMessage('Sync failed. Please try again.')
    } finally {
      setSyncing(null)
      setTimeout(() => setSyncMessage(null), 4000)
    }
  }

  const handleDisconnect = async (connId: string) => {
    if (!confirm('Disconnect this broker? Imported trades will be kept.')) return
    setDisconnecting(connId)
    try {
      await brokerAPI.disconnect(connId)
      setConnections(cs => cs.filter(c => c.id !== connId))
    } catch {
      setSyncMessage('Disconnect failed. Please try again.')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* OAuth callback handler — must be inside Suspense for useSearchParams */}
      <Suspense fallback={null}>
        <OAuthCallbackHandler
          onMessage={handleOAuthMessage}
          onRefresh={fetchConnections}
          isAuthenticated={isAuthenticated}
        />
      </Suspense>

      {/* Connected Accounts */}
      <div>
        <div className="section-header"><span className="section-header-text">Connected Accounts</span></div>

        {syncMessage && (
          <div style={{ marginBottom: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(0,214,143,0.08)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-positive)' }}>
            {syncMessage}
          </div>
        )}

        {loadingList ? (
          <div className="terminal-card" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading connections...</div>
          </div>
        ) : connections.length === 0 ? (
          <div className="terminal-card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>No broker connected yet.</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '0.5rem' }}>Connect a broker below to auto-import trades.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {connections.map(conn => {
              const broker = SUPPORTED_BROKERS.find(b => b.id === conn.broker_name)
              return (
                <div key={conn.id} className="terminal-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: broker?.color || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>
                      {broker?.logo ?? conn.broker_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{conn.display_name || conn.broker_name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        {conn.last_synced_at
                          ? `Last sync: ${new Date(conn.last_synced_at).toLocaleDateString('en-IN')} · `
                          : 'Never synced · '}
                        {conn.trade_count} trades imported
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
                    <button
                      className="btn-ghost"
                      style={{ color: 'var(--color-negative)', borderColor: 'rgba(255,77,109,0.2)' }}
                      onClick={() => handleDisconnect(conn.id)}
                      disabled={disconnecting === conn.id}
                    >
                      {disconnecting === conn.id ? 'Removing...' : 'Disconnect'}
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
            const isConnected = connections.some(c => c.broker_name === broker.id)
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
