package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type viewerPingRequest struct {
	ViewerID  string `json:"viewerId"`
	Path      string `json:"path"`
	UserAgent string `json:"userAgent"`
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

	viewer := s.viewers.Ping(req.ViewerID, req.Path, c.ClientIP(), userAgent)
	writeJSON(c, http.StatusOK, viewer)
}

func (s *Server) handleViewerLeave(c *gin.Context) {
	var req viewerPingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	if req.ViewerID != "" {
		s.viewers.Leave(req.ViewerID)
	}
	writeJSON(c, http.StatusOK, gin.H{"status": "ok"})
}
