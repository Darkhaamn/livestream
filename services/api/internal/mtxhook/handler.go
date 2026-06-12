// Package mtxhook implements the MediaMTX auth and hook webhooks.
// These endpoints are internal (no auth header) and intended to be reachable
// only from MediaMTX on localhost.
package mtxhook

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

type Handler struct {
	db *gorm.DB
}

func NewHandler(db *gorm.DB) *Handler {
	return &Handler{db: db}
}

type authRequest struct {
	User     string `json:"user"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
	ID       string `json:"id"`
	Query    string `json:"query"`
}

type pathRequest struct {
	Path string `json:"path"`
}

// Auth handles POST /internal/mtx/auth (MediaMTX authHTTPAddress callback).
// MediaMTX treats any 2xx as allow, non-2xx as deny.
func (h *Handler) Auth(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.Action != "publish" {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	if req.User == "" || req.Password == "" || req.Path != "live/"+req.User {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid stream key"})
		return
	}

	var u model.User
	err := h.db.WithContext(c.Request.Context()).
		Where("username = ? AND stream_key = ?", req.User, req.Password).
		First(&u).Error
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid stream key"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// userFromPath resolves the user for a "live/<username>" path.
// Returns nil with no error for paths outside the live/ namespace.
func (h *Handler) userFromPath(c *gin.Context) (*model.User, bool) {
	var req pathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return nil, false
	}
	username, found := strings.CutPrefix(req.Path, "live/")
	if !found || username == "" {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return nil, false
	}
	var u model.User
	err := h.db.WithContext(c.Request.Context()).
		Where("username = ?", username).First(&u).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return nil, false
	}
	return &u, true
}

// StreamStarted handles POST /internal/mtx/stream-started.
func (h *Handler) StreamStarted(c *gin.Context) {
	u, ok := h.userFromPath(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()

	var open int64
	if err := h.db.WithContext(ctx).Model(&model.StreamSession{}).
		Where("user_id = ? AND ended_at IS NULL", u.ID).
		Count(&open).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if open == 0 {
		session := model.StreamSession{
			UserID:    u.ID,
			Path:      "live/" + u.Username,
			Title:     u.StreamTitle,
			Category:  u.StreamCategory,
			StartedAt: time.Now(),
		}
		if err := h.db.WithContext(ctx).Create(&session).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
	}
	if err := h.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", u.ID).Update("is_live", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// StreamStopped handles POST /internal/mtx/stream-stopped.
func (h *Handler) StreamStopped(c *gin.Context) {
	u, ok := h.userFromPath(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	now := time.Now()
	if err := h.db.WithContext(ctx).Model(&model.StreamSession{}).
		Where("user_id = ? AND ended_at IS NULL", u.ID).
		Update("ended_at", now).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if err := h.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", u.ID).Update("is_live", false).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
