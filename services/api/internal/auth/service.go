package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrUserExists         = errors.New("username or email already taken")
)

type Service struct {
	db     *gorm.DB
	secret string
}

func NewService(db *gorm.DB, jwtSecret string) *Service {
	return &Service{db: db, secret: jwtSecret}
}

type RegisterInput struct {
	Username string
	Email    string
	Password string
}

type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	UserID       string `json:"user_id"`
	Username     string `json:"username"`
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (*TokenPair, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	u := model.User{
		Username:     in.Username,
		Email:        in.Email,
		PasswordHash: string(hash),
		StreamKey:    "live_" + randomHex(16),
	}
	if err := s.db.WithContext(ctx).Create(&u).Error; err != nil {
		if isUniqueViolation(err) {
			return nil, ErrUserExists
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	return s.issuePair(ctx, u.ID, u.Username)
}

type LoginInput struct {
	Email    string
	Password string
}

func (s *Service) Login(ctx context.Context, in LoginInput) (*TokenPair, error) {
	var u model.User
	if err := s.db.WithContext(ctx).Where("email = ?", in.Email).First(&u).Error; err != nil {
		return nil, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(in.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}
	return s.issuePair(ctx, u.ID, u.Username)
}

func (s *Service) RefreshTokens(ctx context.Context, refreshToken string) (*TokenPair, error) {
	tokenHash := hashToken(refreshToken)

	var rt model.RefreshToken
	err := s.db.WithContext(ctx).
		Where("token_hash = ? AND expires_at > ?", tokenHash, time.Now()).
		First(&rt).Error
	if err != nil {
		return nil, ErrInvalidCredentials
	}
	var u model.User
	if err := s.db.WithContext(ctx).Where("id = ?", rt.UserID).First(&u).Error; err != nil {
		return nil, ErrInvalidCredentials
	}

	_ = s.db.WithContext(ctx).Where("token_hash = ?", tokenHash).Delete(&model.RefreshToken{}).Error
	return s.issuePair(ctx, u.ID, u.Username)
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	return s.db.WithContext(ctx).
		Where("token_hash = ?", hashToken(refreshToken)).
		Delete(&model.RefreshToken{}).Error
}

func (s *Service) issuePair(ctx context.Context, userID, username string) (*TokenPair, error) {
	access, err := NewAccessToken(s.secret, userID, username)
	if err != nil {
		return nil, err
	}
	refresh := randomHex(32)
	rt := model.RefreshToken{
		UserID:    userID,
		TokenHash: hashToken(refresh),
		ExpiresAt: time.Now().Add(RefreshTokenTTL),
	}
	if err := s.db.WithContext(ctx).Create(&rt).Error; err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}
	return &TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		UserID:       userID,
		Username:     username,
	}, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := err.Error()
	return strings.Contains(msg, "23505") || strings.Contains(msg, "duplicate")
}
