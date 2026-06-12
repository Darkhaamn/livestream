# Frontend

Next.js web application for the Live-Stream platform. Provides the homepage, channel pages, live watch experience, and broadcast setup.

## Stack

- Next.js 16 (App Router)
- React 19
- Tailwind CSS 4
- shadcn/ui
- HLS.js / Plyr for playback

## Pages

| Route | Description |
|-------|-------------|
| `/` | Live stream grid |
| `/[username]` | Channel page (live + VODs) |
| `/watch/[key]` | Watch a stream by path key |
| `/broadcast` | Broadcast setup (RTMP / WebRTC ingest) |

## API proxying

The frontend proxies MediaMTX manager routes through Next.js rewrites (configured in `next.config.ts`):

- `/api/health`, `/api/dashboard`, `/api/paths`, `/api/streams`, `/api/members`
- `/api/broadcast`, `/api/thumbnails`

Auth and user routes call the API service directly via `NEXT_PUBLIC_API_URL`.

## Setup

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8081` | API service base URL |
| `NEXT_PUBLIC_CHAT_URL` | `ws://localhost:8082` | Chat WebSocket base URL |
| `NEXT_PUBLIC_MTX_API_URL` | `http://localhost:8080` | MTX manager URL (used by rewrites) |
| `MTX_API_URL` | `http://localhost:8080` | Server-side rewrite target |

## Scripts

```bash
pnpm dev        # Development server (port 3000)
pnpm build      # Production build
pnpm start      # Run production build
pnpm lint       # ESLint
pnpm typecheck  # TypeScript check
```

## Adding UI components

```bash
npx shadcn@latest add button
```

Components are placed in `components/ui/`.
