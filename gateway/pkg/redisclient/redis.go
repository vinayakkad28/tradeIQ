package redisclient

import (
	"context"
	"log"
	"sync"
	"time"
)

// InMemoryCache provides a simple thread-safe cache as a Redis stand-in.
// In production, replace this with github.com/redis/go-redis/v9.
// This exists so rate limiting and caching work correctly with bounded memory.

type cacheEntry struct {
	value     string
	expiresAt time.Time
}

var (
	mu    sync.RWMutex
	store = make(map[string]cacheEntry)
)

func init() {
	// Background cleanup every 60 seconds to prevent unbounded memory growth
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		for range ticker.C {
			cleanup()
		}
	}()
}

func cleanup() {
	mu.Lock()
	defer mu.Unlock()
	now := time.Now()
	for k, v := range store {
		if now.After(v.expiresAt) {
			delete(store, k)
		}
	}
}

// Init logs readiness. Replace with real Redis connection in production.
func Init() {
	log.Println("[Cache] In-memory cache initialized (replace with Redis in production)")
}

// Available returns true (always available for in-memory).
func Available() bool {
	return true
}

// Set stores a key with TTL.
func Set(_ context.Context, key string, value string, ttl time.Duration) error {
	mu.Lock()
	defer mu.Unlock()
	store[key] = cacheEntry{value: value, expiresAt: time.Now().Add(ttl)}
	return nil
}

// Get retrieves a key. Returns empty string and false if not found or expired.
func Get(_ context.Context, key string) (string, bool) {
	mu.RLock()
	defer mu.RUnlock()
	entry, ok := store[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return "", false
	}
	return entry.value, true
}

// Del deletes keys.
func Del(_ context.Context, keys ...string) {
	mu.Lock()
	defer mu.Unlock()
	for _, k := range keys {
		delete(store, k)
	}
}

// Incr atomically increments a counter, setting TTL on first creation.
// Returns the new count.
func Incr(_ context.Context, key string, ttl time.Duration) int64 {
	mu.Lock()
	defer mu.Unlock()
	entry, ok := store[key]
	now := time.Now()
	if !ok || now.After(entry.expiresAt) {
		store[key] = cacheEntry{value: "1", expiresAt: now.Add(ttl)}
		return 1
	}
	// Parse and increment
	count := int64(0)
	for _, c := range entry.value {
		count = count*10 + int64(c-'0')
	}
	count++
	// Convert back
	s := make([]byte, 0, 8)
	if count == 0 {
		s = append(s, '0')
	} else {
		tmp := make([]byte, 0, 8)
		n := count
		for n > 0 {
			tmp = append(tmp, byte('0'+n%10))
			n /= 10
		}
		for i := len(tmp) - 1; i >= 0; i-- {
			s = append(s, tmp[i])
		}
	}
	store[key] = cacheEntry{value: string(s), expiresAt: entry.expiresAt}
	return count
}
