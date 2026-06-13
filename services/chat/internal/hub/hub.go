package hub

import (
	"context"
	"log"
	"sync"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/backplane"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/room"
)

// Hub owns this pod's local rooms. Each room runs exactly one backplane
// subscription (shared by all local clients in that room) that fans incoming
// messages out to the local WebSocket connections. The subscription starts
// when the first client joins the room on this pod and stops when the last
// one leaves.
type Hub struct {
	bp    backplane.Backplane
	rooms map[string]*roomState
	mu    sync.Mutex
}

type roomState struct {
	room   *room.Room
	cancel context.CancelFunc
}

func New(bp backplane.Backplane) *Hub {
	return &Hub{bp: bp, rooms: make(map[string]*roomState)}
}

// Join adds a client to the room on this pod, starting the backplane
// subscription if this is the first local client.
func (h *Hub) Join(name string, c *room.Client) {
	h.mu.Lock()
	st, ok := h.rooms[name]
	if !ok {
		ctx, cancel := context.WithCancel(context.Background())
		rm := room.New(name)
		st = &roomState{room: rm, cancel: cancel}
		h.rooms[name] = st
		h.startConsumer(ctx, rm)
	}
	h.mu.Unlock()
	st.room.Join(c)
}

// Leave removes a client and tears down the subscription if the room is now
// empty on this pod.
func (h *Hub) Leave(name string, c *room.Client) {
	h.mu.Lock()
	st, ok := h.rooms[name]
	if !ok {
		h.mu.Unlock()
		return
	}
	st.room.Leave(c)
	if st.room.Count() == 0 {
		st.cancel()
		delete(h.rooms, name)
	}
	h.mu.Unlock()
}

// startConsumer subscribes to the backplane for a room and fans every received
// message out to the room's local clients. Runs until the room's ctx is cancelled.
func (h *Hub) startConsumer(ctx context.Context, rm *room.Room) {
	ch, err := h.bp.Subscribe(ctx, rm.Name)
	if err != nil {
		log.Printf("hub: subscribe room=%s: %v", rm.Name, err)
		return
	}
	go func() {
		for msg := range ch {
			rm.Broadcast(ctx, msg)
		}
	}()
}
