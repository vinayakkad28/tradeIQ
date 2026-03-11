package main

import (
	"log"
	"os"
	"strings"

	"tradeiq/gateway/internal/analytics"
	"tradeiq/gateway/internal/auth"
	"tradeiq/gateway/internal/brokers"
	"tradeiq/gateway/internal/journal"
	"tradeiq/gateway/internal/market"
	"tradeiq/gateway/internal/notifications"
	"tradeiq/gateway/internal/reports"
	"tradeiq/gateway/internal/trades"
	"tradeiq/gateway/internal/users"
	wshandler "tradeiq/gateway/internal/ws"
	appcrypto "tradeiq/gateway/pkg/crypto"
	"tradeiq/gateway/pkg/database"
	"tradeiq/gateway/pkg/middleware"
	"tradeiq/gateway/pkg/redisclient"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Fail fast: validate required env vars
	if os.Getenv("JWT_SECRET") == "" {
		log.Fatal("FATAL: JWT_SECRET environment variable must be set")
	}

	// Init subsystems
	database.Init()
	appcrypto.Init()
	redisclient.Init()

	// Gin setup
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestID())
	r.Use(middleware.StructuredLogger())
	r.Use(middleware.SecurityHeaders())

	// CORS: allow localhost, known prod domains, specific Vercel deployment,
	// and any extra origin set via FRONTEND_URL env var.
	extraOrigin := os.Getenv("FRONTEND_URL")
	vercelProject := os.Getenv("VERCEL_PROJECT_SLUG") // e.g. "tradeiq"
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			if origin == "http://localhost:3000" {
				return true
			}
			if origin == "https://tradeiq.in" || origin == "https://www.tradeiq.in" {
				return true
			}
			// Only allow the specific Vercel project, not all *.vercel.app
			if vercelProject != "" && strings.HasSuffix(origin, ".vercel.app") &&
				strings.Contains(origin, vercelProject) {
				return true
			}
			if extraOrigin != "" && origin == extraOrigin {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// Health check
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok", "service": "tradeiq-gateway"}) })


	// Demo (no auth)
	r.GET("/api/v1/demo/analytics", analytics.GetDemoAnalytics)

	// Broker OAuth public callback (broker redirects here after auth)
	r.GET("/api/v1/brokers/oauth/callback", brokers.OAuthCallback)

	// Market data — public, no auth required
	mkt := r.Group("/api/v1/market")
	{
		mkt.GET("/indices", market.GetIndices)
		mkt.GET("/vix", market.GetVIX)
		mkt.GET("/fii-dii", market.GetFIIDII)
		mkt.GET("/gainers-losers", market.GetGainersLosers)
		mkt.GET("/max-pain", market.GetMaxPain)
	}

	v1 := r.Group("/api/v1")

	// ── AUTH ──────────────────────────────────────────────
	authGroup := v1.Group("/auth")
	authGroup.Use(middleware.RateLimit(5))
	{
		authGroup.POST("/register", auth.Register)
		authGroup.POST("/login", auth.Login)
		authGroup.POST("/refresh", auth.Refresh)
		authGroup.POST("/logout", auth.Logout)
	}

	// ── AUTHENTICATED ─────────────────────────────────────
	protected := v1.Group("/")
	protected.Use(middleware.AuthRequired())
	{
		// Users
		protected.GET("users/me", users.GetMe)
		protected.PATCH("users/me", users.UpdateMe)
		protected.POST("users/change-password", users.ChangePassword)

		// Brokers
		protected.GET("users/me/brokers", brokers.ListBrokers)
		protected.POST("users/me/brokers/connect", brokers.ConnectBroker)
		protected.POST("users/me/brokers/callback", brokers.BrokerCallback)
		protected.DELETE("users/me/brokers/:id", brokers.DisconnectBroker)
		protected.POST("users/me/brokers/:id/sync", brokers.SyncBroker)
		protected.POST("users/me/brokers/sync-all", brokers.SyncAllBrokers)

		// Trades
		protected.POST("trades/ingest/csv", trades.IngestCSV)
		protected.GET("trades", trades.ListTrades)
		protected.GET("trades/:id", trades.GetTrade)

		// Analytics
		protected.GET("analytics/insights", analytics.GetInsights)
		protected.GET("analytics/equity-curve", analytics.GetEquityCurve)
		protected.GET("analytics/heatmap", analytics.GetHeatmap)

		// Market — authenticated (uses user's Dhan connection for option chain)
		protected.GET("market/option-chain", market.GetOptionChain)

		// Journal (free for all authenticated users)
		journalGroup := protected.Group("journal")
		{
			journalGroup.GET("", journal.ListJournal)
			journalGroup.POST("", journal.CreateJournalEntry)
			journalGroup.PATCH(":id", journal.UpdateJournalEntry)
			journalGroup.DELETE(":id", journal.DeleteJournalEntry)
		}

		// Notifications
		protected.GET("notifications", notifications.ListNotifications)
		protected.PATCH("notifications/:id/read", notifications.MarkRead)
		protected.POST("notifications/mark-all-read", notifications.MarkAllRead)
		protected.DELETE("notifications/:id", notifications.DeleteNotification)

		// Reports (trader plan)
		reportsGroup := protected.Group("reports")
		reportsGroup.Use(middleware.PlanGate("trader"))
		{
			reportsGroup.GET("weekly", reports.GetWeeklyReport)
			reportsGroup.GET("weekly/list", reports.ListReports)
			reportsGroup.POST("weekly/generate", reports.GenerateReport)
		}

		// WebSocket live feed
		protected.GET("ws/live", wshandler.HandleLive)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("TradeIQ Gateway starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
