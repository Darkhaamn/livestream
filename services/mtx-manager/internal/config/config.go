package config

import (
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	MediaMTXURL       string
	MediaMTXUsername  string
	MediaMTXPassword  string
	ServerAddr        string
	CORSOrigins       string
	RTMPIngestURL     string
	RTSPPlaybackURL   string
	HLSPlaybackURL    string
	WHIPIngestURL     string
	WebRTCPlaybackURL string
	ThumbnailDir      string
	ThumbnailInterval string
	RecordingsDir     string
	RedisURL          string
	APIURL                 string
	LiveSyncInterval       string
	MetricsSampleInterval  string
}

func Load() Config {
	recordingsDir := resolveDataDir("RECORDINGS_DIR", "recordings")
	thumbnailDir := resolveDataDir("THUMBNAIL_DIR", "thumbnails")

	return Config{
		MediaMTXURL:       envOr("MEDIAMTX_URL", "http://localhost:9997"),
		MediaMTXUsername:  envOr("MEDIAMTX_USERNAME", "admin"),
		MediaMTXPassword:  envOr("MEDIAMTX_PASSWORD", "admin123"),
		ServerAddr:        envOr("SERVER_ADDR", ":8080"),
		CORSOrigins:       envOr("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"),
		RTMPIngestURL:     envOr("RTMP_INGEST_URL", "rtmp://localhost"),
		RTSPPlaybackURL:   envOr("RTSP_PLAYBACK_URL", "rtsp://localhost:8554"),
		HLSPlaybackURL:    envOr("HLS_PLAYBACK_URL", "http://localhost:8888"),
		WHIPIngestURL:     envOr("WHIP_INGEST_URL", "http://localhost:8889/webrtc"),
		WebRTCPlaybackURL: envOr("WEBRTC_PLAYBACK_URL", "http://localhost:8889/webrtc"),
		ThumbnailDir:      thumbnailDir,
		ThumbnailInterval: envOr("THUMBNAIL_INTERVAL", "10s"),
		RecordingsDir:     recordingsDir,
		RedisURL:          envOr("REDIS_URL", "redis://:redis_secret@localhost:6379/0"),
		APIURL:            envOr("API_URL", "http://localhost:8081"),
		LiveSyncInterval:      envOr("LIVE_SYNC_INTERVAL", "3s"),
		MetricsSampleInterval: envOr("METRICS_SAMPLE_INTERVAL", "5s"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// resolveDataDir finds a repo-root data directory (recordings/, thumbnails/)
// by walking up from the current working directory. Falls back to env or cwd.
func resolveDataDir(envKey, dirName string) string {
	if v := os.Getenv(envKey); v != "" {
		if abs, err := filepath.Abs(v); err == nil {
			return abs
		}
		return v
	}

	if wd, err := os.Getwd(); err == nil {
		dir := wd
		for range 8 {
			candidate := filepath.Join(dir, dirName)
			if st, err := os.Stat(candidate); err == nil && st.IsDir() {
				abs, err := filepath.Abs(candidate)
				if err == nil {
					return abs
				}
				return candidate
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	abs, err := filepath.Abs(dirName)
	if err != nil {
		return dirName
	}
	return abs
}

func (c Config) MediaMTXBase() string {
	return c.MediaMTXURL
}

func (c Config) String() string {
	return fmt.Sprintf("mediamtx=%s server=%s recordings=%s", c.MediaMTXURL, c.ServerAddr, c.RecordingsDir)
}
