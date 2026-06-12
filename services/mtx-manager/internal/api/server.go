package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/mediamtx"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/middleware"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/thumbnails"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/viewers"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/vods"
)

type Server struct {
	engine             *gin.Engine
	client             *mediamtx.Client
	thumbnails         *thumbnails.Service
	vods               *vods.Service
	viewers            *viewers.Tracker
	rtmpURL            string
	hlsPlaybackBase    string
	whipURL            string
	webrtcPlaybackBase string
}

func New(
	client *mediamtx.Client,
	thumbs *thumbnails.Service,
	vodSvc *vods.Service,
	corsOrigins []string,
	rtmpURL, hlsPlaybackBase, whipURL, webrtcPlaybackBase string,
) *Server {
	s := &Server{
		client:             client,
		thumbnails:         thumbs,
		vods:               vodSvc,
		viewers:            viewers.NewTracker(),
		rtmpURL:            rtmpURL,
		hlsPlaybackBase:    hlsPlaybackBase,
		whipURL:            whipURL,
		webrtcPlaybackBase: webrtcPlaybackBase,
	}

	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())
	engine.Use(middleware.CORS(corsOrigins))
	s.engine = engine
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler {
	return s.engine
}

func (s *Server) routes() {
	api := s.engine.Group("/api")
	{
		api.GET("/health", s.handleHealth)
		api.GET("/dashboard", s.handleDashboard)
		api.GET("/paths", s.handlePaths)
		api.GET("/paths/:name", s.handlePath)
		api.GET("/streams/live", s.handleLiveStreams)
		api.GET("/members", s.handleMembers)
		api.GET("/broadcast", s.handleBroadcastConfig)
		api.POST("/broadcast/key", s.handleBroadcastKey)
		api.POST("/viewers/ping", s.handleViewerPing)
		api.POST("/viewers/leave", s.handleViewerLeave)

		if s.thumbnails != nil {
			api.GET("/thumbnails/*name", s.handleThumbnail)
		}
		if s.vods != nil {
			api.GET("/vods", s.handleVODs)
			api.GET("/vods/file/*id", s.handleVODFile)
		}
	}
}

func (s *Server) handleVODs(c *gin.Context) {
	list, err := s.vods.List(c.Query("path"))
	if err != nil {
		writeError(c, http.StatusInternalServerError, err)
		return
	}
	writeJSON(c, http.StatusOK, list)
}

func (s *Server) handleVODFile(c *gin.Context) {
	id := strings.TrimPrefix(c.Param("id"), "/")
	if id == "" {
		writeError(c, http.StatusBadRequest, errNotFound("vod id required"))
		return
	}
	path, err := s.vods.Open(id)
	if err != nil {
		writeError(c, http.StatusNotFound, errNotFound("vod not found"))
		return
	}
	c.Header("Content-Type", "video/mp4")
	c.File(path)
}

func (s *Server) LivePathNames() []string {
	dashboard, err := s.dashboard()
	if err != nil {
		return nil
	}
	names := make([]string, 0)
	for _, path := range dashboard.Paths {
		if path.Online {
			names = append(names, path.Name)
		}
	}
	return names
}

func (s *Server) handleThumbnail(c *gin.Context) {
	if s.thumbnails == nil {
		writeError(c, http.StatusNotFound, errNotFound("thumbnails disabled"))
		return
	}

	name := strings.TrimPrefix(c.Param("name"), "/")
	if name == "" {
		writeError(c, http.StatusBadRequest, errNotFound("path name required"))
		return
	}

	data, err := s.thumbnails.Get(name)
	if err != nil {
		writeError(c, http.StatusNotFound, errNotFound("thumbnail not available"))
		return
	}

	c.Header("Cache-Control", "public, max-age=8")
	c.Data(http.StatusOK, "image/jpeg", data)
}

func (s *Server) dashboard() (mediamtx.Dashboard, error) {
	dashboard, err := s.client.Dashboard()
	if err != nil {
		return mediamtx.Dashboard{}, err
	}

	for i, path := range dashboard.Paths {
		tracked := s.viewers.ForPath(path.Name)
		pathViewers := mediamtx.BuildViewers(path.Name, path.Members, tracked)
		dashboard.Paths[i].Viewers = pathViewers
		dashboard.Paths[i].ViewerCount = len(pathViewers)
	}
	return dashboard, nil
}

func (s *Server) handleHealth(c *gin.Context) {
	writeJSON(c, http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) handleDashboard(c *gin.Context) {
	dashboard, err := s.dashboard()
	if err != nil {
		writeError(c, http.StatusBadGateway, err)
		return
	}
	writeJSON(c, http.StatusOK, dashboard)
}

func (s *Server) handlePaths(c *gin.Context) {
	dashboard, err := s.dashboard()
	if err != nil {
		writeError(c, http.StatusBadGateway, err)
		return
	}
	writeJSON(c, http.StatusOK, dashboard.Paths)
}

func (s *Server) handleLiveStreams(c *gin.Context) {
	dashboard, err := s.dashboard()
	if err != nil {
		writeError(c, http.StatusBadGateway, err)
		return
	}

	live := make([]mediamtx.PathSummary, 0)
	for _, path := range dashboard.Paths {
		if path.Online {
			live = append(live, path)
		}
	}
	writeJSON(c, http.StatusOK, live)
}

func (s *Server) handlePath(c *gin.Context) {
	name := c.Param("name")
	dashboard, err := s.dashboard()
	if err != nil {
		writeError(c, http.StatusBadGateway, err)
		return
	}
	for _, p := range dashboard.Paths {
		if p.Name == name {
			writeJSON(c, http.StatusOK, p)
			return
		}
	}
	writeError(c, http.StatusNotFound, errNotFound("path not found"))
}

func (s *Server) handleMembers(c *gin.Context) {
	dashboard, err := s.dashboard()
	if err != nil {
		writeError(c, http.StatusBadGateway, err)
		return
	}

	var members []mediamtx.StreamMember
	for _, p := range dashboard.Paths {
		members = append(members, p.Members...)
	}
	writeJSON(c, http.StatusOK, members)
}

func writeJSON(c *gin.Context, status int, v any) {
	c.Header("Cache-Control", "no-store")
	c.JSON(status, v)
}

type apiError struct {
	Error string `json:"error"`
	Time  string `json:"time"`
}

func writeError(c *gin.Context, status int, err error) {
	writeJSON(c, status, apiError{
		Error: err.Error(),
		Time:  time.Now().UTC().Format(time.RFC3339),
	})
}

func errNotFound(msg string) error {
	return &notFoundError{msg: msg}
}

type notFoundError struct {
	msg string
}

func (e *notFoundError) Error() string {
	return e.msg
}

func ParseCORSOrigins(value string) []string {
	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}
