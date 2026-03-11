'use client'
import { useRouter } from 'next/navigation'

interface UpgradePromptProps {
  feature: string
  requiredPlan?: string
  onClose: () => void
}

export function UpgradePrompt({ feature, requiredPlan = 'Trader', onClose }: UpgradePromptProps) {
  const router = useRouter()
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border-amber)',
          borderRadius: 8, padding: '2rem', maxWidth: 400, width: '90%', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700,
          color: 'var(--color-text-primary)', marginBottom: '0.5rem',
        }}>
          Upgrade to {requiredPlan}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
          color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5,
        }}>
          {feature} requires the {requiredPlan} plan. Upgrade to unlock full analytics.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => router.push('/dashboard/settings?tab=plan')}>
            View Plans
          </button>
          <button className="btn-ghost" onClick={onClose}>Maybe Later</button>
        </div>
      </div>
    </div>
  )
}
