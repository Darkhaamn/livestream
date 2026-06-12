package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"

	"gorm.io/gorm"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

type UpdateInput struct {
	DisplayName    *string `json:"display_name"`
	Bio            *string `json:"bio"`
	StreamTitle    *string `json:"stream_title"`
	StreamCategory *string `json:"stream_category"`
}

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) GetByID(ctx context.Context, id string) (*model.User, error) {
	var u model.User
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&u).Error; err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *Repository) GetByUsername(ctx context.Context, username string) (*model.User, error) {
	var u model.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).First(&u).Error; err != nil {
		return nil, fmt.Errorf("get user by username: %w", err)
	}
	return &u, nil
}

func (r *Repository) GetByStreamKey(ctx context.Context, streamKey string) (*model.User, error) {
	var u model.User
	if err := r.db.WithContext(ctx).Where("stream_key = ?", streamKey).First(&u).Error; err != nil {
		return nil, fmt.Errorf("get user by stream key: %w", err)
	}
	return &u, nil
}

func (r *Repository) Update(ctx context.Context, id string, in UpdateInput) (*model.User, error) {
	updates := map[string]any{}
	if in.DisplayName != nil {
		updates["display_name"] = *in.DisplayName
	}
	if in.Bio != nil {
		updates["bio"] = *in.Bio
	}
	if in.StreamTitle != nil {
		updates["stream_title"] = *in.StreamTitle
	}
	if in.StreamCategory != nil {
		updates["stream_category"] = *in.StreamCategory
	}
	if len(updates) > 0 {
		err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(updates).Error
		if err != nil {
			return nil, fmt.Errorf("update user: %w", err)
		}
	}
	return r.GetByID(ctx, id)
}

func (r *Repository) ListSessions(ctx context.Context, userID string, limit int) ([]model.StreamSession, error) {
	var sessions []model.StreamSession
	err := r.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("started_at DESC").
		Limit(limit).
		Find(&sessions).Error
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	return sessions, nil
}

func (r *Repository) RegenerateStreamKey(ctx context.Context, userID string) (string, error) {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	newKey := "live_" + hex.EncodeToString(b)
	err := r.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", userID).Update("stream_key", newKey).Error
	if err != nil {
		return "", err
	}
	return newKey, nil
}
