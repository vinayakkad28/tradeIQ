package notifications

import (
	"net/http"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// GET /notifications
func ListNotifications(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	query := database.DB.Where("user_id = ?", userID)
	if c.Query("unread_only") == "true" {
		query = query.Where("read = false")
	}
	var notifs []models.Notification
	query.Order("created_at DESC").Limit(50).Find(&notifs)
	var unreadCount int64
	database.DB.Model(&models.Notification{}).Where("user_id = ? AND read = false", userID).Count(&unreadCount)
	c.JSON(http.StatusOK, gin.H{"notifications": notifs, "unread_count": unreadCount})
}

// PATCH /notifications/:id/read
func MarkRead(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	database.DB.Model(&models.Notification{}).Where("id = ? AND user_id = ?", c.Param("id"), userID).Update("read", true)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /notifications/mark-all-read
func MarkAllRead(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	result := database.DB.Model(&models.Notification{}).Where("user_id = ? AND read = false", userID).Update("read", true)
	c.JSON(http.StatusOK, gin.H{"updated_count": result.RowsAffected})
}

// DELETE /notifications/:id
func DeleteNotification(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	database.DB.Delete(&models.Notification{}, "id = ? AND user_id = ?", c.Param("id"), userID)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
