'use client'
import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react'
import { analyticsAPI } from '@/lib/api'
import { MOCK_TRADES } from '@/lib/mockData'
import { computeInsights, InsightReport } from '@/lib/insights'
import { useAuth } from '@/context/AuthContext'

export type DateRange = '7d' | '1m' | '3m' | '6m' | 'all'

// Map UI pill values to API range param values
const RANGE_MAP: Record<DateRange, string> = {
  '7d': '7d',
  '1m': '1m',
  '3m': '3m',
  '6m': '6m',
  'all': 'all',
}

type DateRangeContextType = {
  range: DateRange
  setRange: (r: DateRange) => void
  insights: InsightReport
  isLoading: boolean
  error: string | null
  hasRealData: boolean
  refetch: () => void
}

const DateRangeContext = createContext<DateRangeContextType | null>(null)

// Build an InsightReport from the backend's FullInsightReport response.
// The backend returns the exact same shape as the frontend computeInsights() output
// so we just cast it. If fields are missing, fill in safe defaults.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeInsights(data: any): InsightReport {
  // Provide defaults for every required field so the UI never crashes on missing data
  return {
    totalTrades: data.totalTrades ?? 0,
    wins: data.wins ?? 0,
    losses: data.losses ?? 0,
    winRate: data.winRate ?? 0,
    avgWin: data.avgWin ?? 0,
    avgLoss: data.avgLoss ?? 0,
    expectancy: data.expectancy ?? 0,
    profitFactor: data.profitFactor ?? 0,
    totalPnl: data.totalPnl ?? 0,
    maxDrawdown: data.maxDrawdown ?? 0,
    maxDrawdownPct: data.maxDrawdownPct ?? 0,
    equityCurve: data.equityCurve ?? [],

    pnlByHour: data.pnlByHour ?? [],
    pnlByDay: data.pnlByDay ?? [],
    bestHour: data.bestHour ?? 9,
    worstHour: data.worstHour ?? 14,
    morningEdge: data.morningEdge ?? 0,
    afternoonCost: data.afternoonCost ?? 0,
    bestWindowCounterfactual: data.bestWindowCounterfactual ?? {
      bestWindowPnl: 0, totalPnl: 0, gain: 0, windowLabel: '—',
    },

    revengeTradeCount: data.revengeTradeCount ?? 0,
    revengeTradeWinRate: data.revengeTradeWinRate ?? 0,
    normalTradeWinRate: data.normalTradeWinRate ?? 0,
    revengeTradePnl: data.revengeTradePnl ?? 0,
    revengeCost: data.revengeCost ?? 0,
    revengeAsPercentOfLosses: data.revengeAsPercentOfLosses ?? 0,

    avgTradesPerDay: data.avgTradesPerDay ?? 0,
    maxTradesInDay: data.maxTradesInDay ?? 0,
    overtradingDays: data.overtradingDays ?? 0,

    stopLossMovedCount: data.stopLossMovedCount ?? 0,
    stopLossMovedAvgPnl: data.stopLossMovedAvgPnl ?? 0,
    stopLossHeldAvgPnl: data.stopLossHeldAvgPnl ?? 0,
    stopLossMovingCost: data.stopLossMovingCost ?? 0,

    boredomTradeCount: data.boredomTradeCount ?? 0,
    boredomTradeWinRate: data.boredomTradeWinRate ?? 0,
    boredomTradePnl: data.boredomTradePnl ?? 0,

    planComplianceRate: data.planComplianceRate ?? 0,
    plannedTradeWinRate: data.plannedTradeWinRate ?? 0,
    unplannedTradeWinRate: data.unplannedTradeWinRate ?? 0,
    complianceCost: data.complianceCost ?? 0,

    emotionBreakdown: data.emotionBreakdown ?? [],
    setupBreakdown: data.setupBreakdown ?? [],
    segmentBreakdown: data.segmentBreakdown ?? [],
    instrumentBreakdown: data.instrumentBreakdown ?? [],
    holdingBuckets: data.holdingBuckets ?? [],
    edgeZoneLabel: data.edgeZoneLabel ?? '—',

    primaryInsight: data.primaryInsight ?? {
      title: 'No data yet',
      description: 'Upload trades to see insights.',
      impactAmount: 0,
      impactLabel: '',
      actionText: '',
      severity: 'info',
      category: 'info',
    },
    allInsights: data.allInsights ?? [],
    iqScore: data.iqScore ?? 0,
    iqBreakdown: data.iqBreakdown ?? {
      winRateScore: 0, disciplineScore: 0, riskScore: 0, consistencyScore: 0,
    },

    bestSelfAvgPnl: data.bestSelfAvgPnl ?? 0,
    overallAvgPnl: data.overallAvgPnl ?? 0,
    bestSelfMultiplier: data.bestSelfMultiplier ?? 0,

    mostExpensiveDays: data.mostExpensiveDays ?? [],
    weeklyTrend: data.weeklyTrend ?? [],
  }
}

const MOCK_INSIGHTS = computeInsights(MOCK_TRADES)

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [range, setRange] = useState<DateRange>('1m')
  const [insights, setInsights] = useState<InsightReport>(MOCK_INSIGHTS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRealData, setHasRealData] = useState(false)

  const fetchInsights = useCallback(async (r: DateRange) => {
    if (!isAuthenticated) return
    setIsLoading(true)
    setError(null)
    try {
      const res = await analyticsAPI.insights(RANGE_MAP[r])
      const data = res.data?.data ?? res.data
      if (data?.hasData === false || data?.totalTrades === 0) {
        // No trades yet — keep showing mock data with a flag
        setHasRealData(false)
        setInsights(MOCK_INSIGHTS)
      } else {
        setInsights(normalizeInsights(data))
        setHasRealData(true)
      }
    } catch (err) {
      setError('Failed to load analytics. Showing demo data.')
      setInsights(MOCK_INSIGHTS)
      setHasRealData(false)
      console.error('Analytics fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    if (isAuthenticated) {
      fetchInsights(range)
    } else {
      // Not logged in → always show mock data
      setInsights(MOCK_INSIGHTS)
      setHasRealData(false)
    }
  }, [isAuthenticated, authLoading, range, fetchInsights])

  const refetch = useCallback(() => fetchInsights(range), [fetchInsights, range])

  return (
    <DateRangeContext.Provider value={{
      range,
      setRange,
      insights,
      isLoading,
      error,
      hasRealData,
      refetch,
    }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider')
  return ctx
}
