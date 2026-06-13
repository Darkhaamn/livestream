package user

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

// ErrSelfFollow is returned when a user tries to follow themselves.
var ErrSelfFollow = errors.New("cannot follow yourself")

// LiveStreamRow is the raw DB projection for a single live stream: a live user
// joined to its currently-open stream_sessions row (ended_at IS NULL) for the
// started_at timestamp.
type LiveStreamRow struct {
	Username       string
	DisplayName    *string
	AvatarURL      *string
	StreamTitle    string
	StreamCategory string
	StartedAt      *time.Time
}

type UpdateInput struct {
	DisplayName       *string `json:"display_name"`
	Bio               *string `json:"bio"`
	StreamTitle       *string `json:"stream_title"`
	StreamCategory    *string `json:"stream_category"`
	StreamDescription *string `json:"stream_description"`
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
	if in.StreamDescription != nil {
		updates["stream_description"] = *in.StreamDescription
	}
	if len(updates) > 0 {
		err := r.db.WithContext(ctx).Model(&model.User{}).Where("id = ?", id).Updates(updates).Error
		if err != nil {
			return nil, fmt.Errorf("update user: %w", err)
		}
	}
	u, err := r.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if u.IsLive {
		sessionUpdates := map[string]any{}
		if in.StreamTitle != nil {
			sessionUpdates["title"] = *in.StreamTitle
		}
		if in.StreamCategory != nil {
			sessionUpdates["category"] = *in.StreamCategory
		}
		if in.StreamDescription != nil {
			sessionUpdates["description"] = *in.StreamDescription
		}
		if len(sessionUpdates) > 0 {
			_ = r.db.WithContext(ctx).Model(&model.StreamSession{}).
				Where("user_id = ? AND ended_at IS NULL", id).
				Updates(sessionUpdates).Error
		}
	}
	return u, nil
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

// ListLiveStreams returns all users with is_live = true, each joined to its
// currently-open stream_sessions row (ended_at IS NULL; latest started_at wins
// if several are open) for the started_at timestamp. Results are ordered newest
// first by started_at, with NULL started_at sorted last.
func (r *Repository) ListLiveStreams(ctx context.Context) ([]LiveStreamRow, error) {
	var rows []LiveStreamRow
	// Correlated subquery picks the latest open session per user. A LEFT JOIN
	// keeps live users that have no open session row (started_at stays NULL).
	sub := r.db.
		Model(&model.StreamSession{}).
		Select("user_id, MAX(started_at) AS started_at").
		Where("ended_at IS NULL").
		Group("user_id")

	err := r.db.WithContext(ctx).
		Table("users AS u").
		Select("u.username, u.display_name, u.avatar_url, u.stream_title, u.stream_category, s.started_at").
		Joins("LEFT JOIN (?) AS s ON s.user_id = u.id", sub).
		Where("u.is_live = ?", true).
		Order("s.started_at DESC NULLS LAST").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list live streams: %w", err)
	}
	return rows, nil
}

// Follow makes followerID follow followingID. Idempotent: following twice is a
// no-op. FollowingID's denormalized FollowerCount is kept in sync in the same
// transaction (incremented only when a new row is actually inserted).
func (r *Repository) Follow(ctx context.Context, followerID, followingID string) error {
	if followerID == followingID {
		return ErrSelfFollow
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.Follow{
			FollowerID:  followerID,
			FollowingID: followingID,
			CreatedAt:   time.Now().UTC(),
		})
		if res.Error != nil {
			return fmt.Errorf("insert follow: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return nil // already following
		}
		return tx.Model(&model.User{}).Where("id = ?", followingID).
			UpdateColumn("follower_count", gorm.Expr("follower_count + 1")).Error
	})
}

// Unfollow removes the follow edge. Idempotent: FollowerCount is decremented
// only when a row was actually deleted, and never below zero.
func (r *Repository) Unfollow(ctx context.Context, followerID, followingID string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Where("follower_id = ? AND following_id = ?", followerID, followingID).
			Delete(&model.Follow{})
		if res.Error != nil {
			return fmt.Errorf("delete follow: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return nil // wasn't following
		}
		return tx.Model(&model.User{}).
			Where("id = ? AND follower_count > 0", followingID).
			UpdateColumn("follower_count", gorm.Expr("follower_count - 1")).Error
	})
}

// IsFollowing reports whether followerID currently follows followingID.
func (r *Repository) IsFollowing(ctx context.Context, followerID, followingID string) (bool, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&model.Follow{}).
		Where("follower_id = ? AND following_id = ?", followerID, followingID).
		Count(&n).Error
	return n > 0, err
}

// FollowingChannelRow is a channel the user follows (live or offline).
type FollowingChannelRow struct {
	Username       string
	DisplayName    *string
	AvatarURL      *string
	StreamTitle    string
	StreamCategory string
	IsLive         bool
}

// ListFollowingChannels returns every channel followerID follows, live first.
func (r *Repository) ListFollowingChannels(ctx context.Context, followerID string) ([]FollowingChannelRow, error) {
	var rows []FollowingChannelRow
	err := r.db.WithContext(ctx).
		Table("users AS u").
		Select("u.username, u.display_name, u.avatar_url, u.stream_title, u.stream_category, u.is_live").
		Joins("INNER JOIN follows f ON f.following_id = u.id").
		Where("f.follower_id = ?", followerID).
		Order("u.is_live DESC, u.username ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list following channels: %w", err)
	}
	return rows, nil
}

// ListFollowingLive returns the live streams of channels that followerID follows,
// shaped exactly like ListLiveStreams (newest open session first).
func (r *Repository) ListFollowingLive(ctx context.Context, followerID string) ([]LiveStreamRow, error) {
	var rows []LiveStreamRow
	sub := r.db.
		Model(&model.StreamSession{}).
		Select("user_id, MAX(started_at) AS started_at").
		Where("ended_at IS NULL").
		Group("user_id")

	err := r.db.WithContext(ctx).
		Table("users AS u").
		Select("u.username, u.display_name, u.avatar_url, u.stream_title, u.stream_category, s.started_at").
		Joins("JOIN follows f ON f.following_id = u.id").
		Joins("LEFT JOIN (?) AS s ON s.user_id = u.id", sub).
		Where("f.follower_id = ? AND u.is_live = ?", followerID, true).
		Order("s.started_at DESC NULLS LAST").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list following live: %w", err)
	}
	return rows, nil
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
