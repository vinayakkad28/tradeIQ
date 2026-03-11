package market

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"tradeiq/gateway/models"
	appcrypto "tradeiq/gateway/pkg/crypto"
	"tradeiq/gateway/pkg/database"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	}
	return 0
}

const nseBase = "https://www.nseindia.com"

// NSE requires a session cookie. We maintain one globally and refresh if needed.
var (
	nseSessionMu      sync.Mutex
	nseSessionCookies []*http.Cookie
	nseSessionExpiry  time.Time
)

func refreshNSESession() []*http.Cookie {
	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", nseBase, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Connection", "keep-alive")
	req.Header.Set("Upgrade-Insecure-Requests", "1")

	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	io.ReadAll(resp.Body) // drain body
	return resp.Cookies()
}

func getNSESession() []*http.Cookie {
	nseSessionMu.Lock()
	defer nseSessionMu.Unlock()
	if time.Now().Before(nseSessionExpiry) {
		return nseSessionCookies
	}
	nseSessionCookies = refreshNSESession()
	nseSessionExpiry = time.Now().Add(5 * time.Minute)
	return nseSessionCookies
}

func forceRefreshNSESession() []*http.Cookie {
	nseSessionMu.Lock()
	defer nseSessionMu.Unlock()
	nseSessionCookies = refreshNSESession()
	nseSessionExpiry = time.Now().Add(5 * time.Minute)
	return nseSessionCookies
}

func nseGet(path string) ([]byte, error) {
	return nseGetWithCookies(path, getNSESession())
}

func nseGetWithCookies(path string, cookies []*http.Cookie) ([]byte, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", nseBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.nseindia.com/")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	for _, c := range cookies {
		req.AddCookie(c)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		// Session expired — force refresh and retry once
		newCookies := forceRefreshNSESession()
		time.Sleep(500 * time.Millisecond)
		return nseGetWithCookies(path, newCookies)
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("NSE returned %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ── GET /api/v1/market/indices ────────────────────────────

func GetIndices(c *gin.Context) {
	data, err := nseGet("/api/allIndices")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"data": fallbackIndices(), "source": "fallback", "timestamp": time.Now()})
		return
	}

	var raw struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusOK, gin.H{"data": fallbackIndices(), "source": "fallback", "timestamp": time.Now()})
		return
	}

	major := map[string]bool{
		"NIFTY 50": true, "NIFTY BANK": true, "NIFTY MIDCAP 100": true,
		"INDIA VIX": true, "NIFTY IT": true, "NIFTY FIN SERVICE": true,
		"NIFTY NEXT 50": true, "NIFTY AUTO": true, "NIFTY PHARMA": true,
	}
	var filtered []map[string]interface{}
	for _, idx := range raw.Data {
		if name, ok := idx["index"].(string); ok && major[name] {
			filtered = append(filtered, idx)
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": filtered, "source": "nse", "timestamp": time.Now()})
}

// dhanScripMap maps symbol name → Dhan UnderlyingScrip ID and segment
var dhanScripMap = map[string]struct {
	Scrip int
	Seg   string
}{
	"NIFTY":      {13, "IDX_I"},
	"BANKNIFTY":  {25, "IDX_I"},
	"FINNIFTY":   {27, "IDX_I"},
	"MIDCPNIFTY": {442, "IDX_I"},
	"SENSEX":     {51, "IDX_I"},
}

func dhanPost(token string, path string, body interface{}) ([]byte, error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", "https://api.dhan.co/v2"+path, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("access-token", token)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("dhan %s returned %d: %s", path, resp.StatusCode, string(b))
	}
	return io.ReadAll(resp.Body)
}

// getUserDhanToken returns the access token for the user's connected Dhan account, or "".
func getUserDhanToken(userID uuid.UUID) string {
	var conn models.BrokerConnection
	if err := database.DB.Where("user_id = ? AND broker_name = ? AND status = ?", userID, "dhan", "connected").
		First(&conn).Error; err != nil {
		return ""
	}
	if conn.TokenExpiresAt != nil && conn.TokenExpiresAt.Before(time.Now()) {
		return ""
	}
	decrypted, _ := appcrypto.Decrypt(conn.AccessToken)
	return decrypted
}

// ── GET /api/v1/market/option-chain?symbol=NIFTY ─────────
// Requires auth. Uses user's Dhan connection for live option chain data.

func GetOptionChain(c *gin.Context) {
	symbol := strings.ToUpper(c.DefaultQuery("symbol", "NIFTY"))
	expiry := c.Query("expiry")
	userID := c.MustGet("user_id").(uuid.UUID)

	scrip, ok := dhanScripMap[symbol]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "message": "Unsupported symbol: " + symbol})
		return
	}

	dhanToken := getUserDhanToken(userID)
	if dhanToken == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":   true,
			"message": "No Dhan account connected. Connect your Dhan broker to access live option chain.",
			"code":    "NO_DHAN_CONNECTION",
		})
		return
	}

	// 1. Fetch expiry list
	expiryBody := map[string]interface{}{
		"UnderlyingScrip": scrip.Scrip,
		"UnderlyingSeg":   scrip.Seg,
	}
	expiryRaw, err := dhanPost(dhanToken, "/optionchain/expirylist", expiryBody)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": true, "message": "Dhan expiry list error: " + err.Error()})
		return
	}
	var expiryResp struct {
		Data   []string `json:"data"`
		Status string   `json:"status"`
	}
	if err := json.Unmarshal(expiryRaw, &expiryResp); err != nil || expiryResp.Status != "success" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "message": "Dhan expiry parse error"})
		return
	}
	expiryDates := expiryResp.Data

	// Use requested expiry or first available
	useExpiry := expiry
	if useExpiry == "" && len(expiryDates) > 0 {
		useExpiry = expiryDates[0]
	}

	// 2. Fetch option chain
	chainBody := map[string]interface{}{
		"UnderlyingScrip": scrip.Scrip,
		"UnderlyingSeg":   scrip.Seg,
		"Expiry":          useExpiry,
	}
	chainRaw, err := dhanPost(dhanToken, "/optionchain", chainBody)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": true, "message": "Dhan option chain error: " + err.Error()})
		return
	}

	// Dhan response: { data: { last_price, oc: { "25650.000000": { ce: {...}, pe: {...} } } }, status }
	var chainResp struct {
		Status string `json:"status"`
		Data   struct {
			LastPrice float64 `json:"last_price"`
			OC        map[string]struct {
				CE *struct {
					LastPrice         float64 `json:"last_price"`
					OI                float64 `json:"oi"`
					PreviousOI        float64 `json:"previous_oi"`
					Volume            float64 `json:"volume"`
					ImpliedVolatility float64 `json:"implied_volatility"`
					Greeks            *struct {
						Delta float64 `json:"delta"`
						Gamma float64 `json:"gamma"`
						Theta float64 `json:"theta"`
						Vega  float64 `json:"vega"`
					} `json:"greeks"`
				} `json:"ce"`
				PE *struct {
					LastPrice         float64 `json:"last_price"`
					OI                float64 `json:"oi"`
					PreviousOI        float64 `json:"previous_oi"`
					Volume            float64 `json:"volume"`
					ImpliedVolatility float64 `json:"implied_volatility"`
					Greeks            *struct {
						Delta float64 `json:"delta"`
						Gamma float64 `json:"gamma"`
						Theta float64 `json:"theta"`
						Vega  float64 `json:"vega"`
					} `json:"greeks"`
				} `json:"pe"`
			} `json:"oc"`
		} `json:"data"`
	}
	if err := json.Unmarshal(chainRaw, &chainResp); err != nil || chainResp.Status != "success" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "message": "Dhan option chain parse error"})
		return
	}

	// Transform to our standard format (compatible with existing frontend)
	type optionEntry struct {
		OpenInterest        float64 `json:"openInterest"`
		ChangeinOpenInterest float64 `json:"changeinOpenInterest"`
		LastPrice           float64 `json:"lastPrice"`
		ImpliedVolatility   float64 `json:"impliedVolatility"`
		TotalTradedVolume   float64 `json:"totalTradedVolume"`
		Delta               float64 `json:"delta"`
		Gamma               float64 `json:"gamma"`
		Theta               float64 `json:"theta"`
		Vega                float64 `json:"vega"`
	}
	type rowOut struct {
		StrikePrice float64      `json:"strikePrice"`
		ExpiryDate  string       `json:"expiryDate"`
		CE          *optionEntry `json:"CE,omitempty"`
		PE          *optionEntry `json:"PE,omitempty"`
	}

	var rows []rowOut
	totalCEOI, totalPEOI := 0.0, 0.0

	for strikeStr, data := range chainResp.Data.OC {
		strike, err := strconv.ParseFloat(strings.TrimSpace(strikeStr), 64)
		if err != nil {
			continue
		}
		row := rowOut{StrikePrice: strike, ExpiryDate: useExpiry}
		if data.CE != nil {
			chgOI := data.CE.OI - data.CE.PreviousOI
			e := &optionEntry{
				OpenInterest: data.CE.OI, ChangeinOpenInterest: chgOI,
				LastPrice: data.CE.LastPrice, ImpliedVolatility: data.CE.ImpliedVolatility,
				TotalTradedVolume: data.CE.Volume,
			}
			if data.CE.Greeks != nil {
				e.Delta = data.CE.Greeks.Delta; e.Gamma = data.CE.Greeks.Gamma
				e.Theta = data.CE.Greeks.Theta; e.Vega = data.CE.Greeks.Vega
			}
			row.CE = e
			totalCEOI += data.CE.OI
		}
		if data.PE != nil {
			chgOI := data.PE.OI - data.PE.PreviousOI
			e := &optionEntry{
				OpenInterest: data.PE.OI, ChangeinOpenInterest: chgOI,
				LastPrice: data.PE.LastPrice, ImpliedVolatility: data.PE.ImpliedVolatility,
				TotalTradedVolume: data.PE.Volume,
			}
			if data.PE.Greeks != nil {
				e.Delta = data.PE.Greeks.Delta; e.Gamma = data.PE.Greeks.Gamma
				e.Theta = data.PE.Greeks.Theta; e.Vega = data.PE.Greeks.Vega
			}
			row.PE = e
			totalPEOI += data.PE.OI
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].StrikePrice < rows[j].StrikePrice })

	pcrOI := 0.0
	if totalCEOI > 0 {
		pcrOI = totalPEOI / totalCEOI
	}

	c.JSON(http.StatusOK, gin.H{
		"symbol":       symbol,
		"expiry_dates": expiryDates,
		"underlying":   chainResp.Data.LastPrice,
		"data":         rows,
		"pcr_oi":       pcrOI,
		"total_ce_oi":  totalCEOI,
		"total_pe_oi":  totalPEOI,
		"source":       "dhan",
		"timestamp":    time.Now(),
	})
}

// ── GET /api/v1/market/vix ────────────────────────────────

func GetVIX(c *gin.Context) {
	data, err := nseGet("/api/allIndices")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"vix": 14.5, "change": 0.2, "percent_change": 1.4, "source": "fallback"})
		return
	}
	var raw struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(data, &raw); err == nil {
		for _, idx := range raw.Data {
			if idx["index"] == "INDIA VIX" {
				c.JSON(http.StatusOK, gin.H{
					"vix":            idx["last"],
					"change":         idx["change"],
					"percent_change": idx["percentChange"],
					"source":         "nse",
					"timestamp":      time.Now(),
				})
				return
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"vix": 14.5, "change": 0.2, "percent_change": 1.4, "source": "fallback"})
}

// ── GET /api/v1/market/fii-dii ───────────────────────────

func GetFIIDII(c *gin.Context) {
	data, err := nseGet("/api/fiidiiTradeReact")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"data": []interface{}{}, "source": "fallback"})
		return
	}
	var raw []map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusOK, gin.H{"data": []interface{}{}, "source": "fallback"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": raw, "source": "nse", "timestamp": time.Now()})
}

// ── GET /api/v1/market/gainers-losers ─────────────────────

func GetGainersLosers(c *gin.Context) {
	// Use equity-stockIndices which reliably returns all constituent stocks with % change
	data, err := nseGet("/api/equity-stockIndices?index=NIFTY%2050")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"gainers": fallbackGainers(), "losers": fallbackLosers(), "source": "fallback"})
		return
	}
	var raw struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(data, &raw); err != nil || len(raw.Data) == 0 {
		c.JSON(http.StatusOK, gin.H{"gainers": fallbackGainers(), "losers": fallbackLosers(), "source": "fallback"})
		return
	}

	type stock struct {
		Symbol    string  `json:"symbol"`
		Last      float64 `json:"last"`
		ChangePct float64 `json:"change_pct"`
	}

	var stocks []stock
	for _, item := range raw.Data {
		sym, _ := item["symbol"].(string)
		if sym == "" {
			continue
		}
		pct := toFloat(item["pChange"])
		last := toFloat(item["lastPrice"])
		stocks = append(stocks, stock{Symbol: sym, Last: last, ChangePct: pct})
	}

	// Sort a copy for gainers (desc) and losers (asc)
	gainers := make([]stock, len(stocks))
	copy(gainers, stocks)
	sort.Slice(gainers, func(i, j int) bool { return gainers[i].ChangePct > gainers[j].ChangePct })

	losers := make([]stock, len(stocks))
	copy(losers, stocks)
	sort.Slice(losers, func(i, j int) bool { return losers[i].ChangePct < losers[j].ChangePct })

	if len(gainers) > 10 {
		gainers = gainers[:10]
	}
	if len(losers) > 10 {
		losers = losers[:10]
	}
	c.JSON(http.StatusOK, gin.H{"gainers": gainers, "losers": losers, "source": "nse", "timestamp": time.Now()})
}

func fallbackGainers() []map[string]interface{} {
	return []map[string]interface{}{
		{"symbol": "HDFCBANK", "last": 1785.0, "change_pct": 1.8},
		{"symbol": "RELIANCE", "last": 2940.0, "change_pct": 1.4},
		{"symbol": "INFY", "last": 1945.0, "change_pct": 1.1},
	}
}

func fallbackLosers() []map[string]interface{} {
	return []map[string]interface{}{
		{"symbol": "WIPRO", "last": 605.0, "change_pct": -1.5},
		{"symbol": "ONGC", "last": 265.0, "change_pct": -1.2},
		{"symbol": "NTPC", "last": 345.0, "change_pct": -0.9},
	}
}

// ── GET /api/v1/market/max-pain?symbol=NIFTY&expiry=... ──

func GetMaxPain(c *gin.Context) {
	symbol := strings.ToUpper(c.DefaultQuery("symbol", "NIFTY"))
	expiry := c.Query("expiry")

	if expiry == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": true, "message": "expiry parameter required"})
		return
	}

	indexSymbols := map[string]bool{"NIFTY": true, "BANKNIFTY": true, "FINNIFTY": true, "MIDCPNIFTY": true}
	var apiPath string
	if indexSymbols[symbol] {
		apiPath = "/api/option-chain-indices?symbol=" + url.QueryEscape(symbol)
	} else {
		apiPath = "/api/option-chain-equities?symbol=" + url.QueryEscape(symbol)
	}

	data, err := nseGet(apiPath)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": true, "message": "NSE unavailable"})
		return
	}

	var raw struct {
		Records struct {
			Data []struct {
				StrikePrice float64 `json:"strikePrice"`
				ExpiryDate  string  `json:"expiryDate"`
				CE          *struct{ OpenInterest float64 `json:"openInterest"` } `json:"CE"`
				PE          *struct{ OpenInterest float64 `json:"openInterest"` } `json:"PE"`
			} `json:"data"`
		} `json:"records"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "message": "Parse error"})
		return
	}

	// Max pain = strike where total OI pain is minimized
	type strikeOI struct {
		Strike float64
		CEOI   float64
		PEOI   float64
	}
	strikeMap := map[float64]*strikeOI{}
	for _, row := range raw.Records.Data {
		if row.ExpiryDate != expiry {
			continue
		}
		if _, ok := strikeMap[row.StrikePrice]; !ok {
			strikeMap[row.StrikePrice] = &strikeOI{Strike: row.StrikePrice}
		}
		if row.CE != nil {
			strikeMap[row.StrikePrice].CEOI += row.CE.OpenInterest
		}
		if row.PE != nil {
			strikeMap[row.StrikePrice].PEOI += row.PE.OpenInterest
		}
	}

	minPain := -1.0
	maxPainStrike := 0.0
	for strike := range strikeMap {
		totalPain := 0.0
		for s2, oi2 := range strikeMap {
			if strike > s2 {
				totalPain += (strike - s2) * oi2.CEOI
			} else {
				totalPain += (s2 - strike) * oi2.PEOI
			}
		}
		if minPain < 0 || totalPain < minPain {
			minPain = totalPain
			maxPainStrike = strike
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"symbol":          symbol,
		"expiry":          expiry,
		"max_pain_strike": maxPainStrike,
		"timestamp":       time.Now(),
	})
}

// ─── FALLBACK DATA ────────────────────────────────────────

func fallbackIndices() []map[string]interface{} {
	return []map[string]interface{}{
		{"index": "NIFTY 50", "last": 22500.0, "change": 120.5, "percentChange": 0.54, "open": 22380.0, "high": 22610.0, "low": 22310.0},
		{"index": "NIFTY BANK", "last": 48200.0, "change": -85.0, "percentChange": -0.18, "open": 48285.0, "high": 48490.0, "low": 47980.0},
		{"index": "NIFTY MIDCAP 100", "last": 51800.0, "change": 230.0, "percentChange": 0.45, "open": 51570.0, "high": 51950.0, "low": 51490.0},
		{"index": "INDIA VIX", "last": 14.5, "change": 0.2, "percentChange": 1.4, "open": 14.3, "high": 14.8, "low": 14.1},
		{"index": "NIFTY IT", "last": 38900.0, "change": -210.0, "percentChange": -0.54, "open": 39110.0, "high": 39200.0, "low": 38750.0},
		{"index": "NIFTY FIN SERVICE", "last": 21100.0, "change": 45.0, "percentChange": 0.21, "open": 21055.0, "high": 21180.0, "low": 20990.0},
	}
}
