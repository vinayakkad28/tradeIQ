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
	// Enforce 10 MB limit
	const maxCSVSize = 10 << 20
	if file.Size > maxCSVSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "code": "FILE_TOO_LARGE", "message": "CSV file must be under 10 MB"})
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
	rejected := 0
	rejectedReasons := []string{}
	var batch []*models.Trade

	for i, row := range records[1:] {
		trade, err := parseRow(row, headers, userID, brokerDetected)
		if err != nil {
			rejected++
			if len(rejectedReasons) < 10 {
				rejectedReasons = append(rejectedReasons, fmt.Sprintf("row %d: %s", i+2, err.Error()))
			}
			continue
		}
		batch = append(batch, trade)
	}

	accepted := 0
	if len(batch) > 0 {
		// Batch insert in chunks of 100
		if err := database.DB.CreateInBatches(batch, 100).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": true, "code": "DB_ERROR", "message": "Failed to save trades: " + err.Error()})
			return
		}
		accepted = len(batch)
	}

	result := gin.H{"accepted": accepted, "rejected": rejected, "broker_detected": brokerDetected}
	if len(rejectedReasons) > 0 {
		result["rejected_reasons"] = rejectedReasons
	}
	c.JSON(http.StatusOK, result)
}

func detectBroker(headers map[string]int) string {
	if _, ok := headers["tradingsymbol"]; ok {
		return "zerodha"
	}
	if _, ok := headers["instrument_token"]; ok {
		return "upstox"
	}
	// AngelOne exports "Scrip Name" (with space) or "ScripName" (no space)
	if _, ok := headers["scripname"]; ok {
		return "angelone"
	}
	if _, ok := headers["scrip name"]; ok {
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
	// AngelOne exports "Trade Date" or "Order Date"; try multiple column names + formats
	dateStr := firstOf(get("date"), get("trade_date"), get("trade date"), get("order date"),
		get("orderdate"), get("tradedate"))
	tradeDate, _ := time.Parse("2006-01-02", dateStr)
	if tradeDate.IsZero() {
		// Try all common Indian broker date formats including AngelOne's "02-Jan-2006"
		for _, layout := range []string{
			"02-Jan-2006", "02-January-2006",
			"02-01-2006", "2-1-2006",
			"01/02/2006", "2/1/2006",
			"02/01/2006", "1/2/2006",
			"02 Jan 2006", "02 January 2006",
			"Jan 02, 2006", "January 02, 2006",
		} {
			if t, e := time.Parse(layout, dateStr); e == nil {
				tradeDate = t
				break
			}
		}
	}

	// ── Instrument ──
	// AngelOne: "Scrip Name" (spaced) or "ScripName" or "Symbol Name"
	instrument := firstOf(get("instrument"), get("tradingsymbol"),
		get("scripname"), get("scrip name"), get("symbol name"), get("symbol"))
	if instrument == "" {
		return nil, fmt.Errorf("no instrument in row")
	}

	// ── Direction ──
	// AngelOne exports "Buy/Sell" column
	dirRaw := firstOf(get("direction"), get("transaction_type"), get("trade_type"),
		get("buy_sell"), get("buy/sell"), get("action"), get("order_type"))
	direction := strings.ToUpper(strings.TrimSpace(dirRaw))
	// Normalise: "B"/"BUY"/"PURCHASE" → "BUY", "S"/"SELL" → "SELL"
	if direction == "B" || strings.HasPrefix(direction, "BUY") || direction == "PURCHASE" {
		direction = "BUY"
	} else if direction == "S" || strings.HasPrefix(direction, "SELL") {
		direction = "SELL"
	}
	if direction != "BUY" && direction != "SELL" {
		return nil, fmt.Errorf("unrecognized direction: %q", dirRaw)
	}

	// ── Segment ──
	// AngelOne exports "Exchange" (NSE/NFO/BSE/MCX) and "Segment" separately
	segment := strings.ToUpper(firstOf(get("segment"), get("exchange_segment")))
	if segment == "" {
		// Map AngelOne exchange codes to our segment names
		exchange := strings.ToUpper(firstOf(get("exchange"), get("exch")))
		switch exchange {
		case "NFO", "BFO":
			segment = "FNO"
		case "MCX":
			segment = "COMM"
		case "CDS", "BCD":
			segment = "CURR"
		case "NSE", "BSE":
			segment = "" // fall through to instrument-based detection
		}
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
	// AngelOne: "Trade Price" / "Traded Price" / "Net Rate"
	entryPrice, _ := strconv.ParseFloat(strings.ReplaceAll(
		firstOf(get("entry_price"), get("average_price"), get("tradeprice"),
			get("trade price"), get("traded price"), get("net rate"),
			get("buy_price"), get("price"), get("order price")), ",", ""), 64)
	exitPrice, _ := strconv.ParseFloat(strings.ReplaceAll(
		firstOf(get("exit_price"), get("sell_price"), get("exit_avg_price")), ",", ""), 64)

	// ── Quantity ──
	// AngelOne: "Quantity" or "Traded Qty"
	qty, _ := strconv.Atoi(strings.ReplaceAll(
		firstOf(get("quantity"), get("traded_quantity"), get("traded qty"),
			get("qty"), get("filled_quantity")), ",", ""))
	if qty == 0 {
		qty = 1
	}

	// ── P&L ──
	// AngelOne: "Net Amount" = turnover (not P&L), so only use named P&L columns
	pnlStr := strings.ReplaceAll(
		firstOf(get("pnl"), get("profit_loss"), get("realized_pnl"), get("net_pnl")), ",", "")
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
	// AngelOne exports "Brokerage" column
	charges, _ := strconv.ParseFloat(strings.ReplaceAll(
		firstOf(get("charges"), get("brokerage"), get("total_charges"), get("total charges")), ",", ""), 64)

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
