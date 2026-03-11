'use client'

interface LoadingSpinnerProps {
  label?: string
  size?: 'sm' | 'md'
}

export function LoadingSpinner({ label = 'Loading...', size = 'md' }: LoadingSpinnerProps) {
  const dim = size === 'sm' ? 16 : 24
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
      padding: size === 'sm' ? '0.5rem' : '2rem',
    }}>
      <svg width={dim} height={dim} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
        <circle cx="12" cy="12" r="10" stroke="var(--color-border)" strokeWidth="3" fill="none" />
        <circle cx="12" cy="12" r="10" stroke="var(--color-amber-primary)" strokeWidth="3" fill="none"
          strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: size === 'sm' ? '0.7rem' : '0.8rem',
        color: 'var(--color-text-muted)',
      }}>
        {label}
      </span>
    </div>
  )
}
