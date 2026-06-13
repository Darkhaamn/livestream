package backplane

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
)

// RedisBackplane fans messages out across pods using one Redis Stream per room
// (XADD/XREAD — globally ordered, monotonic IDs) and tracks presence in a
// per-room sorted set scored by last-seen time (self-healing on pod crash).
type RedisBackplane struct {
	rdb *redis.Client
}

func NewRedis(redisURL string) (*RedisBackplane, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	rdb := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &RedisBackplane{rdb: rdb}, nil
}

func streamKey(room string) string   { return "chat:stream:" + room }
func presenceKey(room string) string { return "chat:presence:" + room }

func (b *RedisBackplane) Publish(ctx context.Context, room string, msg message.Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return b.rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey(room),
		MaxLen: streamMaxLen,
		Approx: true,
		Values: map[string]any{"d": data},
	}).Err()
}

func (b *RedisBackplane) Subscribe(ctx context.Context, room string) (<-chan message.Message, error) {
	ch := make(chan message.Message, 128)
	go func() {
		defer close(ch)
		// "$" = only messages published after we subscribe; durable history is
		// replayed from Postgres on connect, so we never want the backlog here.
		lastID := "$"
		for {
			if ctx.Err() != nil {
				return
			}
			res, err := b.rdb.XRead(ctx, &redis.XReadArgs{
				Streams: []string{streamKey(room), lastID},
				Block:   2 * time.Second,
				Count:   64,
			}).Result()
			if err != nil {
				if err == redis.Nil || ctx.Err() != nil {
					continue // block timeout with no data, or shutting down
				}
				log.Printf("backplane: XRead room=%s: %v", room, err)
				time.Sleep(time.Second)
				continue
			}
			for _, stream := range res {
				for _, entry := range stream.Messages {
					lastID = entry.ID
					raw, ok := entry.Values["d"].(string)
					if !ok {
						continue
					}
					var msg message.Message
					if json.Unmarshal([]byte(raw), &msg) != nil {
						continue
					}
					select {
					case ch <- msg:
					case <-ctx.Done():
						return
					}
				}
			}
		}
	}()
	return ch, nil
}

func (b *RedisBackplane) PresenceJoin(ctx context.Context, room, clientID string) error {
	return b.touch(ctx, room, clientID)
}

func (b *RedisBackplane) PresenceRefresh(ctx context.Context, room, clientID string) error {
	return b.touch(ctx, room, clientID)
}

func (b *RedisBackplane) touch(ctx context.Context, room, clientID string) error {
	key := presenceKey(room)
	now := float64(time.Now().Unix())
	pipe := b.rdb.Pipeline()
	pipe.ZAdd(ctx, key, redis.Z{Score: now, Member: clientID})
	pipe.Expire(ctx, key, 2*PresenceTTLSeconds*time.Second)
	_, err := pipe.Exec(ctx)
	return err
}

func (b *RedisBackplane) PresenceLeave(ctx context.Context, room, clientID string) error {
	return b.rdb.ZRem(ctx, presenceKey(room), clientID).Err()
}

func (b *RedisBackplane) PresenceCount(ctx context.Context, room string) (int, error) {
	key := presenceKey(room)
	cutoff := float64(time.Now().Add(-PresenceTTLSeconds * time.Second).Unix())
	// Prune stale entries (crashed pods, dropped connections) then count.
	if err := b.rdb.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%f", cutoff)).Err(); err != nil {
		return 0, err
	}
	n, err := b.rdb.ZCard(ctx, key).Result()
	return int(n), err
}

func (b *RedisBackplane) ResetRoom(ctx context.Context, room string) error {
	pipe := b.rdb.Pipeline()
	pipe.Del(ctx, streamKey(room))
	if _, err := pipe.Exec(ctx); err != nil {
		return err
	}
	return b.Publish(ctx, room, message.NewClear(room, ""))
}

// --- Moderation (per channel owner) ---

func banKey(owner string) string                 { return "chat:ban:" + owner }
func timeoutKey(owner, username string) string   { return "chat:timeout:" + owner + ":" + username }
func modKey(owner string) string                 { return "chat:mods:" + owner }

func (b *RedisBackplane) IsBanned(ctx context.Context, owner, username string) (bool, error) {
	banned, err := b.rdb.SIsMember(ctx, banKey(owner), username).Result()
	if err != nil {
		return false, err
	}
	if banned {
		return true, nil
	}
	n, err := b.rdb.Exists(ctx, timeoutKey(owner, username)).Result()
	return n > 0, err
}

func (b *RedisBackplane) SetBan(ctx context.Context, owner, username string, banned bool) error {
	if banned {
		return b.rdb.SAdd(ctx, banKey(owner), username).Err()
	}
	// Unban also clears any active timeout.
	pipe := b.rdb.Pipeline()
	pipe.SRem(ctx, banKey(owner), username)
	pipe.Del(ctx, timeoutKey(owner, username))
	_, err := pipe.Exec(ctx)
	return err
}

func (b *RedisBackplane) SetTimeout(ctx context.Context, owner, username string, seconds int) error {
	return b.rdb.Set(ctx, timeoutKey(owner, username), "1", time.Duration(seconds)*time.Second).Err()
}

func (b *RedisBackplane) IsMod(ctx context.Context, owner, username string) (bool, error) {
	return b.rdb.SIsMember(ctx, modKey(owner), username).Result()
}

func (b *RedisBackplane) SetMod(ctx context.Context, owner, username string, isMod bool) error {
	if isMod {
		return b.rdb.SAdd(ctx, modKey(owner), username).Err()
	}
	return b.rdb.SRem(ctx, modKey(owner), username).Err()
}

func (b *RedisBackplane) Close() error { return b.rdb.Close() }
