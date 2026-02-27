import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ background: 'var(--color-bg-primary)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 560, padding: '2rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--color-amber-primary)', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
          POST-TRADE BEHAVIORAL INTELLIGENCE
        </div>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: '1rem', letterSpacing: '-0.03em' }}>
          Trade<span style={{ color: 'var(--color-amber-primary)' }}>IQ</span>
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
          Bloomberg-grade analytics for Indian retail traders.<br />
          Understand the behavioral patterns costing you money.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/dashboard" className="btn-primary" style={{ textDecoration: 'none', fontSize: '0.85rem', padding: '0.75rem 1.5rem' }}>
            Open Dashboard →
          </Link>
          <Link href="/login" className="btn-ghost" style={{ textDecoration: 'none', fontSize: '0.85rem', padding: '0.75rem 1.5rem' }}>
            Sign In
          </Link>
        </div>
        <div style={{ marginTop: '4rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { label: 'Behavioral Biases', value: '12+', desc: 'patterns detected' },
            { label: 'Win Rate Impact', value: '+23%', desc: 'after fixing top bias' },
            { label: 'Avg P&L Saved', value: '₹8,400', desc: 'per month identified' },
          ].map(item => (
            <div key={item.label} className="terminal-card" style={{ textAlign: 'center' }}>
              <div className="data-value-xl data-value-amber">{item.value}</div>
              <div className="data-label" style={{ marginTop: '0.25rem' }}>{item.label}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '0.125rem' }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <div className="disclaimer-banner" style={{ marginTop: '3rem', borderRadius: 4, borderTop: 'none', border: '1px solid var(--color-border-amber)' }}>
          FOR EDUCATIONAL PURPOSES ONLY — NOT INVESTMENT ADVICE — PAST PERFORMANCE DOES NOT GUARANTEE FUTURE RESULTS
        </div>
      </div>
    </main>
  )
}
