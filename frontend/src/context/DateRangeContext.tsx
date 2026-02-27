'use client'
import { createContext, useContext, useState, useMemo, ReactNode } from 'react'
import { MOCK_TRADES, Trade } from '@/lib/mockData'
import { computeInsights, InsightReport } from '@/lib/insights'

export type DateRange = '7d' | '1m' | '3m' | '6m' | 'all'

type DateRangeContextType = {
  range: DateRange
  setRange: (r: DateRange) => void
  trades: Trade[]
  insights: InsightReport
}

const DateRangeContext = createContext<DateRangeContextType | null>(null)

function filterTradesByRange(trades: Trade[], range: DateRange): Trade[] {
  if (range === 'all') return trades
  const now = new Date('2025-12-01')
  const cutoff = new Date(now)
  if (range === '7d') cutoff.setDate(now.getDate() - 7)
  else if (range === '1m') cutoff.setMonth(now.getMonth() - 1)
  else if (range === '3m') cutoff.setMonth(now.getMonth() - 3)
  else if (range === '6m') cutoff.setMonth(now.getMonth() - 6)
  return trades.filter(t => new Date(t.date) >= cutoff)
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>('all')

  const trades = useMemo(() => filterTradesByRange(MOCK_TRADES, range), [range])
  const insights = useMemo(() => computeInsights(trades.length ? trades : MOCK_TRADES), [trades])

  return (
    <DateRangeContext.Provider value={{ range, setRange, trades, insights }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
