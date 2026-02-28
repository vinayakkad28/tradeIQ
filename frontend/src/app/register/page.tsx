'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      await register(form.email, form.password, form.fullName)
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
            TRADE<span style={{ color: 'var(--color-amber-primary)' }}>IQ</span>
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--color-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '0.375rem' }}>
            Create Your Account
          </div>
        </div>
        <div className="terminal-card" style={{ padding: '1.75rem' }}>
          <div className="section-header" style={{ marginBottom: '1.25rem' }}>
            <span className="section-header-text">REGISTER</span>
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { key: 'fullName', label: 'Full Name', type: 'text', placeholder: 'Vinayak K.' },
              { key: 'email', label: 'Email', type: 'email', placeholder: 'trader@example.com' },
              { key: 'password', label: 'Password', type: 'password', placeholder: '8+ characters' },
            ].map(field => (
              <div key={field.key}>
                <label className="data-label" style={{ display: 'block', marginBottom: '0.375rem' }}>{field.label}</label>
                <input
                  type={field.type}
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder={field.placeholder}
                  value={form[field.key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  required
                />
              </div>
            ))}
            {error && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-negative)', padding: '0.5rem', background: 'var(--color-negative-dim)', borderRadius: 3 }}>
                {error}
              </div>
            )}
            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.25rem' }}>
              {loading ? 'Creating account...' : 'Create Account →'}
            </button>
          </form>
          <div style={{ marginTop: '1.25rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: 'var(--color-amber-primary)', textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
