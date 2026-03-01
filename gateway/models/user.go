package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                uuid.UUID  `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Email             string     `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash      string     `gorm:"not null" json:"-"`
	FullName          string     `json:"full_name"`
	PhoneNumber       string     `json:"phone_number"`
	TradingExperience string     `gorm:"default:beginner" json:"trading_experience"` // beginner, intermediate, advanced, professional
	TradingStyle      string     `gorm:"default:intraday" json:"trading_style"`      // scalper, intraday, swing, positional
	AvatarColor       string     `gorm:"default:amber" json:"avatar_color"`          // amber, green, blue, purple, red
	Plan              string     `gorm:"default:free" json:"plan"`                   // free, trader, pro
	PlanExpiresAt     *time.Time `json:"plan_expires_at,omitempty"`
	OnboardingDone    bool       `gorm:"default:false" json:"onboarding_done"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}
