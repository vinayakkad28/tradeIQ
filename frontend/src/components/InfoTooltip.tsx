export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="info-tooltip-wrapper">
      <span className="info-tooltip-icon">ⓘ</span>
      <span className="info-tooltip-box">{text}</span>
    </span>
  )
}
