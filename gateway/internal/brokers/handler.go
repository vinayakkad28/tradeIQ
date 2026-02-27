package brokers

import (
	"net/http"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var supportedBrokers = []gin.H{
	{"id": "zerodha", "name": "Zerodha", "description": "Kite API — OAuth 2.0"},
	{"id": "upstox", "name": "Upstox", "description": "Upstox Pro API v2"},
	{"id": "angelone", "name": "AngelOne", "description": "SmartAPI REST"},
	{"id": "fyers", "name": "Fyers", "description": "Fyers API v3"},
	{"id": "dhan", "name": "Dhan", "description": "Dhan HQ Trading API"},
}

// GET /users/me/brokers
func ListBrokers(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var connections []models.BrokerConnection
	database.DB.Where("user_id = ?", userID).Find(&connections)
	c.JSON(http.StatusOK, gin.H{"connections": connections, "supported_brokers": supportedBrokers})
}

// POST /users/me/brokers/connect
func ConnectBroker(c *gin.Context) {
	var req struct {
		BrokerName string `json:"broker_name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	// In production: generate OAuth URL and state, store in Redis
	oauthURL := "https://" + req.BrokerName + ".example.com/oauth?client_id=DEMO&redirect_uri=http://localhost:8080/callback"
	c.JSON(http.StatusOK, gin.H{"oauth_url": oauthURL, "state": uuid.New().String()})
}

// POST /users/me/brokers/callback
func BrokerCallback(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var req struct {
		BrokerName string `json:"broker_name" binding:"required"`
		Code       string `json:"code" binding:"required"`
		State      string `json:"state" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "VALIDATION_ERROR", "message": err.Error()})
		return
	}
	conn := models.BrokerConnection{
		ID:          uuid.New(),
		UserID:      userID,
		BrokerName:  req.BrokerName,
		DisplayName: req.BrokerName + " — connected",
		Status:      "connected",
		ConnectedAt: time.Now(),
	}
	database.DB.Create(&conn)
	c.JSON(http.StatusCreated, gin.H{"connection": conn})
}

// DELETE /users/me/brokers/:id
func DisconnectBroker(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	database.DB.Delete(&models.BrokerConnection{}, "id = ? AND user_id = ?", c.Param("id"), userID)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// POST /users/me/brokers/:id/sync
func SyncBroker(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var conn models.BrokerConnection
	if err := database.DB.First(&conn, "id = ? AND user_id = ?", c.Param("id"), userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": true, "code": "NOT_FOUND", "message": "Connection not found"})
		return
	}
	now := time.Now()
	// Mock sync: generate 5 trades
	for i := 0; i < 5; i++ {
		pnl := float64((i%3-1) * 500)
		connID := conn.ID
		database.DB.Create(&models.Trade{
			ID:                 uuid.New(),
			UserID:             userID,
			BrokerConnectionID: &connID,
			TradeDate:          now.AddDate(0, 0, -i),
			EntryTime:          now.AddDate(0, 0, -i),
			Instrument:         "NIFTY25000CE",
			Segment:            "FNO",
			Direction:          "BUY",
			EntryPrice:         150,
			Quantity:           50,
			PnL:                &pnl,
			Source:             "oauth",
		})
	}
	conn.LastSyncedAt = &now
	conn.TradeCount += 5
	database.DB.Save(&conn)
	c.JSON(http.StatusOK, gin.H{"trades_imported": 5, "synced_at": now})
}

// POST /users/me/brokers/sync-all
func SyncAllBrokers(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var conns []models.BrokerConnection
	database.DB.Where("user_id = ? AND status = 'connected'", userID).Find(&conns)
	results := []gin.H{}
	for _, conn := range conns {
		results = append(results, gin.H{"broker": conn.BrokerName, "synced": true})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}
