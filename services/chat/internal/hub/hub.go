package hub

import (
	"sync"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/room"
)

type Hub struct {
	rooms map[string]*room.Room
	mu    sync.RWMutex
}

func New() *Hub {
	return &Hub{rooms: make(map[string]*room.Room)}
}

func (h *Hub) GetOrCreate(name string) *room.Room {
	h.mu.RLock()
	if r, ok := h.rooms[name]; ok {
		h.mu.RUnlock()
		return r
	}
	h.mu.RUnlock()

	h.mu.Lock()
	defer h.mu.Unlock()
	if r, ok := h.rooms[name]; ok {
		return r
	}
	r := room.New(name)
	h.rooms[name] = r
	return r
}

func (h *Hub) RoomCount(name string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if r, ok := h.rooms[name]; ok {
		return r.Count()
	}
	return 0
}
