package store

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
)

type ChatMessage struct {
	ID        uint      `gorm:"primaryKey"`
	Room      string    `gorm:"index:idx_chat_room_created,priority:1;size:255;not null"`
	UserID    string    `gorm:"size:64"`
	Username  string    `gorm:"size:64"`
	Color     string    `gorm:"size:16"`
	Text      string    `gorm:"size:500"`
	Badges    string    `gorm:"size:128"` // JSON array, e.g. ["broadcaster"]
	CreatedAt time.Time `gorm:"index:idx_chat_room_created,priority:2"`
}

type Store struct {
	db *gorm.DB
}

func New(dsn string) (*Store, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("gorm open: %w", err)
	}
	if err := db.AutoMigrate(&ChatMessage{}); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}
	return &Store{db: db}, nil
}

// Save persists a chat message; failures are logged, not fatal —
// chat keeps working if the database hiccups.
func (s *Store) Save(msg message.Message) {
	rec := ChatMessage{
		Room:      msg.Room,
		UserID:    msg.UserID,
		Username:  msg.Username,
		Color:     msg.Color,
		Text:      msg.Text,
		CreatedAt: msg.Timestamp,
	}
	if len(msg.Badges) > 0 {
		if b, err := json.Marshal(msg.Badges); err == nil {
			rec.Badges = string(b)
		}
	}
	if err := s.db.Create(&rec).Error; err != nil {
		log.Printf("chat store: save: %v", err)
	}
}

// History returns the last limit chat messages for a room, oldest first.
func (s *Store) History(ctx context.Context, room string, limit int) []message.Message {
	var recs []ChatMessage
	err := s.db.WithContext(ctx).
		Where("room = ?", room).
		Order("created_at DESC").
		Limit(limit).
		Find(&recs).Error
	if err != nil {
		log.Printf("chat store: history: %v", err)
		return nil
	}
	msgs := make([]message.Message, 0, len(recs))
	for i := len(recs) - 1; i >= 0; i-- {
		r := recs[i]
		var badges []string
		if r.Badges != "" {
			_ = json.Unmarshal([]byte(r.Badges), &badges)
		}
		msgs = append(msgs, message.Message{
			Type:      message.TypeChat,
			Room:      r.Room,
			UserID:    r.UserID,
			Username:  r.Username,
			Color:     r.Color,
			Text:      r.Text,
			Badges:    badges,
			Timestamp: r.CreatedAt,
		})
	}
	return msgs
}

// ClearRoom deletes persisted chat history for a room.
func (s *Store) ClearRoom(ctx context.Context, room string) error {
	return s.db.WithContext(ctx).Where("room = ?", room).Delete(&ChatMessage{}).Error
}
