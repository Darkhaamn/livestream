// Package backplane decouples chat fan-out from a single process so multiple
// chat pods can serve the same room. Every message (chat/join/leave) is
// published to the backplane; each pod subscribes and fans out to its own
// local WebSocket clients. Presence (live counts) is tracked globally too.
package backplane

import (
	"context"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
)

// Backplane is the cross-pod transport + presence store for chat rooms.
//
// Implementations: RedisBackplane (multi-pod, Redis Streams + ZSET) and
// LocalBackplane (single process, in-memory) used as a dev fallback.
type Backplane interface {
	// Publish appends a message to the room's ordered log. Every subscriber
	// (including the publishing pod) receives it via Subscribe.
	Publish(ctx context.Context, room string, msg message.Message) error

	// Subscribe returns a channel of new messages for a room. The stream lives
	// until ctx is cancelled, at which point the channel is closed.
	Subscribe(ctx context.Context, room string) (<-chan message.Message, error)

	// PresenceJoin / PresenceRefresh / PresenceLeave maintain a self-healing
	// global presence set. Refresh is called periodically so a crashed pod's
	// entries expire instead of inflating the count forever.
	PresenceJoin(ctx context.Context, room, clientID string) error
	PresenceRefresh(ctx context.Context, room, clientID string) error
	PresenceLeave(ctx context.Context, room, clientID string) error

	// PresenceCount returns the current global occupant count for a room.
	PresenceCount(ctx context.Context, room string) (int, error)

	// ResetRoom wipes the live transport log for a room. Postgres history is
	// cleared separately by the store. Publishes a clear event to connected clients.
	ResetRoom(ctx context.Context, room string) error

	// Moderation state, scoped per channel owner (the username in "live/<owner>").
	// Bans/timeouts and mod grants are keyed by username so they survive
	// reconnects. IsBanned is true while a permanent ban or an unexpired timeout exists.
	IsBanned(ctx context.Context, owner, username string) (bool, error)
	SetBan(ctx context.Context, owner, username string, banned bool) error
	SetTimeout(ctx context.Context, owner, username string, seconds int) error
	IsMod(ctx context.Context, owner, username string) (bool, error)
	SetMod(ctx context.Context, owner, username string, isMod bool) error

	Close() error
}

const (
	// PresenceTTLSeconds: an occupant entry older than this is considered gone.
	PresenceTTLSeconds = 60
	// streamMaxLen bounds the live transport log; durable history lives in Postgres.
	streamMaxLen = 1000
)
