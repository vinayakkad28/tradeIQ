package users

import (
	"net/http"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// GET /users/me
func GetMe(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// PATCH /users/me
func UpdateMe(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	var req struct {
		FullName          *string `json:"full_name"`
		PhoneNumber       *string `json:"phone_number"`
		TradingExperience *string `json:"trading_experience"`
		TradingStyle      *string `json:"trading_style"`
		AvatarColor       *string `json:"avatar_color"`
		OnboardingDone    *bool   `json:"onboarding_done"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if req.FullName != nil {
		updates["full_name"] = *req.FullName
	}
	if req.PhoneNumber != nil {
		updates["phone_number"] = *req.PhoneNumber
	}
	if req.TradingExperience != nil {
		updates["trading_experience"] = *req.TradingExperience
	}
	if req.TradingStyle != nil {
		updates["trading_style"] = *req.TradingStyle
	}
	if req.AvatarColor != nil {
		updates["avatar_color"] = *req.AvatarColor
	}
	if req.OnboardingDone != nil {
		updates["onboarding_done"] = *req.OnboardingDone
	}
	if len(updates) > 0 {
		database.DB.Model(&user).Updates(updates)
	}
	database.DB.First(&user, "id = ?", user.ID)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// POST /users/change-password
func ChangePassword(c *gin.Context) {
	user := c.MustGet("user").(models.User)
	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required,min=8"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "message": err.Error()})
		return
	}
	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "message": "Current password is incorrect"})
		return
	}
	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "message": "Failed to update password"})
		return
	}
	database.DB.Model(&user).Update("password_hash", string(newHash))
	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}
