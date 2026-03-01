package analytics

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strings"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ── GET /analytics/insights ──────────────────────────────

func GetInsights(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	user := c.MustGet("user").(models.User)
	dateRange := c.DefaultQuery("range", "1m")
	forceRefresh := c.Query("force_refresh") == "true"

	// Free tier: max 30 days
	if user.Plan == "free" && (dateRange == "3m" || dateRange == "6m" || dateRange == "all") {
		dateRange = "1m"
	}

	// Check cache (trader/pro only)
	if !forceRefresh && user.Plan != "free" {
		var cached models.AnalyticsCache
		if err := database.DB.First(&cached, "user_id = ? AND date_range = ? AND expires_at > ?", userID, dateRange, time.Now()).Error; err == nil {
			c.JSON(http.StatusOK, gin.H{"data": json.RawMessage(cached.Payload), "cached": true, "computed_at": cached.ComputedAt})
			return
		}
	}

	trades := getTradesForRange(userID, dateRange)
	if len(trades) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"data": gin.H{
				"hasData":     false,
				"totalTrades": 0,
				"message":     "No trades found. Upload a CSV or connect a broker to get started.",
			},
			"cached": false,
		})
		return
	}

	insights := computeFullInsights(trades)
	payload, _ := json.Marshal(insights)

	// Cache by plan
	if user.Plan != "free" {
		ttl := time.Hour
		if user.Plan == "trader" {
			ttl = 15 * time.Minute
		}
		cache := models.AnalyticsCache{
			ID:         uuid.New(),
			UserID:     userID,
			DateRange:  dateRange,
			ComputedAt: time.Now(),
			ExpiresAt:  time.Now().Add(ttl),
			Payload:    payload,
		}
		database.DB.Where("user_id = ? AND date_range = ?", userID, dateRange).Delete(&models.AnalyticsCache{})
		database.DB.Create(&cache)
	}

	c.JSON(http.StatusOK, gin.H{"data": insights, "cached": false, "computed_at": time.Now()})
}

// ── GET /analytics/equity-curve ───────────────────────────

func GetEquityCurve(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	dateRange := c.DefaultQuery("range", "1m")
	trades := getTradesForRange(userID, dateRange)

	type Point struct {
		Date       string  `json:"date"`
		Daily      float64 `json:"daily"`
		Cumulative float64 `json:"cumulative"`
	}

	dailyMap := map[string]float64{}
	for _, t := range trades {
		if t.PnL != nil {
			date := t.TradeDate.Format("2006-01-02")
			dailyMap[date] += *t.PnL
		}
	}

	dates := make([]string, 0, len(dailyMap))
	for d := range dailyMap {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	points := make([]Point, 0)
	cum := 0.0
	for _, date := range dates {
		daily := dailyMap[date]
		cum += daily
		points = append(points, Point{Date: date, Daily: daily, Cumulative: cum})
	}

	c.JSON(http.StatusOK, gin.H{"points": points})
}

// ── GET /analytics/heatmap ────────────────────────────────

func GetHeatmap(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	dateRange := c.DefaultQuery("range", "1m")
	dimension := c.DefaultQuery("dimension", "hour")
	trades := getTradesForRange(userID, dateRange)

	type Cell struct {
		Label  string  `json:"label"`
		PnL    float64 `json:"pnl"`
		Trades int     `json:"trades"`
		AvgPnL float64 `json:"avgPnl"`
	}

	cellMap := map[string]*Cell{}
	for _, t := range trades {
		var key string
		switch dimension {
		case "hour":
			key = t.EntryTime.Format("15:00")
		case "day":
			key = t.TradeDate.Weekday().String()[:3]
		default:
			key = extractInstrumentBase(t.Instrument)
		}
		if cellMap[key] == nil {
			cellMap[key] = &Cell{Label: key}
		}
		if t.PnL != nil {
			cellMap[key].PnL += *t.PnL
		}
		cellMap[key].Trades++
	}

	cells := make([]Cell, 0)
	for _, cell := range cellMap {
		if cell.Trades > 0 {
			cell.AvgPnL = cell.PnL / float64(cell.Trades)
		}
		cells = append(cells, *cell)
	}
	sort.Slice(cells, func(i, j int) bool { return cells[i].Label < cells[j].Label })

	c.JSON(http.StatusOK, gin.H{"cells": cells, "dimension": dimension})
}

// ── GET /demo/analytics (no auth) ─────────────────────────

func GetDemoAnalytics(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message":     "Demo analytics — connect a broker or upload CSV for real insights",
		"demo":        true,
		"totalTrades": 47,
		"winRate":     63.8,
		"totalPnl":    18400,
		"iqScore":     72,
	})
}

// ─────────────────────────────────────────────────────────
// FULL ANALYTICS ENGINE (port of frontend insights.ts)
// ─────────────────────────────────────────────────────────

type HourStat struct {
	Hour       int     `json:"hour"`
	Label      string  `json:"label"`
	TotalPnL   float64 `json:"totalPnl"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	Verdict    string  `json:"verdict"`
}

type DayStat struct {
	Day        string  `json:"day"`
	TotalPnL   float64 `json:"totalPnl"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
}

type EmotionStat struct {
	Emotion    string  `json:"emotion"`
	Emoji      string  `json:"emoji"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	TotalPnL   float64 `json:"totalPnl"`
}

type SetupStat struct {
	Rating     string  `json:"rating"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	TotalPnL   float64 `json:"totalPnl"`
}

type SegmentStat struct {
	Segment    string  `json:"segment"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	TotalPnL   float64 `json:"totalPnl"`
	Expectancy float64 `json:"expectancy"`
}

type InstrumentStat struct {
	Instrument string  `json:"instrument"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	TotalPnL   float64 `json:"totalPnl"`
}

type HoldingBucket struct {
	Label      string  `json:"label"`
	MinMinutes int     `json:"minMinutes"`
	MaxMinutes int     `json:"maxMinutes"`
	TradeCount int     `json:"tradeCount"`
	WinRate    float64 `json:"winRate"`
	AvgPnL     float64 `json:"avgPnl"`
	Pct        float64 `json:"pct"`
	IsEdgeZone bool    `json:"isEdgeZone"`
}

type EquityPoint struct {
	Date       string  `json:"date"`
	Daily      float64 `json:"daily"`
	Cumulative float64 `json:"cumulative"`
}

type PrimaryInsight struct {
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	ImpactAmount float64 `json:"impactAmount"`
	ImpactLabel  string  `json:"impactLabel"`
	ActionText   string  `json:"actionText"`
	Severity     string  `json:"severity"`
	Category     string  `json:"category"`
}

type IQBreakdown struct {
	WinRateScore     float64 `json:"winRateScore"`
	DisciplineScore  float64 `json:"disciplineScore"`
	RiskScore        float64 `json:"riskScore"`
	ConsistencyScore float64 `json:"consistencyScore"`
}

type ExpensiveDay struct {
	Date     string   `json:"date"`
	PnL      float64  `json:"pnl"`
	Triggers []string `json:"triggers"`
}

type WeeklyPoint struct {
	Week    string  `json:"week"`
	PnL     float64 `json:"pnl"`
	Trades  int     `json:"trades"`
	WinRate float64 `json:"winRate"`
}

type BestWindowCounterfactual struct {
	BestWindowPnL float64 `json:"bestWindowPnl"`
	TotalPnL      float64 `json:"totalPnl"`
	Gain          float64 `json:"gain"`
	WindowLabel   string  `json:"windowLabel"`
}

type FullInsightReport struct {
	HasData      bool    `json:"hasData"`
	TotalTrades  int     `json:"totalTrades"`
	Wins         int     `json:"wins"`
	Losses       int     `json:"losses"`
	WinRate      float64 `json:"winRate"`
	AvgWin       float64 `json:"avgWin"`
	AvgLoss      float64 `json:"avgLoss"`
	Expectancy   float64 `json:"expectancy"`
	ProfitFactor float64 `json:"profitFactor"`
	TotalPnL     float64 `json:"totalPnl"`
	MaxDrawdown    float64      `json:"maxDrawdown"`
	MaxDrawdownPct float64      `json:"maxDrawdownPct"`
	EquityCurve    []EquityPoint `json:"equityCurve"`

	PnLByHour     []HourStat `json:"pnlByHour"`
	PnLByDay      []DayStat  `json:"pnlByDay"`
	BestHour      int        `json:"bestHour"`
	WorstHour     int        `json:"worstHour"`
	MorningEdge   float64    `json:"morningEdge"`
	AfternoonCost float64    `json:"afternoonCost"`
	BestWindowCounterfactual BestWindowCounterfactual `json:"bestWindowCounterfactual"`

	RevengeTradeCount        int     `json:"revengeTradeCount"`
	RevengeTradeWinRate      float64 `json:"revengeTradeWinRate"`
	NormalTradeWinRate       float64 `json:"normalTradeWinRate"`
	RevengeTradePnL          float64 `json:"revengeTradePnl"`
	RevengeCost              float64 `json:"revengeCost"`
	RevengeAsPercentOfLosses float64 `json:"revengeAsPercentOfLosses"`

	AvgTradesPerDay float64 `json:"avgTradesPerDay"`
	MaxTradesInDay  int     `json:"maxTradesInDay"`
	OvertradingDays int     `json:"overtradingDays"`

	StopLossMovedCount  int     `json:"stopLossMovedCount"`
	StopLossMovedAvgPnL float64 `json:"stopLossMovedAvgPnl"`
	StopLossHeldAvgPnL  float64 `json:"stopLossHeldAvgPnl"`
	StopLossMovingCost  float64 `json:"stopLossMovingCost"`

	BoredomTradeCount   int     `json:"boredomTradeCount"`
	BoredomTradeWinRate float64 `json:"boredomTradeWinRate"`
	BoredomTradePnL     float64 `json:"boredomTradePnl"`

	PlanComplianceRate    float64 `json:"planComplianceRate"`
	PlannedTradeWinRate   float64 `json:"plannedTradeWinRate"`
	UnplannedTradeWinRate float64 `json:"unplannedTradeWinRate"`
	ComplianceCost        float64 `json:"complianceCost"`

	EmotionBreakdown    []EmotionStat    `json:"emotionBreakdown"`
	SetupBreakdown      []SetupStat      `json:"setupBreakdown"`
	SegmentBreakdown    []SegmentStat    `json:"segmentBreakdown"`
	InstrumentBreakdown []InstrumentStat `json:"instrumentBreakdown"`
	HoldingBuckets      []HoldingBucket  `json:"holdingBuckets"`
	EdgeZoneLabel       string           `json:"edgeZoneLabel"`

	PrimaryInsight PrimaryInsight   `json:"primaryInsight"`
	AllInsights    []PrimaryInsight `json:"allInsights"`
	IQScore        int              `json:"iqScore"`
	IQBreakdown    IQBreakdown      `json:"iqBreakdown"`

	BestSelfAvgPnL     float64 `json:"bestSelfAvgPnl"`
	OverallAvgPnL      float64 `json:"overallAvgPnl"`
	BestSelfMultiplier float64 `json:"bestSelfMultiplier"`

	MostExpensiveDays []ExpensiveDay `json:"mostExpensiveDays"`
	WeeklyTrend       []WeeklyPoint  `json:"weeklyTrend"`
}

func computeFullInsights(trades []models.Trade) FullInsightReport {
	if len(trades) == 0 {
		return FullInsightReport{HasData: false}
	}

	// ── CORE ──────────────────────────────────────────────

	var winTrades, lossTrades []models.Trade
	totalPnL, totalWin, totalLoss := 0.0, 0.0, 0.0

	for _, t := range trades {
		p := pnlOf(t)
		totalPnL += p
		if p > 0 {
			winTrades = append(winTrades, t)
			totalWin += p
		} else {
			lossTrades = append(lossTrades, t)
			totalLoss += -p
		}
	}

	winRate := float64(len(winTrades)) / float64(len(trades)) * 100
	avgWin := safeDivide(totalWin, float64(len(winTrades)))
	avgLoss := safeDivide(totalLoss, float64(len(lossTrades)))
	expectancy := (winRate/100)*avgWin - (1-winRate/100)*avgLoss
	profitFactor := 0.0
	if totalLoss > 0 {
		profitFactor = totalWin / totalLoss
	} else if totalWin > 0 {
		profitFactor = 999
	}

	byDate := groupByDate(trades)
	sortedDates := sortedDateKeys(byDate)
	cumulative, peak, maxDrawdown := 0.0, 0.0, 0.0
	equityCurve := make([]EquityPoint, 0)

	for _, date := range sortedDates {
		daily := sumPnL(byDate[date])
		cumulative += daily
		if cumulative > peak {
			peak = cumulative
		}
		dd := peak - cumulative
		if dd > maxDrawdown {
			maxDrawdown = dd
		}
		equityCurve = append(equityCurve, EquityPoint{Date: date, Daily: daily, Cumulative: cumulative})
	}
	maxDrawdownPct := 0.0
	if peak > 0 {
		maxDrawdownPct = (maxDrawdown / peak) * 100
	}

	// ── TIME ANALYSIS ─────────────────────────────────────

	byHour := groupByHour(trades)
	var pnlByHour []HourStat
	for hour, ts := range byHour {
		ap := meanPnL(ts)
		verdict := "Avoid"
		if ap > 1000 {
			verdict = "Edge Window"
		} else if ap > 0 {
			verdict = "Marginal"
		}
		pnlByHour = append(pnlByHour, HourStat{
			Hour:       hour,
			Label:      fmt.Sprintf("%02d:00", hour),
			TotalPnL:   sumPnL(ts),
			TradeCount: len(ts),
			WinRate:    winRateOf(ts),
			AvgPnL:     ap,
			Verdict:    verdict,
		})
	}
	sort.Slice(pnlByHour, func(i, j int) bool { return pnlByHour[i].Hour < pnlByHour[j].Hour })

	dayOrder := []string{"Mon", "Tue", "Wed", "Thu", "Fri"}
	byDay := groupByWeekday(trades)
	var pnlByDay []DayStat
	for _, day := range dayOrder {
		ts, ok := byDay[day]
		if !ok {
			continue
		}
		pnlByDay = append(pnlByDay, DayStat{
			Day: day, TotalPnL: sumPnL(ts),
			TradeCount: len(ts), WinRate: winRateOf(ts), AvgPnL: meanPnL(ts),
		})
	}

	bestHS, worstHS := pnlByHour[0], pnlByHour[0]
	for _, h := range pnlByHour {
		if h.AvgPnL > bestHS.AvgPnL {
			bestHS = h
		}
		if h.AvgPnL < worstHS.AvgPnL {
			worstHS = h
		}
	}

	morningEdge, afternoonCost := 0.0, 0.0
	for _, t := range trades {
		h := t.EntryTime.Hour()
		if h < 10 {
			morningEdge += pnlOf(t)
		}
		if h >= 14 {
			afternoonCost += pnlOf(t)
		}
	}

	bhn := bestHS.Hour
	var windowTrades []models.Trade
	for _, t := range trades {
		h := t.EntryTime.Hour()
		if h >= bhn-1 && h <= bhn+1 {
			windowTrades = append(windowTrades, t)
		}
	}
	bestWindowPnL := sumPnL(windowTrades)

	// ── BEHAVIORAL ────────────────────────────────────────

	var revengeTrades, normalTrades []models.Trade
	for _, t := range trades {
		if t.ReEntryAfterLoss {
			revengeTrades = append(revengeTrades, t)
		} else {
			normalTrades = append(normalTrades, t)
		}
	}
	revengeCost := 0.0
	for _, t := range revengeTrades {
		if pnlOf(t) < 0 {
			revengeCost += -pnlOf(t)
		}
	}

	counts := make([]int, 0, len(byDate))
	maxTrades := 0
	for _, ts := range byDate {
		counts = append(counts, len(ts))
		if len(ts) > maxTrades {
			maxTrades = len(ts)
		}
	}
	avgTPD := safeDivide(float64(sumInts(counts)), float64(len(counts)))
	overtradingDays := 0
	for _, n := range counts {
		if float64(n) > avgTPD+1 {
			overtradingDays++
		}
	}

	var slMovedTrades, slHeldTrades []models.Trade
	for _, t := range trades {
		if t.StopLossMoved {
			slMovedTrades = append(slMovedTrades, t)
		} else {
			slHeldTrades = append(slHeldTrades, t)
		}
	}
	slMovedAvgPnL := meanPnL(slMovedTrades)
	slHeldAvgPnL := meanPnL(slHeldTrades)
	slMovingCost := (slHeldAvgPnL - slMovedAvgPnL) * float64(len(slMovedTrades))

	var boredomTrades []models.Trade
	for _, t := range trades {
		if strings.ToLower(t.Emotion) == "bored" {
			boredomTrades = append(boredomTrades, t)
		}
	}

	var plannedTrades, unplannedTrades []models.Trade
	for _, t := range trades {
		if t.FollowedPlan != nil && *t.FollowedPlan {
			plannedTrades = append(plannedTrades, t)
		} else {
			unplannedTrades = append(unplannedTrades, t)
		}
	}
	planComplianceRate := float64(len(plannedTrades)) / float64(len(trades)) * 100
	plannedWR := winRateOf(plannedTrades)
	unplannedWR := winRateOf(unplannedTrades)
	complianceCost := (math.Abs(plannedWR-unplannedWR) / 100) * avgWin * float64(len(unplannedTrades))

	// ── BREAKDOWNS ────────────────────────────────────────

	emotionEmoji := map[string]string{
		"calm": "😌", "confident": "💪", "anxious": "😰",
		"frustrated": "😤", "bored": "😑", "fomo": "🤑",
	}
	byEmotion := groupByField(trades, func(t models.Trade) string { return strings.ToLower(t.Emotion) })
	var emotionBreakdown []EmotionStat
	for emotion, ts := range byEmotion {
		if emotion == "" {
			continue
		}
		emoji := emotionEmoji[emotion]
		if emoji == "" {
			emoji = "😐"
		}
		emotionBreakdown = append(emotionBreakdown, EmotionStat{
			Emotion: emotion, Emoji: emoji, TradeCount: len(ts),
			WinRate: winRateOf(ts), AvgPnL: meanPnL(ts), TotalPnL: sumPnL(ts),
		})
	}
	sort.Slice(emotionBreakdown, func(i, j int) bool { return emotionBreakdown[i].AvgPnL > emotionBreakdown[j].AvgPnL })

	bySetup := groupByField(trades, func(t models.Trade) string { return strings.ToUpper(t.SetupRating) })
	var setupBreakdown []SetupStat
	for _, rating := range []string{"A", "B", "C"} {
		ts, ok := bySetup[rating]
		if !ok {
			continue
		}
		setupBreakdown = append(setupBreakdown, SetupStat{
			Rating: rating, TradeCount: len(ts),
			WinRate: winRateOf(ts), AvgPnL: meanPnL(ts), TotalPnL: sumPnL(ts),
		})
	}

	bySegment := groupByField(trades, func(t models.Trade) string { return t.Segment })
	var segmentBreakdown []SegmentStat
	for segment, ts := range bySegment {
		if segment == "" {
			continue
		}
		sw := winRateOf(ts) / 100
		aw := avgWinOf(ts)
		al := avgLossOf(ts)
		segmentBreakdown = append(segmentBreakdown, SegmentStat{
			Segment: segment, TradeCount: len(ts),
			WinRate: winRateOf(ts), AvgPnL: meanPnL(ts), TotalPnL: sumPnL(ts),
			Expectancy: sw*aw - (1-sw)*al,
		})
	}

	byInstrument := groupByField(trades, func(t models.Trade) string { return extractInstrumentBase(t.Instrument) })
	var instrumentBreakdown []InstrumentStat
	for instrument, ts := range byInstrument {
		instrumentBreakdown = append(instrumentBreakdown, InstrumentStat{
			Instrument: instrument, TradeCount: len(ts),
			WinRate: winRateOf(ts), AvgPnL: meanPnL(ts), TotalPnL: sumPnL(ts),
		})
	}
	sort.Slice(instrumentBreakdown, func(i, j int) bool {
		return instrumentBreakdown[i].TotalPnL > instrumentBreakdown[j].TotalPnL
	})

	bucketDefs := []struct {
		Label      string
		MinMinutes int
		MaxMinutes int
	}{
		{"<5 min", 0, 5},
		{"5–15 min", 5, 15},
		{"15–60 min", 15, 60},
		{">60 min", 60, 9999},
	}
	maxWRBucketLabel := ""
	maxWR := -1.0
	var holdingBuckets []HoldingBucket
	for _, bd := range bucketDefs {
		var bts []models.Trade
		for _, t := range trades {
			m := holdingMinutes(t)
			if m >= bd.MinMinutes && m < bd.MaxMinutes {
				bts = append(bts, t)
			}
		}
		wr := winRateOf(bts)
		if len(bts) > 0 && wr > maxWR {
			maxWR = wr
			maxWRBucketLabel = bd.Label
		}
		holdingBuckets = append(holdingBuckets, HoldingBucket{
			Label: bd.Label, MinMinutes: bd.MinMinutes, MaxMinutes: bd.MaxMinutes,
			TradeCount: len(bts), WinRate: wr, AvgPnL: meanPnL(bts),
			Pct: safeDivide(float64(len(bts)), float64(len(trades))) * 100,
		})
	}
	for i := range holdingBuckets {
		holdingBuckets[i].IsEdgeZone = holdingBuckets[i].Label == maxWRBucketLabel
	}

	// ── KEY INSIGHTS ──────────────────────────────────────

	boredomPnL := sumPnL(boredomTrades)
	boredomCost := 0.0
	for _, t := range boredomTrades {
		if pnlOf(t) < 0 {
			boredomCost += -pnlOf(t)
		}
	}
	afternoonLoss := 0.0
	if afternoonCost < 0 {
		afternoonLoss = -afternoonCost
	}

	insightDefs := []struct {
		key    string
		amount float64
		ins    PrimaryInsight
	}{
		{"revenge", revengeCost, PrimaryInsight{
			Title:        "Revenge Trading Detected",
			Description:  fmt.Sprintf("You re-entered after %d losses. These trades cost ₹%.0f and won %.0f%% vs %.0f%% for normal trades.", len(revengeTrades), revengeCost, winRateOf(revengeTrades), winRateOf(normalTrades)),
			ImpactAmount: revengeCost,
			ImpactLabel:  "Lost to revenge trades",
			ActionText:   "Add a 15-minute mandatory break after any loss before re-entering.",
			Severity:     "critical",
			Category:     "behavioral",
		}},
		{"afternoon", afternoonLoss, PrimaryInsight{
			Title:        "Afternoon Session Costs You",
			Description:  fmt.Sprintf("Trades placed after 2 PM have produced ₹%.0f in losses. Your morning edge is real — afternoon activity erodes it.", math.Abs(afternoonCost)),
			ImpactAmount: afternoonLoss,
			ImpactLabel:  "Lost in afternoon sessions",
			ActionText:   "Set a hard stop at 1:30 PM. Your best edge is in the morning.",
			Severity:     "warning",
			Category:     "timing",
		}},
		{"boredom", boredomCost, PrimaryInsight{
			Title:        "Boredom Trades Destroy Capital",
			Description:  fmt.Sprintf("%d trades taken when bored cost ₹%.0f. Boredom trading has a %.0f%% win rate.", len(boredomTrades), math.Abs(boredomPnL), winRateOf(boredomTrades)),
			ImpactAmount: boredomCost,
			ImpactLabel:  "Lost to boredom trades",
			ActionText:   "If you feel bored, walk away. The market will be there tomorrow.",
			Severity:     "warning",
			Category:     "behavioral",
		}},
		{"compliance", complianceCost, PrimaryInsight{
			Title:        "Unplanned Trades Drag Performance",
			Description:  fmt.Sprintf("Your plan compliance is %.0f%%. Planned trades win %.0f%% vs %.0f%% for unplanned ones.", planComplianceRate, plannedWR, unplannedWR),
			ImpactAmount: complianceCost,
			ImpactLabel:  "Cost of deviating from plan",
			ActionText:   "Before each trade, write the setup reason. If you can't, don't trade.",
			Severity:     "warning",
			Category:     "discipline",
		}},
		{"stopLoss", math.Max(0, slMovingCost), PrimaryInsight{
			Title:        "Moving Stop-Losses Costs You",
			Description:  fmt.Sprintf("You moved stop-losses on %d trades. Avg P&L when SL moved: ₹%.0f vs ₹%.0f when held.", len(slMovedTrades), slMovedAvgPnL, slHeldAvgPnL),
			ImpactAmount: math.Max(0, slMovingCost),
			ImpactLabel:  "Cost of moving stop-losses",
			ActionText:   "Set your stop-loss at entry. Never move it wider to avoid a loss.",
			Severity:     "critical",
			Category:     "risk",
		}},
	}

	worstIdx := 0
	for i, d := range insightDefs {
		if d.amount > insightDefs[worstIdx].amount {
			worstIdx = i
		}
	}
	primaryInsight := insightDefs[worstIdx].ins
	var allInsights []PrimaryInsight
	for _, d := range insightDefs {
		allInsights = append(allInsights, d.ins)
	}
	sort.Slice(allInsights, func(i, j int) bool { return allInsights[i].ImpactAmount > allInsights[j].ImpactAmount })

	// ── IQ SCORE ──────────────────────────────────────────

	winRateScore := math.Min(100, winRate*1.5)
	disciplineScore := math.Min(100, planComplianceRate)
	riskScore := 100.0
	if len(slMovedTrades) > 0 {
		riskScore = math.Max(0, 100-float64(len(slMovedTrades))/float64(len(trades))*200)
	}
	consistencyScore := 40.0
	if profitFactor >= 1.5 {
		consistencyScore = 100
	} else if profitFactor >= 1 {
		consistencyScore = 70
	}
	iqScore := int(math.Round(winRateScore*0.3 + disciplineScore*0.3 + riskScore*0.2 + consistencyScore*0.2))

	// ── BEST SELF ─────────────────────────────────────────

	var bestSelfTrades []models.Trade
	for _, t := range trades {
		if t.FollowedPlan != nil && *t.FollowedPlan &&
			strings.ToLower(t.Emotion) == "calm" &&
			strings.ToUpper(t.SetupRating) == "A" {
			bestSelfTrades = append(bestSelfTrades, t)
		}
	}
	bestSelfAvgPnL := meanPnL(bestSelfTrades)
	overallAvgPnL := meanPnL(trades)
	bestSelfMultiplier := safeDivide(bestSelfAvgPnL, overallAvgPnL)

	// ── MOST EXPENSIVE DAYS ───────────────────────────────

	var mostExpensiveDays []ExpensiveDay
	for _, date := range sortedDates {
		ts := byDate[date]
		dayPnL := sumPnL(ts)
		if dayPnL >= 0 {
			continue
		}
		var triggers []string
		for _, t := range ts {
			if t.ReEntryAfterLoss {
				triggers = appendUnique(triggers, "Revenge trades")
			}
			if strings.ToLower(t.Emotion) == "frustrated" {
				triggers = appendUnique(triggers, "Trading frustrated")
			}
			if t.StopLossMoved {
				triggers = appendUnique(triggers, "SL moved")
			}
			if t.FollowedPlan != nil && !*t.FollowedPlan {
				triggers = appendUnique(triggers, "Off-plan")
			}
		}
		mostExpensiveDays = append(mostExpensiveDays, ExpensiveDay{Date: date, PnL: dayPnL, Triggers: triggers})
	}
	sort.Slice(mostExpensiveDays, func(i, j int) bool { return mostExpensiveDays[i].PnL < mostExpensiveDays[j].PnL })
	if len(mostExpensiveDays) > 5 {
		mostExpensiveDays = mostExpensiveDays[:5]
	}

	// ── WEEKLY TREND ──────────────────────────────────────

	weekMap := map[string][]models.Trade{}
	for _, t := range trades {
		d := t.TradeDate
		offset := int((d.Weekday()+6) % 7)
		monday := d.AddDate(0, 0, -offset)
		weekKey := monday.Format("2006-01-02")
		weekMap[weekKey] = append(weekMap[weekKey], t)
	}
	weekKeys := sortedDateKeys(weekMap)
	var weeklyTrend []WeeklyPoint
	for _, week := range weekKeys {
		ts := weekMap[week]
		weeklyTrend = append(weeklyTrend, WeeklyPoint{
			Week: week, PnL: sumPnL(ts), Trades: len(ts), WinRate: winRateOf(ts),
		})
	}

	return FullInsightReport{
		HasData:        true,
		TotalTrades:    len(trades),
		Wins:           len(winTrades),
		Losses:         len(lossTrades),
		WinRate:        winRate,
		AvgWin:         avgWin,
		AvgLoss:        avgLoss,
		Expectancy:     expectancy,
		ProfitFactor:   profitFactor,
		TotalPnL:       totalPnL,
		MaxDrawdown:    maxDrawdown,
		MaxDrawdownPct: maxDrawdownPct,
		EquityCurve:    equityCurve,

		PnLByHour:     pnlByHour,
		PnLByDay:      pnlByDay,
		BestHour:      bestHS.Hour,
		WorstHour:     worstHS.Hour,
		MorningEdge:   morningEdge,
		AfternoonCost: afternoonCost,
		BestWindowCounterfactual: BestWindowCounterfactual{
			BestWindowPnL: bestWindowPnL,
			TotalPnL:      totalPnL,
			Gain:          bestWindowPnL - totalPnL,
			WindowLabel:   fmt.Sprintf("%02d:00–%02d:59", bhn-1, bhn+1),
		},

		RevengeTradeCount:        len(revengeTrades),
		RevengeTradeWinRate:      winRateOf(revengeTrades),
		NormalTradeWinRate:       winRateOf(normalTrades),
		RevengeTradePnL:          sumPnL(revengeTrades),
		RevengeCost:              revengeCost,
		RevengeAsPercentOfLosses: safeDivide(revengeCost, totalLoss) * 100,

		AvgTradesPerDay: avgTPD,
		MaxTradesInDay:  maxTrades,
		OvertradingDays: overtradingDays,

		StopLossMovedCount:  len(slMovedTrades),
		StopLossMovedAvgPnL: slMovedAvgPnL,
		StopLossHeldAvgPnL:  slHeldAvgPnL,
		StopLossMovingCost:  slMovingCost,

		BoredomTradeCount:   len(boredomTrades),
		BoredomTradeWinRate: winRateOf(boredomTrades),
		BoredomTradePnL:     boredomPnL,

		PlanComplianceRate:    planComplianceRate,
		PlannedTradeWinRate:   plannedWR,
		UnplannedTradeWinRate: unplannedWR,
		ComplianceCost:        complianceCost,

		EmotionBreakdown:    emotionBreakdown,
		SetupBreakdown:      setupBreakdown,
		SegmentBreakdown:    segmentBreakdown,
		InstrumentBreakdown: instrumentBreakdown,
		HoldingBuckets:      holdingBuckets,
		EdgeZoneLabel:       maxWRBucketLabel,

		PrimaryInsight: primaryInsight,
		AllInsights:    allInsights,
		IQScore:        iqScore,
		IQBreakdown: IQBreakdown{
			WinRateScore:     winRateScore,
			DisciplineScore:  disciplineScore,
			RiskScore:        riskScore,
			ConsistencyScore: consistencyScore,
		},

		BestSelfAvgPnL:     bestSelfAvgPnL,
		OverallAvgPnL:      overallAvgPnL,
		BestSelfMultiplier: bestSelfMultiplier,

		MostExpensiveDays: mostExpensiveDays,
		WeeklyTrend:       weeklyTrend,
	}
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

func pnlOf(t models.Trade) float64 {
	if t.PnL != nil {
		return *t.PnL
	}
	return 0
}

func winRateOf(trades []models.Trade) float64 {
	if len(trades) == 0 {
		return 0
	}
	wins := 0
	for _, t := range trades {
		if pnlOf(t) > 0 {
			wins++
		}
	}
	return float64(wins) / float64(len(trades)) * 100
}

func sumPnL(trades []models.Trade) float64 {
	s := 0.0
	for _, t := range trades {
		s += pnlOf(t)
	}
	return s
}

func meanPnL(trades []models.Trade) float64 {
	if len(trades) == 0 {
		return 0
	}
	return sumPnL(trades) / float64(len(trades))
}

func avgWinOf(trades []models.Trade) float64 {
	s, n := 0.0, 0
	for _, t := range trades {
		if pnlOf(t) > 0 {
			s += pnlOf(t)
			n++
		}
	}
	return safeDivide(s, float64(n))
}

func avgLossOf(trades []models.Trade) float64 {
	s, n := 0.0, 0
	for _, t := range trades {
		if pnlOf(t) < 0 {
			s += -pnlOf(t)
			n++
		}
	}
	return safeDivide(s, float64(n))
}

func safeDivide(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

func holdingMinutes(t models.Trade) int {
	if t.HoldingMinutes != nil {
		return *t.HoldingMinutes
	}
	if t.ExitTime != nil {
		m := int(t.ExitTime.Sub(t.EntryTime).Minutes())
		if m < 0 {
			return 0
		}
		return m
	}
	return 0
}

func extractInstrumentBase(instrument string) string {
	upper := strings.ToUpper(instrument)
	if strings.HasPrefix(upper, "BANKNIFTY") {
		return "BANKNIFTY"
	}
	if strings.HasPrefix(upper, "NIFTY") {
		return "NIFTY"
	}
	return instrument
}

func groupByDate(trades []models.Trade) map[string][]models.Trade {
	m := map[string][]models.Trade{}
	for _, t := range trades {
		k := t.TradeDate.Format("2006-01-02")
		m[k] = append(m[k], t)
	}
	return m
}

func groupByHour(trades []models.Trade) map[int][]models.Trade {
	m := map[int][]models.Trade{}
	for _, t := range trades {
		h := t.EntryTime.Hour()
		m[h] = append(m[h], t)
	}
	return m
}

func groupByWeekday(trades []models.Trade) map[string][]models.Trade {
	abbrev := map[time.Weekday]string{
		time.Monday: "Mon", time.Tuesday: "Tue", time.Wednesday: "Wed",
		time.Thursday: "Thu", time.Friday: "Fri",
	}
	m := map[string][]models.Trade{}
	for _, t := range trades {
		day := abbrev[t.TradeDate.Weekday()]
		m[day] = append(m[day], t)
	}
	return m
}

func groupByField(trades []models.Trade, key func(models.Trade) string) map[string][]models.Trade {
	m := map[string][]models.Trade{}
	for _, t := range trades {
		k := key(t)
		m[k] = append(m[k], t)
	}
	return m
}

func sortedDateKeys(m map[string][]models.Trade) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sumInts(ns []int) int {
	s := 0
	for _, n := range ns {
		s += n
	}
	return s
}

func appendUnique(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}

func getTradesForRange(userID uuid.UUID, dateRange string) []models.Trade {
	cutoff := time.Now()
	switch dateRange {
	case "7d":
		cutoff = cutoff.AddDate(0, 0, -7)
	case "1m":
		cutoff = cutoff.AddDate(0, -1, 0)
	case "3m":
		cutoff = cutoff.AddDate(0, -3, 0)
	case "6m":
		cutoff = cutoff.AddDate(0, -6, 0)
	default:
		cutoff = time.Time{}
	}
	var trades []models.Trade
	q := database.DB.Where("user_id = ? AND status != 'fill'", userID)
	if !cutoff.IsZero() {
		q = q.Where("trade_date >= ?", cutoff)
	}
	q.Order("trade_date ASC, entry_time ASC").Find(&trades)
	return trades
}
