package alerts

import (
	"fmt"
	"sort"
	"time"

	wshandler "tradeiq/gateway/internal/ws"
	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/google/uuid"
)

// EvaluateAndNotify runs alert checks after new trades are ingested.
// It is called as a fire-and-forget goroutine — errors are silently dropped.
func EvaluateAndNotify(userID uuid.UUID, trades []models.Trade) {
	today := time.Now().Truncate(24 * time.Hour)

	// Fetch ALL of today's trades for this user (includes ones ingested before this batch)
	var todayTrades []models.Trade
	database.DB.Where("user_id = ? AND trade_date >= ? AND status != 'fill'", userID, today).
		Order("entry_time ASC").Find(&todayTrades)

	if len(todayTrades) == 0 {
		return
	}

	checkRevengeTrades(userID, todayTrades, today)
	checkConsecutiveLosses(userID, todayTrades, today)
	checkDailyLossLimit(userID, todayTrades, today)
}

// checkRevengeTrades fires if any trade today has ReEntryAfterLoss = true
func checkRevengeTrades(userID uuid.UUID, trades []models.Trade, today time.Time) {
	var revengeTrades []models.Trade
	totalCost := 0.0
	for _, t := range trades {
		if t.ReEntryAfterLoss {
			revengeTrades = append(revengeTrades, t)
			if t.PnL != nil && *t.PnL < 0 {
				totalCost += -*t.PnL
			}
		}
	}
	if len(revengeTrades) == 0 {
		return
	}

	category := "behavioral"
	if alreadyNotifiedToday(userID, category, today) {
		return
	}

	n := models.Notification{
		ID:       uuid.New(),
		UserID:   userID,
		Category: category,
		Severity: "critical",
		Title:    "Revenge Trading Detected",
		Message:  fmt.Sprintf("%d re-entry trade(s) after losses detected today. Estimated cost: ₹%.0f. Take a 15-min break before re-entering.", len(revengeTrades), totalCost),
	}
	database.DB.Create(&n)
	wshandler.GlobalHub.Broadcast(userID, "notification", n)
}

// checkConsecutiveLosses fires if there are 3+ consecutive losses today
func checkConsecutiveLosses(userID uuid.UUID, trades []models.Trade, today time.Time) {
	// Sort by entry_time
	sorted := make([]models.Trade, len(trades))
	copy(sorted, trades)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].EntryTime.Before(sorted[j].EntryTime)
	})

	maxConsec, current := 0, 0
	for _, t := range sorted {
		if t.PnL != nil && *t.PnL < 0 {
			current++
			if current > maxConsec {
				maxConsec = current
			}
		} else {
			current = 0
		}
	}

	if maxConsec < 3 {
		return
	}

	category := "streak"
	if alreadyNotifiedToday(userID, category, today) {
		return
	}

	n := models.Notification{
		ID:       uuid.New(),
		UserID:   userID,
		Category: category,
		Severity: "warning",
		Title:    "Losing Streak Alert",
		Message:  fmt.Sprintf("%d consecutive losses detected today. Consider stepping away and reviewing your setup before the next trade.", maxConsec),
	}
	database.DB.Create(&n)
	wshandler.GlobalHub.Broadcast(userID, "notification", n)
}

// checkDailyLossLimit fires if today's total P&L is below -₹5000
func checkDailyLossLimit(userID uuid.UUID, trades []models.Trade, today time.Time) {
	totalPnL := 0.0
	for _, t := range trades {
		if t.PnL != nil {
			totalPnL += *t.PnL
		}
	}
	if totalPnL >= -5000 {
		return
	}

	category := "pnl"
	if alreadyNotifiedToday(userID, category, today) {
		return
	}

	n := models.Notification{
		ID:       uuid.New(),
		UserID:   userID,
		Category: category,
		Severity: "warning",
		Title:    "Daily Loss Limit Reached",
		Message:  fmt.Sprintf("Today's P&L is ₹%.0f. You've hit the ₹5,000 daily loss threshold. Consider stopping for the day to protect your capital.", totalPnL),
	}
	database.DB.Create(&n)
	wshandler.GlobalHub.Broadcast(userID, "notification", n)
}

// alreadyNotifiedToday returns true if a notification of this category was already sent today
func alreadyNotifiedToday(userID uuid.UUID, category string, today time.Time) bool {
	var count int64
	database.DB.Model(&models.Notification{}).
		Where("user_id = ? AND category = ? AND created_at >= ?", userID, category, today).
		Count(&count)
	return count > 0
}
