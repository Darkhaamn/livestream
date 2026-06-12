package room

import (
	"context"
	"encoding/json"
	"log"
	"sync"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
	"nhooyr.io/websocket"
)

type Client struct {
	ID       string
	Username string
	Color    string
	conn     *websocket.Conn
	send     chan []byte
}

func NewClient(id, username, color string, conn *websocket.Conn) *Client {
	return &Client{
		ID: id, Username: username, Color: color,
		conn: conn, send: make(chan []byte, 64),
	}
}

func (c *Client) Write(ctx context.Context, data []byte) error {
	return c.conn.Write(ctx, websocket.MessageText, data)
}

type Room struct {
	Name    string
	clients map[string]*Client
	mu      sync.RWMutex
}

func New(name string) *Room {
	return &Room{Name: name, clients: make(map[string]*Client)}
}

func (r *Room) Join(c *Client) {
	r.mu.Lock()
	r.clients[c.ID] = c
	count := len(r.clients)
	r.mu.Unlock()
	log.Printf("room %s: %s joined (%d clients)", r.Name, c.Username, count)
}

func (r *Room) Leave(c *Client) {
	r.mu.Lock()
	delete(r.clients, c.ID)
	count := len(r.clients)
	r.mu.Unlock()
	log.Printf("room %s: %s left (%d clients)", r.Name, c.Username, count)
}

func (r *Room) Broadcast(ctx context.Context, msg message.Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	r.mu.RLock()
	clients := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		clients = append(clients, c)
	}
	r.mu.RUnlock()

	for _, c := range clients {
		if err := c.Write(ctx, data); err != nil {
			log.Printf("write to %s: %v", c.Username, err)
		}
	}
}

func (r *Room) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}
