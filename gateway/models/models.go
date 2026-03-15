package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

type BrokerOAuthState struct {
	ID          uuid.UUID `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"index;not null" json:"user_id"`
	BrokerName  string    `gorm:"not null" json:"broker_name"`
	State       string    `gorm:"uniqueIndex;not null" json:"state"`
	FrontendURL string    `json:"frontend_url"` // origin of the frontend that initiated connect
	ExpiresAt   time.Time `gorm:"not null" json:"expires_at"`
	CreatedAt   time.Time `json:"created_at"`
}

type RefreshToken struct {
	ID        uuid.UUID `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"index;not null" json:"user_id"`
	TokenHash string    `gorm:"not null" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

type BrokerConnection struct {
	ID             uuid.UUID  `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID         uuid.UUID  `gorm:"index;not null" json:"user_id"`
	BrokerName     string     `gorm:"not null" json:"broker_name"`
	DisplayName    string     `json:"display_name"`
	ExternalUserID string     `json:"external_user_id,omitempty"` // client ID at the broker (e.g. Angel One client code)
	AccessToken    string     `json:"-"`
	RefreshToken   string     `json:"-"`
	FeedToken      string     `json:"-"`
	TokenExpiresAt *time.Time `json:"token_expires_at,omitempty"`
	Status         string     `gorm:"default:connected" json:"status"`
	LastSyncedAt   *time.Time `json:"last_synced_at,omitempty"`
	TradeCount     int        `gorm:"default:0" json:"trade_count"`
	ConnectedAt    time.Time  `gorm:"default:now()" json:"connected_at"`
}

type Trade struct {
	ID                 uuid.UUID      `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID             uuid.UUID      `gorm:"index:idx_trade_user_date,priority:1;index:idx_trade_user_status,priority:1;not null" json:"user_id"`
	BrokerConnectionID *uuid.UUID     `json:"broker_connection_id,omitempty"`
	BrokerTradeID      string         `json:"broker_trade_id,omitempty"`
	TradeDate          time.Time      `gorm:"index:idx_trade_user_date,priority:2;not null" json:"trade_date"`
	EntryTime          time.Time      `gorm:"not null" json:"entry_time"`
	ExitTime           *time.Time     `json:"exit_time,omitempty"`
	Instrument         string         `gorm:"not null" json:"instrument"`
	InstrumentType     string         `json:"instrument_type"`
	Segment            string         `gorm:"not null" json:"segment"`
	Direction          string         `gorm:"not null" json:"direction"`
	EntryPrice         float64        `gorm:"type:decimal(12,4)" json:"entry_price"`
	ExitPrice          *float64       `gorm:"type:decimal(12,4)" json:"exit_price,omitempty"`
	Quantity           int            `gorm:"not null" json:"quantity"`
	PnL                *float64       `gorm:"type:decimal(12,2)" json:"pnl,omitempty"`
	Charges            float64        `gorm:"type:decimal(10,2);default:0" json:"charges"`
	NetPnL             *float64       `gorm:"type:decimal(12,2)" json:"net_pnl,omitempty"`
	Status             string         `gorm:"default:closed;index:idx_trade_user_status,priority:2" json:"status"`
	HoldingMinutes     *int           `json:"holding_minutes,omitempty"`
	FollowedPlan       *bool          `json:"followed_plan,omitempty"`
	Emotion            string         `json:"emotion,omitempty"`
	SetupRating        string         `json:"setup_rating,omitempty"`
	StopLossMoved      bool           `gorm:"default:false" json:"stop_loss_moved"`
	ReEntryAfterLoss   bool           `gorm:"default:false" json:"re_entry_after_loss"`
	Source             string         `gorm:"default:manual" json:"source"`
	RawData            datatypes.JSON `json:"raw_data,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
}

type JournalEntry struct {
	ID               uuid.UUID      `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID           uuid.UUID      `gorm:"index:idx_journal_user_date,priority:1;not null" json:"user_id"`
	TradeID          *uuid.UUID     `json:"trade_id,omitempty"`
	TradeDate        time.Time      `gorm:"index:idx_journal_user_date,priority:2" json:"trade_date"`
	Instrument       string         `json:"instrument"`
	Direction        string         `json:"direction"`
	PnL              *float64       `gorm:"type:decimal(12,2)" json:"pnl,omitempty"`
	Emotion          string         `json:"emotion"`
	SetupRating      string         `json:"setup_rating"`
	FollowedPlan     *bool          `json:"followed_plan,omitempty"`
	StopLossMoved    bool           `gorm:"default:false" json:"stop_loss_moved"`
	ReEntryAfterLoss bool           `gorm:"default:false" json:"re_entry_after_loss"`
	PreTradeNotes    string         `json:"pre_trade_notes"`
	PostTradeNotes   string         `json:"post_trade_notes"`
	Tags             datatypes.JSON `json:"tags,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

type AnalyticsCache struct {
	ID         uuid.UUID      `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID      `gorm:"uniqueIndex:idx_user_range;not null" json:"user_id"`
	DateRange  string         `gorm:"uniqueIndex:idx_user_range" json:"date_range"`
	ComputedAt time.Time      `json:"computed_at"`
	ExpiresAt  time.Time      `json:"expires_at"`
	Payload    datatypes.JSON `json:"payload"`
}

type Notification struct {
	ID        uuid.UUID `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"index;not null" json:"user_id"`
	Category  string    `json:"category"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Severity  string    `gorm:"default:info" json:"severity"`
	Read      bool      `gorm:"default:false" json:"read"`
	CreatedAt time.Time `json:"created_at"`
}

type WeeklyReport struct {
	ID         uuid.UUID      `gorm:"primaryKey;type:uuid;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID      `gorm:"index;not null" json:"user_id"`
	WeekStart  time.Time      `json:"week_start"`
	WeekEnd    time.Time      `json:"week_end"`
	TotalPnL   float64        `gorm:"type:decimal(12,2)" json:"total_pnl"`
	TradeCount int            `json:"trade_count"`
	WinRate    float64        `gorm:"type:decimal(5,2)" json:"win_rate"`
	TopInsight string         `json:"top_insight"`
	Payload    datatypes.JSON `json:"payload"`
	CreatedAt  time.Time      `json:"created_at"`
}
