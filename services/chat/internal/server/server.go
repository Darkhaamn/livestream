package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
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
	r.POST("/internal/rooms/reset", s.handleResetRoom)
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

	// Roles: owner is the channel username (room "live/<owner>"). A logged-in
	// viewer whose username == owner is the broadcaster; mods come from the
	// per-channel Redis set. Badges are computed once at connect.
	owner := strings.TrimPrefix(roomName, "live/")
	isGuest := strings.HasPrefix(userID, "guest_")
	isBroadcaster := !isGuest && username == owner
	isMod := false
	if !isGuest && !isBroadcaster {
		isMod, _ = s.bp.IsMod(c.Request.Context(), owner, username)
	}
	var badges []string
	if isBroadcaster {
		badges = []string{message.BadgeBroadcaster}
	} else if isMod {
		badges = []string{message.BadgeMod}
	}
	canModerate := isBroadcaster || isMod

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
			hm.Badges = s.badgesForMessage(ctx, owner, hm)
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

		// Moderation commands (broadcaster/mod only). Not published as chat.
		if strings.HasPrefix(text, "/") {
			if canModerate {
				s.handleCommand(ctx, conn, roomName, owner, isBroadcaster, text)
			} else {
				_ = client.Write(ctx, mustJSON(message.Message{
					Type: message.TypeError, Room: roomName,
					Text: "you are not a moderator", Timestamp: nowUTC(),
				}))
			}
			continue
		}

		// Enforce bans/timeouts for regular chatters (mods/broadcaster exempt).
		if !canModerate {
			if banned, _ := s.bp.IsBanned(ctx, owner, username); banned {
				_ = client.Write(ctx, mustJSON(message.Message{
					Type: message.TypeError, Room: roomName,
					Text: "you are banned or timed out in this channel", Timestamp: nowUTC(),
				}))
				continue
			}
		}

		msg := message.NewChat(roomName, randomHex(8), userID, username, color, text, badges)
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

// handleCommand executes a moderation command from a broadcaster/mod connection.
// Commands are control messages: they mutate Redis state and publish system /
// clear / delete events to the room, but are never echoed as chat.
func (s *Server) handleCommand(ctx context.Context, conn *websocket.Conn, room, owner string, isBroadcaster bool, text string) {
	fields := strings.Fields(text)
	cmd := strings.ToLower(fields[0])
	usage := func(m string) {
		_ = conn.Write(ctx, websocket.MessageText, mustJSON(message.Message{
			Type: message.TypeError, Room: room, Text: m, Timestamp: nowUTC(),
		}))
	}
	target := ""
	if len(fields) > 1 {
		target = fields[1]
	}

	switch cmd {
	case "/ban":
		if target == "" {
			usage("usage: /ban <username>")
			return
		}
		_ = s.bp.SetBan(ctx, owner, target, true)
		_ = s.bp.Publish(ctx, room, message.NewSystem(room, target+" was banned"))
		_ = s.bp.Publish(ctx, room, message.NewClear(room, target))
	case "/unban":
		if target == "" {
			usage("usage: /unban <username>")
			return
		}
		_ = s.bp.SetBan(ctx, owner, target, false)
		_ = s.bp.Publish(ctx, room, message.NewSystem(room, target+" was unbanned"))
	case "/timeout":
		if target == "" || len(fields) < 3 {
			usage("usage: /timeout <username> <seconds>")
			return
		}
		secs, err := strconv.Atoi(fields[2])
		if err != nil || secs <= 0 {
			usage("timeout seconds must be a positive number")
			return
		}
		_ = s.bp.SetTimeout(ctx, owner, target, secs)
		_ = s.bp.Publish(ctx, room, message.NewSystem(room, fmt.Sprintf("%s was timed out for %ds", target, secs)))
		_ = s.bp.Publish(ctx, room, message.NewClear(room, target))
	case "/delete":
		if target == "" {
			usage("usage: /delete <messageId>")
			return
		}
		_ = s.bp.Publish(ctx, room, message.NewDelete(room, target))
	case "/clear":
		_ = s.bp.Publish(ctx, room, message.NewClear(room, ""))
		_ = s.bp.Publish(ctx, room, message.NewSystem(room, "chat was cleared"))
	case "/mod", "/unmod":
		if !isBroadcaster {
			usage("only the broadcaster can assign moderators")
			return
		}
		if target == "" {
			usage("usage: " + cmd + " <username>")
			return
		}
		grant := cmd == "/mod"
		_ = s.bp.SetMod(ctx, owner, target, grant)
		verb := "is now a moderator"
		if !grant {
			verb = "is no longer a moderator"
		}
		_ = s.bp.Publish(ctx, room, message.NewSystem(room, target+" "+verb))
	default:
		usage("unknown command: " + cmd)
	}
}

func mustJSON(m message.Message) []byte {
	b, _ := json.Marshal(m)
	return b
}

func nowUTC() time.Time { return time.Now().UTC() }

// badgesForMessage restores broadcaster/mod badges on replayed history. Live
// messages already carry badges; Postgres history does not persist them yet.
func (s *Server) badgesForMessage(ctx context.Context, owner string, msg message.Message) []string {
	if msg.Type != message.TypeChat || msg.Username == "" {
		return msg.Badges
	}
	if len(msg.Badges) > 0 {
		return msg.Badges
	}
	if msg.Username == owner {
		return []string{message.BadgeBroadcaster}
	}
	if isMod, _ := s.bp.IsMod(ctx, owner, msg.Username); isMod {
		return []string{message.BadgeMod}
	}
	return nil
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

type resetRoomRequest struct {
	Room string `json:"room"`
}

// handleResetRoom wipes chat for a new broadcast session. Called by the API
// when a stream session starts.
func (s *Server) handleResetRoom(c *gin.Context) {
	var req resetRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Room == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "room required"})
		return
	}
	if !strings.HasPrefix(req.Room, "live/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room"})
		return
	}

	ctx := c.Request.Context()
	if s.store != nil {
		if err := s.store.ClearRoom(ctx, req.Room); err != nil {
			log.Printf("reset room %s: clear store: %v", req.Room, err)
		}
	}
	if err := s.bp.ResetRoom(ctx, req.Room); err != nil {
		log.Printf("reset room %s: backplane: %v", req.Room, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reset failed"})
		return
	}
	_ = s.bp.Publish(ctx, req.Room, message.NewSystem(req.Room, "Chat cleared for a new stream"))
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
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
