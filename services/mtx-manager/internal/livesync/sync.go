// Package livesync watches MediaMTX for live/ path transitions and notifies
// the API so Postgres is_live stays in sync. Required because the official
// MediaMTX image is distroless (no shell/curl for runOnReady hooks).
package livesync

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/mediamtx"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/thumbnails"
	"github.com/darkhanbayarerdenebat/mtx-manager/internal/vods"
)

type Syncer struct {
	client   *mediamtx.Client
	apiBase  string
	vods     *vods.Service
	thumbs   *thumbnails.Service
	http     *http.Client
	interval time.Duration
	live     map[string]time.Time
}

func New(client *mediamtx.Client, apiBase string, vodSvc *vods.Service, thumbSvc *thumbnails.Service, interval time.Duration) *Syncer {
	return &Syncer{
		client:   client,
		apiBase:  strings.TrimRight(apiBase, "/"),
		vods:     vodSvc,
		thumbs:   thumbSvc,
		http:     &http.Client{Timeout: 5 * time.Second},
		interval: interval,
		live:     make(map[string]time.Time),
	}
}

func (s *Syncer) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	s.sync(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.sync(ctx)
		}
	}
}

func (s *Syncer) sync(ctx context.Context) {
	dashboard, err := s.client.Dashboard()
	if err != nil {
		log.Printf("livesync: dashboard: %v", err)
		return
	}

	online := make(map[string]time.Time)
	now := time.Now()
	for _, p := range dashboard.Paths {
		if !p.Online || !strings.HasPrefix(p.Name, "live/") {
			continue
		}
		started, was := s.live[p.Name]
		if !was {
			started = now
			s.notify(ctx, "stream-started", p.Name, "")
		}
		online[p.Name] = started
	}

	for path, startedAt := range s.live {
		if _, ok := online[path]; !ok {
			s.notify(ctx, "stream-stopped", path, "")
			go s.attachRecording(path, startedAt)
		}
	}
	s.live = online
}

func (s *Syncer) attachRecording(path string, startedAt time.Time) {
	if s.vods == nil {
		return
	}
	deadline := time.Now().Add(3 * time.Minute)
	attempt := 0
	for time.Now().Before(deadline) {
		attempt++
		rec, err := s.vods.LatestSince(path, startedAt)
		if err != nil {
			log.Printf("livesync: recording lookup %s: %v", path, err)
		} else if rec != nil {
			s.ensureVodThumbnail(rec.ID)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			s.notify(ctx, "recording-attached", path, rec.ID)
			cancel()
			return
		}
		time.Sleep(5 * time.Second)
	}
	log.Printf("livesync: no recording found for %s after %d attempts", path, attempt)
}

func (s *Syncer) ensureVodThumbnail(recordingID string) {
	if s.thumbs == nil || s.vods == nil {
		return
	}
	videoPath, err := s.vods.Open(recordingID)
	if err != nil {
		log.Printf("livesync: vod thumbnail %s: open: %v", recordingID, err)
		return
	}
	if err := s.thumbs.EnsureVOD(recordingID, videoPath); err != nil {
		log.Printf("livesync: vod thumbnail %s: %v", recordingID, err)
		return
	}
	log.Printf("livesync: vod thumbnail %s", recordingID)
}

func (s *Syncer) notify(ctx context.Context, hook, path, recordingPath string) {
	body, err := json.Marshal(map[string]string{
		"path":           path,
		"recording_path": recordingPath,
	})
	if err != nil {
		return
	}
	url := s.apiBase + "/internal/mtx/" + hook
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		log.Printf("livesync: %s %s: %v", hook, path, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.http.Do(req)
	if err != nil {
		log.Printf("livesync: %s %s: %v", hook, path, err)
		return
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("livesync: %s %s: api status %d", hook, path, resp.StatusCode)
		return
	}
	if recordingPath != "" {
		log.Printf("livesync: %s %s → %s", hook, path, recordingPath)
	} else {
		log.Printf("livesync: %s %s", hook, path)
	}
}
