package server

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/darkhanbayarerdenebat/livestream-chat/internal/hub"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/message"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/room"
	"github.com/darkhanbayarerdenebat/livestream-chat/internal/store"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

type Server struct {
	hub         *hub.Hub
	store       *store.Store
	jwtSecret   string
	corsOrigins map[string]bool
}

// New creates a chat server. st may be nil — chat then runs without history.
func New(h *hub.Hub, st *store.Store, jwtSecret string, origins []string) *Server {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return &Server{hub: h, store: st, jwtSecret: jwtSecret, corsOrigins: allowed}
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

	rm := s.hub.GetOrCreate(roomName)
	client := room.NewClient(userID, username, color, conn)

	// Replay recent history to this client only, before joining the room.
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

	rm.Join(client)
	defer func() {
		rm.Leave(client)
		rm.Broadcast(ctx, message.NewLeave(roomName, userID, username))
	}()

	rm.Broadcast(ctx, message.NewJoin(roomName, userID, username))

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
		rm.Broadcast(ctx, msg)
	}
}

func (s *Server) handleCount(c *gin.Context) {
	roomName := strings.TrimPrefix(c.Param("room"), "/")
	c.JSON(http.StatusOK, gin.H{"count": s.hub.RoomCount(roomName)})
}

func (s *Server) extractUser(r *http.Request) (id, username string) {
	token := bearerToken(r)
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		return anonID(r), "Guest_" + anonID(r)[:6]
	}
	t, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		return []byte(s.jwtSecret), nil
	})
	if err != nil || !t.Valid {
		return anonID(r), "Guest_" + anonID(r)[:6]
	}
	claims := t.Claims.(jwt.MapClaims)
	uid, _ := claims["uid"].(string)
	uname, _ := claims["username"].(string)
	if uid == "" {
		return anonID(r), "Guest_" + anonID(r)[:6]
	}
	return uid, uname
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

func anonID(r *http.Request) string {
	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = strings.Split(xff, ",")[0]
	}
	sum := 0
	for _, c := range ip {
		sum += int(c)
	}
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, 8)
	for i := range result {
		result[i] = chars[(sum+i*7)%len(chars)]
	}
	return string(result)
}
