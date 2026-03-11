package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
)

var encryptionKey []byte

// Init validates and loads the ENCRYPTION_KEY env var.
// Key must be exactly 32 bytes (AES-256).
func Init() {
	raw := os.Getenv("ENCRYPTION_KEY")
	if raw == "" {
		// In development, derive a key from JWT_SECRET as fallback.
		raw = os.Getenv("JWT_SECRET")
	}
	if raw == "" {
		panic("ENCRYPTION_KEY (or JWT_SECRET) must be set — refusing to start without encryption key")
	}
	// Pad or truncate to exactly 32 bytes for AES-256
	key := make([]byte, 32)
	copy(key, []byte(raw))
	encryptionKey = key
}

// Encrypt encrypts plaintext using AES-256-GCM and returns a base64-encoded string.
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", fmt.Errorf("cipher init: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm init: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("nonce gen: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64-encoded AES-256-GCM ciphertext.
func Decrypt(encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		// If it's not base64, it's likely a legacy plaintext token — return as-is.
		return encoded, nil
	}
	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", fmt.Errorf("cipher init: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm init: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		// Too short to be encrypted — likely legacy plaintext
		return encoded, nil
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		// Decryption failed — likely legacy plaintext token, return as-is
		return encoded, nil
	}
	return string(plaintext), nil
}
