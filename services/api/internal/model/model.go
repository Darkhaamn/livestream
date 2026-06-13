package model

import "time"

type User struct {
	ID             string    `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Username       string    `gorm:"uniqueIndex;size:32" json:"username"`
	Email          string    `gorm:"uniqueIndex" json:"email,omitempty"`
	PasswordHash   string    `json:"-"`
	DisplayName    *string   `json:"display_name"`
	Bio            *string   `json:"bio"`
	AvatarURL      *string   `json:"avatar_url"`
	StreamKey      string    `gorm:"uniqueIndex" json:"stream_key,omitempty"`
	StreamTitle       string    `gorm:"default:'Live Stream'" json:"stream_title"`
	StreamCategory    string    `gorm:"default:'Just Chatting'" json:"stream_category"`
	StreamDescription string    `gorm:"default:''" json:"stream_description"`
	IsLive         bool      `json:"is_live"`
	FollowerCount  int       `json:"follower_count"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"-"`
}

type RefreshToken struct {
	ID        string    `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID    string    `gorm:"type:uuid;index"`
	TokenHash string
	ExpiresAt time.Time
	CreatedAt time.Time
}

type Follow struct {
	FollowerID  string `gorm:"type:uuid;primaryKey"`
	FollowingID string `gorm:"type:uuid;primaryKey"`
	CreatedAt   time.Time
}

type StreamSession struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        string     `gorm:"type:uuid;index" json:"-"`
	Path          string     `json:"path"`
	Title         string     `json:"title"`
	Category      string     `json:"category"`
	Description   string     `json:"description"`
	StartedAt     time.Time  `json:"started_at"`
	EndedAt       *time.Time `json:"ended_at"`
	RecordingPath *string    `json:"recording_path"`
}

type PublicUser struct {
	ID             string    `json:"id"`
	Username       string    `json:"username"`
	DisplayName    *string   `json:"display_name"`
	Bio            *string   `json:"bio"`
	AvatarURL      *string   `json:"avatar_url"`
	StreamTitle       string    `json:"stream_title"`
	StreamCategory    string    `json:"stream_category"`
	StreamDescription string    `json:"stream_description"`
	IsLive         bool      `json:"is_live"`
	FollowerCount  int       `json:"follower_count"`
	CreatedAt      time.Time `json:"created_at"`
}

func (u *User) Public() PublicUser {
	return PublicUser{
		ID: u.ID, Username: u.Username, DisplayName: u.DisplayName,
		Bio: u.Bio, AvatarURL: u.AvatarURL, StreamTitle: u.StreamTitle,
		StreamCategory: u.StreamCategory, StreamDescription: u.StreamDescription, IsLive: u.IsLive,
		FollowerCount: u.FollowerCount, CreatedAt: u.CreatedAt,
	}
}
