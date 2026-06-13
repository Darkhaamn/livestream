package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/backplane"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/hub"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/room"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// presenceHeartbeat: how often a live connection refreshes its presence entry.
// Must be well under backplane.PresenceTTLSeconds so entries don't expire while connected.
const presenceHeartbeat = 20 * time.Second

type Server struct {
	hub         *hub.Hub
	bp          backplane.Backplane
	store       *store.Store
	jwtSecret   string
	corsOrigins map[string]bool
}

// New creates a chat server. st may be nil — chat then runs without history.
func New(h *hub.Hub, bp backplane.Backplane, st *store.Store, jwtSecret string, origins []string) *Server {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return &Server{hub: h, bp: bp, store: st, jwtSecret: jwtSecret, corsOrigins: allowed}
}

// Register attaches the chat routes to the given gin engine.
func (s *Server) Register(r *gin.Engine) {
	r.GET("/ws/*room", s.handleWS)
	r.GET("/rooms/count/*room", s.handleCount)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
}

type incomingMsg struct {
	Text string `json:"text"`
}

func (s *Server) handleWS(c *gin.Context) {
	roomName := strings.TrimPrefix(c.Param("room"), "/")
	if roomName == "" {
		c.String(http.StatusBadRequest, "room required")
		return
	}

	userID, username := s.extractUser(c.Request)
	color := message.ColorForUser(userID)
	// connID uniquely identifies THIS websocket connection for presence — two
	// tabs from the same user (or two guests) must not collapse to one entry
	// for chat fan-out, but presence is keyed by connID so counts stay correct.
	connID := userID + ":" + randomHex(6)

	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		OriginPatterns: s.originPatterns(),
	})
	if err != nil {
		log.Printf("ws accept: %v", err)
		return
	}
	defer conn.CloseNow()

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Hour)
	defer cancel()

	client := room.NewClient(connID, username, color, conn)

	// Replay durable history to THIS client only (from Postgres), before joining.
	if s.store != nil {
		for _, hm := range s.store.History(ctx, roomName, 50) {
			data, err := json.Marshal(hm)
			if err != nil {
				continue
			}
			if err := client.Write(ctx, data); err != nil {
				break
			}
		}
	}

	// Join local fan-out + global presence, then announce via the backplane so
	// every pod (not just this one) sees the join.
	s.hub.Join(roomName, client)
	_ = s.bp.PresenceJoin(ctx, roomName, connID)
	_ = s.bp.Publish(ctx, roomName, message.NewJoin(roomName, userID, username))

	stopHeartbeat := make(chan struct{})
	go s.heartbeat(ctx, roomName, connID, stopHeartbeat)

	defer func() {
		close(stopHeartbeat)
		s.hub.Leave(roomName, client)
		bg := context.Background()
		_ = s.bp.PresenceLeave(bg, roomName, connID)
		_ = s.bp.Publish(bg, roomName, message.NewLeave(roomName, userID, username))
	}()

	conn.SetReadLimit(512)
	for {
		var incoming incomingMsg
		if err := wsjson.Read(ctx, conn, &incoming); err != nil {
			break
		}
		text := strings.TrimSpace(incoming.Text)
		if text == "" || len(text) > 500 {
			continue
		}
		msg := message.NewChat(roomName, userID, username, color, text)
		if s.store != nil {
			go s.store.Save(msg)
		}
		// Publish to the backplane only — the room's subscriber delivers it back
		// to local clients too, giving a single global ordering source (no
		// double-send, no per-pod ordering divergence).
		if err := s.bp.Publish(ctx, roomName, msg); err != nil {
			log.Printf("publish room=%s: %v", roomName, err)
		}
	}
}

func (s *Server) heartbeat(ctx context.Context, room, connID string, stop <-chan struct{}) {
	t := time.NewTicker(presenceHeartbeat)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			_ = s.bp.PresenceRefresh(ctx, room, connID)
		case <-stop:
			return
		case <-ctx.Done():
			return
		}
	}
}

func (s *Server) handleCount(c *gin.Context) {
	roomName := strings.TrimPrefix(c.Param("room"), "/")
	n, err := s.bp.PresenceCount(c.Request.Context(), roomName)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"count": 0})
		return
	}
	c.JSON(http.StatusOK, gin.H{"count": n})
}

func (s *Server) extractUser(r *http.Request) (id, username string) {
	token := bearerToken(r)
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		return guestIdentity()
	}
	t, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		return []byte(s.jwtSecret), nil
	})
	if err != nil || !t.Valid {
		return guestIdentity()
	}
	claims, ok := t.Claims.(jwt.MapClaims)
	if !ok {
		return guestIdentity()
	}
	uid, _ := claims["uid"].(string)
	uname, _ := claims["username"].(string)
	if uid == "" {
		return guestIdentity()
	}
	return uid, uname
}

// guestIdentity returns a random, per-connection guest id. Random (not
// IP-derived) so that behind a load balancer or CDN — where many clients share
// a forwarded IP — guests don't collide onto one id or get spoofed.
func guestIdentity() (id, username string) {
	g := randomHex(5)
	return "guest_" + g, "Guest_" + g
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "000000000000"[:n*2]
	}
	return hex.EncodeToString(b)
}

// originPatterns converts allowed origins to host patterns —
// nhooyr.io/websocket matches against the Origin host (e.g. "localhost:3000"),
// not the full URL.
func (s *Server) originPatterns() []string {
	patterns := make([]string, 0, len(s.corsOrigins))
	for o := range s.corsOrigins {
		host := strings.TrimPrefix(strings.TrimPrefix(o, "https://"), "http://")
		patterns = append(patterns, host)
	}
	return patterns
}

func bearerToken(r *http.Request) string {
	v := r.Header.Get("Authorization")
	if !strings.HasPrefix(v, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(v, "Bearer ")
}
