'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { brokerAPI } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

// ── Broker capability definitions ────────────────────────────────────────────
// tradeHistoryLevel: 'excellent' = multi-year auto | 'limited' = today only via API
const SUPPORTED_BROKERS = [
  {
    id: 'upstox',
    name: 'Upstox',
    logo: 'U',
    color: '#7ac231',
    manualToken: false,
    connection: 'OAuth 2.0',
    tradeHistory: '3 Financial Years',
    tradeHistoryNote: 'Automatic full-history import via API — no CSV needed',
    tradeHistoryLevel: 'excellent' as const,
    liveQuotes: true,
    optionChain: true,
    csvRequired: false,
    tagline: 'Best auto-import — 3 years of trades fetched automatically',
    csvGuide: null,
  },
  {
    id: 'dhan',
    name: 'Dhan HQ',
    logo: 'D',
    color: '#6d2bff',
    manualToken: true,
    connection: 'Personal Token',
    tradeHistory: 'Full history',
    tradeHistoryNote: 'All trades since account opening, fetched automatically',
    tradeHistoryLevel: 'excellent' as const,
    liveQuotes: true,
    optionChain: true,
    csvRequired: false,
    tagline: 'Best live data — 200-level depth, 5,000 instruments, option chain',
    csvGuide: null,
  },
  {
    id: 'zerodha',
    name: 'Zerodha',
    logo: 'Z',
    color: '#387ed1',
    manualToken: false,
    connection: 'OAuth 2.0',
    tradeHistory: 'Today only',
    tradeHistoryNote: 'API returns today\'s trades only. Use Zerodha Console → Reports → Download to get your full history CSV.',
    tradeHistoryLevel: 'limited' as const,
    liveQuotes: true,
    optionChain: false,
    csvRequired: true,
    tagline: "India's largest broker. Connect for daily sync + upload CSV for history.",
    csvGuide: {
      steps: [
        'Go to console.zerodha.com → Reports → Tradebook',
        'Select date range and click Download',
        'Upload the CSV at Import Trades below',
      ],
      uploadUrl: '/dashboard/upload',
    },
  },
  {
    id: 'fyers',
    name: 'Fyers',
    logo: 'F',
    color: '#1e6fd9',
    manualToken: false,
    connection: 'OAuth 2.0',
    tradeHistory: 'Today only',
    tradeHistoryNote: 'API returns today\'s trades only. Download from Fyers backoffice for full history.',
    tradeHistoryLevel: 'limited' as const,
    liveQuotes: true,
    optionChain: true,
    csvRequired: true,
    tagline: 'Ultra-low latency TBT feed. Connect for daily sync + upload CSV for history.',
    csvGuide: {
      steps: [
        'Go to myaccount.fyers.in → Reports → Tradebook',
        'Select date range and Export as CSV',
        'Upload the CSV at Import Trades below',
      ],
      uploadUrl: '/dashboard/upload',
    },
  },
  {
    id: 'angelone',
    name: 'AngelOne',
    logo: 'A',
    color: '#f77f00',
    manualToken: false,
    connection: 'OAuth 2.0',
    tradeHistory: 'Today only',
    tradeHistoryNote: 'SmartAPI returns today\'s trades only. No expired F&O data available. Download from backoffice for history.',
    tradeHistoryLevel: 'limited' as const,
    liveQuotes: true,
    optionChain: false,
    csvRequired: true,
    tagline: 'Daily trades auto-imported. Upload CSV from backoffice for full history.',
    csvGuide: {
      steps: [
        'Go to backoffice.angelone.in → Trade Reports',
        'Select date range and Download CSV',
        'Upload the CSV at Import Trades below',
      ],
      uploadUrl: '/dashboard/upload',
    },
  },
]

type BrokerDef = typeof SUPPORTED_BROKERS[number]

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
            } catch { /* sync failed silently */ }
          }
        })
        .catch(err => {
          onMessage(err?.response?.data?.message || 'OAuth token exchange failed. Please try again.', false)
        })
      window.history.replaceState({}, '', '/dashboard/brokers')
    }
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// ── Capability badge ──────────────────────────────────────────────────────────
function CapBadge({ label, level }: { label: string; level: 'green' | 'amber' | 'muted' }) {
  const colors = {
    green: { bg: 'rgba(0,214,143,0.08)', border: 'rgba(0,214,143,0.2)', color: 'var(--color-positive)' },
    amber: { bg: 'rgba(255,170,0,0.08)', border: 'rgba(255,170,0,0.2)', color: 'var(--color-amber-primary)' },
    muted: { bg: 'rgba(255,255,255,0.04)', border: 'var(--color-border)', color: 'var(--color-text-muted)' },
  }[level]
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em',
      padding: '0.15rem 0.45rem', borderRadius: 3,
      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Single broker card (in the "Add Broker" grid) ─────────────────────────────
function BrokerCard({
  broker,
  existingConn,
  connecting,
  tokenForm,
  onConnect,
  onOpenTokenForm,
  onTokenFormChange,
  onTokenSubmit,
  onCancelTokenForm,
}: {
  broker: BrokerDef
  existingConn: Connection | undefined
  connecting: string | null
  tokenForm: { brokerId: string; token: string; clientId: string } | null
  onConnect: (id: string) => void
  onOpenTokenForm: (id: string) => void
  onTokenFormChange: (field: 'token' | 'clientId', value: string) => void
  onTokenSubmit: () => void
  onCancelTokenForm: () => void
}) {
  const isFullyConnected = existingConn?.status === 'connected'
  const histLevel = broker.tradeHistoryLevel === 'excellent' ? 'green' : 'muted'
  const showTokenForm = tokenForm?.brokerId === broker.id

  return (
    <div className="terminal-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, background: broker.color, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: '#fff',
        }}>
          {broker.logo}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.85rem' }}>
            {broker.name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
            {broker.connection}
          </div>
        </div>
        {isFullyConnected && (
          <span className="badge badge-green" style={{ flexShrink: 0, alignSelf: 'flex-start' }}>CONNECTED</span>
        )}
      </div>

      {/* ── Capability badges ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        <CapBadge
          label={broker.tradeHistoryLevel === 'excellent' ? `⭐ ${broker.tradeHistory}` : `📅 ${broker.tradeHistory}`}
          level={histLevel}
        />
        <CapBadge label={broker.liveQuotes ? '📡 Live quotes' : '— No live data'} level={broker.liveQuotes ? 'green' : 'muted'} />
        <CapBadge label={broker.optionChain ? '🔗 Option chain' : '— No chain API'} level={broker.optionChain ? 'green' : 'muted'} />
        {broker.csvRequired && <CapBadge label="📄 CSV for history" level="amber" />}
      </div>

      {/* ── Trade history note ── */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
        {broker.tradeHistoryNote}
      </div>

      {/* ── CSV guide (collapsed if no CSV needed) ── */}
      {broker.csvRequired && broker.csvGuide && !isFullyConnected && (
        <div style={{
          background: 'rgba(255,170,0,0.04)', border: '1px solid rgba(255,170,0,0.15)',
          borderRadius: 4, padding: '0.5rem 0.625rem',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-amber-primary)', marginBottom: '0.35rem' }}>
            To import full history:
          </div>
          {broker.csvGuide.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'rgba(255,170,0,0.5)', fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{s}</span>
            </div>
          ))}
          <a href={broker.csvGuide.uploadUrl} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-amber-primary)', textDecoration: 'underline', display: 'inline-block', marginTop: '0.3rem' }}>
            → Go to Import Trades
          </a>
        </div>
      )}

      {/* ── Connect / Token form ── */}
      {isFullyConnected ? null : broker.manualToken ? (
        showTokenForm ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <input
              type="text"
              placeholder="Access Token (from web.dhan.co → API → New Token)"
              value={tokenForm?.token ?? ''}
              onChange={e => onTokenFormChange('token', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.4rem 0.5rem', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text-primary)', width: '100%' }}
            />
            <input
              type="text"
              placeholder="Client ID (e.g. 1102691389)"
              value={tokenForm?.clientId ?? ''}
              onChange={e => onTokenFormChange('clientId', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', padding: '0.4rem 0.5rem', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 4, color: 'var(--color-text-primary)', width: '100%' }}
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Generate at web.dhan.co → My Profile → API → New Token
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-primary"
                onClick={onTokenSubmit}
                disabled={connecting === broker.id}
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem' }}
              >
                {connecting === broker.id ? 'Connecting...' : 'Connect'}
              </button>
              <button className="btn-ghost" onClick={onCancelTokenForm} style={{ fontSize: '0.75rem' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn-primary"
            onClick={() => onOpenTokenForm(broker.id)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {existingConn ? `⟳ Reconnect ${broker.name}` : `Connect ${broker.name}`}
          </button>
        )
      ) : (
        <button
          className="btn-primary"
          onClick={() => onConnect(broker.id)}
          disabled={connecting === broker.id}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {connecting === broker.id ? 'Connecting...' : existingConn ? `⟳ Reconnect ${broker.name}` : `Connect ${broker.name}`}
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BrokersPage() {
  const { isAuthenticated } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [connecting, setConnecting]   = useState<string | null>(null)
  const [syncing, setSyncing]         = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [message, setMessage]         = useState<{ text: string; ok: boolean } | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [tokenForm, setTokenForm]     = useState<{ brokerId: string; token: string; clientId: string } | null>(null)

  const showMessage = (text: string, ok = true) => {
    setMessage({ text, ok })
    setTimeout(() => setMessage(null), 6000)
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

  const handleConnect = async (brokerId: string) => {
    if (!isAuthenticated) { window.location.href = '/login'; return }
    setConnecting(brokerId)
    try {
      const res = await brokerAPI.connect(brokerId)
      const oauthUrl = res.data.oauth_url ?? res.data.data?.oauth_url
      if (oauthUrl && oauthUrl !== '#') {
        window.location.href = oauthUrl
      } else {
        showMessage(res.data.message || `OAuth for ${brokerId} not yet configured.`, false)
      }
    } catch {
      showMessage('Connection failed. Please try again.', false)
    } finally {
      setConnecting(null)
    }
  }

  const connectWithManualToken = async () => {
    if (!tokenForm) return
    const { brokerId, token, clientId } = tokenForm
    if (!token.trim()) { showMessage('Access token is required.', false); return }
    setConnecting(brokerId)
    try {
      const res = await brokerAPI.connectWithToken(brokerId, token.trim(), clientId.trim() || undefined)
      const connId = res.data.connection?.id
      showMessage(`${brokerId} connected! Importing your trades...`, true)
      setTokenForm(null)
      fetchConnections()
      if (connId) {
        try {
          const syncRes = await brokerAPI.sync(connId)
          const count = syncRes.data.trades_synced ?? syncRes.data.data?.trades_synced ?? 0
          showMessage(`${brokerId} connected! Imported ${count} trade(s).`, true)
          fetchConnections()
        } catch { /* sync error — user can click Sync Now */ }
      }
    } catch {
      showMessage('Connection failed. Check your token and try again.', false)
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

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* OAuth callback handler */}
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

      {/* ── What each integration delivers ── */}
      <div className="terminal-card" style={{ padding: '1rem 1.25rem' }}>
        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
          <span className="section-header-text">What Each Broker Delivers</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Broker', 'Trade History via API', 'Live Quotes', 'Option Chain', 'Connection', 'For full history'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_BROKERS.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '0.45rem 0.75rem', fontWeight: 700, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: b.color, marginRight: 6, verticalAlign: 'middle' }} />
                    {b.name}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: b.tradeHistoryLevel === 'excellent' ? 'var(--color-positive)' : 'var(--color-amber-primary)', whiteSpace: 'nowrap' }}>
                    {b.tradeHistoryLevel === 'excellent' ? '⭐ ' : ''}{b.tradeHistory}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: b.liveQuotes ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                    {b.liveQuotes ? '✓' : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: b.optionChain ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                    {b.optionChain ? '✓' : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{b.connection}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: b.csvRequired ? 'var(--color-amber-primary)' : 'var(--color-positive)', whiteSpace: 'nowrap' }}>
                    {b.csvRequired ? '📄 CSV download' : '✓ Auto via API'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Note:</strong> All brokers support daily trade sync after connecting. Trade history limitation is per SEBI/broker API policy — brokers only expose today&apos;s tradebook via API (except Upstox and Dhan which allow historical access).
        </div>
      </div>

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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              Connect Upstox or Dhan for automatic trade history import.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {connections.map(conn => {
              const brokerDef = SUPPORTED_BROKERS.find(b => b.id === conn.broker_name)
              const isExpired = conn.status !== 'connected'
              return (
                <div key={conn.id} className="terminal-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: brokerDef?.color || '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.9rem', color: '#fff', flexShrink: 0 }}>
                      {brokerDef?.logo ?? conn.broker_name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        {conn.display_name || brokerDef?.name || conn.broker_name}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                        {conn.last_synced_at
                          ? `Last sync: ${new Date(conn.last_synced_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · `
                          : 'Never synced · '}
                        {conn.trade_count} trades imported
                        {brokerDef && (
                          <span style={{ marginLeft: 8, color: brokerDef.tradeHistoryLevel === 'excellent' ? 'var(--color-positive)' : 'var(--color-amber-primary)' }}>
                            · {brokerDef.tradeHistory}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span className={`badge ${conn.status === 'connected' ? 'badge-green' : 'badge-red'}`}>
                      {conn.status.toUpperCase()}
                    </span>

                    {isExpired ? (
                      <button
                        className="btn-primary"
                        onClick={() => brokerDef?.manualToken
                          ? setTokenForm({ brokerId: conn.broker_name, token: '', clientId: '' })
                          : handleConnect(conn.broker_name)
                        }
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
                      onClick={() => handleDisconnect(conn.id, brokerDef?.name ?? conn.broker_name)}
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

      {/* ── Add Broker ── */}
      <div>
        <div className="section-header"><span className="section-header-text">Add Broker Connection</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {SUPPORTED_BROKERS.map(broker => (
            <BrokerCard
              key={broker.id}
              broker={broker}
              existingConn={connections.find(c => c.broker_name === broker.id)}
              connecting={connecting}
              tokenForm={tokenForm}
              onConnect={handleConnect}
              onOpenTokenForm={(id) => setTokenForm({ brokerId: id, token: '', clientId: '' })}
              onTokenFormChange={(field, value) => setTokenForm(f => f ? { ...f, [field]: value } : null)}
              onTokenSubmit={connectWithManualToken}
              onCancelTokenForm={() => setTokenForm(null)}
            />
          ))}
        </div>
      </div>

      {/* ── SEBI / Regulatory note ── */}
      <div className="terminal-card" style={{ borderColor: 'rgba(255,255,255,0.06)', padding: '0.875rem 1rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--color-text-primary)' }}>Regulatory:</strong> Per SEBI&apos;s algo trading framework (effective Apr 2026), all API access tokens expire daily. TradeIQ uses read-only access only — no orders are placed on your behalf. Broker API tokens should be treated as sensitive credentials.
        </div>
      </div>
    </div>
  )
}
