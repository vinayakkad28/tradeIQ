'use client'
import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { userAPI } from '@/lib/api'

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    period: 'forever',
    features: ['Up to 30 days analytics', 'CSV import', '1 broker connection', 'Basic insights'],
    color: 'var(--color-text-muted)',
  },
  {
    id: 'trader',
    name: 'Trader',
    price: '₹499',
    period: '/month',
    features: ['Unlimited date range', 'All 5 brokers', 'Trade journal', 'Weekly reports', 'Analytics cache (15 min)', 'Priority support'],
    color: 'var(--color-amber-primary)',
    recommended: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹1,499',
    period: '/month',
    features: ['Everything in Trader', 'API access', '1-hour cache', 'PDF exports', 'Multi-account', 'Custom alerts'],
    color: 'var(--color-positive)',
  },
]

const BROKER_ENV_KEYS = [
  { broker: 'Zerodha', apiKey: 'ZERODHA_API_KEY', apiSecret: 'ZERODHA_API_SECRET', docs: 'https://kite.trade/docs/connect/v3/' },
  { broker: 'Upstox', apiKey: 'UPSTOX_CLIENT_ID', apiSecret: 'UPSTOX_CLIENT_SECRET', docs: 'https://upstox.com/developer/api-documentation/' },
  { broker: 'Fyers', apiKey: 'FYERS_APP_ID', apiSecret: 'FYERS_SECRET_KEY', docs: 'https://myapi.fyers.in/docs/' },
  { broker: 'AngelOne', apiKey: 'ANGELONE_CLIENT_ID', apiSecret: 'ANGELONE_CLIENT_SECRET', docs: 'https://smartapi.angelbroking.com/docs' },
  { broker: 'Dhan', apiKey: 'DHAN_CLIENT_ID', apiSecret: 'DHAN_ACCESS_TOKEN', docs: 'https://dhanhq.co/docs/latest/' },
]

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const [tab, setTab] = useState<'profile' | 'plan' | 'api'>('profile')
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const handleSaveProfile = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await userAPI.update({ full_name: fullName })
      await refreshUser()
      setSaveMsg('Profile updated successfully.')
    } catch {
      setSaveMsg('Failed to save. Please try again.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 800 }}>

      <div>
        <div className="section-header"><span className="section-header-text">Settings</span></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        {([['profile', 'Profile'], ['plan', 'Plan & Billing'], ['api', 'API Keys']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.4rem 0.75rem',
              background: tab === t ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: tab === t ? 'var(--color-amber-primary)' : 'var(--color-text-muted)',
              border: `1px solid ${tab === t ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── PROFILE ── */}
      {tab === 'profile' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Account Details</span></div>

            {saveMsg && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(0,214,143,0.08)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-positive)' }}>
                {saveMsg}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div className="data-label-amber">Email</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  {user?.email ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Email cannot be changed</div>
              </div>

              <div>
                <div className="data-label-amber">Full Name</div>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                  style={{
                    width: '100%', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
                    background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border)', borderRadius: 4,
                    padding: '0.4rem 0.6rem', outline: 'none',
                  }}
                />
              </div>

              <div>
                <div className="data-label-amber">Plan</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                  <span className={`badge ${user?.plan === 'pro' ? 'badge-green' : user?.plan === 'trader' ? 'badge-amber' : ''}`} style={{ background: user?.plan === 'free' ? 'rgba(255,255,255,0.08)' : undefined }}>
                    {user?.plan?.toUpperCase() ?? 'FREE'}
                  </span>
                  <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => setTab('plan')}>Upgrade →</button>
                </div>
              </div>

              <div>
                <div className="data-label-amber">Member Since</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                </div>
              </div>
            </div>

            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <div className="terminal-card" style={{ borderColor: 'rgba(255,77,109,0.2)', background: 'rgba(255,77,109,0.04)' }}>
            <div className="section-header"><span className="section-header-text" style={{ color: 'var(--color-negative)' }}>Danger Zone</span></div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Deleting your account is permanent. All trades, journal entries, and analytics will be removed.
            </p>
            <button className="btn-ghost" style={{ color: 'var(--color-negative)', borderColor: 'rgba(255,77,109,0.3)', fontSize: '0.8rem' }}
              onClick={() => alert('Account deletion not yet implemented. Please contact support@tradeiq.in')}>
              Delete Account
            </button>
          </div>
        </div>
      )}

      {/* ── PLAN & BILLING ── */}
      {tab === 'plan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {PLANS.map(plan => {
              const isCurrent = user?.plan === plan.id
              return (
                <div key={plan.id} className="terminal-card" style={{
                  display: 'flex', flexDirection: 'column', gap: '0.75rem',
                  border: isCurrent ? `1px solid ${plan.color}` : undefined,
                  background: isCurrent ? `rgba(245,158,11,0.04)` : undefined,
                  position: 'relative',
                }}>
                  {plan.recommended && (
                    <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-amber-primary)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: 10, fontWeight: 800 }}>
                      POPULAR
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: plan.color }}>{plan.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
                      {plan.price}<span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>{plan.period}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
                        <span style={{ color: plan.color }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                  {isCurrent ? (
                    <span className="badge badge-green" style={{ alignSelf: 'flex-start' }}>CURRENT PLAN</span>
                  ) : (
                    <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                      onClick={() => alert('Razorpay billing coming soon. Email billing@tradeiq.in to upgrade early.')}>
                      {user?.plan === 'pro' ? 'Downgrade' : 'Upgrade'} to {plan.name}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="terminal-card-amber">
            <div className="section-header"><span className="section-header-text">Payment & Billing</span></div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              Payments via Razorpay — UPI, Net Banking, Credit/Debit cards accepted.<br />
              Annual billing available at 20% discount. GST invoices provided automatically.<br />
              Cancel anytime. Access continues until end of billing cycle.
            </p>
          </div>
        </div>
      )}

      {/* ── API KEYS ── */}
      {tab === 'api' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="terminal-card-amber">
            <div className="section-header"><span className="section-header-text">Broker API Configuration</span></div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              To enable live broker sync, add these environment variables to your gateway server (or <code>.env</code> file).
              API keys are never stored in the database — only the access tokens from OAuth are stored (encrypted).
            </p>
          </div>

          {BROKER_ENV_KEYS.map(b => (
            <div key={b.broker} className="terminal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{b.broker}</div>
                <a href={b.docs} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-amber-primary)', textDecoration: 'none' }}>
                  API Docs →
                </a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {[
                  { label: 'API Key / Client ID', envKey: b.apiKey },
                  { label: 'API Secret / Client Secret', envKey: b.apiSecret },
                ].map(field => (
                  <div key={field.envKey} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', width: 160 }}>{field.label}</span>
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-amber-primary)', flex: 1 }}>
                      {field.envKey}=your_{field.envKey.toLowerCase()}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Example .env</span></div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 4, overflowX: 'auto', lineHeight: 1.8 }}>
{`# Zerodha Kite API
ZERODHA_API_KEY=your_api_key
ZERODHA_API_SECRET=your_api_secret

# Upstox Pro API v2
UPSTOX_CLIENT_ID=your_client_id
UPSTOX_CLIENT_SECRET=your_client_secret

# Fyers API v3
FYERS_APP_ID=your_app_id
FYERS_SECRET_KEY=your_secret_key

# App URLs
APP_BASE_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000`}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
