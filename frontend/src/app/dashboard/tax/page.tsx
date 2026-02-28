'use client'
import { useState } from 'react'
import { useDateRange } from '@/context/DateRangeContext'

type TaxCategory = 'intraday_eq' | 'stcg' | 'ltcg' | 'fno'

type TaxBreakdown = {
  category: TaxCategory
  label: string
  grossPnL: number
  expenses: number
  taxableIncome: number
  taxRate: number
  taxPayable: number
  stt: number
  stampDuty: number
  brokerage: number
  description: string
}

const STT_RATES: Record<string, number> = {
  intraday_eq: 0.025 / 100,  // 0.025% on sell side
  stcg: 0.1 / 100,            // 0.1% on sell side
  ltcg: 0.1 / 100,
  fno: 0.02 / 100,            // 0.02% on sell side (futures), 0.1% options
}

export default function TaxPage() {
  const { insights } = useDateRange()

  // Manual inputs
  const [fy, setFy] = useState('2024-25')
  const [salariedIncome, setSalariedIncome] = useState(0)
  const [regime, setRegime] = useState<'old' | 'new'>('new')
  const [intradayPnL, setIntradayPnL] = useState(insights.totalPnl ?? 0)
  const [stcgPnL, setStcgPnL] = useState(0)
  const [ltcgPnL, setLtcgPnL] = useState(0)
  const [fnoPnL, setFnoPnL] = useState(0)
  const [turnover, setTurnover] = useState(5000000) // ₹50L
  const [brokerage, setBrokerage] = useState(5000)

  const calcBreakdowns = (): TaxBreakdown[] => {
    const breakdowns: TaxBreakdown[] = []

    // Intraday Equity — Speculative Business Income
    if (intradayPnL !== 0) {
      const taxableIncome = Math.max(0, intradayPnL - brokerage * 0.3)
      const stt = turnover * STT_RATES.intraday_eq
      breakdowns.push({
        category: 'intraday_eq',
        label: 'Intraday Equity',
        grossPnL: intradayPnL,
        expenses: brokerage * 0.3,
        taxableIncome,
        taxRate: slabRate(salariedIncome + taxableIncome, regime),
        taxPayable: taxableIncome * slabRate(salariedIncome + taxableIncome, regime) / 100,
        stt,
        stampDuty: turnover * 0.00003,
        brokerage: brokerage * 0.3,
        description: 'Treated as speculative business income. Set off only against speculative gains.',
      })
    }

    // STCG — Short-Term Capital Gains (held < 12 months)
    if (stcgPnL !== 0) {
      const taxableIncome = Math.max(0, stcgPnL)
      breakdowns.push({
        category: 'stcg',
        label: 'STCG (Equity < 12M)',
        grossPnL: stcgPnL,
        expenses: 0,
        taxableIncome,
        taxRate: 20, // Post Budget 2024: 20% flat
        taxPayable: taxableIncome > 0 ? taxableIncome * 0.20 : 0,
        stt: 0,
        stampDuty: 0,
        brokerage: 0,
        description: 'Short-term capital gains on listed equity/MFs. Flat 20% tax (post July 2024).',
      })
    }

    // LTCG — Long-Term Capital Gains (held > 12 months)
    if (ltcgPnL !== 0) {
      const exemptLimit = 125000 // ₹1.25L exempt per year (post Jul 2024)
      const taxableIncome = Math.max(0, ltcgPnL - exemptLimit)
      breakdowns.push({
        category: 'ltcg',
        label: 'LTCG (Equity > 12M)',
        grossPnL: ltcgPnL,
        expenses: 0,
        taxableIncome,
        taxRate: 12.5, // Post Budget 2024: 12.5% flat
        taxPayable: taxableIncome > 0 ? taxableIncome * 0.125 : 0,
        stt: 0,
        stampDuty: 0,
        brokerage: 0,
        description: `LTCG on listed equity. First ₹1.25L exempt. 12.5% on gains above that.`,
      })
    }

    // F&O — Non-Speculative Business Income
    if (fnoPnL !== 0) {
      const businessExpenses = brokerage * 0.7
      const taxableIncome = Math.max(0, fnoPnL - businessExpenses)
      const stt = turnover * STT_RATES.fno
      breakdowns.push({
        category: 'fno',
        label: 'F&O Trading',
        grossPnL: fnoPnL,
        expenses: businessExpenses,
        taxableIncome,
        taxRate: slabRate(salariedIncome + taxableIncome, regime),
        taxPayable: taxableIncome * slabRate(salariedIncome + taxableIncome, regime) / 100,
        stt,
        stampDuty: turnover * 0.00002,
        brokerage: businessExpenses,
        description: 'F&O is non-speculative business income. Can deduct expenses (brokerage, internet, advisory). Can offset against other business income.',
      })
    }

    return breakdowns
  }

  const breakdowns = calcBreakdowns()
  const totalTax = breakdowns.reduce((s, b) => s + b.taxPayable, 0)
  const totalSurcharge = surcharge(totalTax)
  const cess = (totalTax + totalSurcharge) * 0.04
  const totalTaxFinal = totalTax + totalSurcharge + cess

  // Tax audit threshold: turnover > ₹10Cr (no audit if profit > 6% of turnover)
  const auditRequired = turnover > 10000000 || (fnoPnL < 0 && turnover > 1000000)

  return (
    <div className="page-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 900 }}>

      {/* Header */}
      <div>
        <div className="section-header"><span className="section-header-text">Tax Calculator</span></div>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
          Estimate your trading tax liability for FY {fy}. Based on Indian tax law (Finance Act 2024).
        </p>
      </div>

      {/* Inputs */}
      <div className="terminal-card">
        <div className="section-header"><span className="section-header-text">Income Details</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {[
            { label: 'Financial Year', type: 'select', options: ['2024-25', '2025-26'], value: fy, onChange: setFy },
          ].map(f => (
            <div key={f.label}>
              <div className="data-label-amber">{f.label}</div>
              <select
                value={f.value as string}
                onChange={e => (f.onChange as (v: string) => void)(e.target.value)}
                style={{ width: '100%', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '0.4rem 0.6rem' }}
              >
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <div className="data-label-amber">Tax Regime</div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
              {(['new', 'old'] as const).map(r => (
                <button key={r} className={`range-pill ${regime === r ? 'active' : ''}`} onClick={() => setRegime(r)}>
                  {r === 'new' ? 'New (Default)' : 'Old'}
                </button>
              ))}
            </div>
          </div>
          <InputField label="Salary / Other Income (₹)" value={salariedIncome} onChange={setSalariedIncome} />
        </div>

        <div style={{ marginTop: '1rem' }}>
          <div className="data-label-amber" style={{ marginBottom: '0.5rem' }}>Trading Income (from your trades)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <InputField label="Intraday Equity P&L (₹)" value={intradayPnL} onChange={setIntradayPnL} />
            <InputField label="STCG — Short-Term Equity P&L (₹)" value={stcgPnL} onChange={setStcgPnL} />
            <InputField label="LTCG — Long-Term Equity P&L (₹)" value={ltcgPnL} onChange={setLtcgPnL} />
            <InputField label="F&O Net P&L (₹)" value={fnoPnL} onChange={setFnoPnL} hint="Use negative for loss" />
            <InputField label="Approximate Turnover (₹)" value={turnover} onChange={setTurnover} hint="Total buy+sell value" />
            <InputField label="Brokerage + Charges (₹)" value={brokerage} onChange={setBrokerage} />
          </div>
        </div>
      </div>

      {/* Results */}
      {breakdowns.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {[
              { label: 'Total Tax (before cess)', value: `₹${totalTax.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: 'data-value-negative' },
              { label: 'Surcharge + 4% Cess', value: `₹${(totalSurcharge + cess).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: 'data-value-amber' },
              { label: 'Total Tax Payable', value: `₹${totalTaxFinal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: 'data-value-negative' },
            ].map(s => (
              <div key={s.label} className="terminal-card">
                <div className="data-label">{s.label}</div>
                <div className={`data-value ${s.cls}`} style={{ fontSize: '1.1rem', marginTop: '0.25rem' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Breakdown per category */}
          {breakdowns.map(bd => (
            <div key={bd.category} className="terminal-card">
              <div className="section-header"><span className="section-header-text">{bd.label}</span></div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>{bd.description}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                {[
                  { label: 'Gross P&L', value: `${bd.grossPnL >= 0 ? '+' : ''}₹${bd.grossPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: bd.grossPnL >= 0 ? 'data-value-positive' : 'data-value-negative' },
                  { label: 'Deductible Expenses', value: `₹${bd.expenses.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: '' },
                  { label: 'Taxable Income', value: `₹${bd.taxableIncome.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: '' },
                  { label: `Tax @ ${bd.taxRate.toFixed(1)}%`, value: `₹${bd.taxPayable.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, cls: 'data-value-negative' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="data-label">{s.label}</div>
                    <div className={`data-value ${s.cls}`} style={{ fontSize: '0.9rem', marginTop: '0.2rem' }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {bd.stt > 0 && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem' }}>
                  <div className="data-label">STT: <span style={{ color: 'var(--color-text-secondary)' }}>₹{bd.stt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                  <div className="data-label">Stamp Duty: <span style={{ color: 'var(--color-text-secondary)' }}>₹{bd.stampDuty.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span></div>
                </div>
              )}
            </div>
          ))}

          {/* Tax Audit */}
          <div className={`terminal-card${auditRequired ? '' : '-amber'}`} style={{ borderColor: auditRequired ? 'rgba(255,77,109,0.3)' : undefined, background: auditRequired ? 'rgba(255,77,109,0.05)' : undefined }}>
            <div className="section-header">
              <span className="section-header-text" style={{ color: auditRequired ? 'var(--color-negative)' : undefined }}>
                Tax Audit Requirement
              </span>
            </div>
            {auditRequired ? (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-negative)', lineHeight: 1.6 }}>
                ⚠️ Based on your turnover (₹{(turnover / 100000).toFixed(1)}L), a <strong>Tax Audit (44AB)</strong> may be required. Consult a CA.
                F&O losses require ITR-3 filing. Deadline: Oct 31 (with audit) or Jul 31 (without audit).
              </p>
            ) : (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                Based on your inputs, tax audit is likely not required. File ITR-3 (for F&O income) or ITR-2 (for STCG/LTCG only).
                Maintain contract notes and ledger statements for 8 years.
              </p>
            )}
          </div>
        </>
      )}

      <div className="disclaimer-banner" style={{ borderRadius: 4, border: '1px solid var(--color-border-amber)' }}>
        This is an estimate only. Consult a CA for accurate tax filing. Tax rates are based on Finance Act 2024.
      </div>
    </div>
  )
}

function InputField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div>
      <div className="data-label-amber">{label}{hint && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.65rem', marginLeft: '0.3rem' }}>({hint})</span>}</div>
      <input
        type="number"
        value={value || ''}
        onChange={e => onChange(Number(e.target.value))}
        placeholder="0"
        style={{
          width: '100%', marginTop: '0.25rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
          background: 'var(--color-bg-card)', color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)', borderRadius: 4,
          padding: '0.4rem 0.6rem', outline: 'none',
        }}
      />
    </div>
  )
}

// ─── TAX CALCULATION HELPERS ─────────────────────────────

function slabRate(income: number, regime: 'old' | 'new'): number {
  if (regime === 'new') {
    if (income <= 300000) return 0
    if (income <= 700000) return 5
    if (income <= 1000000) return 10
    if (income <= 1200000) return 15
    if (income <= 1500000) return 20
    return 30
  }
  // Old regime
  if (income <= 250000) return 0
  if (income <= 500000) return 5
  if (income <= 1000000) return 20
  return 30
}

function surcharge(tax: number): number {
  if (tax <= 0) return 0
  // Simplified surcharge (income-based, approximate)
  if (tax > 10000000) return tax * 0.15
  if (tax > 5000000) return tax * 0.10
  if (tax > 1000000) return tax * 0.07
  return 0
}
