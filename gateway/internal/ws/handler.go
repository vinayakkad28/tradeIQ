package ws

import (
	"net/http"

	"tradeiq/gateway/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins in dev; restrict in production via CORS
		return true
	},
}

// GET /ws/live — authenticated WebSocket endpoint
func HandleLive(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "WebSocket upgrade failed"})
		return
	}

	client := GlobalHub.Register(userID, conn)

	// Send welcome message
	user := c.MustGet("user").(models.User)
	GlobalHub.Broadcast(userID, "connected", gin.H{
		"user_id": userID,
		"plan":    user.Plan,
		"message": "TradeIQ live feed connected",
	})

	go client.WritePump()
	client.ReadPump(GlobalHub) // blocks until disconnected
}
