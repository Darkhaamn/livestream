package viewers

import (
	"sync"
	"time"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/device"
)

const viewerTTL = 90 * time.Second

type TrackedViewer struct {
	ID        string    `json:"id"`
	Path      string    `json:"path"`
	IP        string    `json:"ip"`
	UserAgent string    `json:"userAgent"`
	Device    string    `json:"device"`
	LastSeen  time.Time `json:"lastSeen"`
}

type Tracker struct {
	mu      sync.Mutex
	entries map[string]TrackedViewer
}

func NewTracker() *Tracker {
	return &Tracker{entries: make(map[string]TrackedViewer)}
}

func (t *Tracker) Ping(id, path, ip, userAgent string) TrackedViewer {
	now := time.Now()
	viewer := TrackedViewer{
		ID:        id,
		Path:      path,
		IP:        ip,
		UserAgent: userAgent,
		Device:    device.FromUserAgent(userAgent),
		LastSeen:  now,
	}

	t.mu.Lock()
	t.entries[id] = viewer
	t.pruneLocked(now)
	t.mu.Unlock()

	return viewer
}

func (t *Tracker) Leave(id string) {
	t.mu.Lock()
	delete(t.entries, id)
	t.mu.Unlock()
}

func (t *Tracker) ForPath(path string) []TrackedViewer {
	now := time.Now()

	t.mu.Lock()
	defer t.mu.Unlock()
	t.pruneLocked(now)

	out := make([]TrackedViewer, 0)
	for _, viewer := range t.entries {
		if viewer.Path == path {
			out = append(out, viewer)
		}
	}
	return out
}

func (t *Tracker) pruneLocked(now time.Time) {
	for id, viewer := range t.entries {
		if now.Sub(viewer.LastSeen) > viewerTTL {
			delete(t.entries, id)
		}
	}
}
