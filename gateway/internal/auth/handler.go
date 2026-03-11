package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"net/http"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"
	"tradeiq/gateway/pkg/middleware"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

func jwtSecret() []byte {
	return []byte(middleware.MustGetJWTSecret())
}

func generateTokens(userID uuid.UUID) (accessToken, refreshToken string, err error) {
	// Access token — 15 min
	access := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(15 * time.Minute).Unix(),
		"type":    "access",
	})
	accessToken, err = access.SignedString(jwtSecret())
	if err != nil {
		return
	}
	// Refresh token — 30 days
	refresh := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID.String(),
		"exp":     time.Now().Add(30 * 24 * time.Hour).Unix(),
		"type":    "refresh",
	})
	refreshToken, err = refresh.SignedString(jwtSecret())
	return
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// POST /auth/register
func Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
		FullName string `json:"full_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "HASH_ERROR", "message": "Failed to hash password"})
		return
	}
	user := models.User{
		ID:           uuid.New(),
		Email:        req.Email,
		PasswordHash: string(hash),
		FullName:     req.FullName,
		Plan:         "free",
	}
	if err := database.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": true, "code": "EMAIL_EXISTS", "message": "Email already registered"})
		return
	}
	accessToken, refreshToken, err := generateTokens(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_ERROR", "message": "Failed to generate tokens"})
		return
	}
	if err := database.DB.Create(&models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hashToken(refreshToken),
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
	}).Error; err != nil {
		log.Printf("[Auth] Failed to store refresh token for user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_STORE_ERROR", "message": "Failed to store session"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"user":   user,
		"tokens": gin.H{"access_token": accessToken, "refresh_token": refreshToken},
	})
}

// POST /auth/login
func Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	var user models.User
	if err := database.DB.First(&user, "email = ?", req.Email).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "INVALID_CREDENTIALS", "message": "Invalid email or password"})
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "INVALID_CREDENTIALS", "message": "Invalid email or password"})
		return
	}
	accessToken, refreshToken, err := generateTokens(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_ERROR", "message": "Failed to generate tokens"})
		return
	}
	if err := database.DB.Create(&models.RefreshToken{
		ID:        uuid.New(),
		UserID:    user.ID,
		TokenHash: hashToken(refreshToken),
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
	}).Error; err != nil {
		log.Printf("[Auth] Failed to store refresh token for user %s: %v", user.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_STORE_ERROR", "message": "Failed to store session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user":   user,
		"tokens": gin.H{"access_token": accessToken, "refresh_token": refreshToken},
	})
}

// POST /auth/refresh
func Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	token, err := jwt.Parse(req.RefreshToken, func(t *jwt.Token) (interface{}, error) {
		return jwtSecret(), nil
	})
	if err != nil || !token.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "INVALID_TOKEN", "message": "Invalid or expired refresh token"})
		return
	}
	claims := token.Claims.(jwt.MapClaims)
	if claims["type"] != "refresh" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "WRONG_TOKEN_TYPE", "message": "Not a refresh token"})
		return
	}
	var stored models.RefreshToken
	if err := database.DB.First(&stored, "token_hash = ?", hashToken(req.RefreshToken)).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "TOKEN_NOT_FOUND", "message": "Token revoked"})
		return
	}
	userID, _ := uuid.Parse(claims["user_id"].(string))
	database.DB.Delete(&stored)
	accessToken, refreshToken, err := generateTokens(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_ERROR", "message": "Failed to generate tokens"})
		return
	}
	if err := database.DB.Create(&models.RefreshToken{
		ID:        uuid.New(),
		UserID:    userID,
		TokenHash: hashToken(refreshToken),
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour),
	}).Error; err != nil {
		log.Printf("[Auth] Failed to store refresh token for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "TOKEN_STORE_ERROR", "message": "Failed to store session"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tokens": gin.H{"access_token": accessToken, "refresh_token": refreshToken}})
}

// POST /auth/logout
func Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	database.DB.Delete(&models.RefreshToken{}, "token_hash = ?", hashToken(req.RefreshToken))
	c.JSON(http.StatusOK, gin.H{"success": true})
}
