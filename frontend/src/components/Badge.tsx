'use client'

interface BadgeProps {
  children: React.ReactNode
  variant: 'red' | 'green' | 'amber' | 'indigo' | 'muted'
  style?: React.CSSProperties
}

export function Badge({ children, variant, style }: BadgeProps) {
  return (
    <span className={`badge badge-${variant}`} style={style}>
      {children}
    </span>
  )
}
