package brokers

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
			ID:         uuid.New(),
			UserID:     userID,
			BrokerName: "dhan",
			State:      consentAppID,
			ExpiresAt:  time.Now().Add(10 * time.Minute),
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
			"message":    fmt.Sprintf("%s OAuth not yet configured. Set %s_API_KEY env var.", req.BrokerName, strings.ToUpper(req.BrokerName)),
			"configured": false,
		})
		return
	}

	// Generate CSRF state token
	state := uuid.New().String()

	// Store state in DB (expires in 10 min)
	database.DB.Where("user_id = ? AND broker_name = ?", userID, req.BrokerName).Delete(&models.BrokerOAuthState{})
	database.DB.Create(&models.BrokerOAuthState{
		ID:         uuid.New(),
		UserID:     userID,
		BrokerName: req.BrokerName,
		State:      state,
		ExpiresAt:  time.Now().Add(10 * time.Minute),
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
	return result.AccessToken, "", &expiry, nil
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

func OAuthCallback(c *gin.Context) {
	frontendBase := os.Getenv("FRONTEND_URL")
	if frontendBase == "" {
		frontendBase = "http://localhost:3000"
	}

	// ── Dhan: returns ?tokenId= instead of standard ?code=&state= ──
	// Dhan's configured redirect URL receives only tokenId — no state is echoed back.
	// We look up the most recently created active Dhan state to reconnect it to the user.
	tokenID := c.Query("tokenId")
	if tokenID != "" {
		var dhanState models.BrokerOAuthState
		if err := database.DB.Where("broker_name = ? AND expires_at > ?", "dhan", time.Now()).
			Order("created_at DESC").First(&dhanState).Error; err != nil {
			c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=dhan_state_not_found")
			return
		}
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
			c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=angelone_state_not_found")
			return
		}
		// Pass auth_token as "code" and feedToken as "refresh_token" so BrokerCallback can store both
		redirectURL := fmt.Sprintf("%s/dashboard/brokers?code=%s&state=%s&broker=angelone&feed_token=%s",
			frontendBase, url.QueryEscape(authToken), url.QueryEscape(angelState.State), url.QueryEscape(feedToken))
		c.Redirect(http.StatusFound, redirectURL)
		return
	}

	// ── Standard OAuth (Zerodha, Upstox, Fyers …) ──
	code := c.Query("code")
	state := c.Query("state")
	broker := c.Query("broker")

	if code == "" || state == "" {
		c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=oauth_failed")
		return
	}

	// Look up state to find the broker
	var oauthState models.BrokerOAuthState
	if err := database.DB.First(&oauthState, "state = ? AND expires_at > ?", state, time.Now()).Error; err != nil {
		c.Redirect(http.StatusFound, frontendBase+"/dashboard/brokers?error=invalid_state")
		return
	}

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
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}

	// Validate state
	var oauthState models.BrokerOAuthState
	if err := database.DB.First(&oauthState, "state = ? AND user_id = ? AND expires_at > ?", req.State, userID, time.Now()).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "INVALID_STATE", "message": "OAuth state expired or invalid"})
		return
	}
	// Clean up state
	database.DB.Delete(&oauthState)

	cfg := getBrokerConfig(req.BrokerName)

	// Exchange code for access token
	accessToken, refreshToken, expiresAt, err := exchangeToken(req.BrokerName, cfg, req.Code)
	if err != nil {
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
	conn.RefreshToken = refreshToken
	conn.TokenExpiresAt = expiresAt
	conn.Status = "connected"
	conn.ConnectedAt = now
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
		// Fall back to mock on API error (dev mode when no real keys)
		trades = generateMockTrades(conn, userID)
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
	// Fyers: appID-100:SHA256(appID + ":" + secret + ":" + code)
	appID := cfg.APIKey + "-100"
	raw := fmt.Sprintf("%s:%s:%s", cfg.APIKey, cfg.APISecret, code)
	checksum := fmt.Sprintf("%x", sha256.Sum256([]byte(raw)))

	payload := map[string]string{
		"grant_type":  "authorization_code",
		"appIdHash":   checksum,
		"code":        code,
		"client_id":   appID,
		"secret_key":  cfg.APISecret,
		"redirect_uri": cfg.RedirectURI,
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", cfg.TokenURL, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		S           string `json:"s"`
		Message     string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
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
	case "angelone":
		return fetchAngelOneTrades(conn, cfg, userID)
	case "dhan":
		return fetchDhanTrades(conn, cfg, userID)
	}
	return nil, fmt.Errorf("no trade fetcher for broker: %s", conn.BrokerName)
}

func fetchAngelOneTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	req, _ := http.NewRequest("GET",
		"https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getTradeBook",
		nil)
	req.Header.Set("Authorization", "Bearer "+conn.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-UserType", "USER")
	req.Header.Set("X-SourceID", "WEB")
	req.Header.Set("X-ClientLocalIP", "127.0.0.1")
	req.Header.Set("X-ClientPublicIP", "127.0.0.1")
	req.Header.Set("X-MACAddress", "00:00:00:00:00:00")
	req.Header.Set("X-PrivateKey", cfg.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("angelone: http error: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("angelone: token expired (HTTP 401) — please reconnect")
	}

	var result struct {
		Status  bool   `json:"status"`
		Message string `json:"message"`
		Data    []struct {
			OrderID          string  `json:"orderid"`
			UniqueOrderID    string  `json:"uniqueorderid"`
			TradingSymbol    string  `json:"tradingsymbol"`
			SymbolToken      string  `json:"symboltoken"`
			Exchange         string  `json:"exchange"`       // NSE / BSE / NFO / MCX
			ProductType      string  `json:"producttype"`    // INTRADAY / DELIVERY / CARRYFORWARD / MARGIN
			TransactionType  string  `json:"transactiontype"` // BUY / SELL
			Quantity         int     `json:"quantity"`
			FillQty          int     `json:"fillid"`
			Price            float64 `json:"price"`
			AveragePrice     float64 `json:"averageprice"`
			TradeID          string  `json:"tradeID"`
			OrderTimestamp   string  `json:"updatetime"` // "02-Jan-2006 15:04:05"
			OptionType       string  `json:"optiontype"` // CE / PE / ""
			StrikePrice      float64 `json:"strikeprice"`
			ExpiryDate       string  `json:"expirydate"` // "25Jan2024"
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("angelone: decode error: %w", err)
	}
	if !result.Status {
		return nil, fmt.Errorf("angelone: API error: %s", result.Message)
	}

	connID := conn.ID
	trades := make([]models.Trade, 0, len(result.Data))
	for _, t := range result.Data {
		tradeTime, _ := time.Parse("02-Jan-2006 15:04:05", t.OrderTimestamp)
		if tradeTime.IsZero() {
			tradeTime = time.Now()
		}

		segment := classifyAngelOneSegment(t.Exchange, t.ProductType)
		instrumentType := classifyAngelOneInstrumentType(t.Exchange, t.OptionType)

		instrument := t.TradingSymbol
		if t.StrikePrice > 0 && t.OptionType != "" {
			instrument = fmt.Sprintf("%s %s %.0f%s", t.TradingSymbol, t.ExpiryDate, t.StrikePrice, t.OptionType)
		}

		qty := t.Quantity
		if t.FillQty > 0 {
			qty = t.FillQty
		}

		tradeID := t.TradeID
		if tradeID == "" {
			tradeID = t.UniqueOrderID
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
			InstrumentType:     instrumentType,
			Segment:            segment,
			Direction:          t.TransactionType,
			EntryPrice:         t.AveragePrice,
			Quantity:           qty,
			Source:             "angelone",
			RawData:            datatypes.JSON(rawJSON),
		})
	}
	return trades, nil
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

func fetchUpstoxTrades(conn models.BrokerConnection, cfg brokerConfig, userID uuid.UUID) ([]models.Trade, error) {
	today := time.Now().Format("2006-01-02")
	apiURL := fmt.Sprintf("https://api.upstox.com/v2/order/trades/get-trades-for-day?date=%s", today)

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Authorization", "Bearer "+conn.AccessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
		Data   []struct {
			OrderID         string  `json:"order_id"`
			TradingSymbol   string  `json:"trading_symbol"`
			Exchange        string  `json:"exchange"`
			TransactionType string  `json:"transaction_type"`
			Quantity        int     `json:"quantity"`
			AveragePrice    float64 `json:"average_price"`
			OrderTimestamp  string  `json:"order_timestamp"`
			Product         string  `json:"product"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
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
			BrokerTradeID:      t.OrderID,
			TradeDate:          tradeTime,
			EntryTime:          tradeTime,
			Instrument:         t.TradingSymbol,
			Segment:            segment,
			Direction:          t.TransactionType,
			EntryPrice:         t.AveragePrice,
			Quantity:           t.Quantity,
			Source:             "oauth",
		})
	}
	return trades, nil
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
	// Fetch last 90 days. Dhan returns data oldest-first per page.
	toDate := time.Now().Format("2006-01-02")
	fromDate := time.Now().AddDate(0, 0, -90).Format("2006-01-02")

	connID := conn.ID
	var allTrades []models.Trade

	for page := 0; page <= 50; page++ { // page 0-based; 50-page safety cap
		apiURL := fmt.Sprintf("https://api.dhan.co/v2/trades/%s/%s/%d", fromDate, toDate, page)

		req, err := http.NewRequest("GET", apiURL, nil)
		if err != nil {
			return nil, fmt.Errorf("dhan: build request: %w", err)
		}
		// Dhan v2 auth: access-token header (JWT embeds client-id — no separate client-id header)
		req.Header.Set("access-token", conn.AccessToken)
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

		var page_trades []dhanTrade
		if err := json.Unmarshal(body, &page_trades); err != nil {
			return nil, fmt.Errorf("dhan: decode response: %w", err)
		}
		if len(page_trades) == 0 {
			break // No more pages
		}

		for _, t := range page_trades {
			tradeTime := parseDhanTime(t.CreateTime, t.ExchangeTime)
			segment := classifyDhanSegment(t.ExchangeSegment, t.ProductType)
			instrumentType := dhanInstrumentType(t.ExchangeSegment, t.DrvOptionType)
			instrument := buildDhanInstrumentName(t)

			// Total charges: sum all Dhan-provided tax/fee fields
			charges := t.SebiTax + t.STT + t.BrokerageCharges + t.ServiceTax +
				t.ExchangeTransactionCharges + t.StampDuty

			// Prefer exchange trade ID for deduplication; fall back to order ID
			brokerTradeID := t.ExchangeTradeID
			if brokerTradeID == "" {
				brokerTradeID = t.OrderID
			}

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
	}

	return allTrades, nil
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

func generateMockTrades(conn models.BrokerConnection, userID uuid.UUID) []models.Trade {
	now := time.Now()
	var trades []models.Trade
	connID := conn.ID
	symbols := []string{"NIFTY25000CE", "BANKNIFTY54000PE", "RELIANCE", "INFY", "HDFCBANK"}
	for i := 0; i < 5; i++ {
		pnl := float64((i%3-1) * 500)
		trades = append(trades, models.Trade{
			ID:                 uuid.New(),
			UserID:             userID,
			BrokerConnectionID: &connID,
			BrokerTradeID:      fmt.Sprintf("MOCK-%s-%d", conn.BrokerName, now.UnixNano()+int64(i)),
			TradeDate:          now.AddDate(0, 0, -i),
			EntryTime:          now.AddDate(0, 0, -i),
			Instrument:         symbols[i%len(symbols)],
			Segment:            "FNO",
			Direction:          "BUY",
			EntryPrice:         150,
			Quantity:           50,
			PnL:                &pnl,
			Source:             "oauth",
		})
	}
	return trades
}
