'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
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

const AVATAR_COLORS: { id: string; label: string; hex: string }[] = [
  { id: 'amber',  label: 'Amber',  hex: '#f59e0b' },
  { id: 'green',  label: 'Green',  hex: '#00d68f' },
  { id: 'blue',   label: 'Blue',   hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'red',    label: 'Red',    hex: '#ef4444' },
]

const EXPERIENCE_OPTIONS = [
  { value: 'beginner',      label: 'Beginner (< 1 year)' },
  { value: 'intermediate',  label: 'Intermediate (1–3 years)' },
  { value: 'advanced',      label: 'Advanced (3–7 years)' },
  { value: 'professional',  label: 'Professional (7+ years)' },
]

const STYLE_OPTIONS = [
  { value: 'scalper',    label: 'Scalper (seconds to minutes)' },
  { value: 'intraday',   label: 'Intraday (same-day trades)' },
  { value: 'swing',      label: 'Swing Trader (days to weeks)' },
  { value: 'positional', label: 'Positional (weeks to months)' },
]

const BROKER_ENV_KEYS = [
  { broker: 'Zerodha',  apiKey: 'ZERODHA_API_KEY',    apiSecret: 'ZERODHA_API_SECRET',    docs: 'https://kite.trade/docs/connect/v3/' },
  { broker: 'Upstox',   apiKey: 'UPSTOX_CLIENT_ID',   apiSecret: 'UPSTOX_CLIENT_SECRET',  docs: 'https://upstox.com/developer/api-documentation/' },
  { broker: 'Fyers',    apiKey: 'FYERS_APP_ID',        apiSecret: 'FYERS_SECRET_KEY',      docs: 'https://myapi.fyers.in/docs/' },
  { broker: 'AngelOne', apiKey: 'ANGELONE_CLIENT_ID',  apiSecret: 'ANGELONE_CLIENT_SECRET',docs: 'https://smartapi.angelbroking.com/docs' },
  { broker: 'Dhan',     apiKey: 'DHAN_CLIENT_ID',      apiSecret: 'DHAN_ACCESS_TOKEN',     docs: 'https://dhanhq.co/docs/latest/' },
]

type Tab = 'profile' | 'security' | 'plan' | 'developer'

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
    background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 4,
    padding: '0.4rem 0.6rem', outline: 'none', boxSizing: 'border-box',
    ...extra,
  }
}

function selectStyle(): React.CSSProperties {
  return {
    width: '100%', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem',
    background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)', borderRadius: 4,
    padding: '0.4rem 0.6rem', outline: 'none', cursor: 'pointer',
  }
}

function SettingsPageInner() {
  const { user, refreshUser } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    if (t === 'plan' || t === 'security' || t === 'developer') return t
    return 'profile'
  })

  // Sync ?tab= param
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'plan' || t === 'security' || t === 'developer') setTab(t)
    else if (!t) setTab('profile')
  }, [searchParams])

  const switchTab = (t: Tab) => {
    setTab(t)
    router.replace(`/dashboard/settings${t === 'profile' ? '' : `?tab=${t}`}`, { scroll: false })
  }

  // ── Profile form state ──
  const [fullName, setFullName]               = useState(user?.full_name ?? '')
  const [phone, setPhone]                     = useState(user?.phone_number ?? '')
  const [experience, setExperience]           = useState<string>(user?.trading_experience ?? 'beginner')
  const [style, setStyle]                     = useState<string>(user?.trading_style ?? 'intraday')
  const [avatarColor, setAvatarColor]         = useState<string>(user?.avatar_color ?? 'amber')
  const [saving, setSaving]                   = useState(false)
  const [saveMsg, setSaveMsg]                 = useState('')

  // Sync form when user loads
  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '')
      setPhone(user.phone_number ?? '')
      setExperience(user.trading_experience ?? 'beginner')
      setStyle(user.trading_style ?? 'intraday')
      setAvatarColor(user.avatar_color ?? 'amber')
    }
  }, [user])

  const handleSaveProfile = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await userAPI.update({ full_name: fullName, phone_number: phone, trading_experience: experience, trading_style: style, avatar_color: avatarColor })
      await refreshUser()
      setSaveMsg('Profile saved.')
    } catch {
      setSaveMsg('Failed to save. Please try again.')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }

  // ── Security form state ──
  const [currentPwd, setCurrentPwd]     = useState('')
  const [newPwd, setNewPwd]             = useState('')
  const [confirmPwd, setConfirmPwd]     = useState('')
  const [pwdSaving, setPwdSaving]       = useState(false)
  const [pwdMsg, setPwdMsg]             = useState<{ text: string; ok: boolean } | null>(null)

  const handleChangePassword = async () => {
    if (newPwd !== confirmPwd) {
      setPwdMsg({ text: 'New passwords do not match.', ok: false })
      return
    }
    if (newPwd.length < 8) {
      setPwdMsg({ text: 'Password must be at least 8 characters.', ok: false })
      return
    }
    setPwdSaving(true)
    setPwdMsg(null)
    try {
      await userAPI.changePassword(currentPwd, newPwd)
      setPwdMsg({ text: 'Password changed successfully.', ok: true })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to change password.'
      setPwdMsg({ text: msg, ok: false })
    } finally {
      setPwdSaving(false)
      setTimeout(() => setPwdMsg(null), 5000)
    }
  }

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email ?? '').slice(0, 2).toUpperCase()

  const avatarHex = AVATAR_COLORS.find(c => c.id === avatarColor)?.hex ?? '#f59e0b'

  const TABS: { id: Tab; label: string }[] = [
    { id: 'profile',   label: 'Profile' },
    { id: 'security',  label: 'Security' },
    { id: 'plan',      label: 'Plan & Billing' },
    { id: 'developer', label: 'Developer' },
  ]

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 820 }}>

      <div>
        <div className="section-header"><span className="section-header-text">Settings</span></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '0.8rem', padding: '0.4rem 0.75rem',
              background: tab === id ? 'rgba(245,158,11,0.12)' : 'transparent',
              color: tab === id ? 'var(--color-amber-primary)' : 'var(--color-text-muted)',
              border: `1px solid ${tab === id ? 'rgba(245,158,11,0.3)' : 'transparent'}`,
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

          {/* Avatar + Identity */}
          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Identity</span></div>

            {saveMsg && (
              <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(0,214,143,0.08)', border: '1px solid rgba(0,214,143,0.2)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-positive)' }}>
                {saveMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* Avatar preview */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', minWidth: 100 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', background: avatarHex,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 800, color: '#000',
                  transition: 'background 0.2s',
                }}>
                  {initials || 'VK'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Avatar Color</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c.id}
                      title={c.label}
                      onClick={() => setAvatarColor(c.id)}
                      style={{
                        width: 20, height: 20, borderRadius: '50%', background: c.hex,
                        border: avatarColor === c.id ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer', outline: 'none', padding: 0,
                        boxShadow: avatarColor === c.id ? `0 0 0 2px ${c.hex}` : 'none',
                        transition: 'box-shadow 0.15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Form fields */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minWidth: 240 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <div className="data-label-amber">Full Name</div>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Your full name"
                      style={inputStyle()}
                    />
                  </div>
                  <div>
                    <div className="data-label-amber">Phone Number</div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      style={inputStyle()}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <div className="data-label-amber">Trading Experience</div>
                    <select value={experience} onChange={e => setExperience(e.target.value)} style={selectStyle()}>
                      {EXPERIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="data-label-amber">Trading Style</div>
                    <select value={style} onChange={e => setStyle(e.target.value)} style={selectStyle()}>
                      {STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>

          {/* Account info */}
          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Account Info</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <div className="data-label-amber">Email</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  {user?.email ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Email cannot be changed</div>
              </div>
              <div>
                <div className="data-label-amber">Member Since</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                </div>
              </div>
              <div>
                <div className="data-label-amber">Plan</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', alignItems: 'center' }}>
                  <span className={`badge ${user?.plan === 'pro' ? 'badge-green' : user?.plan === 'trader' ? 'badge-amber' : ''}`} style={{ background: user?.plan === 'free' ? 'rgba(255,255,255,0.08)' : undefined }}>
                    {user?.plan?.toUpperCase() ?? 'FREE'}
                  </span>
                  <button className="btn-ghost" style={{ fontSize: '0.7rem' }} onClick={() => switchTab('plan')}>Upgrade →</button>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
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

      {/* ── SECURITY ── */}
      {tab === 'security' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Change Password</span></div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Choose a strong password with at least 8 characters.
            </p>

            {pwdMsg && (
              <div style={{
                marginBottom: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 4,
                fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
                background: pwdMsg.ok ? 'rgba(0,214,143,0.08)' : 'rgba(255,77,109,0.08)',
                border: `1px solid ${pwdMsg.ok ? 'rgba(0,214,143,0.2)' : 'rgba(255,77,109,0.2)'}`,
                color: pwdMsg.ok ? 'var(--color-positive)' : 'var(--color-negative)',
              }}>
                {pwdMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 400 }}>
              <div>
                <div className="data-label-amber">Current Password</div>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  placeholder="Enter current password"
                  style={inputStyle()}
                />
              </div>
              <div>
                <div className="data-label-amber">New Password</div>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="At least 8 characters"
                  style={inputStyle()}
                />
              </div>
              <div>
                <div className="data-label-amber">Confirm New Password</div>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder="Repeat new password"
                  style={inputStyle({
                    borderColor: confirmPwd && confirmPwd !== newPwd ? 'rgba(255,77,109,0.5)' : undefined,
                  })}
                />
                {confirmPwd && confirmPwd !== newPwd && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-negative)', marginTop: '0.25rem' }}>
                    Passwords do not match
                  </div>
                )}
              </div>
              <button
                className="btn-primary"
                style={{ marginTop: '0.25rem', alignSelf: 'flex-start' }}
                onClick={handleChangePassword}
                disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}
              >
                {pwdSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>

          <div className="terminal-card">
            <div className="section-header"><span className="section-header-text">Active Sessions</span></div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              You are currently signed in on this device. Changing your password will not revoke existing sessions — sign out and back in to refresh.
            </p>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', borderRadius: 4 }}>
              <span style={{ fontSize: '0.9rem' }}>💻</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-text-primary)' }}>This device</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>Browser session · Active now</div>
              </div>
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>CURRENT</span>
            </div>
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

      {/* ── DEVELOPER ── */}
      {tab === 'developer' && (
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

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Loading settings...</div>}>
      <SettingsPageInner />
    </Suspense>
  )
}
