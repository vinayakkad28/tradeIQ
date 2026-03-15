package reports

import (
	"net/http"
	"time"

	"tradeiq/gateway/internal/analytics"
	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GET /reports/weekly
func GetWeeklyReport(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	weekStart := c.Query("week_start")

	var report models.WeeklyReport
	query := database.DB.Where("user_id = ?", userID)
	if weekStart != "" {
		query = query.Where("week_start = ?", weekStart)
	} else {
		query = query.Order("week_start DESC")
	}
	if err := query.First(&report).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": true, "code": "NOT_FOUND", "message": "No report found"})
		return
	}
	c.JSON(http.StatusOK, report)
}

// GET /reports/weekly/list
func ListReports(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var reports []models.WeeklyReport
	database.DB.Where("user_id = ?", userID).Order("week_start DESC").Limit(12).Find(&reports)
	c.JSON(http.StatusOK, gin.H{"reports": reports})
}

// POST /reports/weekly/generate
func GenerateReport(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var req struct {
		WeekStart string `json:"week_start" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	weekStart, _ := time.Parse("2006-01-02", req.WeekStart)
	weekEnd := weekStart.AddDate(0, 0, 6)

	var trades []models.Trade
	database.DB.Where("user_id = ? AND trade_date >= ? AND trade_date <= ?", userID, weekStart, weekEnd).Find(&trades)

	totalPnL, wins := 0.0, 0
	for _, t := range trades {
		if t.PnL != nil {
			totalPnL += *t.PnL
			if *t.PnL > 0 {
				wins++
			}
		}
	}
	winRate := 0.0
	if len(trades) > 0 {
		winRate = float64(wins) / float64(len(trades)) * 100
	}

	topInsight := "No trades this week."
	if len(trades) > 0 {
		insights := analytics.ComputeFullInsights(trades)
		topInsight = insights.PrimaryInsight.Title + ": " + insights.PrimaryInsight.Description + " Action: " + insights.PrimaryInsight.ActionText
	}

	report := models.WeeklyReport{
		ID:         uuid.New(),
		UserID:     userID,
		WeekStart:  weekStart,
		WeekEnd:    weekEnd,
		TotalPnL:   totalPnL,
		TradeCount: len(trades),
		WinRate:    winRate,
		TopInsight: topInsight,
	}
	database.DB.Create(&report)
	c.JSON(http.StatusCreated, report)
}
