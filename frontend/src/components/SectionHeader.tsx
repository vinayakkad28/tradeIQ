'use client'
import { InfoTooltip } from './InfoTooltip'

interface SectionHeaderProps {
  title: string
  tooltip?: string
}

export function SectionHeader({ title, tooltip }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <span className="section-header-text" style={{ display: 'inline-flex', alignItems: 'center' }}>
        {title}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
    </div>
  )
}
