package user

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/livestream-api/internal/auth"
)

type Handler struct {
	repo      *Repository
	jwtSecret string
}

func NewHandler(repo *Repository, jwtSecret string) *Handler {
	return &Handler{repo: repo, jwtSecret: jwtSecret}
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
