package message

import "time"

type Type string

const (
	TypeChat   Type = "chat"
	TypeSystem Type = "system"
	TypeJoin   Type = "join"
	TypeLeave  Type = "leave"
	TypeError  Type = "error"
	// TypeClear tells clients to remove all messages from Target (a username),
	// used on ban/timeout. Empty Target clears the whole chat.
	TypeClear Type = "clear"
	// TypeDelete tells clients to remove a single message by Target (a message id).
	TypeDelete Type = "delete"
)

// Badge identifiers attached to a chat author.
const (
	BadgeBroadcaster = "broadcaster"
	BadgeMod         = "mod"
)

type Message struct {
	Type      Type      `json:"type"`
	ID        string    `json:"id,omitempty"`
	Room      string    `json:"room"`
	UserID    string    `json:"user_id,omitempty"`
	Username  string    `json:"username,omitempty"`
	Color     string    `json:"color,omitempty"`
	Text      string    `json:"text,omitempty"`
	Badges    []string  `json:"badges,omitempty"`
	Target    string    `json:"target,omitempty"` // username (clear) or message id (delete)
	Timestamp time.Time `json:"timestamp"`
}

func NewChat(room, id, userID, username, color, text string, badges []string) Message {
	return Message{
		Type: TypeChat, ID: id, Room: room, UserID: userID,
		Username: username, Color: color, Text: text, Badges: badges,
		Timestamp: time.Now().UTC(),
	}
}

func NewSystem(room, text string) Message {
	return Message{Type: TypeSystem, Room: room, Text: text, Timestamp: time.Now().UTC()}
}

// NewClear removes all messages from target (username); empty target = clear all.
func NewClear(room, target string) Message {
	return Message{Type: TypeClear, Room: room, Target: target, Timestamp: time.Now().UTC()}
}

// NewDelete removes a single message by id.
func NewDelete(room, msgID string) Message {
	return Message{Type: TypeDelete, Room: room, Target: msgID, Timestamp: time.Now().UTC()}
}

func NewJoin(room, userID, username string) Message {
	return Message{Type: TypeJoin, Room: room, UserID: userID, Username: username, Timestamp: time.Now().UTC()}
}

func NewLeave(room, userID, username string) Message {
	return Message{Type: TypeLeave, Room: room, UserID: userID, Username: username, Timestamp: time.Now().UTC()}
}

var usernameColors = []string{
	"#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff",
	"#ff6bff", "#ff9f43", "#48dbfb", "#ff9ff3",
}

func ColorForUser(userID string) string {
	if len(userID) == 0 {
		return usernameColors[0]
	}
	sum := 0
	for _, c := range userID {
		sum += int(c)
	}
	return usernameColors[sum%len(usernameColors)]
}
