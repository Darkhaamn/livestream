// Package presence tracks live viewer presence per stream path.
//
// It defines a small Service interface satisfied by two backends:
//   - Redis (multi-pod, self-healing) — see NewRedis.
//   - the in-process viewers.Tracker (single node, local dev) — see NewMemory.
//
// The Redis backend follows the SHARED REDIS CONTRACT used by services/api:
// presence per stream is a ZSET keyed "viewers:<path>", member = viewerId,
// score = unix epoch seconds of last ping. A 90s window is used for counting
// (self-heals missed leaves) and keys expire after 180s.
package presence

import "context"

// Service is the presence backend contract. Both the Redis and in-memory
// implementations satisfy it.
type Service interface {
	// Ping records that viewerId is currently watching path.
	Ping(ctx context.Context, path, viewerID string)
	// Leave removes viewerId from path.
	Leave(ctx context.Context, path, viewerID string)
	// Count returns the number of active viewers on path within the presence window.
	Count(ctx context.Context, path string) int
	// Counts returns active viewer counts for several paths at once.
	Counts(ctx context.Context, paths []string) map[string]int
}

const (
	// windowSeconds is the presence window: pings older than this are not counted.
	windowSeconds = 90
	// ttlSeconds is the Redis key TTL (EXPIRE) refreshed on every ping.
	ttlSeconds = 180
)

// key returns the Redis ZSET key for a stream path.
func key(path string) string {
	return "viewers:" + path
}
