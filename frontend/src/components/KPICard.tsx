'use client'
import { InfoTooltip } from './InfoTooltip'

interface KPICardProps {
  label: string
  value: string
  className?: string
  tooltip?: string
  variant?: 'positive' | 'negative' | 'amber' | 'default'
  alert?: boolean
}

const variantClass: Record<string, string> = {
  positive: 'data-value-positive',
  negative: 'data-value-negative',
  amber: 'data-value-amber',
  default: '',
}

export function KPICard({ label, value, className, tooltip, variant = 'default', alert }: KPICardProps) {
  return (
    <div className={`kpi-card ${alert ? 'alert' : ''} ${className ?? ''}`}>
      <span className="data-label" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
      <span className={`data-value ${variantClass[variant]}`} style={{ fontSize: '1.1rem' }}>
        {value}
      </span>
    </div>
  )
}
