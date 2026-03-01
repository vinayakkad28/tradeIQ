'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { brokerAPI } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

const SUPPORTED_BROKERS = [
  { id: 'zerodha',  name: 'Zerodha',  description: 'Kite API — OAuth 2.0',   logo: 'Z', color: '#387ed1' },
  { id: 'upstox',   name: 'Upstox',   description: 'Upstox Pro API v2',       logo: 'U', color: '#7ac231' },
  { id: 'angelone', name: 'AngelOne', description: 'SmartAPI — OAuth 2.0',    logo: 'A', color: '#f77f00' },
  { id: 'fyers',    name: 'Fyers',    description: 'Fyers API v3',            logo: 'F', color: '#1e6fd9' },
  { id: 'dhan',     name: 'Dhan',     description: 'Dhan HQ v2 — OAuth 2.0', logo: 'D', color: '#6d2bff' },
]

type Connection = {
  id: string
  broker_name: string
  display_name: string
  status: 'connected' | 'expired' | 'error'
  last_synced_at: string | null
  trade_count: number
}

// Handles the ?code=&state=&broker= params that arrive after OAuth redirect
function OAuthCallbackHandler({ onMessage, onRefresh, isAuthenticated }: {
  onMessage: (msg: string, ok?: boolean) => void
  onRefresh: () => void
  isAuthenticated: boolean
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const code   = searchParams.get('code')
    const state  = searchParams.get('state')
    const broker = searchParams.get('broker')
    const error  = searchParams.get('error')

    if (error) {
      onMessage(`OAuth failed: ${error}. Please try again.`, false)
      return
    }

    if (code && state && broker && isAuthenticated) {
      const feedToken = searchParams.get('feed_token') ?? ''
      brokerAPI.callbackWithFeed(broker, code, state, feedToken)
        .then(async (res) => {
          const connId = res.data.connection?.id
          onMessage(`${broker} connected! Importing your trades...`, true)
          onRefresh()
          if (connId) {
            try {
              const syncRes = await brokerAPI.sync(connId)
              const count = syncRes.data.trades_synced ?? syncRes.data.data?.trades_synced ?? 0
              onMessage(`${broker} connected! Imported ${count} trade(s).`, true)
              onRefresh()
            } catch { /* sync error — user can click Sync Now */ }
          }
        })
        .catch(err => {
          onMessage(err?.response?.data?.message || 'OAuth token exchange failed. Please try again.', false)
        })
      // Clear URL params immediately so a page refresh doesn't re-trigger
      window.history.replaceState({}, '', '/dashboard/brokers')
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export default function BrokersPage() {
  const { isAuthenticated } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [connecting, setConnecting]   = useState<string | null>(null)
  const [syncing, setSyncing]         = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [message, setMessage]         = useState<{ text: string; ok: boolean } | null>(null)
  const [loadingList, setLoadingList] = useState(true)

  const showMessage = (text: string, ok = true) => {
    setMessage({ text, ok })
    setTimeout(() => setMessage(null), 5000)
  }

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

  useEffect(() => { fetchConnections() }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initiate OAuth connect (or reconnect for expired)
  const handleConnect = async (brokerId: string) => {
    if (!isAuthenticated) { window.location.href = '/login'; return }
    setConnecting(brokerId)
    try {
      const res = await brokerAPI.connect(brokerId)
      const oauthUrl = res.data.oauth_url ?? res.data.data?.oauth_url
      if (oauthUrl && oauthUrl !== '#') {
        window.location.href = oauthUrl
      } else {
        showMessage(`OAuth for ${brokerId} is coming soon. Use CSV import for now.`, false)
      }
    } catch {
      showMessage('Connection failed. Please try again.', false)
    } finally {
      setConnecting(null)
    }
  }

  const handleSync = async (connId: string) => {
    setSyncing(connId)
    try {
      const res = await brokerAPI.sync(connId)
      const count = res.data.trades_synced ?? res.data.data?.trades_synced ?? 0
      showMessage(`Synced ${count} new trade(s).`)
      fetchConnections()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Sync failed.'
      showMessage(msg, false)
    } finally {
      setSyncing(null)
    }
  }

  const handleDisconnect = async (connId: string, brokerName: string) => {
    if (!confirm(`Disconnect ${brokerName}? Your imported trades will be kept.`)) return
    setDisconnecting(connId)
    try {
      await brokerAPI.disconnect(connId)
      setConnections(cs => cs.filter(c => c.id !== connId))
      showMessage(`${brokerName} disconnected.`)
    } catch {
      showMessage('Disconnect failed. Please try again.', false)
    } finally {
      setDisconnecting(null)
    }
  }

  // A broker is "fully connected" only if status === 'connected'
  const fullyConnected = (brokerId: string) =>
    connections.some(c => c.broker_name === brokerId && c.status === 'connected')

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* OAuth callback handler — needs Suspense for useSearchParams */}
      <Suspense fallback={null}>
        <OAuthCallbackHandler
          onMessage={showMessage}
          onRefresh={fetchConnections}
          isAuthenticated={isAuthenticated}
        />
      </Suspense>

      {/* Status message */}
      {message && (
        <div style={{
          padding: '0.625rem 0.875rem', borderRadius: 4,
          fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
          background: message.ok ? 'rgba(0,214,143,0.08)' : 'rgba(255,77,109,0.08)',
          border: `1px solid ${message.ok ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,109,0.2)'}`,
          color: message.ok ? 'var(--color-positive)' : 'var(--color-negative)',
        }}>
          {message.text}
        </div>
      )}

      {/* ── Connected Accounts ── */}
      <div>
        <div className="section-header"><span className="section-header-text">Connected Accounts</span></div>

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
              const isExpired = conn.status !== 'connected'
              return (
                <div key={conn.id} className="terminal-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: broker?.color || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0 }}>
                      {broker?.logo ?? conn.broker_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {conn.display_name || broker?.name || conn.broker_name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        {conn.last_synced_at
                          ? `Last sync: ${new Date(conn.last_synced_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · `
                          : 'Never synced · '}
                        {conn.trade_count} trades imported
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span className={`badge ${conn.status === 'connected' ? 'badge-green' : 'badge-red'}`}>
                      {conn.status.toUpperCase()}
                    </span>

                    {isExpired ? (
                      // Token expired / error → show Reconnect button
                      <button
                        className="btn-primary"
                        onClick={() => handleConnect(conn.broker_name)}
                        disabled={connecting === conn.broker_name}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {connecting === conn.broker_name ? 'Connecting...' : '⟳ Reconnect'}
                      </button>
                    ) : (
                      <button
                        className="btn-ghost"
                        onClick={() => handleSync(conn.id)}
                        disabled={syncing === conn.id}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {syncing === conn.id ? 'Syncing...' : '⇌ Sync Now'}
                      </button>
                    )}

                    <button
                      className="btn-ghost"
                      style={{ color: 'var(--color-negative)', borderColor: 'rgba(255,77,109,0.2)', fontSize: '0.75rem' }}
                      onClick={() => handleDisconnect(conn.id, broker?.name ?? conn.broker_name)}
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

      {/* ── Add / Reconnect Broker ── */}
      <div>
        <div className="section-header"><span className="section-header-text">Add Broker Connection</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {SUPPORTED_BROKERS.map(broker => {
            const existingConn = connections.find(c => c.broker_name === broker.id)
            const isFullyConnected = fullyConnected(broker.id)
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

                {isFullyConnected ? (
                  <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>CONNECTED</span>
                ) : existingConn ? (
                  // Connection exists but token expired — show Reconnect
                  <button
                    className="btn-primary"
                    onClick={() => handleConnect(broker.id)}
                    disabled={connecting === broker.id}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem' }}
                  >
                    {connecting === broker.id ? 'Connecting...' : `⟳ Reconnect ${broker.name}`}
                  </button>
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

      {/* ── AngelOne historical data notice (shown when AngelOne is connected) ── */}
      {connections.some(c => c.broker_name === 'angelone') && (
        <div className="terminal-card" style={{ borderColor: 'rgba(247,127,0,0.3)', background: 'rgba(247,127,0,0.04)' }}>
          <div className="section-header"><span className="section-header-text" style={{ color: 'var(--color-amber-primary)' }}>AngelOne — Historical Data Limitation</span></div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.7, margin: '0.5rem 0 0.75rem' }}>
            AngelOne SmartAPI only returns <strong style={{ color: 'var(--color-text-primary)' }}>today&apos;s trades</strong>. There is no API endpoint for historical trade data.
            To import your full trade history, you must download a CSV from the AngelOne backoffice and upload it here.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {[
              { step: '1', text: 'Open backoffice.angelone.in and log in with your AngelOne credentials.' },
              { step: '2', text: 'Go to Reports → Trade Reports → select date range → click Download / Export.' },
              { step: '3', text: 'Upload the downloaded CSV at Import Trades below — TradeIQ auto-detects the AngelOne format.' },
            ].map(s => (
              <div key={s.step} style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'rgba(247,127,0,0.5)', flexShrink: 0, lineHeight: 1.2 }}>{s.step}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{s.text}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <a href="/dashboard/upload" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-amber-primary)', textDecoration: 'underline' }}>
              → Go to Import Trades
            </a>
          </div>
        </div>
      )}

      {/* ── How it works ── */}
      <div className="terminal-card-amber">
        <div className="section-header"><span className="section-header-text">How Broker Sync Works</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { step: '01', title: 'OAuth Authorization', desc: 'Click Connect. You\'ll be redirected to your broker\'s site to authorize TradeIQ with read-only access to your trade history.' },
            { step: '02', title: 'Full History Import', desc: 'TradeIQ fetches your complete trade history — all available data since account opening. Dhan supports full history. AngelOne requires CSV for history beyond today.' },
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
