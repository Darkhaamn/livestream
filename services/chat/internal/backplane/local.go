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
	mod      *modState
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

func (b *LocalBackplane) ResetRoom(ctx context.Context, room string) error {
	return b.Publish(ctx, room, message.NewClear(room, ""))
}

// --- Moderation (per channel owner), in-process ---

type modState struct {
	bans     map[string]map[string]struct{}  // owner -> set of banned usernames
	timeouts map[string]map[string]time.Time // owner -> username -> expiry
	mods     map[string]map[string]struct{}  // owner -> set of mod usernames
}

func (b *LocalBackplane) ensureMod() *modState {
	if b.mod == nil {
		b.mod = &modState{
			bans:     map[string]map[string]struct{}{},
			timeouts: map[string]map[string]time.Time{},
			mods:     map[string]map[string]struct{}{},
		}
	}
	return b.mod
}

func (b *LocalBackplane) IsBanned(_ context.Context, owner, username string) (bool, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := b.ensureMod()
	if s := m.bans[owner]; s != nil {
		if _, ok := s[username]; ok {
			return true, nil
		}
	}
	if t := m.timeouts[owner]; t != nil {
		if exp, ok := t[username]; ok {
			if time.Now().Before(exp) {
				return true, nil
			}
			delete(t, username)
		}
	}
	return false, nil
}

func (b *LocalBackplane) SetBan(_ context.Context, owner, username string, banned bool) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := b.ensureMod()
	if banned {
		if m.bans[owner] == nil {
			m.bans[owner] = map[string]struct{}{}
		}
		m.bans[owner][username] = struct{}{}
	} else {
		delete(m.bans[owner], username)
		delete(m.timeouts[owner], username)
	}
	return nil
}

func (b *LocalBackplane) SetTimeout(_ context.Context, owner, username string, seconds int) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := b.ensureMod()
	if m.timeouts[owner] == nil {
		m.timeouts[owner] = map[string]time.Time{}
	}
	m.timeouts[owner][username] = time.Now().Add(time.Duration(seconds) * time.Second)
	return nil
}

func (b *LocalBackplane) IsMod(_ context.Context, owner, username string) (bool, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := b.ensureMod()
	if s := m.mods[owner]; s != nil {
		_, ok := s[username]
		return ok, nil
	}
	return false, nil
}

func (b *LocalBackplane) SetMod(_ context.Context, owner, username string, isMod bool) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	m := b.ensureMod()
	if isMod {
		if m.mods[owner] == nil {
			m.mods[owner] = map[string]struct{}{}
		}
		m.mods[owner][username] = struct{}{}
	} else {
		delete(m.mods[owner], username)
	}
	return nil
}

func (b *LocalBackplane) Close() error { return nil }
