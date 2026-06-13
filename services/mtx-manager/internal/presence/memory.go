package presence

import (
	"context"

	"github.com/darkhanbayarerdenebat/mtx-manager/internal/viewers"
)

// Memory is a single-node presence Service backed by the in-process
// viewers.Tracker. It is used as a graceful fallback when Redis is unavailable
// so local development without Redis keeps working.
//
// The wrapped Tracker is exposed via Tracker() so the dashboard can still build
// rich per-viewer member details (IP, user agent, device) that the Redis
// backend does not retain.
type Memory struct {
	tracker *viewers.Tracker
}

// NewMemory returns an in-memory presence Service wrapping a fresh Tracker.
func NewMemory() *Memory {
	return &Memory{tracker: viewers.NewTracker()}
}

// Tracker exposes the underlying in-process tracker for rich member lookups.
func (m *Memory) Tracker() *viewers.Tracker {
	return m.tracker
}

func (m *Memory) Ping(_ context.Context, path, viewerID string) {
	m.tracker.Ping(viewerID, path, "", "")
}

func (m *Memory) Leave(_ context.Context, _ string, viewerID string) {
	m.tracker.Leave(viewerID)
}

func (m *Memory) Count(_ context.Context, path string) int {
	return len(m.tracker.ForPath(path))
}

func (m *Memory) Counts(_ context.Context, paths []string) map[string]int {
	out := make(map[string]int, len(paths))
	for _, p := range paths {
		out[p] = len(m.tracker.ForPath(p))
	}
	return out
}
