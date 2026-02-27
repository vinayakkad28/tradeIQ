import { Trade } from './mockData'

// ─────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────

export type HourStat = {
  hour: number
  label: string
  totalPnl: number
  tradeCount: number
  winRate: number
  avgPnl: number
  verdict: 'Edge Window' | 'Marginal' | 'Avoid'
}

export type DayStat = {
  day: string
  totalPnl: number
  tradeCount: number
  winRate: number
  avgPnl: number
}

export type EmotionStat = {
  emotion: string
  emoji: string
  tradeCount: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export type SetupStat = {
  rating: 'A' | 'B' | 'C'
  tradeCount: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export type SegmentStat = {
  segment: string
  tradeCount: number
  winRate: number
  avgPnl: number
  totalPnl: number
  expectancy: number
}

export type InstrumentStat = {
  instrument: string
  tradeCount: number
  winRate: number
  avgPnl: number
  totalPnl: number
}

export type HoldingBucket = {
  label: string
  minMinutes: number
  maxMinutes: number
  tradeCount: number
  winRate: number
  avgPnl: number
  pct: number
  isEdgeZone: boolean
}

export type EquityPoint = {
  date: string
  daily: number
  cumulative: number
}

export type PrimaryInsight = {
  title: string
  description: string
  impactAmount: number
  impactLabel: string
  actionText: string
  severity: 'critical' | 'warning' | 'info'
  category: string
}

export type InsightReport = {
  // Core
  totalTrades: number
  wins: number
  losses: number
  winRate: number
  avgWin: number
  avgLoss: number
  expectancy: number
  profitFactor: number
  totalPnl: number
  maxDrawdown: number
  maxDrawdownPct: number
  equityCurve: EquityPoint[]

  // Time analysis
  pnlByHour: HourStat[]
  pnlByDay: DayStat[]
  bestHour: number
  worstHour: number
  morningEdge: number
  afternoonCost: number
  bestWindowCounterfactual: {
    bestWindowPnl: number
    totalPnl: number
    gain: number
    windowLabel: string
  }

  // Behavioral
  revengeTradeCount: number
  revengeTradeWinRate: number
  normalTradeWinRate: number
  revengeTradePnl: number
  revengeCost: number
  revengeAsPercentOfLosses: number

  avgTradesPerDay: number
  maxTradesInDay: number
  overtradingDays: number

  stopLossMovedCount: number
  stopLossMovedAvgPnl: number
  stopLossHeldAvgPnl: number
  stopLossMovingCost: number

  boredomTradeCount: number
  boredomTradeWinRate: number
  boredomTradePnl: number

  planComplianceRate: number
  plannedTradeWinRate: number
  unplannedTradeWinRate: number
  complianceCost: number

  // Breakdowns
  emotionBreakdown: EmotionStat[]
  setupBreakdown: SetupStat[]
  segmentBreakdown: SegmentStat[]
  instrumentBreakdown: InstrumentStat[]
  holdingBuckets: HoldingBucket[]
  edgeZoneLabel: string

  // Key insights
  primaryInsight: PrimaryInsight
  allInsights: PrimaryInsight[]
  iqScore: number
  iqBreakdown: {
    winRateScore: number
    disciplineScore: number
    riskScore: number
    consistencyScore: number
  }

  // Best self
  bestSelfAvgPnl: number
  overallAvgPnl: number
  bestSelfMultiplier: number

  // Expensive days
  mostExpensiveDays: Array<{ date: string; pnl: number; triggers: string[] }>

  // Weekly trend
  weeklyTrend: Array<{ week: string; pnl: number; trades: number; winRate: number }>
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function winRateOf(trades: Trade[]): number {
  if (!trades.length) return 0
  return (trades.filter(t => t.pnl > 0).length / trades.length) * 100
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function holdingMins(t: Trade): number {
  return toMinutes(t.exitTime) - toMinutes(t.entryTime)
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

function extractInstrumentBase(instrument: string): string {
  if (instrument.startsWith('NIFTY')) return 'NIFTY'
  if (instrument.startsWith('BANKNIFTY')) return 'BANKNIFTY'
  return instrument
}

// ─────────────────────────────────────────────────────────
// MAIN ENGINE
// ─────────────────────────────────────────────────────────

export function computeInsights(trades: Trade[]): InsightReport {
  if (!trades.length) throw new Error('No trades provided')

  // ── SECTION 1: CORE ──────────────────────────────────

  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl < 0)
  const winRate = winRateOf(trades)
  const avgWin = wins.length ? mean(wins.map(t => t.pnl)) : 0
  const avgLoss = losses.length ? mean(losses.map(t => Math.abs(t.pnl))) : 0
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss
  const totalGross = wins.reduce((s, t) => s + t.pnl, 0)
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = totalLoss > 0 ? totalGross / totalLoss : totalGross > 0 ? 999 : 0
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)

  // Equity curve & max drawdown
  const byDate = groupBy(trades, t => t.date)
  const sortedDates = Object.keys(byDate).sort()
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  const equityCurve: EquityPoint[] = sortedDates.map(date => {
    const daily = byDate[date].reduce((s, t) => s + t.pnl, 0)
    cumulative += daily
    if (cumulative > peak) peak = cumulative
    const drawdown = peak - cumulative
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
    return { date, daily, cumulative }
  })
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0

  // ── SECTION 2: TIME ANALYSIS ─────────────────────────

  const byHour = groupBy(trades, t => String(parseInt(t.entryTime.split(':')[0])))
  const pnlByHour: HourStat[] = Object.entries(byHour).map(([hour, ts]) => {
    const h = parseInt(hour)
    const ap = mean(ts.map(t => t.pnl))
    const verdict: HourStat['verdict'] = ap > 1000 ? 'Edge Window' : ap > 0 ? 'Marginal' : 'Avoid'
    return {
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      tradeCount: ts.length,
      winRate: winRateOf(ts),
      avgPnl: ap,
      verdict,
    }
  }).sort((a, b) => a.hour - b.hour)

  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const byDay = groupBy(trades, t => t.day)
  const pnlByDay: DayStat[] = DAY_ORDER.filter(d => byDay[d]).map(day => {
    const ts = byDay[day]
    return {
      day,
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      tradeCount: ts.length,
      winRate: winRateOf(ts),
      avgPnl: mean(ts.map(t => t.pnl)),
    }
  })

  const bestHourStat = pnlByHour.reduce((best, h) => h.avgPnl > best.avgPnl ? h : best, pnlByHour[0])
  const worstHourStat = pnlByHour.reduce((worst, h) => h.avgPnl < worst.avgPnl ? h : worst, pnlByHour[0])
  const morningEdge = trades.filter(t => parseInt(t.entryTime.split(':')[0]) < 10).reduce((s, t) => s + t.pnl, 0)
  const afternoonCost = trades.filter(t => parseInt(t.entryTime.split(':')[0]) >= 14).reduce((s, t) => s + t.pnl, 0)

  // Best window counterfactual
  const bestHourNum = bestHourStat.hour
  const windowTrades = trades.filter(t => {
    const h = parseInt(t.entryTime.split(':')[0])
    return h >= bestHourNum - 1 && h <= bestHourNum + 1
  })
  const bestWindowPnl = windowTrades.reduce((s, t) => s + t.pnl, 0)

  // ── SECTION 3: BEHAVIORAL ────────────────────────────

  const revengeTrades = trades.filter(t => t.reEntryAfterLoss)
  const normalTrades = trades.filter(t => !t.reEntryAfterLoss)
  const revengeCost = Math.abs(revengeTrades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0))

  const tradesPerDay = Object.values(byDate).map(ts => ts.length)
  const avgTradesPerDay = mean(tradesPerDay)
  const maxTradesInDay = Math.max(...tradesPerDay)
  const overtradingDays = tradesPerDay.filter(n => n > avgTradesPerDay + 1).length

  const slMovedTrades = trades.filter(t => t.stopLossMoved)
  const slHeldTrades = trades.filter(t => !t.stopLossMoved)
  const stopLossMovedAvgPnl = mean(slMovedTrades.map(t => t.pnl))
  const stopLossHeldAvgPnl = mean(slHeldTrades.map(t => t.pnl))
  const stopLossMovingCost = (stopLossHeldAvgPnl - stopLossMovedAvgPnl) * slMovedTrades.length

  const boredomTrades = trades.filter(t => t.emotion === 'bored')
  const plannedTrades = trades.filter(t => t.followedPlan)
  const unplannedTrades = trades.filter(t => !t.followedPlan)
  const planComplianceRate = (plannedTrades.length / trades.length) * 100
  const plannedWR = winRateOf(plannedTrades)
  const unplannedWR = winRateOf(unplannedTrades)
  const complianceCost = (Math.abs(plannedWR - unplannedWR) / 100) * avgWin * unplannedTrades.length

  // ── SECTION 4: EMOTION BREAKDOWN ─────────────────────

  const EMOTION_EMOJI: Record<string, string> = {
    calm: '😌', confident: '💪', anxious: '😰', frustrated: '😤', bored: '😑', fomo: '🤑',
  }
  const byEmotion = groupBy(trades, t => t.emotion)
  const emotionBreakdown: EmotionStat[] = Object.entries(byEmotion).map(([emotion, ts]) => ({
    emotion,
    emoji: EMOTION_EMOJI[emotion] || '😐',
    tradeCount: ts.length,
    winRate: winRateOf(ts),
    avgPnl: mean(ts.map(t => t.pnl)),
    totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
  })).sort((a, b) => b.avgPnl - a.avgPnl)

  // ── SECTION 5: SETUP BREAKDOWN ───────────────────────

  const bySetup = groupBy(trades, t => t.setupRating)
  const setupBreakdown: SetupStat[] = (['A', 'B', 'C'] as const).filter(r => bySetup[r]).map(rating => {
    const ts = bySetup[rating]
    return {
      rating,
      tradeCount: ts.length,
      winRate: winRateOf(ts),
      avgPnl: mean(ts.map(t => t.pnl)),
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
    }
  })

  // ── SECTION 6: SEGMENT BREAKDOWN ─────────────────────

  const bySegment = groupBy(trades, t => t.segment)
  const segmentBreakdown: SegmentStat[] = Object.entries(bySegment).map(([segment, ts]) => {
    const sw = winRateOf(ts) / 100
    const aw = mean(ts.filter(t => t.pnl > 0).map(t => t.pnl))
    const al = mean(ts.filter(t => t.pnl < 0).map(t => Math.abs(t.pnl)))
    return {
      segment,
      tradeCount: ts.length,
      winRate: winRateOf(ts),
      avgPnl: mean(ts.map(t => t.pnl)),
      totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
      expectancy: sw * aw - (1 - sw) * al,
    }
  })

  // ── SECTION 7: INSTRUMENT BREAKDOWN ──────────────────

  const byInstrument = groupBy(trades, t => extractInstrumentBase(t.instrument))
  const instrumentBreakdown: InstrumentStat[] = Object.entries(byInstrument).map(([instrument, ts]) => ({
    instrument,
    tradeCount: ts.length,
    winRate: winRateOf(ts),
    avgPnl: mean(ts.map(t => t.pnl)),
    totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
  })).sort((a, b) => b.totalPnl - a.totalPnl)

  // ── SECTION 8: HOLDING DURATION ──────────────────────

  const BUCKETS = [
    { label: '<5 min',   minMinutes: 0,  maxMinutes: 5   },
    { label: '5–15 min', minMinutes: 5,  maxMinutes: 15  },
    { label: '15–60 min',minMinutes: 15, maxMinutes: 60  },
    { label: '>60 min',  minMinutes: 60, maxMinutes: 9999},
  ]
  const rawBuckets = BUCKETS.map(b => {
    const ts = trades.filter(t => {
      const m = holdingMins(t)
      return m >= b.minMinutes && m < b.maxMinutes
    })
    return { ...b, trades: ts }
  })
  const maxWRBucket = rawBuckets.reduce((best, b) =>
    b.trades.length > 0 && winRateOf(b.trades) > winRateOf(best.trades) ? b : best,
    rawBuckets[0]
  )
  const holdingBuckets: HoldingBucket[] = rawBuckets.map(b => ({
    label: b.label,
    minMinutes: b.minMinutes,
    maxMinutes: b.maxMinutes,
    tradeCount: b.trades.length,
    winRate: winRateOf(b.trades),
    avgPnl: mean(b.trades.map(t => t.pnl)),
    pct: trades.length > 0 ? (b.trades.length / trades.length) * 100 : 0,
    isEdgeZone: b.label === maxWRBucket.label,
  }))
  const edgeZoneLabel = maxWRBucket.label

  // ── SECTION 9: KEY INSIGHTS ───────────────────────────

  const costs = {
    revenge:    { amount: revengeCost, label: 'Revenge Trading Cost' },
    afternoon:  { amount: Math.abs(afternoonCost < 0 ? afternoonCost : 0), label: 'Afternoon Session Loss' },
    boredom:    { amount: Math.abs(boredomTrades.reduce((s, t) => s + (t.pnl < 0 ? t.pnl : 0), 0)), label: 'Boredom Trade Loss' },
    compliance: { amount: complianceCost, label: 'Unplanned Trade Cost' },
    stopLoss:   { amount: Math.max(0, stopLossMovingCost), label: 'Stop-Loss Moving Cost' },
  }

  const worstCostKey = Object.entries(costs).reduce((best, [k, v]) => v.amount > costs[best as keyof typeof costs].amount ? k : best, 'revenge')
  const worstCost = costs[worstCostKey as keyof typeof costs]

  const insightMap: Record<string, PrimaryInsight> = {
    revenge: {
      title: 'Revenge Trading Detected',
      description: `You re-entered after ${revengeTrades.length} losses. These revenge trades cost you ₹${revengeCost.toFixed(0)} and won only ${revengeTrades.length ? winRateOf(revengeTrades).toFixed(0) : 0}% of the time vs ${winRateOf(normalTrades).toFixed(0)}% for normal trades.`,
      impactAmount: revengeCost,
      impactLabel: 'Lost to revenge trades',
      actionText: 'Add a 15-minute mandatory break after any loss before re-entering.',
      severity: 'critical',
      category: 'behavioral',
    },
    afternoon: {
      title: 'Afternoon Session Costs You',
      description: `Trades placed after 2 PM have produced ₹${Math.abs(afternoonCost).toFixed(0)} in losses. Your morning edge is real — afternoon activity erodes it.`,
      impactAmount: Math.abs(afternoonCost),
      impactLabel: 'Lost in afternoon sessions',
      actionText: 'Set a hard stop at 1:30 PM. Your best edge is in the morning.',
      severity: 'warning',
      category: 'timing',
    },
    boredom: {
      title: 'Boredom Trades Destroy Capital',
      description: `${boredomTrades.length} trades taken when you felt "bored" cost ₹${Math.abs(boredomTrades.reduce((s, t) => s + t.pnl, 0)).toFixed(0)}. Boredom trading has a ${winRateOf(boredomTrades).toFixed(0)}% win rate.`,
      impactAmount: Math.abs(boredomTrades.reduce((s, t) => s + t.pnl, 0)),
      impactLabel: 'Lost to boredom trades',
      actionText: 'If you feel bored, walk away. The market will be there tomorrow.',
      severity: 'warning',
      category: 'behavioral',
    },
    compliance: {
      title: 'Unplanned Trades Drag Performance',
      description: `Your plan compliance is ${planComplianceRate.toFixed(0)}%. Planned trades win ${plannedWR.toFixed(0)}% of the time vs ${unplannedWR.toFixed(0)}% for unplanned ones.`,
      impactAmount: complianceCost,
      impactLabel: 'Cost of deviating from plan',
      actionText: 'Before each trade, write the setup reason. If you can\'t, don\'t trade.',
      severity: 'warning',
      category: 'discipline',
    },
    stopLoss: {
      title: 'Moving Stop-Losses Costs You',
      description: `You moved stop-losses on ${slMovedTrades.length} trades. Average P&L when SL moved: ₹${stopLossMovedAvgPnl.toFixed(0)} vs ₹${stopLossHeldAvgPnl.toFixed(0)} when held.`,
      impactAmount: Math.max(0, stopLossMovingCost),
      impactLabel: 'Cost of moving stop-losses',
      actionText: 'Set your stop-loss at entry. Never move it wider to avoid a loss.',
      severity: 'critical',
      category: 'risk',
    },
  }

  const primaryInsight = insightMap[worstCostKey]
  const allInsights = Object.values(insightMap).sort((a, b) => b.impactAmount - a.impactAmount)

  // ── IQ SCORE ─────────────────────────────────────────

  const winRateScore = Math.min(100, winRate * 1.5)
  const disciplineScore = Math.min(100, planComplianceRate)
  const riskScore = Math.min(100, slMovedTrades.length === 0 ? 100 : Math.max(0, 100 - (slMovedTrades.length / trades.length) * 200))
  const consistencyScore = Math.min(100, profitFactor >= 1.5 ? 100 : profitFactor >= 1 ? 70 : 40)
  const iqScore = Math.round((winRateScore * 0.3 + disciplineScore * 0.3 + riskScore * 0.2 + consistencyScore * 0.2))

  // ── BEST SELF ─────────────────────────────────────────

  const bestSelfTrades = trades.filter(t => t.followedPlan && t.emotion === 'calm' && t.setupRating === 'A')
  const bestSelfAvgPnl = mean(bestSelfTrades.map(t => t.pnl))
  const overallAvgPnl = mean(trades.map(t => t.pnl))
  const bestSelfMultiplier = overallAvgPnl > 0 ? bestSelfAvgPnl / overallAvgPnl : 0

  // ── MOST EXPENSIVE DAYS ───────────────────────────────

  const mostExpensiveDays = sortedDates
    .map(date => {
      const ts = byDate[date]
      const pnl = ts.reduce((s, t) => s + t.pnl, 0)
      const triggers: string[] = []
      if (ts.some(t => t.reEntryAfterLoss)) triggers.push('Revenge trades')
      if (ts.some(t => t.emotion === 'frustrated')) triggers.push('Trading frustrated')
      if (ts.some(t => t.stopLossMoved)) triggers.push('SL moved')
      if (ts.some(t => !t.followedPlan)) triggers.push('Off-plan')
      return { date, pnl, triggers }
    })
    .filter(d => d.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 5)

  // ── WEEKLY TREND ──────────────────────────────────────

  const weekMap: Record<string, Trade[]> = {}
  trades.forEach(t => {
    const d = new Date(t.date)
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const weekKey = monday.toISOString().slice(0, 10)
    if (!weekMap[weekKey]) weekMap[weekKey] = []
    weekMap[weekKey].push(t)
  })
  const weeklyTrend = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ts]) => ({
      week,
      pnl: ts.reduce((s, t) => s + t.pnl, 0),
      trades: ts.length,
      winRate: winRateOf(ts),
    }))

  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    avgWin,
    avgLoss,
    expectancy,
    profitFactor,
    totalPnl,
    maxDrawdown,
    maxDrawdownPct,
    equityCurve,

    pnlByHour,
    pnlByDay,
    bestHour: bestHourStat.hour,
    worstHour: worstHourStat.hour,
    morningEdge,
    afternoonCost,
    bestWindowCounterfactual: {
      bestWindowPnl,
      totalPnl,
      gain: bestWindowPnl - totalPnl,
      windowLabel: `${String(bestHourNum - 1).padStart(2,'0')}:00–${String(bestHourNum + 1).padStart(2,'0')}:59`,
    },

    revengeTradeCount: revengeTrades.length,
    revengeTradeWinRate: winRateOf(revengeTrades),
    normalTradeWinRate: winRateOf(normalTrades),
    revengeTradePnl: revengeTrades.reduce((s, t) => s + t.pnl, 0),
    revengeCost,
    revengeAsPercentOfLosses: totalLoss > 0 ? (revengeCost / totalLoss) * 100 : 0,

    avgTradesPerDay,
    maxTradesInDay,
    overtradingDays,

    stopLossMovedCount: slMovedTrades.length,
    stopLossMovedAvgPnl,
    stopLossHeldAvgPnl,
    stopLossMovingCost,

    boredomTradeCount: boredomTrades.length,
    boredomTradeWinRate: winRateOf(boredomTrades),
    boredomTradePnl: boredomTrades.reduce((s, t) => s + t.pnl, 0),

    planComplianceRate,
    plannedTradeWinRate: plannedWR,
    unplannedTradeWinRate: unplannedWR,
    complianceCost,

    emotionBreakdown,
    setupBreakdown,
    segmentBreakdown,
    instrumentBreakdown,
    holdingBuckets,
    edgeZoneLabel,

    primaryInsight,
    allInsights,
    iqScore,
    iqBreakdown: { winRateScore, disciplineScore, riskScore, consistencyScore },

    bestSelfAvgPnl,
    overallAvgPnl,
    bestSelfMultiplier,

    mostExpensiveDays,
    weeklyTrend,
  }
}
