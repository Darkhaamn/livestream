# API Service

Go service for user authentication, profiles, stream keys, and MediaMTX webhook integration. Built with Gin and GORM.

## Responsibilities

- User registration, login, JWT refresh/logout
- Public user profiles and live session history
- Stream key generation and regeneration
- MediaMTX HTTP auth and stream lifecycle hooks

## Run

```bash
go mod tidy
go run ./cmd/api
```

Default listen address: `:8081`

Requires PostgreSQL (and optionally Redis) from `deploy/docker-compose.yml`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_ADDR` | `:8081` | HTTP listen address |
| `DATABASE_URL` | `postgres://livestream:livestream_secret@localhost:5432/livestream` | PostgreSQL DSN |
| `REDIS_URL` | `redis://:redis_secret@localhost:6379/0` | Redis URL (optional) |
| `JWT_SECRET` | — | JWT signing secret (min 32 chars in production) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `MEDIAMTX_URL` | `http://localhost:9997` | MediaMTX API URL |
| `GIN_MODE` | `debug` | Gin mode (`release` for production) |

## API routes

### Public (`/api/v1`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login, returns tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/users/:username` | Public profile (use `me` when authenticated) |
| GET | `/users/:username/sessions` | Past live sessions |

### Authenticated (`/api/v1/users`, requires Bearer token)

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/me` | Update profile |
| POST | `/me/stream-key` | Regenerate RTMP stream key |

### Internal (`/internal/mtx`, called by MediaMTX)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth` | Publish auth — validates stream key |
| POST | `/stream-started` | Stream went live |
| POST | `/stream-stopped` | Stream ended |

## Project layout

```
cmd/api/          Entry point
internal/
  auth/           JWT auth service and handlers
  user/           User CRUD and profiles
  mtxhook/        MediaMTX webhook handlers
  db/             GORM connection and migrations
  middleware/     CORS, JWT auth
  config/         Environment config
```
