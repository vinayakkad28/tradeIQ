package market

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const nseBase = "https://www.nseindia.com"

// NSE requires a session cookie. We maintain one globally and refresh if needed.
var (
	nseSessionMu      sync.Mutex
	nseSessionCookies []*http.Cookie
	nseSessionExpiry  time.Time
)

func getNSESession() []*http.Cookie {
	nseSessionMu.Lock()
	defer nseSessionMu.Unlock()
	if time.Now().Before(nseSessionExpiry) {
		return nseSessionCookies
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequest("GET", nseBase, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	nseSessionCookies = resp.Cookies()
	nseSessionExpiry = time.Now().Add(5 * time.Minute)
	return nseSessionCookies
}

func nseGet(path string) ([]byte, error) {
	cookies := getNSESession()

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", nseBase+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.nseindia.com/")
	for _, c := range cookies {
		req.AddCookie(c)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

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

// ── GET /api/v1/market/option-chain?symbol=NIFTY ─────────

func GetOptionChain(c *gin.Context) {
	symbol := strings.ToUpper(c.DefaultQuery("symbol", "NIFTY"))
	expiry := c.Query("expiry")

	var apiPath string
	indexSymbols := map[string]bool{"NIFTY": true, "BANKNIFTY": true, "FINNIFTY": true, "MIDCPNIFTY": true}
	if indexSymbols[symbol] {
		apiPath = "/api/option-chain-indices?symbol=" + url.QueryEscape(symbol)
	} else {
		apiPath = "/api/option-chain-equities?symbol=" + url.QueryEscape(symbol)
	}

	data, err := nseGet(apiPath)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": true, "message": "NSE unavailable: " + err.Error()})
		return
	}

	var raw struct {
		Records struct {
			ExpiryDates     []string               `json:"expiryDates"`
			Data            []map[string]interface{} `json:"data"`
			UnderlyingValue float64                `json:"underlyingValue"`
			Timestamp       string                 `json:"timestamp"`
		} `json:"records"`
		Filtered struct {
			CE struct {
				TotOI  float64 `json:"totOI"`
				TotVol float64 `json:"totVol"`
			} `json:"CE"`
			PE struct {
				TotOI  float64 `json:"totOI"`
				TotVol float64 `json:"totVol"`
			} `json:"PE"`
		} `json:"filtered"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": true, "message": "Parse error"})
		return
	}

	filteredData := raw.Records.Data
	if expiry != "" {
		var f []map[string]interface{}
		for _, row := range raw.Records.Data {
			if ed, ok := row["expiryDate"].(string); ok && ed == expiry {
				f = append(f, row)
			}
		}
		filteredData = f
	}

	pcrOI, pcrVol := 0.0, 0.0
	if raw.Filtered.CE.TotOI > 0 {
		pcrOI = raw.Filtered.PE.TotOI / raw.Filtered.CE.TotOI
	}
	if raw.Filtered.CE.TotVol > 0 {
		pcrVol = raw.Filtered.PE.TotVol / raw.Filtered.CE.TotVol
	}

	c.JSON(http.StatusOK, gin.H{
		"symbol":      symbol,
		"expiry_dates": raw.Records.ExpiryDates,
		"underlying":  raw.Records.UnderlyingValue,
		"data":        filteredData,
		"pcr_oi":      pcrOI,
		"pcr_vol":     pcrVol,
		"total_ce_oi": raw.Filtered.CE.TotOI,
		"total_pe_oi": raw.Filtered.PE.TotOI,
		"timestamp":   raw.Records.Timestamp,
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
	index := c.DefaultQuery("index", "NIFTY%2050")
	data, err := nseGet("/api/live-analysis-variations?index=" + index)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"gainers": []interface{}{}, "losers": []interface{}{}, "source": "fallback"})
		return
	}
	var raw map[string][]map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		c.JSON(http.StatusOK, gin.H{"gainers": []interface{}{}, "losers": []interface{}{}, "source": "fallback"})
		return
	}
	gainers := raw["ADVANCES"]
	if len(gainers) > 10 {
		gainers = gainers[:10]
	}
	losers := raw["DECLINES"]
	if len(losers) > 10 {
		losers = losers[:10]
	}
	c.JSON(http.StatusOK, gin.H{"gainers": gainers, "losers": losers, "source": "nse", "timestamp": time.Now()})
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
