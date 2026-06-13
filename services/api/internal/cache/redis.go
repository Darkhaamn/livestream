package cache

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type Cache struct {
	client *redis.Client
}

func New(redisURL string) (*Cache, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &Cache{client: client}, nil
}

func (c *Cache) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	return c.client.Set(ctx, key, value, ttl).Err()
}

func (c *Cache) Get(ctx context.Context, key string) (string, error) {
	return c.client.Get(ctx, key).Result()
}

func (c *Cache) Del(ctx context.Context, keys ...string) error {
	return c.client.Del(ctx, keys...).Err()
}

func (c *Cache) Client() *redis.Client {
	return c.client
}

// ViewerCounts reads live viewer counts for the given MediaMTX paths using the
// shared Redis presence contract. For each path it prunes stale members
// (score < now-90s) then reads ZCARD. All paths are batched into a single
// round-trip via a pipeline. The returned map is keyed by path; any path that
// errors (or if Redis is unavailable) yields a count of 0. This method never
// returns an error so callers can degrade gracefully.
func (c *Cache) ViewerCounts(ctx context.Context, paths []string) map[string]int {
	counts := make(map[string]int, len(paths))
	for _, p := range paths {
		counts[p] = 0
	}
	if c == nil || c.client == nil || len(paths) == 0 {
		return counts
	}

	cutoff := time.Now().Add(-90 * time.Second).Unix()
	pipe := c.client.Pipeline()
	cards := make(map[string]*redis.IntCmd, len(paths))
	for _, p := range paths {
		key := ViewersKey(p)
		pipe.ZRemRangeByScore(ctx, key, "0", strconv.FormatInt(cutoff, 10))
		cards[p] = pipe.ZCard(ctx, key)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		// Pipeline-level failure: degrade to zeros.
		return counts
	}
	for p, cmd := range cards {
		if n, err := cmd.Result(); err == nil {
			counts[p] = int(n)
		}
	}
	return counts
}

func UserKey(id string) string       { return "user:" + id }
func SessionKey(token string) string { return "session:" + token }
func RateLimitKey(ip string) string  { return "rl:" + ip }

// ViewersKey returns the shared presence ZSET key for a MediaMTX path,
// e.g. ViewersKey("live/alice") == "viewers:live/alice".
func ViewersKey(path string) string { return "viewers:" + path }

// DiscoveryLiveKey is the cache key holding the assembled live-streams array.
const DiscoveryLiveKey = "discovery:live"
