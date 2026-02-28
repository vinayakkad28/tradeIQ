package journal

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GET /journal
func ListJournal(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit := 50
	offset := (page - 1) * limit

	query := database.DB.Where("user_id = ?", userID)
	if emotion := c.Query("emotion"); emotion != "" {
		query = query.Where("emotion = ?", emotion)
	}
	if rating := c.Query("setup_rating"); rating != "" {
		query = query.Where("setup_rating = ?", rating)
	}

	var total int64
	query.Model(&models.JournalEntry{}).Count(&total)

	var entries []models.JournalEntry
	query.Order("trade_date DESC").Offset(offset).Limit(limit).Find(&entries)

	c.JSON(http.StatusOK, gin.H{"entries": entries, "total": total})
}

// POST /journal
func CreateJournalEntry(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	// Accept raw map so we can handle trade_date as either "YYYY-MM-DD" or RFC3339
	var raw map[string]json.RawMessage
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}

	var entry models.JournalEntry
	// Marshal back to JSON and re-decode into the model (handles all fields except trade_date)
	rebind, _ := json.Marshal(raw)
	json.Unmarshal(rebind, &entry) //nolint

	// Parse trade_date flexibly
	if tdRaw, ok := raw["trade_date"]; ok {
		var tdStr string
		if err := json.Unmarshal(tdRaw, &tdStr); err == nil {
			for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02"} {
				if t, err := time.Parse(layout, tdStr); err == nil {
					entry.TradeDate = t
					break
				}
			}
		}
	}

	entry.ID = uuid.New()
	entry.UserID = userID
	database.DB.Create(&entry)
	c.JSON(http.StatusCreated, gin.H{"entry": entry})
}

// PATCH /journal/:id
func UpdateJournalEntry(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var entry models.JournalEntry
	if err := database.DB.First(&entry, "id = ? AND user_id = ?", c.Param("id"), userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": true, "code": "NOT_FOUND", "message": "Entry not found"})
		return
	}
	var updates map[string]interface{}
	c.ShouldBindJSON(&updates)
	database.DB.Model(&entry).Updates(updates)
	c.JSON(http.StatusOK, entry)
}

// DELETE /journal/:id
func DeleteJournalEntry(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	database.DB.Delete(&models.JournalEntry{}, "id = ? AND user_id = ?", c.Param("id"), userID)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
