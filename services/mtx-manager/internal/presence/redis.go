package presence

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Redis is a Redis-backed presence Service implementing the SHARED REDIS CONTRACT.
type Redis struct {
	rdb *redis.Client
}

// NewRedis parses redisURL, verifies connectivity with a PING, and returns a
// Redis-backed Service. If the connection cannot be established it returns an
// error so the caller can fall back to the in-memory backend.
func NewRedis(ctx context.Context, redisURL string) (*Redis, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	rdb := redis.NewClient(opt)

	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if err := rdb.Ping(pingCtx).Err(); err != nil {
		_ = rdb.Close()
		return nil, err
	}
	return &Redis{rdb: rdb}, nil
}

// Close releases the underlying client.
func (r *Redis) Close() error {
	return r.rdb.Close()
}

// Ping: ZADD viewers:<path> <now> <viewerId> ; EXPIRE viewers:<path> 180
func (r *Redis) Ping(ctx context.Context, path, viewerID string) {
	now := float64(time.Now().Unix())
	k := key(path)
	pipe := r.rdb.Pipeline()
	pipe.ZAdd(ctx, k, redis.Z{Score: now, Member: viewerID})
	pipe.Expire(ctx, k, ttlSeconds*time.Second)
	_, _ = pipe.Exec(ctx)
}

// Leave: ZREM viewers:<path> <viewerId>
func (r *Redis) Leave(ctx context.Context, path, viewerID string) {
	r.rdb.ZRem(ctx, key(path), viewerID)
}

// Count: ZREMRANGEBYSCORE viewers:<path> 0 <now-90> ; then ZCARD viewers:<path>
func (r *Redis) Count(ctx context.Context, path string) int {
	k := key(path)
	cutoff := strconv.FormatInt(time.Now().Unix()-windowSeconds, 10)
	pipe := r.rdb.Pipeline()
	pipe.ZRemRangeByScore(ctx, k, "0", cutoff)
	card := pipe.ZCard(ctx, k)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0
	}
	return int(card.Val())
}

// Counts returns active viewer counts for many paths using a single pipeline.
func (r *Redis) Counts(ctx context.Context, paths []string) map[string]int {
	out := make(map[string]int, len(paths))
	if len(paths) == 0 {
		return out
	}

	cutoff := strconv.FormatInt(time.Now().Unix()-windowSeconds, 10)
	pipe := r.rdb.Pipeline()
	cards := make([]*redis.IntCmd, len(paths))
	for i, p := range paths {
		k := key(p)
		pipe.ZRemRangeByScore(ctx, k, "0", cutoff)
		cards[i] = pipe.ZCard(ctx, k)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		// Partial results may still be valid; fall through and read what we can.
		_ = err
	}
	for i, p := range paths {
		out[p] = int(cards[i].Val())
	}
	return out
}
