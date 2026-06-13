package backplane

import (
	"context"
	"sync"
	"time"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
)

// LocalBackplane is a single-process fallback used when Redis is unavailable.
// It mirrors the Redis semantics (publish fans out to all subscribers,
// presence with TTL) but only within one pod — so chat still works in local
// dev, just without horizontal scale.
type LocalBackplane struct {
	mu       sync.Mutex
	subs     map[string]map[chan message.Message]struct{}
	presence map[string]map[string]time.Time
}

func NewLocal() *LocalBackplane {
	return &LocalBackplane{
		subs:     make(map[string]map[chan message.Message]struct{}),
		presence: make(map[string]map[string]time.Time),
	}
}

func (b *LocalBackplane) Publish(_ context.Context, room string, msg message.Message) error {
	b.mu.Lock()
	chans := make([]chan message.Message, 0, len(b.subs[room]))
	for ch := range b.subs[room] {
		chans = append(chans, ch)
	}
	b.mu.Unlock()
	for _, ch := range chans {
		select {
		case ch <- msg:
		default: // slow consumer — drop rather than block the publisher
		}
	}
	return nil
}

func (b *LocalBackplane) Subscribe(ctx context.Context, room string) (<-chan message.Message, error) {
	ch := make(chan message.Message, 128)
	b.mu.Lock()
	if b.subs[room] == nil {
		b.subs[room] = make(map[chan message.Message]struct{})
	}
	b.subs[room][ch] = struct{}{}
	b.mu.Unlock()

	go func() {
		<-ctx.Done()
		b.mu.Lock()
		delete(b.subs[room], ch)
		if len(b.subs[room]) == 0 {
			delete(b.subs, room)
		}
		b.mu.Unlock()
		close(ch)
	}()
	return ch, nil
}

func (b *LocalBackplane) PresenceJoin(_ context.Context, room, clientID string) error {
	return b.touch(room, clientID)
}

func (b *LocalBackplane) PresenceRefresh(_ context.Context, room, clientID string) error {
	return b.touch(room, clientID)
}

func (b *LocalBackplane) touch(room, clientID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.presence[room] == nil {
		b.presence[room] = make(map[string]time.Time)
	}
	b.presence[room][clientID] = time.Now()
	return nil
}

func (b *LocalBackplane) PresenceLeave(_ context.Context, room, clientID string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if m := b.presence[room]; m != nil {
		delete(m, clientID)
		if len(m) == 0 {
			delete(b.presence, room)
		}
	}
	return nil
}

func (b *LocalBackplane) PresenceCount(_ context.Context, room string) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	cutoff := time.Now().Add(-PresenceTTLSeconds * time.Second)
	m := b.presence[room]
	n := 0
	for id, seen := range m {
		if seen.Before(cutoff) {
			delete(m, id)
			continue
		}
		n++
	}
	return n, nil
}

func (b *LocalBackplane) Close() error { return nil }
