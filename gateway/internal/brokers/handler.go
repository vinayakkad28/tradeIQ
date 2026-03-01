package brokers

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ─── SUPPORTED BROKERS ────────────────────────────────────

var supportedBrokers = []gin.H{
	{"id": "zerodha", "name": "Zerodha", "description": "Kite API — OAuth 2.0"},
	{"id": "upstox", "name": "Upstox", "description": "Upstox Pro API v2"},
	{"id": "angelone", "name": "AngelOne", "description": "SmartAPI REST"},
	{"id": "fyers", "name": "Fyers", "description": "Fyers API v3"},
	{"id": "dhan", "name": "Dhan", "description": "Dhan HQ Trading API"},
}

// Broker OAuth config from env
type brokerConfig struct {
	APIKey      string
	APISecret   string
	OAuthURL    string
	TokenURL    string
	RedirectURI string
}

func getBrokerConfig(broker string) brokerConfig {
	appBase := os.Getenv("APP_BASE_URL")
	if appBase == "" {
		appBase = "http://localhost:8080"
	}
	redirect := appBase + "/api/v1/brokers/oauth/callback"

	switch broker {
	case "zerodha":
		return brokerConfig{
			APIKey:      os.Getenv("ZERODHA_API_KEY"),
			APISecret:   os.Getenv("ZERODHA_API_SECRET"),
			OAuthURL:    "https://kite.zerodha.com/connect/login",
			TokenURL:    "https://api.kite.trade/session/token",
			RedirectURI: redirect,
		}
	case "upstox":
		return brokerConfig{
			APIKey:      os.Getenv("UPSTOX_CLIENT_ID"),
			APISecret:   os.Getenv("UPSTOX_CLIENT_SECRET"),
			OAuthURL:    "https://api.upstox.com/v2/login/authorization/dialog",
			TokenURL:    "https://api.upstox.com/v2/login/authorization/token",
			RedirectURI: redirect,
		}
	case "angelone":
		return brokerConfig{
			APIKey:      os.Getenv("ANGELONE_API_KEY"), // Publisher API key (from SmartAPI "Publisher APIs" app)
			APISecret:   os.Getenv("ANGELONE_CLIENT_SECRET"),
			OAuthURL:    "https://smartapi.angelone.in/publisher-login",
			RedirectURI: redirect,
		}
	case "fyers":
		return brokerConfig{
			APIKey:      os.Getenv("FYERS_APP_ID"),
			APISecret:   os.Getenv("FYERS_SECRET_KEY"),
			OAuthURL:    "https://api-t1.fyers.in/api/v3/generate-authcode",
			TokenURL:    "https://api-t1.fyers.in/api/v3/validate-authcode",
			RedirectURI: redirect,
		}
	case "dhan":
		return brokerConfig{
			APIKey:    os.Getenv("DHAN_APP_ID"),     // app_id header for Dhan consent API
			APISecret: os.Getenv("DHAN_APP_SECRET"), // app_secret header for Dhan consent API
		}
	}
	return brokerConfig{}
}

// ── GET /users/me/brokers ─────────────────────────────────

func ListBrokers(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var connections []models.BrokerConnection
	database.DB.Where("user_id = ?", userID).Find(&connections)
	if connections == nil {
		connections = []models.BrokerConnection{}
	}
	c.JSON(http.StatusOK, gin.H{"brokers": connections, "supported_brokers": supportedBrokers})
}

// ── POST /users/me/brokers/connect ────────────────────────

func ConnectBroker(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var req struct {
		BrokerName  string `json:"broker_name" binding:"required"`
		AccessToken string `json:"access_token"` // For token-based brokers
		ClientID    string `json:"client_id"`    // Optional — Dhan client ID for display
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}

	// Capture which frontend origin initiated this connect so the callback redirects back correctly.
	// This fixes the localhost redirect bug when using production (Vercel → Railway).
	frontendURL := c.GetHeader("Origin")
	if frontendURL == "" {
		frontendURL = os.Getenv("FRONTEND_URL")
	}
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	// ── Dhan: personal access token (skip OAuth) ──────────
	if req.BrokerName == "dhan" && req.AccessToken != "" {
		now := time.Now()
		conn := models.BrokerConnection{}
		database.DB.Where("user_id = ? AND broker_name = ?", userID, "dhan").First(&conn)
		conn.UserID = userID
		conn.BrokerName = "dhan"
		conn.DisplayName = brokerDisplayName("dhan")
		conn.AccessToken = req.AccessToken
		conn.ExternalUserID = req.ClientID
		conn.Status = "connected"
		conn.ConnectedAt = now
		conn.RefreshToken = ""
		if conn.ID == uuid.Nil {
			conn.ID = uuid.New()
			database.DB.Create(&conn)
		} else {
			database.DB.Save(&conn)
		}
		c.JSON(http.StatusOK, gin.H{"connection": conn})
		return
	}

	// ── Dhan: OAuth consent flow ──────────────────────────
	if req.BrokerName == "dhan" {
		cfg := getBrokerConfig("dhan")
		if cfg.APIKey == "" || cfg.APISecret == "" {
			c.JSON(http.StatusOK, gin.H{
				"oauth_url":  "",
				"configured": false,
				"message":    "Dhan not configured. Set DHAN_APP_ID, DHAN_APP_SECRET, and DHAN_CLIENT_ID env vars.",
			})
			return
		}

		consentAppID, err := generateDhanConsent(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "DHAN_CONSENT_FAILED", "message": "Dhan consent error: " + err.Error()})
			return
		}

		// Store consentAppID as state — OAuthCallback uses it to link the tokenId back to this user
		database.DB.Where("user_id = ? AND broker_name = ?", userID, "dhan").Delete(&models.BrokerOAuthState{})
		database.DB.Create(&models.BrokerOAuthState{
			ID:          uuid.New(),
			UserID:      userID,
			BrokerName:  "dhan",
			State:       consentAppID,
			FrontendURL: frontendURL,
			ExpiresAt:   time.Now().Add(30 * time.Minute),
		})

		oauthURL := "https://auth.dhan.co/login/consentApp-login?consentAppId=" + consentAppID
		c.JSON(http.StatusOK, gin.H{
			"oauth_url":  oauthURL,
			"state":      consentAppID,
			"configured": true,
		})
		return
	}

	cfg := getBrokerConfig(req.BrokerName)

	// If no API key configured, return info message
	if cfg.APIKey == "" {
		c.JSON(http.StatusOK, gin.H{
			"oauth_url":  "",
			"state":      "",
			"message":    brokerEnvHint(req.BrokerName),
			"configured": false,
		})
		return
	}

	// Generate CSRF state token
	state := uuid.New().String()

	// Store state in DB (expires in 10 min)
	database.DB.Where("user_id = ? AND broker_name = ?", userID, req.BrokerName).Delete(&models.BrokerOAuthState{})
	database.DB.Create(&models.BrokerOAuthState{
		ID:          uuid.New(),
		UserID:      userID,
		BrokerName:  req.BrokerName,
		State:       state,
		FrontendURL: frontendURL,
		ExpiresAt:   time.Now().Add(30 * time.Minute),
	})

	// Build OAuth URL
	oauthURL := buildOAuthURL(req.BrokerName, cfg, state)

	c.JSON(http.StatusOK, gin.H{
		"oauth_url":  oauthURL,
		"state":      state,
		"configured": true,
	})
}

// generateDhanConsent calls POST https://auth.dhan.co/app/generate-consent
// and returns the consentAppId needed to redirect the user for login.
func generateDhanConsent(cfg brokerConfig) (string, error) {
	clientID := os.Getenv("DHAN_CLIENT_ID") // TradeIQ developer's Dhan account ID
	if clientID == "" {
		return "", fmt.Errorf("DHAN_CLIENT_ID env var not set")
	}

	apiURL := "https://auth.dhan.co/app/generate-consent?client_id=" + clientID
	req, err := http.NewRequest("POST", apiURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("app_id", cfg.APIKey)
	req.Header.Set("app_secret", cfg.APISecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("dhan consent HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		ConsentAppID     string `json:"consentAppId"`
		ConsentAppStatus string `json:"consentAppStatus"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.ConsentAppID == "" {
		return "", fmt.Errorf("unexpected dhan consent response: %s", string(body))
	}
	return result.ConsentAppID, nil
}

// exchangeDhan exchanges a Dhan tokenId (from OAuth callback) for a permanent access token
// via GET https://auth.dhan.co/app/consumeApp-consent?tokenId={tokenId}
func exchangeDhan(cfg brokerConfig, tokenID string) (string, string, *time.Time, error) {
	apiURL := "https://auth.dhan.co/app/consumeApp-consent?tokenId=" + tokenID
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", "", nil, err
	}
	req.Header.Set("app_id", cfg.APIKey)
	req.Header.Set("app_secret", cfg.APISecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "", "", nil, fmt.Errorf("dhan consume-consent HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		DhanClientID   string `json:"dhanClientId"`
		DhanClientName string `json:"dhanClientName"`
		AccessToken    string `json:"accessToken"`
		ExpiryTime     string `json:"expiryTime"` // "2025-09-23T12:37:23"
	}
	if err := json.Unmarshal(body, &result); err != nil || result.AccessToken == "" {
		return "", "", nil, fmt.Errorf("dhan consume-consent decode error: %s", string(body))
	}

	// Parse expiry; default to 24h if format differs
	expiry, err := time.Parse("2006-01-02T15:04:05", result.ExpiryTime)
	if err != nil {
		expiry = time.Now().Add(24 * time.Hour)
	}
	// Return DhanClientID as refreshToken slot so BrokerCallback can store it in ExternalUserID
	return result.AccessToken, result.DhanClientID, &expiry, nil
}

func buildOAuthURL(broker string, cfg brokerConfig, state string) string {
	switch broker {
	case "zerodha":
		// Zerodha: https://kite.zerodha.com/connect/login?api_key={KEY}&v=3
		return fmt.Sprintf("%s?api_key=%s&v=3", cfg.OAuthURL, cfg.APIKey)

	case "upstox":
		params := url.Values{}
		params.Set("response_type", "code")
		params.Set("client_id", cfg.APIKey)
		params.Set("redirect_uri", cfg.RedirectURI)
		params.Set("state", state)
		return cfg.OAuthURL + "?" + params.Encode()

	case "fyers":
		params := url.Values{}
		params.Set("client_id", cfg.APIKey+"-100")
		params.Set("redirect_uri", cfg.RedirectURI)
		params.Set("response_type", "code")
		params.Set("state", state)
		return cfg.OAuthURL + "?" + params.Encode()

	case "angelone":
		// AngelOne Publisher login: returns auth_token directly in callback (no code exchange needed)
		params := url.Values{}
		params.Set("api_key", cfg.APIKey)
		params.Set("state", state)
		return cfg.OAuthURL + "?" + params.Encode()
	}
	return ""
}

// ── GET /api/v1/brokers/oauth/callback (public, no auth) ──
// Called by broker OAuth redirect. Reads state from cookie/param.
// This public endpoint then redirects to frontend with the code+state.

// fallbackFrontend returns the stored FrontendURL from the state if non-empty,
// otherwise falls back to the FRONTEND_URL env var, then localhost.
func fallbackFrontend(stored string) string {
	if stored != "" {
		return stored
	}
	if env := os.Getenv("FRONTEND_URL"); env != "" {
		return env
	}
	return "http://localhost:3000"
}

func OAuthCallback(c *gin.Context) {
	// ── Dhan: returns ?tokenId= instead of standard ?code=&state= ──
	// Dhan's configured redirect URL receives only tokenId — no state is echoed back.
	// We look up the most recently created active Dhan state to reconnect it to the user.
	tokenID := c.Query("tokenId")
	if tokenID != "" {
		var dhanState models.BrokerOAuthState
		if err := database.DB.Where("broker_name = ? AND expires_at > ?", "dhan", time.Now()).
			Order("created_at DESC").First(&dhanState).Error; err != nil {
			frontendBase := fallbackFrontend("")
			c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=session_expired&broker=dhan")
			return
		}
		frontendBase := fallbackFrontend(dhanState.FrontendURL)
		// Forward to frontend as standard code+state+broker so OAuthCallbackHandler works unchanged
		redirectURL := fmt.Sprintf("%s/dashboard/brokers?code=%s&state=%s&broker=dhan",
			frontendBase, url.QueryEscape(tokenID), url.QueryEscape(dhanState.State))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// ── AngelOne Publisher Login: returns ?auth_token= (already a JWT, no exchange needed) ──
	authToken := c.Query("auth_token")
	if authToken != "" {
		feedToken := c.Query("feed_token")
		state := c.Query("state")
		// State may not always be returned (known AngelOne quirk) — fall back to most recent active state
		var angelState models.BrokerOAuthState
		if state != "" {
			database.DB.Where("state = ? AND broker_name = ? AND expires_at > ?", state, "angelone", time.Now()).First(&angelState)
		}
		if angelState.ID == uuid.Nil {
			database.DB.Where("broker_name = ? AND expires_at > ?", "angelone", time.Now()).
				Order("created_at DESC").First(&angelState)
		}
		if angelState.ID == uuid.Nil {
			frontendBase := fallbackFrontend("")
			c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=angelone_state_not_found")
			return
		}
		frontendBase := fallbackFrontend(angelState.FrontendURL)
		// Pass auth_token as "code" and feedToken as "refresh_token" so BrokerCallback can store both
		redirectURL := fmt.Sprintf("%s/dashboard/brokers?code=%s&state=%s&broker=angelone&feed_token=%s",
			frontendBase, url.QueryEscape(authToken), url.QueryEscape(angelState.State), url.QueryEscape(feedToken))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// ── Zerodha: returns ?request_token= with no state param ──
	// Zerodha never echoes state back; look up the most recent active Zerodha pending auth.
	requestToken := c.Query("request_token")
	if requestToken != "" {
		var zeroState models.BrokerOAuthState
		if err := database.DB.Where("broker_name = ? AND expires_at > ?", "zerodha", time.Now()).
			Order("created_at DESC").First(&zeroState).Error; err != nil {
			frontendBase := fallbackFrontend("")
			c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=session_expired&broker=zerodha")
			return
		}
		frontendBase := fallbackFrontend(zeroState.FrontendURL)
		redirectURL := fmt.Sprintf("%s/dashboard/brokers?code=%s&state=%s&broker=zerodha",
			frontendBase, url.QueryEscape(requestToken), url.QueryEscape(zeroState.State))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// ── Standard OAuth (Upstox, Fyers …) ──
	// Fyers returns ?auth_code=REAL_CODE&code=200 — always prefer auth_code if present
	code := c.Query("auth_code")
	if code == "" {
		code = c.Query("code")
	}
	state := c.Query("state")
	broker := c.Query("broker")

	if code == "" || state == "" {
		frontendBase := fallbackFrontend("")
		c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=oauth_failed")
		return
	}

	// Look up state to find the broker and stored frontend URL
	var oauthState models.BrokerOAuthState
	if err := database.DB.First(&oauthState, "state = ? AND expires_at > ?", state, time.Now()).Error; err != nil {
		frontendBase := fallbackFrontend("")
		c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=invalid_state")
		return
	}

	frontendBase := fallbackFrontend(oauthState.FrontendURL)
	if broker == "" {
		broker = oauthState.BrokerName
	}

	// Redirect to frontend with code+state+broker for token exchange
	redirectURL := fmt.Sprintf("%s/dashboard/brokers?code=%s&state=%s&broker=%s",
		frontendBase, url.QueryEscape(code), url.QueryEscape(state), url.QueryEscape(broker))
	c.Redirect(http.StatusFound, redirectURL)
}

// ── POST /users/me/brokers/callback (authenticated) ───────
// Frontend calls this after receiving the OAuth code.

func BrokerCallback(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var req struct {
		BrokerName string `json:"broker_name" binding:"required"`
		Code       string `json:"code" binding:"required"`
		State      string `json:"state" binding:"required"`
		FeedToken  string `json:"feed_token"` // AngelOne publisher login returns this alongside auth_token
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[BrokerCallback] VALIDATION_ERROR: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	log.Printf("[BrokerCallback] broker=%s userID=%s stateLen=%d codeLen=%d", req.BrokerName, userID, len(req.State), len(req.Code))

	// Validate state
	var oauthState models.BrokerOAuthState
	if err := database.DB.First(&oauthState, "state = ? AND user_id = ? AND expires_at > ?", req.State, userID, time.Now()).Error; err != nil {
		log.Printf("[BrokerCallback] INVALID_STATE: state=%s userID=%s err=%v", req.State, userID, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "INVALID_STATE", "message": "OAuth state expired or invalid"})
		return
	}
	// Clean up state
	database.DB.Delete(&oauthState)

	cfg := getBrokerConfig(req.BrokerName)

	// Exchange code for access token
	accessToken, refreshToken, expiresAt, err := exchangeToken(req.BrokerName, cfg, req.Code)
	if err != nil {
		log.Printf("[BrokerCallback] TOKEN_EXCHANGE_FAILED broker=%s err=%v", req.BrokerName, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "TOKEN_EXCHANGE_FAILED", "message": err.Error()})
		return
	}

	// Upsert broker connection
	now := time.Now()
	conn := models.BrokerConnection{}
	database.DB.Where("user_id = ? AND broker_name = ?", userID, req.BrokerName).First(&conn)

	conn.UserID = userID
	conn.BrokerName = req.BrokerName
	conn.DisplayName = brokerDisplayName(req.BrokerName)
	conn.AccessToken = accessToken
	conn.TokenExpiresAt = expiresAt
	conn.Status = "connected"
	conn.ConnectedAt = now
	if req.BrokerName == "dhan" {
		// For Dhan, exchangeDhan returns DhanClientID in the refreshToken slot
		conn.ExternalUserID = refreshToken
		conn.RefreshToken = ""
	} else {
		conn.RefreshToken = refreshToken
	}
	if req.FeedToken != "" {
		conn.FeedToken = req.FeedToken
	}

	if conn.ID == uuid.Nil {
		conn.ID = uuid.New()
		database.DB.Create(&conn)
	} else {
		database.DB.Save(&conn)
	}

	c.JSON(http.StatusOK, gin.H{"connection": conn})
}

// ── DELETE /users/me/brokers/:id ──────────────────────────

func DisconnectBroker(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	database.DB.Delete(&models.BrokerConnection{}, "id = ? AND user_id = ?", c.Param("id"), userID)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// ── POST /users/me/brokers/:id/sync ───────────────────────

func SyncBroker(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var conn models.BrokerConnection
	if err := database.DB.First(&conn, "id = ? AND user_id = ?", c.Param("id"), userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": true, "code": "NOT_FOUND", "message": "Connection not found"})
		return
	}

	// Check token expiry
	if conn.AccessToken == "" || (conn.TokenExpiresAt != nil && conn.TokenExpiresAt.Before(time.Now())) {
		conn.Status = "expired"
		database.DB.Save(&conn)
		c.JSON(http.StatusUnauthorized, gin.H{"error": true, "code": "TOKEN_EXPIRED", "message": "Access token expired. Please reconnect."})
		return
	}

	cfg := getBrokerConfig(conn.BrokerName)

	// Fetch trades from broker API
	trades, err := fetchBrokerTrades(conn, cfg, userID)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": true, "code": "BROKER_API_ERROR", "message": "Failed to fetch trades from " + conn.BrokerName + ": " + err.Error()})
		return
	}

	// Deduplicate and store
	imported := 0
	for _, trade := range trades {
		var existing models.Trade
		if trade.BrokerTradeID != "" {
			if database.DB.First(&existing, "broker_trade_id = ? AND user_id = ?", trade.BrokerTradeID, userID).Error == nil {
				continue // Already imported
			}
		}
		if database.DB.Create(&trade).Error == nil {
			imported++
		}
	}

	// Pair raw BUY/SELL fills into closed positions with computed P&L
	reconcilePositions(userID, conn.ID)

	now := time.Now()
	conn.LastSyncedAt = &now
	conn.TradeCount += imported
	database.DB.Save(&conn)

	// Invalidate analytics cache
	database.DB.Where("user_id = ?", userID).Delete(&models.AnalyticsCache{})

	c.JSON(http.StatusOK, gin.H{"trades_synced": imported, "trades_imported": imported, "synced_at": now})
}

// ── POST /users/me/brokers/sync-all ───────────────────────

func SyncAllBrokers(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var conns []models.BrokerConnection
	database.DB.Where("user_id = ? AND status = 'connected'", userID).Find(&conns)

	results := []gin.H{}
	totalImported := 0
	for _, conn := range conns {
		cfg := getBrokerConfig(conn.BrokerName)
		trades, err := fetchBrokerTrades(conn, cfg, userID)
		if err != nil {
			results = append(results, gin.H{"broker": conn.BrokerName, "synced": false, "error": err.Error()})
			continue
		}

		imported := 0
		for _, trade := range trades {
			var existing models.Trade
			if trade.BrokerTradeID != "" {
				if database.DB.First(&existing, "broker_trade_id = ? AND user_id = ?", trade.BrokerTradeID, userID).Error == nil {
					continue
				}
			}
			if database.DB.Create(&trade).Error == nil {
				imported++
			}
		}

		// Pair raw fills into closed positions with P&L
		reconcilePositions(userID, conn.ID)

		now := time.Now()
		conn.LastSyncedAt = &now
		conn.TradeCount += imported
		database.DB.Save(&conn)
		totalImported += imported
		results = append(results, gin.H{"broker": conn.BrokerName, "synced": true, "imported": imported})
	}

	if totalImported > 0 {
		database.DB.Where("user_id = ?", userID).Delete(&models.AnalyticsCache{})
	}

	c.JSON(http.StatusOK, gin.H{"results": results, "total_imported": totalImported})
}

// ─────────────────────────────────────────────────────────
// BROKER TOKEN EXCHANGE
// ─────────────────────────────────────────────────────────

func exchangeToken(broker string, cfg brokerConfig, code string) (accessToken, refreshToken string, expiresAt *time.Time, err error) {
	switch broker {
	case "zerodha":
		return exchangeZerodha(cfg, code)
	case "upstox":
		return exchangeUpstox(cfg, code)
	case "fyers":
		return exchangeFyers(cfg, code)
	case "dhan":
		return exchangeDhan(cfg, code)
	case "angelone":
		// auth_token from publisher-login is already the final JWT — no exchange needed
		ist, _ := time.LoadLocation("Asia/Kolkata")
		tomorrow := time.Now().In(ist).AddDate(0, 0, 1)
		exp := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 5, 0, 0, 0, ist).UTC()
		return code, "", &exp, nil
	}
	return "", "", nil, fmt.Errorf("unsupported broker: %s", broker)
}

func exchangeZerodha(cfg brokerConfig, requestToken string) (string, string, *time.Time, error) {
	// Checksum: SHA256(api_key + request_token + api_secret)
	checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(cfg.APIKey+requestToken+cfg.APISecret)))

	payload := map[string]string{
		"api_key":       cfg.APIKey,
		"request_token": requestToken,
		"checksum":      checksum,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", cfg.TokenURL, bytes.NewBuffer(body))
	req.Header.Set("X-Kite-Version", "3")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
		Data   struct {
			AccessToken string `json:"access_token"`
			PublicToken string `json:"public_token"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", nil, err
	}
	if result.Status != "success" {
		return "", "", nil, fmt.Errorf("zerodha token exchange failed: %s", result.Message)
	}

	// Zerodha tokens expire at midnight IST
	ist, _ := time.LoadLocation("Asia/Kolkata")
	tomorrow := time.Now().In(ist).AddDate(0, 0, 1)
	midnight := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 0, 0, 0, 0, ist)
	expiresAt := midnight.UTC()

	return result.Data.AccessToken, "", &expiresAt, nil
}

func exchangeUpstox(cfg brokerConfig, code string) (string, string, *time.Time, error) {
	params := url.Values{}
	params.Set("code", code)
	params.Set("client_id", cfg.APIKey)
	params.Set("client_secret", cfg.APISecret)
	params.Set("redirect_uri", cfg.RedirectURI)
	params.Set("grant_type", "authorization_code")

	resp, err := http.PostForm(cfg.TokenURL, params)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		ExpiresIn    int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", "", nil, err
	}
	if result.AccessToken == "" {
		return "", "", nil, fmt.Errorf("upstox: empty access token")
	}
	expiresAt := time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	return result.AccessToken, result.RefreshToken, &expiresAt, nil
}

func exchangeFyers(cfg brokerConfig, code string) (string, string, *time.Time, error) {
	// Fyers v3: appIdHash = SHA256(appID-100 + ":" + secret + ":" + auth_code)
	appID := cfg.APIKey + "-100"
	raw := fmt.Sprintf("%s:%s:%s", appID, cfg.APISecret, code)
	checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(raw)))
	log.Printf("[exchangeFyers] appID=%s secretLen=%d codeLen=%d hashPrefix=%s", appID, len(cfg.APISecret), len(code), checksum[:8])

	payload := map[string]string{
		"grant_type": "authorization_code",
		"appIdHash":  checksum,
		"code":       code,
	}
	body, _ := json.Marshal(payload)
	log.Printf("[exchangeFyers] payload=%s", string(body)[:min(len(string(body)), 120)])

	req, _ := http.NewRequest("POST", cfg.TokenURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	log.Printf("[exchangeFyers] status=%d body=%s", resp.StatusCode, string(respBytes))

	var result struct {
		AccessToken string `json:"access_token"`
		S           string `json:"s"`
		Message     string `json:"message"`
	}
	if err := json.Unmarshal(respBytes, &result); err != nil {
		return "", "", nil, err
	}
	if result.S != "ok" {
		return "", "", nil, fmt.Errorf("fyers token exchange: %s", result.Message)
	}

	expiresAt := time.Now().AddDate(0, 0, 1) // Fyers tokens last 1 day
	return result.AccessToken, "", &expiresAt, nil
}

// ─────────────────────────────────────────────────────────
// ANGELONE — TOTP DIRECT LOGIN
// ─────────────────────────────────────────────────────────

// loginAngelOne calls SmartAPI POST /rest/auth/angelbroking/user/v1/loginByPassword
// and returns jwtToken, feedToken, and expiry (5 AM IST next day per SmartAPI docs).
func loginAngelOne(clientCode, password, totp, apiKey string) (jwtToken, feedToken string, expiresAt *time.Time, err error) {
	payload := map[string]string{
		"clientcode": clientCode,
		"password":   password,
		"totp":       totp,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST",
		"https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
		bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-UserType", "USER")
	req.Header.Set("X-SourceID", "WEB")
	req.Header.Set("X-ClientLocalIP", "127.0.0.1")
	req.Header.Set("X-ClientPublicIP", "127.0.0.1")
	req.Header.Set("X-MACAddress", "00:00:00:00:00:00")
	req.Header.Set("X-PrivateKey", apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", nil, fmt.Errorf("angelone: http error: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    struct {
			JwtToken     string `json:"jwtToken"`
			RefreshToken string `json:"refreshToken"`
			FeedToken    string `json:"feedToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", "", nil, fmt.Errorf("angelone: decode error: %w", err)
	}
	if !result.Status || result.Data.JwtToken == "" {
		return "", "", nil, fmt.Errorf("angelone login failed: %s", result.Message)
	}

	// Tokens expire at 5:00 AM IST the next day
	ist, _ := time.LoadLocation("Asia/Kolkata")
	tomorrow := time.Now().In(ist).AddDate(0, 0, 1)
	exp := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 5, 0, 0, 0, ist).UTC()

	return result.Data.JwtToken, result.Data.FeedToken, &exp, nil
}

// ─────────────────────────────────────────────────────────
// BROKER TRADE FETCHING
// ─────────────────────────────────────────────────────────

func fetchBrokerTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	switch conn.BrokerName {
	case "zerodha":
		return fetchZerodhaTrades(conn, cfg, userID)
	case "upstox":
		return fetchUpstoxTrades(conn, cfg, userID)
	case "fyers":
		return fetchFyersTrades(conn, cfg, userID)
	case "angelone":
		return fetchAngelOneTrades(conn, cfg, userID)
	case "dhan":
		return fetchDhanTrades(conn, cfg, userID)
	}
	return nil, fmt.Errorf("no trade fetcher for broker: %s", conn.BrokerName)
}

// angelOneRow is the common shape returned by both getTradeBook and getOrderBook.
type angelOneRow struct {
	OrderID         string  `json:"orderid"`
	UniqueOrderID   string  `json:"uniqueorderid"`
	TradingSymbol   string  `json:"tradingsymbol"`
	Exchange        string  `json:"exchange"`        // NSE / BSE / NFO / MCX
	ProductType     string  `json:"producttype"`     // INTRADAY / DELIVERY / CARRYFORWARD
	TransactionType string  `json:"transactiontype"` // BUY / SELL
	OrderStatus     string  `json:"orderstatus"`     // complete / cancelled / open …
	Quantity        int     `json:"quantity"`
	FilledShares    string  `json:"filledshares"`    // in order book
	FillQty         int     `json:"fillid"`          // in trade book
	AveragePrice    float64 `json:"averageprice"`
	Price           float64 `json:"price"`
	TradeID         string  `json:"tradeID"`
	UpdateTime      string  `json:"updatetime"` // "02-Jan-2006 15:04:05"
	FillTime        string  `json:"filltime"`   // in trade book
	OptionType      string  `json:"optiontype"` // CE / PE / ""
	StrikePrice     float64 `json:"strikeprice"`
	ExpiryDate      string  `json:"expirydate"` // "25Jan2024"
}

func angelOneHeaders(conn models.BrokerConnection, cfg brokerConfig) map[string]string {
	return map[string]string{
		"Authorization":   "Bearer " + conn.AccessToken,
		"Content-Type":    "application/json",
		"Accept":          "application/json",
		"X-UserType":      "USER",
		"X-SourceID":      "WEB",
		"X-ClientLocalIP": "127.0.0.1",
		"X-ClientPublicIP": "127.0.0.1",
		"X-MACAddress":    "00:00:00:00:00:00",
		"X-PrivateKey":    cfg.APIKey,
	}
}

func angelOneGet(url string, headers map[string]string) ([]angelOneRow, error) {
	req, _ := http.NewRequest("GET", url, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("angelone: token expired (HTTP 401) — please reconnect")
	}

	var result struct {
		Status  bool          `json:"status"`
		Message string        `json:"message"`
		Data    []angelOneRow `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("angelone: decode %s: %w", url, err)
	}
	if !result.Status {
		// AngelOne returns status:false with "No Data" / "No Record" when the
		// account has no trades — treat that as an empty result, not an error.
		msg := strings.ToLower(result.Message)
		if strings.Contains(msg, "no data") || strings.Contains(msg, "no record") ||
			strings.Contains(msg, "no trade") || strings.Contains(msg, "not found") {
			return nil, nil // empty, not an error
		}
		return nil, fmt.Errorf("angelone: API error from %s: %s", url, result.Message)
	}
	return result.Data, nil
}

func angelOneRowToTrade(r angelOneRow, connID uuid.UUID, userID uuid.UUID) models.Trade {
	// Parse timestamp — trade book uses updatetime / filltime, order book uses updatetime
	ts := r.FillTime
	if ts == "" {
		ts = r.UpdateTime
	}
	tradeTime, _ := time.Parse("02-Jan-2006 15:04:05", ts)
	if tradeTime.IsZero() {
		tradeTime = time.Now()
	}

	// Best available quantity: fillid > filledshares > quantity
	qty := r.Quantity
	if r.FillQty > 0 {
		qty = r.FillQty
	} else if fs, err := strconv.Atoi(r.FilledShares); err == nil && fs > 0 {
		qty = fs
	}

	// Use best available price
	price := r.AveragePrice
	if price == 0 {
		price = r.Price
	}

	// Build instrument name
	instrument := r.TradingSymbol
	if r.StrikePrice > 0 && r.OptionType != "" {
		instrument = fmt.Sprintf("%s %s %.0f%s", r.TradingSymbol, r.ExpiryDate, r.StrikePrice, r.OptionType)
	}

	// Pick best dedup key: tradeID > uniqueOrderID > orderID
	tradeID := r.TradeID
	if tradeID == "" {
		tradeID = r.UniqueOrderID
	}
	if tradeID == "" {
		tradeID = r.OrderID
	}

	rawJSON, _ := json.Marshal(r)
	return models.Trade{
		ID:                 uuid.New(),
		UserID:             userID,
		BrokerConnectionID: &connID,
		BrokerTradeID:      tradeID,
		TradeDate:          tradeTime,
		EntryTime:          tradeTime,
		Instrument:         instrument,
		InstrumentType:     classifyAngelOneInstrumentType(r.Exchange, r.OptionType),
		Segment:            classifyAngelOneSegment(r.Exchange, r.ProductType),
		Direction:          r.TransactionType,
		EntryPrice:         price,
		Quantity:           qty,
		Source:             "angelone",
		RawData:            datatypes.JSON(rawJSON),
	}
}

func fetchAngelOneTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	hdrs := angelOneHeaders(conn, cfg)
	connID := conn.ID
	seen := make(map[string]bool)
	var allTrades []models.Trade

	// ── 1. TradeBook — today's executed fills ──────────────
	tradeRows, err := angelOneGet(
		"https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getTradeBook",
		hdrs,
	)
	if err != nil {
		return nil, err // hard fail — if even today's trades can't be fetched, token is bad
	}
	for _, r := range tradeRows {
		t := angelOneRowToTrade(r, connID, userID)
		if !seen[t.BrokerTradeID] {
			seen[t.BrokerTradeID] = true
			allTrades = append(allTrades, t)
		}
	}

	// ── 2. OrderBook — all completed orders (includes historical sessions) ──
	// Filter to status=="complete" (fully filled); these persist across days on SmartAPI.
	orderRows, _ := angelOneGet(
		"https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook",
		hdrs,
	)
	for _, r := range orderRows {
		if !strings.EqualFold(r.OrderStatus, "complete") {
			continue // skip open / cancelled / rejected
		}
		t := angelOneRowToTrade(r, connID, userID)
		if t.BrokerTradeID == "" || seen[t.BrokerTradeID] {
			continue
		}
		seen[t.BrokerTradeID] = true
		allTrades = append(allTrades, t)
	}

	return allTrades, nil
}

func classifyAngelOneSegment(exchange, productType string) string {
	ex := strings.ToUpper(exchange)
	switch ex {
	case "NFO", "BFO":
		return "FNO"
	case "MCX":
		return "COMM"
	case "CDS", "BCD":
		return "CURR"
	}
	if strings.ToUpper(productType) == "INTRADAY" {
		return "EQ_INTRADAY"
	}
	return "EQ"
}

func classifyAngelOneInstrumentType(exchange, optionType string) string {
	ex := strings.ToUpper(exchange)
	if ex == "NFO" || ex == "BFO" {
		switch strings.ToUpper(optionType) {
		case "CE":
			return "CE"
		case "PE":
			return "PE"
		default:
			return "FUT"
		}
	}
	return "EQ"
}

func fetchZerodhaTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	req, _ := http.NewRequest("GET", "https://api.kite.trade/trades", nil)
	req.Header.Set("X-Kite-Version", "3")
	req.Header.Set("Authorization", "token "+cfg.APIKey+":"+conn.AccessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
		Data   []struct {
			TradeID          string  `json:"trade_id"`
			TradingSymbol    string  `json:"tradingsymbol"`
			Exchange         string  `json:"exchange"`
			InstrumentToken  int     `json:"instrument_token"`
			TransactionType  string  `json:"transaction_type"` // BUY/SELL
			Product          string  `json:"product"`          // MIS/NRML/CNC
			AveragePrice     float64 `json:"average_price"`
			Quantity         int     `json:"quantity"`
			FilledQuantity   int     `json:"filled_quantity"`
			OrderTimestamp   string  `json:"order_timestamp"`
		} `json:"data"`
	}

	body, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var trades []models.Trade
	connID := conn.ID
	for _, t := range result.Data {
		tradeTime, _ := time.Parse("2006-01-02 15:04:05", t.OrderTimestamp)
		segment := classifySegment(t.Exchange, t.Product)
		trades = append(trades, models.Trade{
			ID:                 uuid.New(),
			UserID:             userID,
			BrokerConnectionID: &connID,
			BrokerTradeID:      t.TradeID,
			TradeDate:          tradeTime,
			EntryTime:          tradeTime,
			Instrument:         t.TradingSymbol,
			Segment:            segment,
			Direction:          t.TransactionType,
			EntryPrice:         t.AveragePrice,
			Quantity:           t.FilledQuantity,
			Source:             "oauth",
		})
	}
	return trades, nil
}

// ─────────────────────────────────────────────────────────
// FYERS — TODAY'S TRADEBOOK (API returns current session only)
// ─────────────────────────────────────────────────────────

type fyersTradeRow struct {
	ID            string  `json:"id"`
	Symbol        string  `json:"symbol"`        // "NSE:RELIANCE-EQ"
	Exchange      string  `json:"exchange"`       // "NSE", "BSE", "MCX"
	Segment       string  `json:"segment"`        // "E"=equity, "D"=deriv, "C"=curr, "U"=comm
	ProductType   string  `json:"productType"`    // "INTRADAY", "DELIVERY", "MARGIN"
	Side          int     `json:"side"`           // 1=BUY, -1=SELL
	TradedQty     int     `json:"tradedQty"`
	TradePrice    float64 `json:"tradePrice"`
	OrderDateTime string  `json:"orderDateTime"`  // "2024-01-15 09:15:00"
	TradeNumber   string  `json:"tradeNumber"`
	OrderID       string  `json:"orderID"`
}

func fetchFyersTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	// Fyers Authorization header: "appId-100:accessToken"
	appID := cfg.APIKey + "-100"
	req, _ := http.NewRequest("GET", "https://api-t1.fyers.in/api/v3/tradebook", nil)
	req.Header.Set("Authorization", appID+":"+conn.AccessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fyers: http error: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("fyers: token expired (HTTP 401) — please reconnect")
	}

	var result struct {
		S         string          `json:"s"`
		Code      int             `json:"code"`
		Message   string          `json:"message"`
		TradeBook []fyersTradeRow `json:"tradeBook"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("fyers: decode error: %w", err)
	}
	if result.S != "ok" {
		msg := strings.ToLower(result.Message)
		if strings.Contains(msg, "no data") || strings.Contains(msg, "no trade") || len(result.TradeBook) == 0 {
			return nil, nil // empty today — not an error
		}
		return nil, fmt.Errorf("fyers: API error: %s", result.Message)
	}

	connID := conn.ID
	var trades []models.Trade
	for _, t := range result.TradeBook {
		direction := "BUY"
		if t.Side == -1 {
			direction = "SELL"
		}
		tradeTime, _ := time.Parse("2006-01-02 15:04:05", t.OrderDateTime)
		if tradeTime.IsZero() {
			tradeTime = time.Now()
		}
		// Strip exchange prefix: "NSE:RELIANCE-EQ" → "RELIANCE-EQ"
		instrument := t.Symbol
		if idx := strings.Index(t.Symbol, ":"); idx >= 0 {
			instrument = t.Symbol[idx+1:]
		}
		// Dedup key: tradeNumber > id > orderID
		tradeID := t.TradeNumber
		if tradeID == "" {
			tradeID = t.ID
		}
		if tradeID == "" {
			tradeID = t.OrderID
		}

		rawJSON, _ := json.Marshal(t)
		trades = append(trades, models.Trade{
			ID:                 uuid.New(),
			UserID:             userID,
			BrokerConnectionID: &connID,
			BrokerTradeID:      tradeID,
			TradeDate:          tradeTime,
			EntryTime:          tradeTime,
			Instrument:         instrument,
			Segment:            classifyFyersSegment(t.Segment, t.ProductType),
			InstrumentType:     classifyFyersInstrumentType(t.Segment, instrument),
			Direction:          direction,
			EntryPrice:         t.TradePrice,
			Quantity:           t.TradedQty,
			Source:             "fyers",
			RawData:            datatypes.JSON(rawJSON),
		})
	}
	return trades, nil
}

func classifyFyersSegment(segment, productType string) string {
	switch strings.ToUpper(segment) {
	case "D":
		return "FNO"
	case "C":
		return "CURR"
	case "U":
		return "COMM"
	}
	if strings.ToUpper(productType) == "INTRADAY" {
		return "EQ_INTRADAY"
	}
	return "EQ"
}

func classifyFyersInstrumentType(segment, symbol string) string {
	if strings.ToUpper(segment) == "D" {
		upper := strings.ToUpper(symbol)
		if strings.HasSuffix(upper, "CE") {
			return "CE"
		}
		if strings.HasSuffix(upper, "PE") {
			return "PE"
		}
		return "FUT"
	}
	return "EQ"
}

// upstoxHistoricalTrade mirrors the Upstox v2/charges/historical-trades response.
type upstoxHistoricalTrade struct {
	Exchange        string  `json:"exchange"`
	Segment         string  `json:"segment"`          // EQ, FO, COM, CD, MF
	Quantity        int     `json:"quantity"`
	ISIN            string  `json:"isin"`
	TransactionType string  `json:"transaction_type"` // BUY / SELL
	Price           float64 `json:"price"`
	TradeDate       string  `json:"trade_date"` // YYYY-MM-DD
	TradingSymbol   string  `json:"trading_symbol"`
	TradeID         string  `json:"trade_id"`
	OrderRefID      string  `json:"order_ref_id"`
	Brokerage       float64 `json:"brokerage"`
	TaxesCharges    struct {
		STT                        float64 `json:"stt"`
		SebiCharges                float64 `json:"sebi_charges"`
		ExchangeTransactionCharges float64 `json:"exchange_transaction_charges"`
		StampDuty                  float64 `json:"stamp_duty"`
		GST                        float64 `json:"gst"`
		Total                      float64 `json:"total"`
	} `json:"taxes_charges"`
	SegmentInformation struct {
		InstrumentType string  `json:"instrument_type"` // EQ, FUT, CE, PE
		ExpiryDate     string  `json:"expiry_date"`
		StrikePrice    float64 `json:"strike_price"`
		OptionType     string  `json:"option_type"` // CE / PE
	} `json:"segment_information"`
}

func fetchUpstoxTrades(conn models.BrokerConnection, _ brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	// Use the charges/historical-trades endpoint which covers the last 3 financial years.
	// A financial year runs April 1 – March 31. We compute start = April 1 three FYs ago.
	now := time.Now()
	fyStartYear := now.Year() - 3
	if now.Month() < time.April {
		fyStartYear-- // haven't crossed April yet — go one more year back
	}
	startDate := fmt.Sprintf("%d-04-01", fyStartYear)
	endDate := now.Format("2006-01-02")

	connID := conn.ID
	seen := make(map[string]bool)
	var allTrades []models.Trade

	for page := 1; page <= 500; page++ {
		apiURL := fmt.Sprintf(
			"https://api.upstox.com/v2/charges/historical-trades?start_date=%s&end_date=%s&page_number=%d&page_size=5000",
			startDate, endDate, page,
		)
		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			break
		}
		req.Header.Set("Authorization", "Bearer "+conn.AccessToken)
		req.Header.Set("Accept", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			break
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			break
		}

		var result struct {
			Status string `json:"status"`
			Data   struct {
				Trades     []upstoxHistoricalTrade `json:"trades"`
				Pagination struct {
					TotalPages int `json:"total_pages"`
					TotalItems int `json:"total_items"`
				} `json:"pagination"`
			} `json:"data"`
		}
		if err := json.Unmarshal(body, &result); err != nil || result.Status != "success" {
			break
		}
		if len(result.Data.Trades) == 0 {
			break
		}

		for _, t := range result.Data.Trades {
			id := t.TradeID
			if id == "" {
				id = t.OrderRefID
			}
			if seen[id] {
				continue
			}
			seen[id] = true

			tradeDate, _ := time.Parse("2006-01-02", t.TradeDate)
			seg := mapUpstoxSegment(t.Segment, t.Exchange)
			instrType := mapUpstoxInstrumentType(t.SegmentInformation.InstrumentType, t.SegmentInformation.OptionType)
			charges := t.Brokerage + t.TaxesCharges.Total

			allTrades = append(allTrades, models.Trade{
				ID:                 uuid.New(),
				UserID:             userID,
				BrokerConnectionID: &connID,
				BrokerTradeID:      id,
				TradeDate:          tradeDate,
				EntryTime:          tradeDate,
				Instrument:         t.TradingSymbol,
				Segment:            seg,
				InstrumentType:     instrType,
				Direction:          strings.ToUpper(t.TransactionType),
				EntryPrice:         t.Price,
				Quantity:           t.Quantity,
				Charges:            charges,
				Source:             "oauth",
			})
		}

		if page >= result.Data.Pagination.TotalPages {
			break
		}
	}
	return allTrades, nil
}

func mapUpstoxSegment(segment, exchange string) string {
	switch strings.ToUpper(segment) {
	case "FO", "FNO":
		return "FNO"
	case "COM":
		return "COMM"
	case "CD":
		return "CURR"
	}
	ex := strings.ToUpper(exchange)
	if ex == "NFO" || ex == "BFO" {
		return "FNO"
	}
	if ex == "MCX" {
		return "COMM"
	}
	return "EQ"
}

func mapUpstoxInstrumentType(instrType, optionType string) string {
	switch strings.ToUpper(instrType) {
	case "FUT":
		return "FUT"
	case "OPT", "CE", "PE":
		if strings.ToUpper(optionType) == "PE" {
			return "PE"
		}
		return "CE"
	}
	return "EQ"
}

// dhanTrade mirrors the Dhan v2 trade history response fields.
type dhanTrade struct {
	DhanClientID               string  `json:"dhanClientId"`
	OrderID                    string  `json:"orderId"`
	ExchangeOrderID            string  `json:"exchangeOrderId"`
	ExchangeTradeID            string  `json:"exchangeTradeId"`
	TransactionType            string  `json:"transactionType"` // BUY / SELL
	ExchangeSegment            string  `json:"exchangeSegment"` // NSE_EQ, NSE_FNO, BSE_EQ, NSE_CURR, MCX_COMM …
	ProductType                string  `json:"productType"`     // CNC, INTRADAY, MARGIN, MTF, CO, BO
	OrderType                  string  `json:"orderType"`
	TradingSymbol              string  `json:"tradingSymbol"`
	CustomSymbol               string  `json:"customSymbol"`
	SecurityID                 string  `json:"securityId"`
	TradedQuantity             int     `json:"tradedQuantity"`
	TradedPrice                float64 `json:"tradedPrice"`
	ISIN                       string  `json:"isin"`
	Instrument                 string  `json:"instrument"` // EQUITY / DERIVATIVES
	SebiTax                    float64 `json:"sebiTax"`
	STT                        float64 `json:"stt"`
	BrokerageCharges           float64 `json:"brokerageCharges"`
	ServiceTax                 float64 `json:"serviceTax"`
	ExchangeTransactionCharges float64 `json:"exchangeTransactionCharges"`
	StampDuty                  float64 `json:"stampDuty"`
	CreateTime                 string  `json:"createTime"`
	UpdateTime                 string  `json:"updateTime"`
	ExchangeTime               string  `json:"exchangeTime"`
	DrvExpiryDate              string  `json:"drvExpiryDate"`
	DrvOptionType              string  `json:"drvOptionType"` // CALL / PUT
	DrvStrikePrice             float64 `json:"drvStrikePrice"`
}

func fetchDhanTrades(conn models.BrokerConnection, _ brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	// Fetch ALL history in 90-day windows going backward from today.
	// Stop after 2 consecutive empty windows (account start reached) or 120 windows (30 years max).
	// Dhan API max window: 90 days per request.
	connID := conn.ID
	var allTrades []models.Trade
	seen := make(map[string]bool)

	now := time.Now()
	consecutiveEmpty := 0
	for windowIdx := 0; windowIdx < 120 && consecutiveEmpty < 2; windowIdx++ {
		windowEnd := now.AddDate(0, 0, -windowIdx*90)
		windowStart := now.AddDate(0, 0, -(windowIdx+1)*90)
		toDate := windowEnd.Format("2006-01-02")
		fromDate := windowStart.Format("2006-01-02")
		windowHadTrades := false

		for page := 0; page <= 50; page++ { // page 0-based; 50-page safety cap
			apiURL := fmt.Sprintf("https://api.dhan.co/v2/trades/%s/%s/%d", fromDate, toDate, page)

			req, err := http.NewRequest("GET", apiURL, nil)
			if err != nil {
				return nil, fmt.Errorf("dhan: build request: %w", err)
			}
			// Dhan v2 auth: access-token header + client-id (the user's Dhan account ID)
			req.Header.Set("access-token", conn.AccessToken)
			if conn.ExternalUserID != "" {
				req.Header.Set("client-id", conn.ExternalUserID)
			}
			req.Header.Set("Accept", "application/json")
			req.Header.Set("Content-Type", "application/json")

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return nil, fmt.Errorf("dhan: http error: %w", err)
			}
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			if resp.StatusCode == http.StatusUnauthorized {
				return nil, fmt.Errorf("dhan: access token expired or invalid (HTTP 401)")
			}
			if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("dhan: unexpected status %d: %s", resp.StatusCode, string(body))
			}

			// Dhan may return a bare array [] or a wrapped {"data": [...]} object
			var pageTrades []dhanTrade
			if err := json.Unmarshal(body, &pageTrades); err != nil {
				var wrapped struct {
					Data []dhanTrade `json:"data"`
				}
				if err2 := json.Unmarshal(body, &wrapped); err2 != nil {
					// Unrecognised response (e.g. an error string) — stop paging this window
					break
				}
				pageTrades = wrapped.Data
			}
			if len(pageTrades) == 0 {
				break // No more pages for this window
			}
			windowHadTrades = true

			for _, t := range pageTrades {
				// Prefer exchange trade ID for deduplication; fall back to order ID
				brokerTradeID := t.ExchangeTradeID
				if brokerTradeID == "" {
					brokerTradeID = t.OrderID
				}
				// Skip already-seen fills (cross-window deduplication)
				if seen[brokerTradeID] {
					continue
				}
				seen[brokerTradeID] = true

				tradeTime := parseDhanTime(t.CreateTime, t.ExchangeTime)
				segment := classifyDhanSegment(t.ExchangeSegment, t.ProductType)
				instrumentType := dhanInstrumentType(t.ExchangeSegment, t.DrvOptionType)
				instrument := buildDhanInstrumentName(t)

				// Total charges: sum all Dhan-provided tax/fee fields
				charges := t.SebiTax + t.STT + t.BrokerageCharges + t.ServiceTax +
					t.ExchangeTransactionCharges + t.StampDuty

				rawJSON, _ := json.Marshal(t)

				allTrades = append(allTrades, models.Trade{
					ID:                 uuid.New(),
					UserID:             userID,
					BrokerConnectionID: &connID,
					BrokerTradeID:      brokerTradeID,
					TradeDate:          tradeTime,
					EntryTime:          tradeTime,
					Instrument:         instrument,
					InstrumentType:     instrumentType,
					Segment:            segment,
					Direction:          t.TransactionType, // "BUY" or "SELL"
					EntryPrice:         t.TradedPrice,
					Quantity:           t.TradedQuantity,
					Charges:            charges,
					Source:             "dhan_v2",
					RawData:            datatypes.JSON(rawJSON),
				})
			}
		} // end page loop

		if windowHadTrades {
			consecutiveEmpty = 0
		} else {
			consecutiveEmpty++
		}
	} // end window loop

	return allTrades, nil
}

// reconcilePositions pairs raw BUY/SELL fills (stored with PnL=nil after broker sync)
// into closed positions by UPDATING the fills in-place — no deletes, no new records.
// Strategy: the earliest BUY fill per (instrument, date) group becomes the "position" record
// (updated with exit_price, exit_time, pnl, net_pnl). All other fills are marked status="fill"
// so they are excluded from analytics queries.
func reconcilePositions(userID uuid.UUID, connID uuid.UUID) {
	var fills []models.Trade
	database.DB.Where("user_id = ? AND broker_connection_id = ? AND pnl IS NULL AND status != 'fill'", userID, connID).
		Order("trade_date ASC, entry_time ASC").
		Find(&fills)
	if len(fills) == 0 {
		return
	}

	// Group fills by instrument + calendar date
	type groupKey struct{ instrument, date string }
	groups := map[groupKey][]models.Trade{}
	for _, f := range fills {
		k := groupKey{f.Instrument, f.TradeDate.Format("2006-01-02")}
		groups[k] = append(groups[k], f)
	}

	for _, grpFills := range groups {
		var buys, sells []models.Trade
		for _, f := range grpFills {
			if strings.ToUpper(f.Direction) == "BUY" {
				buys = append(buys, f)
			} else {
				sells = append(sells, f)
			}
		}
		if len(buys) == 0 || len(sells) == 0 {
			// Open position — skip, leave unreconciled
			continue
		}

		sort.Slice(buys, func(i, j int) bool { return buys[i].EntryTime.Before(buys[j].EntryTime) })
		sort.Slice(sells, func(i, j int) bool { return sells[i].EntryTime.Before(sells[j].EntryTime) })

		var totalBuyQty, totalSellQty int
		var totalBuyValue, totalSellValue, totalCharges float64
		var exitTime time.Time
		for _, b := range buys {
			totalBuyQty += b.Quantity
			totalBuyValue += float64(b.Quantity) * b.EntryPrice
			totalCharges += b.Charges
		}
		for _, s := range sells {
			totalSellQty += s.Quantity
			totalSellValue += float64(s.Quantity) * s.EntryPrice
			totalCharges += s.Charges
			if s.EntryTime.After(exitTime) {
				exitTime = s.EntryTime
			}
		}

		matchedQty := int(math.Min(float64(totalBuyQty), float64(totalSellQty)))
		if matchedQty == 0 {
			continue
		}

		avgBuy := totalBuyValue / float64(totalBuyQty)
		avgSell := totalSellValue / float64(totalSellQty)
		grossPnL := (avgSell - avgBuy) * float64(matchedQty)
		netPnL := grossPnL - totalCharges

		// UPDATE the first BUY fill in-place to become the position record.
		// This preserves its broker_trade_id so subsequent syncs dedup correctly.
		positionFill := buys[0]
		database.DB.Model(&models.Trade{}).Where("id = ?", positionFill.ID).Updates(map[string]interface{}{
			"exit_price":      avgSell,
			"exit_time":       exitTime,
			"quantity":        matchedQty,
			"pnl":             grossPnL,
			"net_pnl":         netPnL,
			"charges":         totalCharges,
			"status":          "closed",
		})

		// Mark all remaining fills (extra BUYs + all SELLs) as status="fill"
		// so analytics queries exclude them. Their broker_trade_id stays in DB for dedup.
		var fillIDs []uuid.UUID
		for _, b := range buys[1:] {
			fillIDs = append(fillIDs, b.ID)
		}
		for _, s := range sells {
			fillIDs = append(fillIDs, s.ID)
		}
		if len(fillIDs) > 0 {
			database.DB.Model(&models.Trade{}).Where("id IN ?", fillIDs).Update("status", "fill")
		}
	}
}

// parseDhanTime parses Dhan timestamp strings ("2006-01-02 15:04:05").
func parseDhanTime(primary, fallback string) time.Time {
	for _, s := range []string{primary, fallback} {
		if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
			return t
		}
	}
	return time.Now()
}

// buildDhanInstrumentName produces a human-readable symbol.
// For derivatives it appends expiry + strike + option type.
func buildDhanInstrumentName(t dhanTrade) string {
	if t.DrvStrikePrice > 0 && t.DrvOptionType != "" {
		optSuffix := "CE"
		if strings.ToUpper(t.DrvOptionType) == "PUT" {
			optSuffix = "PE"
		}
		expiry := t.DrvExpiryDate
		if len(expiry) == 10 { // YYYY-MM-DD → DDMMMYY
			if parsed, err := time.Parse("2006-01-02", expiry); err == nil {
				expiry = parsed.Format("02Jan06")
			}
		}
		return fmt.Sprintf("%s %s %.0f%s", t.TradingSymbol, expiry, t.DrvStrikePrice, optSuffix)
	}
	return t.TradingSymbol
}

// dhanInstrumentType maps segment + option type to CE / PE / FUT / EQ.
func dhanInstrumentType(segment, drvOptionType string) string {
	seg := strings.ToUpper(segment)
	if seg == "NSE_FNO" || seg == "BSE_FNO" {
		switch strings.ToUpper(drvOptionType) {
		case "CALL":
			return "CE"
		case "PUT":
			return "PE"
		default:
			return "FUT"
		}
	}
	if seg == "MCX_COMM" {
		return "COMM"
	}
	if seg == "NSE_CURR" || seg == "BSE_CURR" {
		return "CURR"
	}
	return "EQ"
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

func classifySegment(exchange, product string) string {
	exchange = strings.ToUpper(exchange)
	product = strings.ToUpper(product)
	if exchange == "NFO" || exchange == "BFO" || strings.Contains(exchange, "FO") {
		return "FNO"
	}
	if product == "MIS" {
		return "EQ_INTRADAY"
	}
	return "EQ"
}

func classifyDhanSegment(exchangeSegment, productType string) string {
	seg := strings.ToUpper(exchangeSegment)
	switch seg {
	case "NSE_FNO", "BSE_FNO":
		return "FNO"
	case "MCX_COMM":
		return "COMM"
	case "NSE_CURR", "BSE_CURR":
		return "CURR"
	case "NSE_EQ", "BSE_EQ":
		if strings.ToUpper(productType) == "INTRADAY" {
			return "EQ_INTRADAY"
		}
		return "EQ"
	}
	return "EQ"
}

func brokerEnvHint(broker string) string {
	switch broker {
	case "upstox":
		return "Upstox OAuth not configured. Set UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET env vars."
	case "fyers":
		return "Fyers OAuth not configured. Set FYERS_APP_ID, FYERS_SECRET_KEY env vars."
	case "zerodha":
		return "Zerodha OAuth not configured. Set ZERODHA_API_KEY, ZERODHA_API_SECRET env vars."
	case "angelone":
		return "AngelOne OAuth not configured. Set ANGELONE_API_KEY env var."
	}
	return broker + " OAuth not configured."
}

func brokerDisplayName(broker string) string {
	switch broker {
	case "zerodha":
		return "Zerodha — Kite"
	case "upstox":
		return "Upstox Pro"
	case "angelone":
		return "AngelOne SmartAPI"
	case "fyers":
		return "Fyers"
	case "dhan":
		return "Dhan HQ"
	}
	return broker + " — connected"
}

