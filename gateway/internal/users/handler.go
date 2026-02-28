package users

import (
	"net/http"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
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
		FullName       *string `json:"full_name"`
		OnboardingDone *bool   `json:"onboarding_done"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if req.FullName != nil {
		updates["full_name"] = *req.FullName
	}
	if req.OnboardingDone != nil {
		updates["onboarding_done"] = *req.OnboardingDone
	}
	database.DB.Model(&user).Updates(updates)
	database.DB.First(&user, "id = ?", user.ID)
	c.JSON(http.StatusOK, gin.H{"user": user})
}
