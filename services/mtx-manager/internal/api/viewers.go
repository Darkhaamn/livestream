package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/device"
)

type viewerPingRequest struct {
	ViewerID  string `json:"viewerId"`
	Path      string `json:"path"`
	UserAgent string `json:"userAgent"`
}

// viewerResponse preserves the JSON shape previously returned by the in-memory
// tracker so the frontend contract is unchanged regardless of backend.
type viewerResponse struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	IP        string `json:"ip"`
	UserAgent string `json:"userAgent"`
	Device    string `json:"device"`
}

func (s *Server) handleViewerPing(c *gin.Context) {
	var req viewerPingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if req.ViewerID == "" || req.Path == "" {
		writeError(c, http.StatusBadRequest, errNotFound("viewerId and path are required"))
		return
	}

	userAgent := req.UserAgent
	if userAgent == "" {
		userAgent = c.GetHeader("User-Agent")
	}

	s.presence.Ping(c.Request.Context(), req.Path, req.ViewerID)

	// Keep rich per-viewer details in the in-memory tracker when it is active so
	// the dashboard can surface IP/device for local single-node development.
	if s.tracker != nil {
		s.tracker.Ping(req.ViewerID, req.Path, c.ClientIP(), userAgent)
	}

	writeJSON(c, http.StatusOK, viewerResponse{
		ID:        req.ViewerID,
		Path:      req.Path,
		IP:        c.ClientIP(),
		UserAgent: userAgent,
		Device:    device.FromUserAgent(userAgent),
	})
}

func (s *Server) handleViewerLeave(c *gin.Context) {
	var req viewerPingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if req.ViewerID != "" {
		s.presence.Leave(c.Request.Context(), req.Path, req.ViewerID)
		if s.tracker != nil {
			s.tracker.Leave(req.ViewerID)
		}
	}
	writeJSON(c, http.StatusOK, gin.H{"status": "ok"})
}
