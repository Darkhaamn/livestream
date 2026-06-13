// Package mtxhook implements the MediaMTX auth and hook webhooks.
// These endpoints are internal (no auth header) and intended to be reachable
// only from MediaMTX on localhost.
package mtxhook

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/cache"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/model"
)

type Handler struct {
	db      *gorm.DB
	cache   *cache.Cache // optional; invalidates discovery cache on live transitions
	chatURL string
	http    *http.Client
}

func NewHandler(db *gorm.DB, c *cache.Cache, chatURL string) *Handler {
	return &Handler{
		db:      db,
		cache:   c,
		chatURL: strings.TrimRight(chatURL, "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
	}
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
	Path          string `json:"path"`
	RecordingPath string `json:"recording_path"`
}

type metricsRequest struct {
	Path          string  `json:"path"`
	InboundMbps   float64 `json:"inbound_mbps"`
	OutboundMbps  float64 `json:"outbound_mbps"`
	ViewerCount   int     `json:"viewer_count"`
	FrameErrors   uint64  `json:"frame_errors"`
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
			UserID:      u.ID,
			Path:        "live/" + u.Username,
			Title:       u.StreamTitle,
			Category:    u.StreamCategory,
			Description: u.StreamDescription,
			StartedAt:   time.Now(),
		}
		if err := h.db.WithContext(ctx).Create(&session).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
			return
		}
		h.resetChat(ctx, "live/"+u.Username)
	}
	if err := h.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", u.ID).Update("is_live", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	h.invalidateDiscovery(ctx)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// StreamStopped handles POST /internal/mtx/stream-stopped.
func (h *Handler) StreamStopped(c *gin.Context) {
	var req pathRequest
	if !h.bindLivePath(c, &req) {
		return
	}
	u, ok := h.userFromPathBody(c, req.Path)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	now := time.Now()
	updates := map[string]any{"ended_at": now}
	if req.RecordingPath != "" {
		updates["recording_path"] = req.RecordingPath
	}
	if err := h.db.WithContext(ctx).Model(&model.StreamSession{}).
		Where("user_id = ? AND ended_at IS NULL", u.ID).
		Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	if err := h.db.WithContext(ctx).Model(&model.User{}).
		Where("id = ?", u.ID).Update("is_live", false).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	h.invalidateDiscovery(ctx)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// StreamMetrics handles POST /internal/mtx/stream-metrics.
// mtx-manager livesync samples bandwidth and viewer count while a path is online.
func (h *Handler) StreamMetrics(c *gin.Context) {
	var req metricsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	u, ok := h.userFromPathBody(c, req.Path)
	if !ok {
		return
	}
	ctx := c.Request.Context()

	var session model.StreamSession
	err := h.db.WithContext(ctx).
		Where("user_id = ? AND ended_at IS NULL", u.ID).
		Order("started_at DESC").
		First(&session).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	sample := model.StreamMetricSample{
		SessionID:    session.ID,
		RecordedAt:   time.Now().UTC(),
		InboundMbps:  req.InboundMbps,
		OutboundMbps: req.OutboundMbps,
		ViewerCount:  req.ViewerCount,
		FrameErrors:  req.FrameErrors,
	}
	if err := h.db.WithContext(ctx).Create(&sample).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// RecordingAttached handles POST /internal/mtx/recording-attached.
// mtx-manager calls this after the recording file is finalized on disk.
func (h *Handler) RecordingAttached(c *gin.Context) {
	var req pathRequest
	if !h.bindLivePath(c, &req) {
		return
	}
	if req.RecordingPath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "recording_path required"})
		return
	}
	u, ok := h.userFromPathBody(c, req.Path)
	if !ok {
		return
	}
	ctx := c.Request.Context()

	session, err := h.findSessionForRecording(ctx, u.ID, req.RecordingPath)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}
	if err := h.db.WithContext(ctx).Model(session).
		Update("recording_path", req.RecordingPath).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	log.Printf("mtxhook: attached recording %s to session %d", req.RecordingPath, session.ID)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func recordingTimeFromPath(recordingPath string) (time.Time, bool) {
	recordingPath = strings.Trim(filepath.ToSlash(recordingPath), "/")
	segments := strings.Split(recordingPath, "/")
	if len(segments) < 5 {
		return time.Time{}, false
	}
	year := segments[len(segments)-4]
	month := segments[len(segments)-3]
	day := segments[len(segments)-2]
	name := strings.TrimSuffix(segments[len(segments)-1], filepath.Ext(segments[len(segments)-1]))
	t, err := time.ParseInLocation("2006/01/02 15-04-05", year+"/"+month+"/"+day+" "+name, time.UTC)
	return t, err == nil
}

func (h *Handler) findSessionForRecording(ctx context.Context, userID, recordingPath string) (*model.StreamSession, error) {
	base := h.db.WithContext(ctx).Model(&model.StreamSession{}).
		Where("user_id = ? AND recording_path IS NULL AND ended_at IS NOT NULL", userID)

	if recTime, ok := recordingTimeFromPath(recordingPath); ok {
		var session model.StreamSession
		err := base.
			Where("started_at BETWEEN ? AND ?", recTime.Add(-5*time.Minute), recTime.Add(5*time.Minute)).
			Order("started_at DESC").
			First(&session).Error
		if err == nil {
			return &session, nil
		}
	}

	var session model.StreamSession
	if err := base.Order("ended_at DESC").First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

func (h *Handler) bindLivePath(c *gin.Context, req *pathRequest) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return false
	}
	return true
}

func (h *Handler) userFromPathBody(c *gin.Context, path string) (*model.User, bool) {
	username, found := strings.CutPrefix(path, "live/")
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

func (h *Handler) invalidateDiscovery(ctx context.Context) {
	if h.cache != nil {
		_ = h.cache.Del(ctx, cache.DiscoveryLiveKey)
	}
}

func (h *Handler) resetChat(ctx context.Context, room string) {
	if h.chatURL == "" {
		return
	}
	body, err := json.Marshal(map[string]string{"room": room})
	if err != nil {
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.chatURL+"/internal/rooms/reset", bytes.NewReader(body))
	if err != nil {
		log.Printf("chat reset %s: build request: %v", room, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.http.Do(req)
	if err != nil {
		log.Printf("chat reset %s: %v", room, err)
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("chat reset %s: status %d", room, resp.StatusCode)
	}
}
