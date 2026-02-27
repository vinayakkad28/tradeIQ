package journal

import (
	"net/http"
	"strconv"

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
	var entry models.JournalEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	entry.ID = uuid.New()
	entry.UserID = userID
	database.DB.Create(&entry)
	c.JSON(http.StatusCreated, entry)
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
