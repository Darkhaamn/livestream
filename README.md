# Live-Stream

Self-hosted live streaming platform built with MediaMTX, Go microservices, and a Next.js frontend. Supports RTMP/WHIP ingest, HLS/WebRTC playback, live chat, VOD recordings, and stream thumbnails.

## Project structure

```
Live-Stream/
├── frontend/           # Next.js web app
├── services/
│   ├── api/            # Auth, users, MediaMTX webhooks
│   ├── chat/           # WebSocket live chat
│   └── mtx-manager/    # MediaMTX proxy, VODs, thumbnails
├── deploy/             # Docker Compose, MediaMTX, nginx
├── recordings/         # Stream recordings (MediaMTX output)
└── thumbnails/         # Stream thumbnail images
```

## Prerequisites

- Docker & Docker Compose
- Go 1.22+
- Node.js 20+ and pnpm

## Quick start

### 1. Start infrastructure

```bash
cd deploy
docker compose up -d
```

This starts PostgreSQL, Redis, and MediaMTX.

### 2. Start backend services

In separate terminals:

```bash
cd services/api && go run ./cmd/api
cd services/chat && go run ./cmd/chat
cd services/mtx-manager && go run ./cmd/mtx-manager
```

### 3. Start frontend

```bash
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Services

| Service                                | Port | Description                          |
| -------------------------------------- | ---- | ------------------------------------ |
| [frontend](./frontend/)                | 3000 | Web UI — browse, watch, broadcast    |
| [api](./services/api/)                 | 8081 | User auth, profiles, stream keys     |
| [chat](./services/chat/)               | 8082 | Real-time chat over WebSocket        |
| [mtx-manager](./services/mtx-manager/) | 8080 | MediaMTX dashboard, VODs, thumbnails |
| MediaMTX HLS                           | 8888 | HLS playback                         |
| MediaMTX WebRTC                        | 8889 | WebRTC / WHIP                        |
| MediaMTX API                           | 9997 | MediaMTX control API                 |
| PostgreSQL                             | 5432 | Database                             |
| Redis                                  | 6379 | Cache                                |

## Environment

Copy `deploy/.env.example` and set values for each service. The frontend uses `frontend/.env.local.example`.

## Data directories

- `recordings/` — MP4 recordings written by MediaMTX (`<stream-path>/YYYY/MM/DD/HH-MM-SS.mp4`)
- `thumbnails/` — JPEG snapshots per stream path

Both are mounted into the MediaMTX container from `deploy/docker-compose.yml`.
