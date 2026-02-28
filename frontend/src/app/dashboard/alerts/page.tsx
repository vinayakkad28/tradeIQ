'use client'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'

type Alert = {
  id: string
  type: 'behavioral' | 'pnl' | 'vix' | 'streak'
  label: string
  condition: string
  threshold: number
  enabled: boolean
  triggered: boolean
  lastTriggered?: string
}

const ALERT_TEMPLATES = [
  { type: 'behavioral' as const, label: 'Revenge Trade Warning', condition: 'Re-entry after loss within 5 min', threshold: 1 },
  { type: 'pnl' as const, label: 'Daily Loss Limit', condition: 'Daily P&L drops below ₹', threshold: -5000 },
  { type: 'pnl' as const, label: 'Profit Target', condition: 'Daily P&L reaches ₹', threshold: 10000 },
  { type: 'vix' as const, label: 'High VIX Warning', condition: 'India VIX crosses', threshold: 20 },
  { type: 'streak' as const, label: 'Losing Streak Alert', condition: 'Consecutive losses ≥', threshold: 3 },
]

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace('/api/v1', '')

export default function AlertsPage() {
  const { isAuthenticated } = useAuth()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [wsMessages, setWsMessages] = useState<{ type: string; message: string; at: string }[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  // Load saved alerts from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tradeiq_alerts')
    if (saved) {
      try { setAlerts(JSON.parse(saved)) } catch { setAlerts(defaultAlerts()) }
    } else {
      setAlerts(defaultAlerts())
    }
  }, [])

  const saveAlerts = (updated: Alert[]) => {
    setAlerts(updated)
    localStorage.setItem('tradeiq_alerts', JSON.stringify(updated))
  }

  // WebSocket connection
  const connectWS = () => {
    if (!isAuthenticated) return
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) return

    setWsStatus('connecting')
    const wsUrl = BASE_URL.replace('http', 'ws') + '/api/v1/ws/live?token=' + token
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setWsStatus('connected')
      addWsMessage('system', 'Connected to TradeIQ live feed')
    }
    ws.onclose = () => {
      setWsStatus('disconnected')
      addWsMessage('system', 'Disconnected from live feed')
    }
    ws.onerror = () => {
      setWsStatus('disconnected')
      addWsMessage('error', 'Connection failed — server may not be running')
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        addWsMessage(msg.type, JSON.stringify(msg.payload))
      } catch {
        addWsMessage('raw', event.data)
      }
    }

    wsRef.current = ws
  }

  const disconnectWS = () => {
    wsRef.current?.close()
    wsRef.current = null
  }

  const addWsMessage = (type: string, message: string) => {
    setWsMessages(prev => [
      { type, message, at: new Date().toLocaleTimeString('en-IN') },
      ...prev.slice(0, 49), // keep last 50
    ])
  }

  useEffect(() => () => { wsRef.current?.close() }, [])

  const toggleAlert = (id: string) => {
    saveAlerts(alerts.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a))
  }

  const updateThreshold = (id: string, value: number) => {
    saveAlerts(alerts.map(a => a.id === id ? { ...a, threshold: value } : a))
  }

  const categoryColor = (type: Alert['type']) => {
    switch (type) {
      case 'behavioral': return 'var(--color-negative)'
      case 'pnl': return 'var(--color-amber-primary)'
      case 'vix': return 'var(--color-positive)'
      case 'streak': return 'var(--color-negative)'
    }
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      <div>
        <div className="section-header"><span className="section-header-text">Alerts & Live Feed</span></div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Smart alerts for behavioral patterns, P&L limits, and market conditions.
        </p>
      </div>

      {/* WebSocket Panel */}
      <div className="terminal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div className="section-header" style={{ margin: 0 }}><span className="section-header-text">Live Feed</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: wsStatus === 'connected' ? 'var(--color-positive)' : wsStatus === 'connecting' ? 'var(--color-amber-primary)' : 'rgba(255,255,255,0.2)',
                animation: wsStatus === 'connecting' ? 'pulse 1s infinite' : undefined,
              }} />
              <span style={{ color: wsStatus === 'connected' ? 'var(--color-positive)' : 'var(--color-text-muted)' }}>
                {wsStatus === 'connected' ? 'LIVE' : wsStatus === 'connecting' ? 'CONNECTING...' : 'OFFLINE'}
              </span>
            </span>
            {wsStatus === 'disconnected' ? (
              <button className="btn-primary" style={{ fontSize: '0.7rem' }} onClick={connectWS} disabled={!isAuthenticated}>
                {isAuthenticated ? 'Connect' : 'Login Required'}
              </button>
            ) : (
              <button className="btn-ghost" style={{ fontSize: '0.7rem', color: 'var(--color-negative)', borderColor: 'rgba(255,77,109,0.2)' }} onClick={disconnectWS}>
                Disconnect
              </button>
            )}
          </div>
        </div>

        <div style={{ height: 200, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', display: 'flex', flexDirection: 'column-reverse' }}>
          {wsMessages.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', padding: '0.5rem' }}>No messages yet. Connect to receive live events.</div>
          ) : wsMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.75rem', padding: '0.15rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: 'var(--color-text-muted)', minWidth: 65 }}>{msg.at}</span>
              <span style={{ color: msg.type === 'error' ? 'var(--color-negative)' : msg.type === 'system' ? 'var(--color-amber-primary)' : 'var(--color-positive)' }}>
                [{msg.type.toUpperCase()}]
              </span>
              <span style={{ color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alert Rules */}
      <div>
        <div className="section-header"><span className="section-header-text">Alert Rules</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {alerts.map(alert => (
            <div key={alert.id} className="terminal-card" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: alert.enabled ? 1 : 0.5,
              borderColor: alert.triggered ? categoryColor(alert.type) : undefined,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: alert.enabled ? categoryColor(alert.type) : 'rgba(255,255,255,0.15)',
                }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{alert.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
                    {alert.condition} {alert.type === 'pnl' ? '' : alert.threshold}
                    {alert.lastTriggered && <span style={{ color: 'var(--color-amber-primary)', marginLeft: '0.5rem' }}>Last: {alert.lastTriggered}</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {(alert.type === 'pnl' || alert.type === 'vix' || alert.type === 'streak') && (
                  <input
                    type="number"
                    value={alert.threshold}
                    onChange={e => updateThreshold(alert.id, Number(e.target.value))}
                    style={{
                      width: 90, fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                      background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)', borderRadius: 4,
                      padding: '0.3rem 0.5rem', textAlign: 'right', outline: 'none',
                    }}
                  />
                )}
                {/* Toggle switch */}
                <div
                  onClick={() => toggleAlert(alert.id)}
                  style={{
                    width: 40, height: 22, borderRadius: 11,
                    background: alert.enabled ? categoryColor(alert.type) : 'rgba(255,255,255,0.1)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: alert.enabled ? 20 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                  }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notification Channels */}
      <div className="terminal-card-amber">
        <div className="section-header"><span className="section-header-text">Notification Channels</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { channel: 'In-App', desc: 'Real-time alerts in the dashboard notification bell', status: 'Active', cls: 'badge-green' },
            { channel: 'Telegram Bot', desc: 'Connect @TradeIQBot to your Telegram account', status: 'Coming Soon', cls: 'badge-amber' },
            { channel: 'Email Digest', desc: 'Daily P&L summary + behavioral alerts via email', status: 'Coming Soon', cls: 'badge-amber' },
          ].map(ch => (
            <div key={ch.channel}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>{ch.channel}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{ch.desc}</div>
              <span className={`badge ${ch.cls}`} style={{ marginTop: '0.5rem', display: 'inline-block' }}>{ch.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function defaultAlerts(): Alert[] {
  return ALERT_TEMPLATES.map((t, i) => ({
    id: `alert-${i}`,
    ...t,
    enabled: i === 0 || i === 1, // first two on by default
    triggered: false,
  }))
}
