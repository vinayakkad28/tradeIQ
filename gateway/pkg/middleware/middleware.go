package middleware

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"
	"tradeiq/gateway/pkg/redisclient"

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
		secret := MustGetJWTSecret()
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

// ── JWT SECRET ──────────────────────────────────────────

// MustGetJWTSecret returns the JWT_SECRET env var, panicking if unset.
func MustGetJWTSecret() string {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		panic("JWT_SECRET environment variable must be set — refusing to start without it")
	}
	return secret
}

// ── PLAN GATE ────────────────────────────────────────────

func PlanGate(requiredPlan string) gin.HandlerFunc {
	planRank := map[string]int{"free": 0, "trader": 1, "pro": 2}
	return func(c *gin.Context) {
		user := c.MustGet("user").(models.User)
		// Check plan tier
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
		// Check plan expiry for paid plans
		if user.Plan != "free" && user.PlanExpiresAt != nil && user.PlanExpiresAt.Before(time.Now()) {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"error":       true,
				"code":        "PLAN_EXPIRED",
				"message":     "Your " + user.Plan + " plan has expired. Please renew to continue.",
				"upgrade_url": "/pricing",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ── RATE LIMIT (cache-backed with bounded memory) ────────

func RateLimit(maxPerMinute int) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		key := fmt.Sprintf("rl:%s", ip)

		count := redisclient.Incr(context.Background(), key, time.Minute)
		if count > int64(maxPerMinute) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": true, "code": "RATE_LIMIT", "message": "Too many requests. Try again in a minute."})
			c.Abort()
			return
		}
		c.Next()
	}
}

// ── SECURITY HEADERS ─────────────────────────────────────

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		// HSTS — only set if running behind TLS
		if c.GetHeader("X-Forwarded-Proto") == "https" || os.Getenv("GIN_MODE") == "release" {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		c.Next()
	}
}

// ── REQUEST ID ───────────────────────────────────────────

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.New().String()[:8]
		}
		c.Set("request_id", id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// ── STRUCTURED LOGGER ────────────────────────────────────

func StructuredLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)
		reqID, _ := c.Get("request_id")
		status := c.Writer.Status()

		// JSON structured log
		fmt.Printf(`{"time":"%s","method":"%s","path":"%s","status":%d,"latency_ms":%d,"ip":"%s","request_id":"%v"}%s`,
			start.Format(time.RFC3339),
			c.Request.Method,
			c.Request.URL.Path,
			status,
			latency.Milliseconds(),
			c.ClientIP(),
			reqID,
			"\n",
		)
	}
}

// ── CSV SIZE LIMIT ───────────────────────────────────────

const MaxCSVUploadSize = 10 << 20 // 10 MB

func CSVSizeLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxCSVUploadSize)
		c.Next()
	}
}
