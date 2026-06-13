package user

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/auth"
	"github.com/darkhanbayarerdenebat/livestream-api/internal/cache"
)

type Handler struct {
	repo      *Repository
	jwtSecret string
	cache     *cache.Cache // may be nil if Redis is unavailable
}

func NewHandler(repo *Repository, jwtSecret string, c *cache.Cache) *Handler {
	return &Handler{repo: repo, jwtSecret: jwtSecret, cache: c}
}

// LiveStream is one item of the GET /streams/live discovery response. The JSON
// shape is part of the shared API contract and must not change.
type LiveStream struct {
	Username       string     `json:"username"`
	DisplayName    *string    `json:"display_name"`
	AvatarURL      *string    `json:"avatar_url"`
	StreamTitle    string     `json:"stream_title"`
	StreamCategory string     `json:"stream_category"`
	Path           string     `json:"path"`
	ViewerCount    int        `json:"viewer_count"`
	StartedAt      *time.Time `json:"started_at"`
}

const discoveryTTL = 2 * time.Second

// ListLiveStreams handles GET /streams/live (public). It lists live streams from
// Postgres enriched with viewer counts from the shared Redis presence keys, and
// caches the assembled array in Redis ("discovery:live", 2s TTL) to absorb the
// frontend's poll. Redis failures degrade gracefully: viewer counts fall back
// to 0 and the request still succeeds.
func (h *Handler) ListLiveStreams(c *gin.Context) {
	ctx := c.Request.Context()

	// Serve from cache when fresh.
	if h.cache != nil {
		if cached, err := h.cache.Get(ctx, cache.DiscoveryLiveKey); err == nil && cached != "" {
			c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(cached))
			return
		}
	}

	rows, err := h.repo.ListLiveStreams(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list live streams"})
		return
	}

	streams := make([]LiveStream, 0, len(rows))
	paths := make([]string, 0, len(rows))
	for _, r := range rows {
		path := "live/" + r.Username
		paths = append(paths, path)
		streams = append(streams, LiveStream{
			Username:       r.Username,
			DisplayName:    r.DisplayName,
			AvatarURL:      r.AvatarURL,
			StreamTitle:    r.StreamTitle,
			StreamCategory: r.StreamCategory,
			Path:           path,
			ViewerCount:    0,
			StartedAt:      r.StartedAt,
		})
	}

	// Enrich with viewer counts in a single pipelined round-trip. Degrades to 0.
	if h.cache != nil {
		counts := h.cache.ViewerCounts(ctx, paths)
		for i := range streams {
			streams[i].ViewerCount = counts[streams[i].Path]
		}
	}

	body, err := json.Marshal(streams)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to encode response"})
		return
	}

	if h.cache != nil {
		_ = h.cache.Set(ctx, cache.DiscoveryLiveKey, body, discoveryTTL)
	}

	c.Data(http.StatusOK, "application/json; charset=utf-8", body)
}

// GetUser handles GET /users/:username. When username == "me" it requires a
// Bearer token and returns the full self profile (email + stream_key);
// otherwise it returns the public profile. This avoids gin's wildcard/static
// route conflict between /users/me and /users/:username.
func (h *Handler) GetUser(c *gin.Context) {
	username := c.Param("username")
	if username == "me" {
		h.getMe(c)
		return
	}
	u, err := h.repo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, u.Public())
}

func (h *Handler) getMe(c *gin.Context) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	claims, err := auth.ParseAccessToken(h.jwtSecret, strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	u, err := h.repo.GetByID(c.Request.Context(), claims.UserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, u)
}

// GetSessions handles GET /users/:username/sessions (public).
func (h *Handler) GetSessions(c *gin.Context) {
	username := c.Param("username")
	u, err := h.repo.GetByUsername(c.Request.Context(), username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	sessions, err := h.repo.ListSessions(c.Request.Context(), u.ID, 50)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sessions"})
		return
	}
	c.JSON(http.StatusOK, sessions)
}

func (h *Handler) UpdateMe(c *gin.Context) {
	userID := c.GetString("user_id")
	var in UpdateInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	u, err := h.repo.Update(c.Request.Context(), userID, in)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}
	c.JSON(http.StatusOK, u)
}

func (h *Handler) RegenerateKey(c *gin.Context) {
	userID := c.GetString("user_id")
	key, err := h.repo.RegenerateStreamKey(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to regenerate key"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stream_key": key})
}

// Follow handles POST /users/:username/follow (auth). The follower is the
// authenticated user; the target is resolved by username.
func (h *Handler) Follow(c *gin.Context) {
	h.setFollow(c, true)
}

// Unfollow handles DELETE /users/:username/follow (auth).
func (h *Handler) Unfollow(c *gin.Context) {
	h.setFollow(c, false)
}

func (h *Handler) setFollow(c *gin.Context, follow bool) {
	followerID := c.GetString("user_id")
	target, err := h.repo.GetByUsername(c.Request.Context(), c.Param("username"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if follow {
		if err := h.repo.Follow(c.Request.Context(), followerID, target.ID); err != nil {
			if err == ErrSelfFollow {
				c.JSON(http.StatusBadRequest, gin.H{"error": "cannot follow yourself"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "follow failed"})
			return
		}
	} else {
		if err := h.repo.Unfollow(c.Request.Context(), followerID, target.ID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "unfollow failed"})
			return
		}
	}
	// Re-read for the fresh follower_count.
	fresh, err := h.repo.GetByID(c.Request.Context(), target.ID)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"following": follow})
		return
	}
	c.JSON(http.StatusOK, gin.H{"following": follow, "follower_count": fresh.FollowerCount})
}

// FollowStatus handles GET /users/:username/follow-status (auth) →
// {"following": bool}. Lets the UI render the right button state on load.
func (h *Handler) FollowStatus(c *gin.Context) {
	followerID := c.GetString("user_id")
	target, err := h.repo.GetByUsername(c.Request.Context(), c.Param("username"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	following, err := h.repo.IsFollowing(c.Request.Context(), followerID, target.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to check follow status"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"following": following})
}

// FollowingChannel is one row of GET /users/me/following.
type FollowingChannel struct {
	Username       string  `json:"username"`
	DisplayName    *string `json:"display_name"`
	AvatarURL      *string `json:"avatar_url"`
	StreamTitle    string  `json:"stream_title"`
	StreamCategory string  `json:"stream_category"`
	IsLive         bool    `json:"is_live"`
	ViewerCount    int     `json:"viewer_count"`
	Path           string  `json:"path"`
}

// ListMyFollowing handles GET /users/me/following (auth) — all followed channels.
func (h *Handler) ListMyFollowing(c *gin.Context) {
	followerID := c.GetString("user_id")
	rows, err := h.repo.ListFollowingChannels(c.Request.Context(), followerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list following"})
		return
	}

	channels := make([]FollowingChannel, 0, len(rows))
	paths := make([]string, 0)
	for _, r := range rows {
		path := "live/" + r.Username
		ch := FollowingChannel{
			Username:       r.Username,
			DisplayName:    r.DisplayName,
			AvatarURL:      r.AvatarURL,
			StreamTitle:    r.StreamTitle,
			StreamCategory: r.StreamCategory,
			IsLive:         r.IsLive,
			Path:           path,
		}
		if r.IsLive {
			paths = append(paths, path)
		}
		channels = append(channels, ch)
	}

	if h.cache != nil && len(paths) > 0 {
		counts := h.cache.ViewerCounts(c.Request.Context(), paths)
		for i := range channels {
			if channels[i].IsLive {
				channels[i].ViewerCount = counts[channels[i].Path]
			}
		}
	}

	c.JSON(http.StatusOK, channels)
}

// ListFollowingStreams handles GET /streams/following (auth) — the live streams
// of channels the authenticated user follows. Same shape as /streams/live.
func (h *Handler) ListFollowingStreams(c *gin.Context) {
	followerID := c.GetString("user_id")
	rows, err := h.repo.ListFollowingLive(c.Request.Context(), followerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list following streams"})
		return
	}
	streams := make([]LiveStream, 0, len(rows))
	paths := make([]string, 0, len(rows))
	for _, r := range rows {
		path := "live/" + r.Username
		paths = append(paths, path)
		streams = append(streams, LiveStream{
			Username: r.Username, DisplayName: r.DisplayName, AvatarURL: r.AvatarURL,
			StreamTitle: r.StreamTitle, StreamCategory: r.StreamCategory,
			Path: path, ViewerCount: 0, StartedAt: r.StartedAt,
		})
	}
	if h.cache != nil {
		counts := h.cache.ViewerCounts(c.Request.Context(), paths)
		for i := range streams {
			streams[i].ViewerCount = counts[streams[i].Path]
		}
	}
	c.JSON(http.StatusOK, streams)
}
