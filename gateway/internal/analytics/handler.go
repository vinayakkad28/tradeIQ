package analytics

import (
	"encoding/json"
	"net/http"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GET /analytics/insights
func GetInsights(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	user := c.MustGet("user").(models.User)
	dateRange := c.DefaultQuery("range", "1m")
	forceRefresh := c.Query("force_refresh") == "true"

	// Free tier: max 30 days
	if user.Plan == "free" && (dateRange == "3m" || dateRange == "6m" || dateRange == "all") {
		dateRange = "1m"
	}

	// Check cache
	if !forceRefresh {
		var cached models.AnalyticsCache
		if err := database.DB.First(&cached, "user_id = ? AND date_range = ? AND expires_at > ?", userID, dateRange, time.Now()).Error; err == nil {
			c.JSON(http.StatusOK, gin.H{"data": json.RawMessage(cached.Payload), "cached": true, "computed_at": cached.ComputedAt})
			return
		}
	}

	// Compute from trades
	trades := getTradesForRange(userID, dateRange)
	if len(trades) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"totalTrades": 0, "message": "No trades found for this range"}, "cached": false})
		return
	}

	insights := computeInsights(trades)
	payload, _ := json.Marshal(insights)

	// Cache TTL by plan
	ttl := time.Hour
	if user.Plan == "pro" {
		ttl = 15 * time.Minute
	} else if user.Plan == "free" {
		// No cache for free
		c.JSON(http.StatusOK, gin.H{"data": insights, "cached": false})
		return
	}

	database.DB.Save(&models.AnalyticsCache{
		UserID:     userID,
		DateRange:  dateRange,
		ComputedAt: time.Now(),
		ExpiresAt:  time.Now().Add(ttl),
		Payload:    payload,
	})

	c.JSON(http.StatusOK, gin.H{"data": insights, "cached": false, "computed_at": time.Now()})
}

// GET /analytics/equity-curve
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

	var points []Point
	cum := 0.0
	for date, daily := range dailyMap {
		cum += daily
		points = append(points, Point{Date: date, Daily: daily, Cumulative: cum})
	}

	c.JSON(http.StatusOK, gin.H{"points": points})
}

// GET /analytics/heatmap
func GetHeatmap(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	dateRange := c.DefaultQuery("range", "1m")
	dimension := c.DefaultQuery("dimension", "hour")
	trades := getTradesForRange(userID, dateRange)

	type Cell struct {
		Label  string  `json:"label"`
		PnL    float64 `json:"pnl"`
		Trades int     `json:"trades"`
	}

	cellMap := map[string]*Cell{}
	for _, t := range trades {
		var key string
		if dimension == "hour" {
			key = t.EntryTime.Format("15:00")
		} else if dimension == "day" {
			key = t.TradeDate.Weekday().String()[:3]
		} else {
			key = t.Instrument
		}
		if cellMap[key] == nil {
			cellMap[key] = &Cell{Label: key}
		}
		if t.PnL != nil {
			cellMap[key].PnL += *t.PnL
		}
		cellMap[key].Trades++
	}

	var cells []Cell
	for _, cell := range cellMap {
		cells = append(cells, *cell)
	}
	c.JSON(http.StatusOK, gin.H{"cells": cells, "dimension": dimension})
}

// GET /demo/analytics (no auth)
func GetDemoAnalytics(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"message": "Demo analytics — connect a broker or upload CSV for real insights",
		"demo":    true,
		"totalTrades": 47,
		"winRate":     63.8,
		"totalPnl":    18400,
		"iqScore":     72,
	})
}

// ── helpers ──────────────────────────────────────────────

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
	q := database.DB.Where("user_id = ?", userID)
	if !cutoff.IsZero() {
		q = q.Where("trade_date >= ?", cutoff)
	}
	q.Order("trade_date ASC").Find(&trades)
	return trades
}

type insightResult struct {
	TotalTrades int     `json:"totalTrades"`
	WinRate     float64 `json:"winRate"`
	TotalPnl    float64 `json:"totalPnl"`
	AvgWin      float64 `json:"avgWin"`
	AvgLoss     float64 `json:"avgLoss"`
	Expectancy  float64 `json:"expectancy"`
}

func computeInsights(trades []models.Trade) insightResult {
	if len(trades) == 0 {
		return insightResult{}
	}
	wins, totalPnl, totalWin, totalLoss := 0, 0.0, 0.0, 0.0
	for _, t := range trades {
		if t.PnL == nil {
			continue
		}
		totalPnl += *t.PnL
		if *t.PnL > 0 {
			wins++
			totalWin += *t.PnL
		} else {
			totalLoss += -*t.PnL
		}
	}
	winRate := float64(wins) / float64(len(trades)) * 100
	avgWin, avgLoss := 0.0, 0.0
	if wins > 0 {
		avgWin = totalWin / float64(wins)
	}
	losses := len(trades) - wins
	if losses > 0 {
		avgLoss = totalLoss / float64(losses)
	}
	expectancy := (winRate/100)*avgWin - (1-winRate/100)*avgLoss
	return insightResult{
		TotalTrades: len(trades),
		WinRate:     winRate,
		TotalPnl:    totalPnl,
		AvgWin:      avgWin,
		AvgLoss:     avgLoss,
		Expectancy:  expectancy,
	}
}
