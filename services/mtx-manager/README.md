# MTX Manager

Go service that sits in front of MediaMTX. Exposes a unified HTTP API for the frontend: live dashboard, broadcast config, viewer tracking, VOD listings, and thumbnail serving. Built with Gin.

## Responsibilities

- Proxy MediaMTX path/dashboard data with enriched viewer counts
- Serve stream thumbnails (ffmpeg capture + MediaMTX snapshots)
- List and serve VOD recordings from `recordings/`
- Broadcast ingest URLs and stream key generation
- Track active viewers via client ping/leave

## Run

```bash
go mod tidy
go run ./cmd/mtx-manager
```

Default listen address: `:8080`

Requires MediaMTX running (via `deploy/docker-compose.yml`).

### CLI modes

```bash
# Print current stream status once
go run ./cmd/mtx-manager -once

# Poll and print status every 3s
go run ./cmd/mtx-manager -watch
go run ./cmd/mtx-manager -watch -interval 5s
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_ADDR` | `:8080` | HTTP listen address |
| `MEDIAMTX_URL` | `http://localhost:9997` | MediaMTX API URL |
| `MEDIAMTX_USERNAME` | `admin` | MediaMTX API user |
| `MEDIAMTX_PASSWORD` | `admin123` | MediaMTX API password |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Allowed origins |
| `RTMP_INGEST_URL` | `rtmp://localhost` | RTMP ingest base |
| `HLS_PLAYBACK_URL` | `http://localhost:8888` | HLS playback base |
| `WHIP_INGEST_URL` | `http://localhost:8889/webrtc` | WHIP ingest URL |
| `WEBRTC_PLAYBACK_URL` | `http://localhost:8889/webrtc` | WebRTC playback base |
| `THUMBNAIL_DIR` | `../../thumbnails` | Thumbnail storage (repo root) |
| `THUMBNAIL_INTERVAL` | `10s` | ffmpeg snapshot interval |
| `RECORDINGS_DIR` | `../../recordings` | VOD storage (repo root) |
| `GIN_MODE` | `debug` | Gin mode |

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard` | Full MediaMTX dashboard + viewers |
| GET | `/api/paths` | All stream paths |
| GET | `/api/paths/:name` | Single path detail |
| GET | `/api/streams/live` | Online streams only |
| GET | `/api/members` | All connected members |
| GET | `/api/broadcast` | Ingest/playback URLs |
| POST | `/api/broadcast/key` | Generate a random stream key |
| POST | `/api/viewers/ping` | Register viewer heartbeat |
| POST | `/api/viewers/leave` | Remove viewer |
| GET | `/api/thumbnails/*path` | JPEG thumbnail for a stream |
| GET | `/api/vods` | List recordings (`?path=` to filter) |
| GET | `/api/vods/file/*id` | Serve a recording MP4 |

The frontend accesses these via Next.js rewrites at `/api/*`.

## Project layout

```
cmd/mtx-manager/  Entry point
internal/
  api/            Gin HTTP handlers
  mediamtx/       MediaMTX API client
  thumbnails/     ffmpeg snapshot worker
  vods/           Recording file listing and serving
  viewers/        Active viewer tracker
  middleware/     CORS
  config/         Environment config
```

## Data paths

Recordings and thumbnails live at the repo root and are shared with the MediaMTX Docker container:

```
recordings/<stream-path>/YYYY/MM/DD/HH-MM-SS.mp4
thumbnails/<stream-path>.jpg
```
