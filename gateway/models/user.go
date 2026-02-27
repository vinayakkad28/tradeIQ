package models

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID             uuid.UUID  `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	Email          string     `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash   string     `gorm:"not null" json:"-"`
	FullName       string     `json:"full_name"`
	Plan           string     `gorm:"default:free" json:"plan"` // free, trader, pro
	PlanExpiresAt  *time.Time `json:"plan_expires_at,omitempty"`
	OnboardingDone bool       `gorm:"default:false" json:"onboarding_done"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
