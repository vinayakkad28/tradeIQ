package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// Hub manages all active WebSocket connections
type Hub struct {
	mu      sync.RWMutex
	clients map[uuid.UUID][]*Client
}

var GlobalHub = &Hub{
	clients: make(map[uuid.UUID][]*Client),
}

type Client struct {
	UserID uuid.UUID
	conn   *websocket.Conn
	send   chan []byte
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
	At      time.Time   `json:"at"`
}

func (h *Hub) Register(userID uuid.UUID, conn *websocket.Conn) *Client {
	c := &Client{
		UserID: userID,
		conn:   conn,
		send:   make(chan []byte, 64),
	}
	h.mu.Lock()
	h.clients[userID] = append(h.clients[userID], c)
	h.mu.Unlock()
	return c
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.clients[c.UserID]
	for i, cl := range clients {
		if cl == c {
			h.clients[c.UserID] = append(clients[:i], clients[i+1:]...)
			close(c.send)
			break
		}
	}
}

// Broadcast sends a message to all connections for a specific user
func (h *Hub) Broadcast(userID uuid.UUID, msgType string, payload interface{}) {
	msg := Message{Type: msgType, Payload: payload, At: time.Now()}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	clients := h.clients[userID]
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- data:
		default:
			// Buffer full, drop
		}
	}
}

// BroadcastAll sends to all connected users (for market data events)
func (h *Hub) BroadcastAll(msgType string, payload interface{}) {
	msg := Message{Type: msgType, Payload: payload, At: time.Now()}
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, clients := range h.clients {
		for _, c := range clients {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

// WritePump pumps messages from the hub to the WebSocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ReadPump reads from WebSocket (handles client commands / pong)
func (c *Client) ReadPump(hub *Hub) {
	defer func() {
		hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WS error for user %s: %v", c.UserID, err)
			}
			break
		}

		// Handle client commands
		var cmd map[string]string
		if err := json.Unmarshal(msg, &cmd); err == nil {
			switch cmd["action"] {
			case "ping":
				data, _ := json.Marshal(Message{Type: "pong", At: time.Now()})
				select {
				case c.send <- data:
				default:
				}
			}
		}
	}
}
