'use client'
import Link from 'next/link'

interface EmptyStateProps {
  icon?: string
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
}

export function EmptyState({ icon = '◇', title, description, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '3rem 2rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.3 }}>{icon}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700,
        color: 'var(--color-text-primary)', marginBottom: '0.5rem',
      }}>
        {title}
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.75rem',
        color: 'var(--color-text-muted)', maxWidth: 400, lineHeight: 1.5,
        marginBottom: actionLabel ? '1.25rem' : 0,
      }}>
        {description}
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-primary" style={{ textDecoration: 'none' }}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionHref && (
        <button className="btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  )
}
