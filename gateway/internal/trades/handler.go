package trades

import (
	"encoding/csv"
	"fmt"
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

	// ── Date ──
	dateStr := get("date")
	if dateStr == "" {
		dateStr = get("trade_date")
	}
	tradeDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		for _, layout := range []string{"02-01-2006", "01/02/2006", "2/1/2006"} {
			if t, e := time.Parse(layout, dateStr); e == nil {
				tradeDate = t
				break
			}
		}
	}

	// ── Instrument ──
	instrument := get("instrument")
	if instrument == "" {
		instrument = get("tradingsymbol")
	}
	if instrument == "" {
		instrument = get("scripname")
	}
	if instrument == "" {
		instrument = get("symbol")
	}
	if instrument == "" {
		return nil, fmt.Errorf("no instrument in row")
	}

	// ── Direction ──
	direction := strings.ToUpper(get("direction"))
	if direction == "" {
		direction = strings.ToUpper(get("transaction_type"))
	}
	if direction == "" {
		direction = strings.ToUpper(get("trade_type"))
	}
	if direction == "" {
		direction = strings.ToUpper(get("buy_sell"))
	}
	if direction != "BUY" && direction != "SELL" {
		direction = "BUY" // fallback
	}

	// ── Segment ──
	segment := strings.ToUpper(get("segment"))
	if segment == "" {
		segment = strings.ToUpper(get("exchange_segment"))
	}
	if segment == "" {
		// Infer from instrument name: if it contains CE/PE/FUT it's FNO
		upper := strings.ToUpper(instrument)
		if strings.HasSuffix(upper, "CE") || strings.HasSuffix(upper, "PE") ||
			strings.Contains(upper, "FUT") || strings.Contains(upper, "FUTURES") {
			segment = "FNO"
		} else if strings.ToUpper(get("product")) == "MIS" || strings.ToUpper(get("product_type")) == "INTRADAY" {
			segment = "EQ_INTRADAY"
		} else {
			segment = "EQ"
		}
	}

	// ── Prices ──
	entryPrice, _ := strconv.ParseFloat(firstOf(get("entry_price"), get("average_price"), get("tradeprice"), get("buy_price"), get("price")), 64)
	exitPrice, _ := strconv.ParseFloat(firstOf(get("exit_price"), get("sell_price"), get("exit_avg_price")), 64)

	// ── Quantity ──
	qty, _ := strconv.Atoi(firstOf(get("quantity"), get("traded_quantity"), get("qty"), get("filled_quantity")))
	if qty == 0 {
		qty = 1
	}

	// ── P&L ──
	pnlStr := firstOf(get("pnl"), get("profit_loss"), get("realized_pnl"), get("net_pnl"))
	pnl, _ := strconv.ParseFloat(pnlStr, 64)

	// Compute P&L from entry/exit if not provided but both prices exist
	if pnl == 0 && entryPrice > 0 && exitPrice > 0 {
		if direction == "BUY" {
			pnl = (exitPrice - entryPrice) * float64(qty)
		} else {
			pnl = (entryPrice - exitPrice) * float64(qty)
		}
	}

	// ── Charges ──
	charges, _ := strconv.ParseFloat(firstOf(get("charges"), get("brokerage"), get("total_charges")), 64)

	// ── Holding time ──
	holdingMins := 0
	if hm := get("holding_minutes"); hm != "" {
		holdingMins, _ = strconv.Atoi(hm)
	}

	// ── Optional behavioural fields ──
	followedPlan := strings.ToLower(get("followed_plan")) == "true" || get("followed_plan") == "1"
	slMoved := strings.ToLower(get("stop_loss_moved")) == "true" || get("stop_loss_moved") == "1"
	reentry := strings.ToLower(get("re_entry_after_loss")) == "true" || get("re_entry_after_loss") == "1"
	emotion := get("emotion")
	setupRating := get("setup_rating")

	// Status — if exit_price set, trade is closed
	status := "closed"
	if exitPrice == 0 && pnl == 0 {
		status = "open"
	}

	var exitPricePtr *float64
	if exitPrice != 0 {
		exitPricePtr = &exitPrice
	}
	var holdingMinsPtr *int
	if holdingMins != 0 {
		holdingMinsPtr = &holdingMins
	}

	t := &models.Trade{
		ID:               uuid.New(),
		UserID:           userID,
		TradeDate:        tradeDate,
		EntryTime:        tradeDate,
		Instrument:       instrument,
		Segment:          segment,
		Direction:        direction,
		EntryPrice:       entryPrice,
		ExitPrice:        exitPricePtr,
		Quantity:         qty,
		PnL:              &pnl,
		Charges:          charges,
		HoldingMinutes:   holdingMinsPtr,
		Status:           status,
		FollowedPlan:     &followedPlan,
		StopLossMoved:    slMoved,
		ReEntryAfterLoss: reentry,
		Emotion:          emotion,
		SetupRating:      setupRating,
		Source:           "csv",
	}

	// InstrumentType: EQ/INTRADAY segments are always EQ stocks
	if segment == "EQ" || segment == "EQ_INTRADAY" || segment == "COMM" || segment == "CURR" {
		t.InstrumentType = "EQ"
	} else {
		// FNO: infer CE/PE/FUT from instrument name suffix
		upper := strings.ToUpper(instrument)
		// Option instruments end with a strike+CE/PE pattern like "NIFTY25DEC24000CE"
		// Use word-boundary check: suffix must be 2-chars and preceded by a digit
		if len(upper) > 2 {
			tail2 := upper[len(upper)-2:]
			prevChar := upper[len(upper)-3]
			if tail2 == "CE" && prevChar >= '0' && prevChar <= '9' {
				t.InstrumentType = "CE"
			} else if tail2 == "PE" && prevChar >= '0' && prevChar <= '9' {
				t.InstrumentType = "PE"
			} else if strings.Contains(upper, "FUT") {
				t.InstrumentType = "FUT"
			} else {
				t.InstrumentType = "EQ"
			}
		} else {
			t.InstrumentType = "EQ"
		}
	}

	return t, nil
}

// firstOf returns the first non-empty string from the provided list.
func firstOf(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// GET /trades
func ListTrades(c *gin.Context) {
	userID := c.MustGet("user_id").(uuid.UUID)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit > 1000 {
		limit = 1000
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
