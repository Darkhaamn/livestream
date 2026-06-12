package message

import "time"

type Type string

const (
	TypeChat   Type = "chat"
	TypeSystem Type = "system"
	TypeJoin   Type = "join"
	TypeLeave  Type = "leave"
	TypeError  Type = "error"
)

type Message struct {
	Type      Type      `json:"type"`
	Room      string    `json:"room"`
	UserID    string    `json:"user_id,omitempty"`
	Username  string    `json:"username,omitempty"`
	Color     string    `json:"color,omitempty"`
	Text      string    `json:"text,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

func NewChat(room, userID, username, color, text string) Message {
	return Message{
		Type: TypeChat, Room: room, UserID: userID,
		Username: username, Color: color, Text: text,
		Timestamp: time.Now().UTC(),
	}
}

func NewSystem(room, text string) Message {
	return Message{Type: TypeSystem, Room: room, Text: text, Timestamp: time.Now().UTC()}
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
