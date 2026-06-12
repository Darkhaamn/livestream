package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/mediamtx"
)

func generateStreamKey() string {
	buf := make([]byte, 5)
	_, _ = rand.Read(buf)
	return "live_" + hex.EncodeToString(buf)
}

func (s *Server) handleBroadcastConfig(c *gin.Context) {
	writeJSON(c, http.StatusOK, mediamtx.BroadcastConfig{
		RTMPURL:            s.rtmpURL,
		HLSPlaybackBase:    s.hlsPlaybackBase,
		WHIPURL:            s.whipURL,
		WebRTCPlaybackBase: s.webrtcPlaybackBase,
	})
}

func (s *Server) handleBroadcastKey(c *gin.Context) {
	writeJSON(c, http.StatusOK, mediamtx.BroadcastConfig{
		RTMPURL:            s.rtmpURL,
		HLSPlaybackBase:    s.hlsPlaybackBase,
		WHIPURL:            s.whipURL,
		WebRTCPlaybackBase: s.webrtcPlaybackBase,
		StreamKey:          generateStreamKey(),
	})
}
