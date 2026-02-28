package middleware

import (
	"net/http"
	"os"
	"strings"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ── AUTH MIDDLEWARE ──────────────────────────────────────

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Support ?token= query param for WebSocket connections (browsers can't set headers on WS)
		var tokenStr string
		if q := c.Query("token"); q != "" {
			tokenStr = q
		} else {
			authHeader := c.GetHeader("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "NO_TOKEN", "message": "Authorization token required"})
				c.Abort()
				return
			}
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		}
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			secret = "tradeiq_dev_secret_change_in_production"
		}
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "INVALID_TOKEN", "message": "Invalid or expired token"})
			c.Abort()
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "BAD_CLAIMS", "message": "Invalid token claims"})
			c.Abort()
			return
		}
		userIDStr, _ := claims["user_id"].(string)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "BAD_UID", "message": "Invalid user ID in token"})
			c.Abort()
			return
		}
		var user models.User
		if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "USER_NOT_FOUND", "message": "User not found"})
			c.Abort()
			return
		}
		c.Set("user", user)
		c.Set("user_id", userID)
		c.Next()
	}
}

// ── PLAN GATE ────────────────────────────────────────────

func PlanGate(requiredPlan string) gin.HandlerFunc {
	planRank := map[string]int{"free": 0, "trader": 1, "pro": 2}
	return func(c *gin.Context) {
		user := c.MustGet("user").(models.User)
		if planRank[user.Plan] < planRank[requiredPlan] {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":       true,
				"code":        "PLAN_REQUIRED",
				"message":     "This feature requires the " + requiredPlan + " plan",
				"upgrade_url": "/pricing",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ── RATE LIMIT (simple token bucket) ────────────────────

var rateLimitMap = map[string][]time.Time{}

func RateLimit(maxPerMinute int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()
		cutoff := now.Add(-time.Minute)
		times := rateLimitMap[ip]
		var valid []time.Time
		for _, t := range times {
			if t.After(cutoff) {
				valid = append(valid, t)
			}
		}
		if len(valid) >= maxPerMinute {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": true, "code": "RATE_LIMIT", "message": "Too many requests"})
			c.Abort()
			return
		}
		rateLimitMap[ip] = append(valid, now)
		c.Next()
	}
}

// ── LOGGER ───────────────────────────────────────────────

func Logger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(p gin.LogFormatterParams) string {
		return "[TRADEIQ] " + p.TimeStamp.Format("2006-01-02 15:04:05") +
			" | " + p.Method + " " + p.Path +
			" | " + strings.Repeat(" ", max(0, 3-len(string(rune(p.StatusCode))))) + string(rune(p.StatusCode)) +
			" | " + p.Latency.String() + "\n"
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
