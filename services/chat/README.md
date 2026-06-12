# Chat Service

Real-time WebSocket chat for live streams. Built with Gin and nhooyr.io/websocket. Messages are persisted to PostgreSQL when the database is available.

## Responsibilities

- Per-room WebSocket chat (one room per stream path)
- Join/leave notifications and message broadcast
- Chat history replay on connect (last 50 messages)
- Guest support for unauthenticated viewers
- Authenticated users identified via JWT from the API service

## Run

```bash
go mod tidy
go run ./cmd/chat
```

Default listen address: `:8082`

Requires PostgreSQL from `deploy/docker-compose.yml` for message history.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAT_ADDR` | `:8082` | HTTP/WebSocket listen address |
| `JWT_SECRET` | — | Must match API service `JWT_SECRET` |
| `DATABASE_URL` | `postgres://livestream:livestream_secret@localhost:5432/livestream` | PostgreSQL DSN |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `GIN_MODE` | `debug` | Gin mode |

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ws/:room` | WebSocket chat for a stream path (e.g. `/ws/live/username`) |
| GET | `/rooms/count/:room` | Active client count in a room |

## WebSocket protocol

Connect to `/ws/<stream-path>`. Optionally pass a JWT via `Authorization: Bearer <token>` header or `?token=` query param.

**Send** (JSON):

```json
{ "text": "Hello chat!" }
```

**Receive** — chat messages, join, and leave events (see `internal/message/`).

Messages are limited to 500 characters.

## Project layout

```
cmd/chat/         Entry point
internal/
  hub/            Room registry
  room/           Per-room client management
  server/         HTTP/WebSocket handlers
  store/          PostgreSQL message persistence
  message/        Message types and serialization
  config/         Environment config
```
