package trades

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tradeiq/gateway/models"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// POST /trades/ingest/csv
func IngestCSV(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "NO_FILE", "message": "CSV file required"})
		return
	}
	f, _ := file.Open()
	defer f.Close()
	reader := csv.NewReader(f)
	records, err := reader.ReadAll()
	if err != nil || len(records) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "INVALID_CSV", "message": "Invalid or empty CSV"})
		return
	}

	headers := make(map[string]int)
	for i, h := range records[0] {
		headers[strings.ToLower(strings.TrimSpace(h))] = i
	}

	brokerDetected := detectBroker(headers)
	accepted, rejected := 0, 0

	for _, row := range records[1:] {
		trade, err := parseRow(row, headers, userID, brokerDetected)
		if err != nil {
			rejected++
			continue
		}
		if err := database.DB.Create(trade).Error; err != nil {
			rejected++
			continue
		}
		accepted++
	}
	c.JSON(http.StatusOK, gin.H{"accepted": accepted, "rejected": rejected, "broker_detected": brokerDetected})
}

func detectBroker(headers map[string]int) string {
	if _, ok := headers["tradingsymbol"]; ok {
		return "zerodha"
	}
	if _, ok := headers["instrument_token"]; ok {
		return "upstox"
	}
	if _, ok := headers["scripname"]; ok {
		return "angelone"
	}
	if _, ok := headers["tradevalue"]; ok {
		return "fyers"
	}
	if _, ok := headers["exchange_segment"]; ok {
		return "dhan"
	}
	return "generic"
}

func parseRow(row []string, headers map[string]int, userID uuid.UUID, broker string) (*models.Trade, error) {
	get := func(key string) string {
		idx, ok := headers[key]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	dateStr := get("date")
	if dateStr == "" {
		dateStr = get("trade_date")
	}
	tradeDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		tradeDate = time.Now()
	}

	instrument := get("instrument")
	if instrument == "" {
		instrument = get("tradingsymbol")
		if instrument == "" {
			instrument = get("scripname")
		}
		if instrument == "" {
			instrument = get("symbol")
		}
	}
	if instrument == "" {
		return nil, err
	}

	pnlStr := get("pnl")
	pnl, _ := strconv.ParseFloat(pnlStr, 64)

	entryPriceStr := get("entry_price")
	if entryPriceStr == "" {
		entryPriceStr = get("average_price")
		if entryPriceStr == "" {
			entryPriceStr = get("tradeprice")
		}
	}
	entryPrice, _ := strconv.ParseFloat(entryPriceStr, 64)

	qtyStr := get("quantity")
	if qtyStr == "" {
		qtyStr = get("traded_quantity")
		if qtyStr == "" {
			qtyStr = get("qty")
		}
	}
	qty, _ := strconv.Atoi(qtyStr)

	return &models.Trade{
		ID:         uuid.New(),
		UserID:     userID,
		TradeDate:  tradeDate,
		EntryTime:  tradeDate,
		Instrument: instrument,
		Segment:    "FNO",
		Direction:  "BUY",
		EntryPrice: entryPrice,
		Quantity:   qty,
		PnL:        &pnl,
		Source:     "csv",
	}, nil
}

// GET /trades
func ListTrades(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit > 200 {
		limit = 200
	}
	offset := (page - 1) * limit

	query := database.DB.Where("user_id = ?", userID)
	if start := c.Query("start_date"); start != "" {
		query = query.Where("trade_date >= ?", start)
	}
	if end := c.Query("end_date"); end != "" {
		query = query.Where("trade_date <= ?", end)
	}
	if seg := c.Query("segment"); seg != "" {
		query = query.Where("segment = ?", seg)
	}

	var total int64
	query.Model(&models.Trade{}).Count(&total)

	var trades []models.Trade
	query.Order("trade_date DESC").Offset(offset).Limit(limit).Find(&trades)

	c.JSON(http.StatusOK, gin.H{"trades": trades, "total": total, "page": page, "limit": limit})
}

// GET /trades/:id
func GetTrade(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	var trade models.Trade
	if err := database.DB.First(&trade, "id = ? AND user_id = ?", c.Param("id"), userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": true, "code": "NOT_FOUND", "message": "Trade not found"})
		return
	}
	c.JSON(http.StatusOK, trade)
}
