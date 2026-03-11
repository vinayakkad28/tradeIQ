package database

import (
	"fmt"
	"log"
	"os"

	"tradeiq/gateway/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		sslmode := getEnv("DB_SSLMODE", "disable")
		if os.Getenv("GIN_MODE") == "release" {
			sslmode = getEnv("DB_SSLMODE", "require")
		}
		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			getEnv("DB_HOST", "localhost"),
			getEnv("DB_PORT", "5432"),
			getEnv("DB_USER", "tradeiq"),
			getEnv("DB_PASSWORD", "tradeiq_dev"),
			getEnv("DB_NAME", "tradeiq"),
			sslmode,
		)
	}

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := DB.AutoMigrate(
		&models.User{},
		&models.RefreshToken{},
		&models.BrokerOAuthState{},
		&models.BrokerConnection{},
		&models.Trade{},
		&models.JournalEntry{},
		&models.AnalyticsCache{},
		&models.Notification{},
		&models.WeeklyReport{},
	); err != nil {
		log.Fatalf("AutoMigrate failed: %v", err)
	}

	log.Println("Database connected and migrated")
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
