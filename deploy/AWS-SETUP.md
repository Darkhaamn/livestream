# AWS setup guide — EC2 + S3 + CloudFront

Step-by-step guide to deploy Live-Stream on AWS for **testing**:

| AWS service | Role |
|-------------|------|
| **EC2** | Docker stack: frontend, API, chat, mtx-manager, Postgres, Redis, MediaMTX, nginx |
| **S3** | Recordings + thumbnails (synced from EC2) |
| **CloudFront** | CDN for live HLS + VOD/thumbnail media |
| **Route 53** (optional) | DNS for app, CDN, ingest domains |

Replace `yourdomain.com` and `your-livestream-media` with your values throughout.

---

## Architecture

```text
                         ┌─────────────────────────────────────┐
                         │              EC2 instance            │
  OBS / streamer         │  nginx :80                           │
  RTMP :1935 ─────────►│    ├─ /           → frontend         │
                         │    ├─ /api/v1/    → api              │
                         │    ├─ /api/       → mtx-manager      │
                         │    ├─ /ws/        → chat             │
                         │    └─ /hls/       → MediaMTX :8888  │◄── CloudFront (cdn)
                         │  MediaMTX writes → /data/recordings  │
                         │  mtx-manager     → /data/thumbnails  │
                         │  s3-sync (60s)   ────────────────────┼──► S3 bucket
                         └─────────────────────────────────────┘
                                                                    │
                                                         CloudFront (media) ──► viewers
```

**Traffic split**

| Traffic | Path | Where |
|---------|------|--------|
| App UI, API, chat | `https://app.yourdomain.com` | EC2 nginx |
| Live playback (HLS) | `https://cdn.yourdomain.com/hls/live/{user}/index.m3u8` | CloudFront → EC2 `/hls/` |
| VOD + thumbnails | `https://media.yourdomain.com/recordings/...` | CloudFront → S3 |
| RTMP ingest | `rtmp://ingest.yourdomain.com/live/{user}` | EC2 :1935 direct |

---

## Before you start

### What you need

- AWS account
- A domain (Route 53 or any DNS provider)
- SSH key pair for EC2
- Git access to this repo

### Recommended instance (test)

| Setting | Value |
|---------|--------|
| Type | `c6g.xlarge` or `c8g.xlarge` (Graviton / ARM) |
| OS | Ubuntu 24.04 LTS **64-bit (Arm)** |
| Root volume | 100 GB gp3 |
| Region | e.g. `ap-southeast-1` (pick one close to you) |

Rough capacity on one `c8g.xlarge`: ~5 concurrent streamers, ~80–120 WebRTC viewers. For more viewers, use **HLS + CloudFront** (this guide).

### Domains to plan

| Subdomain | Points to |
|-----------|-----------|
| `app.yourdomain.com` | EC2 (or CloudFront in front of app) |
| `cdn.yourdomain.com` | CloudFront → EC2 HLS origin |
| `media.yourdomain.com` | CloudFront → S3 |
| `ingest.yourdomain.com` | EC2 public IP (RTMP, A record) |

---

## Step 1 — S3 bucket

### 1.1 Create bucket (Console)

1. Open **S3** → **Create bucket**
2. Bucket name: `your-livestream-media` (globally unique)
3. Region: same as EC2 (e.g. `ap-southeast-1`)
4. **Block all public access**: ON (CloudFront OAC reads privately)
5. Create bucket

### 1.2 Create bucket (CLI)

```bash
export AWS_REGION=ap-southeast-1
export S3_BUCKET=your-livestream-media

aws s3 mb "s3://${S3_BUCKET}" --region "$AWS_REGION"
```

### 1.3 CORS (for browser VOD/thumbnail requests)

S3 → bucket → **Permissions** → **Cross-origin resource sharing (CORS)**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://app.yourdomain.com"
    ],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 1.4 Lifecycle (optional, saves cost later)

Delete old test recordings after 30 days:

```json
{
  "Rules": [
    {
      "ID": "expire-old-recordings",
      "Status": "Enabled",
      "Filter": { "Prefix": "recordings/" },
      "Expiration": { "Days": 30 }
    }
  ]
}
```

---

## Step 2 — IAM role for EC2

The `s3-sync` container uses the **instance profile** — no access keys on the server.

### 2.1 Create policy

IAM → **Policies** → **Create policy** → JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LiveStreamS3Sync",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::your-livestream-media"
    },
    {
      "Sid": "LiveStreamS3Objects",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::your-livestream-media/*"
    }
  ]
}
```

Name it `LiveStreamS3SyncPolicy`.

### 2.2 Create role

1. IAM → **Roles** → **Create role**
2. Trusted entity: **AWS service** → **EC2**
3. Attach `LiveStreamS3SyncPolicy`
4. Role name: `LiveStreamEC2Role`

You will attach this role when launching EC2.

---

## Step 3 — Security group

Create security group `livestream-sg` in the same VPC as EC2.

### Inbound rules (test setup)

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | Your IP `/32` | Admin access |
| HTTP | 80 | `0.0.0.0/0` | App + HLS origin |
| HTTPS | 443 | `0.0.0.0/0` | TLS (if terminated on EC2) |
| Custom TCP | 1935 | `0.0.0.0/0` | RTMP ingest |
| Custom TCP | 8889 | `0.0.0.0/0` | WebRTC (optional preview) |
| Custom UDP | 8189 | `0.0.0.0/0` | WebRTC ICE (optional) |

### Tighten later (production)

- Restrict port **80** to [CloudFront managed prefix list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html) only
- Keep **1935** open to streamers (or use a dedicated ingest IP)

---

## Step 4 — Launch EC2

### 4.1 Console

1. **EC2** → **Launch instance**
2. Name: `livestream-test`
3. AMI: **Ubuntu Server 24.04 LTS (arm64)**
4. Instance type: `c6g.xlarge` or `c8g.xlarge`
5. Key pair: your SSH key
6. Network: default VPC + **livestream-sg**
7. Storage: 100 GB gp3
8. Advanced → **IAM instance profile**: `LiveStreamEC2Role`
9. Launch

Note the **public IPv4** (e.g. `3.15.x.x`).

### 4.2 Elastic IP (recommended)

RTMP ingest and CloudFront origin need a stable IP:

1. **EC2** → **Elastic IPs** → **Allocate**
2. **Associate** with your instance

Use this IP for `ingest.yourdomain.com` and CloudFront HLS origin.

### 4.3 Install Docker on EC2

SSH in:

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git

sudo usermod -aG docker ubuntu
newgrp docker

docker --version
docker compose version
```

---

## Step 5 — CloudFront distribution #1 (HLS / live CDN)

Domain: **`cdn.yourdomain.com`**  
Origin: **EC2** (Elastic IP or `origin.yourdomain.com` A record → EC2)

### 5.1 Create distribution (Console)

1. **CloudFront** → **Create distribution**
2. **Origin domain**: EC2 public DNS or `origin.yourdomain.com`
3. **Protocol**: HTTP only (port 80) for test — TLS can terminate at CloudFront
4. **Origin path**: leave empty
5. **Name**: `livestream-hls-origin`

**Origin custom header** (optional, for locking origin to CloudFront):

| Header name | Value |
|-------------|--------|
| `X-Origin-Verify` | same as `ORIGIN_VERIFY_SECRET` in `.env` |

Enable the nginx check in `deploy/nginx/prod.conf` when you use this.

### 5.2 Default cache behavior

| Setting | Value |
|---------|--------|
| Viewer protocol | Redirect HTTP to HTTPS |
| Allowed methods | GET, HEAD, OPTIONS |
| Cache policy | Create custom (see below) |
| Origin request policy | CORS-S3Origin or AllViewerExceptHostHeader |
| Response headers policy | SimpleCORS or custom CORS for `app.yourdomain.com` |

### 5.3 Custom cache policy (recommended)

Create cache policy **LiveStreamHLS**:

| Behavior | TTL |
|----------|-----|
| `.m3u8` | min 0, default 1, max 5 seconds |
| `.ts` segments | min 86400, default 31536000, max 31536000 |

In CloudFront, you can use **Cache key settings** → include query strings: None.

For `.m3u8`, set **Cache-Control** from origin (nginx already sends `max-age=1` for m3u8).

### 5.4 Alternate domain + certificate

1. **Alternate domain name (CNAME)**: `cdn.yourdomain.com`
2. **Custom SSL certificate**: request in **ACM** (must be in **us-east-1** for CloudFront)
3. Create certificate for `cdn.yourdomain.com` (DNS validation in Route 53)

### 5.5 HLS URL shape

This repo expects:

```text
https://cdn.yourdomain.com/hls/live/{username}/index.m3u8
```

CloudFront forwards `/hls/...` to EC2 nginx, which proxies to MediaMTX.

Set in `deploy/.env`:

```bash
CDN_HLS_URL=https://cdn.yourdomain.com/hls
```

---

## Step 6 — CloudFront distribution #2 (media / S3)

Domain: **`media.yourdomain.com`**  
Origin: **S3 bucket** `your-livestream-media`

### 6.1 Create distribution

1. **CloudFront** → **Create distribution**
2. **Origin domain**: choose S3 bucket from list
3. **Origin access**: **Origin access control (OAC)** → create new OAC
4. After creation, CloudFront shows a **bucket policy** — click **Copy policy** and apply to S3

### 6.2 S3 bucket policy (from OAC)

CloudFront console generates something like:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-livestream-media/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

Paste into S3 → bucket → **Permissions** → **Bucket policy**.

### 6.3 Cache behavior

| Setting | Value |
|---------|--------|
| Path pattern | `Default (*)` |
| Viewer protocol | Redirect to HTTPS |
| Methods | GET, HEAD |
| Cache policy | CachingOptimized |
| TTL for MP4/JPEG | long (1 day+) — files are immutable per path |

### 6.4 CORS on CloudFront (response headers policy)

Create policy **LiveStreamMediaCORS**:

| Header | Value |
|--------|--------|
| `Access-Control-Allow-Origin` | `https://app.yourdomain.com` |
| `Access-Control-Allow-Methods` | `GET, HEAD` |

Attach to the media distribution behavior.

### 6.5 Media URL shapes

After S3 sync, objects look like:

```text
https://media.yourdomain.com/recordings/live/username/2026/06/13/12-00-00.mp4
https://media.yourdomain.com/thumbnails/live/username.jpg
https://media.yourdomain.com/thumbnails/vods/live/username/2026/06/13/12-00-00.jpg
```

Set in `deploy/.env`:

```bash
CDN_MEDIA_URL=https://media.yourdomain.com
NEXT_PUBLIC_MEDIA_CDN_BASE=https://media.yourdomain.com
```

---

## Step 7 — CloudFront distribution #3 (app, optional)

For HTTPS on the app without managing certs on EC2:

| Setting | Value |
|---------|--------|
| Origin | Same EC2 :80 |
| Alternate domain | `app.yourdomain.com` |
| Behavior | Default `/*` → origin (no `/hls` prefix) |
| WebSocket | Enable for `/ws/*` — use **Origin protocol HTTP**, increase **Origin read timeout** to 60s+ |

**Simpler test option**: point `app.yourdomain.com` directly to EC2 and use Let's Encrypt on nginx (see Step 9).

---

## Step 8 — DNS (Route 53)

Create hosted zone for `yourdomain.com` or add records at your registrar.

| Record | Type | Target |
|--------|------|--------|
| `app.yourdomain.com` | A or CNAME | EC2 Elastic IP **or** CloudFront app distribution |
| `cdn.yourdomain.com` | CNAME | CloudFront HLS distribution domain (`dxxx.cloudfront.net`) |
| `media.yourdomain.com` | CNAME | CloudFront media distribution domain |
| `ingest.yourdomain.com` | A | EC2 Elastic IP |
| `origin.yourdomain.com` | A | EC2 Elastic IP (optional, for HLS origin) |

Wait for DNS propagation (usually 5–30 minutes).

---

## Step 9 — TLS options

Pick **one** approach:

### Option A — CloudFront terminates TLS (easiest)

- App, CDN, media: all HTTPS via CloudFront
- EC2 nginx listens on **:80** only
- Request ACM certs in **us-east-1** for each subdomain

### Option B — Let's Encrypt on EC2

```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d app.yourdomain.com
```

Mount certs into nginx (`deploy/certs/`) and add a `:443` server block. Point `app.yourdomain.com` A record to EC2.

CloudFront HLS/media distributions still use ACM in us-east-1.

---

## Step 10 — Deploy the stack on EC2

### 10.1 Clone and configure

```bash
cd ~
git clone https://github.com/YOUR_USER/Live-Stream.git
cd Live-Stream/deploy

cp .env.production.example .env
nano .env   # or vim
```

### 10.2 Edit `.env` (required fields)

```bash
# Public URLs — use YOUR domains
APP_URL=https://app.yourdomain.com
CDN_HLS_URL=https://cdn.yourdomain.com/hls
CDN_MEDIA_URL=https://media.yourdomain.com
RTMP_INGEST_URL=rtmp://ingest.yourdomain.com
NEXT_PUBLIC_CHAT_URL=wss://app.yourdomain.com/ws

# Secrets — generate strong random values
ORIGIN_VERIFY_SECRET=<openssl rand -hex 32>
POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
JWT_SECRET=<openssl rand -hex 32>

# S3
AWS_REGION=ap-southeast-1
S3_BUCKET=your-livestream-media

# Frontend (baked into Next.js at build time)
NEXT_PUBLIC_API_URL=https://app.yourdomain.com
NEXT_PUBLIC_MTX_API_URL=https://app.yourdomain.com
NEXT_PUBLIC_HLS_PLAYBACK_BASE=https://cdn.yourdomain.com/hls
NEXT_PUBLIC_MEDIA_CDN_BASE=https://media.yourdomain.com
NEXT_PUBLIC_LIVE_PLAYBACK=hls

# Update DATABASE_URL and REDIS_URL passwords to match above
DATABASE_URL=postgres://livestream:<POSTGRES_PASSWORD>@postgres:5432/livestream?sslmode=disable
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379/0
```

Generate secrets:

```bash
openssl rand -hex 32
```

### 10.3 Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

First build takes 5–15 minutes.

### 10.4 Check containers

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

All services should be `running` / `healthy`.

---

## Step 11 — Verify

### 11.1 On EC2 (local)

```bash
# nginx up
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/

# HLS proxy (404 is OK until someone is live; 502 means MediaMTX/nginx problem)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/hls/live/test/index.m3u8

# mtx-manager live list
curl -s http://127.0.0.1/api/streams/live

# S3 sync logs
docker compose -f docker-compose.prod.yml logs s3-sync --tail=20
```

### 11.2 From your laptop

```bash
curl -I https://app.yourdomain.com
curl -I https://cdn.yourdomain.com/hls/live/test/index.m3u8
curl -I https://media.yourdomain.com/thumbnails/
```

### 11.3 End-to-end test

1. Open `https://app.yourdomain.com`
2. Register / sign in
3. Go to **Broadcast** → copy RTMP server + stream key
4. OBS settings:
   - **Server**: `rtmp://ingest.yourdomain.com/live` (or value from broadcast page)
   - **Stream key**: from app (includes auth params if configured)
5. Start streaming
6. Open your channel `https://app.yourdomain.com/{username}`
7. Player should load HLS from `cdn.yourdomain.com`
8. Stop stream → wait ~60s → check S3:

   ```bash
   aws s3 ls "s3://your-livestream-media/recordings/" --recursive | tail
   aws s3 ls "s3://your-livestream-media/thumbnails/"
   ```

9. VOD tab should play from `media.yourdomain.com` once synced

---

## Step 12 — Environment variable reference

| Variable | Example | Used by |
|----------|---------|---------|
| `APP_URL` | `https://app.yourdomain.com` | CORS, links |
| `CDN_HLS_URL` | `https://cdn.yourdomain.com/hls` | mtx-manager, frontend HLS base |
| `CDN_MEDIA_URL` | `https://media.yourdomain.com` | VOD/thumbnail CDN URLs |
| `RTMP_INGEST_URL` | `rtmp://ingest.yourdomain.com` | Broadcast page |
| `NEXT_PUBLIC_LIVE_PLAYBACK` | `hls` | Use CDN player (not WebRTC) |
| `NEXT_PUBLIC_CHAT_URL` | `wss://app.yourdomain.com/ws` | Chat WebSocket |
| `S3_BUCKET` | `your-livestream-media` | s3-sync sidecar |
| `AWS_REGION` | `ap-southeast-1` | s3-sync |
| `ORIGIN_VERIFY_SECRET` | random string | Lock HLS origin to CloudFront |

Full template: [`deploy/.env.production.example`](./.env.production.example)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Black video player | Stream not live or wrong HLS URL | `curl` CDN m3u8 while live; check `CDN_HLS_URL` ends with `/hls` |
| CORS error in browser | Missing CORS on CloudFront/S3/nginx | Add response headers policy; check S3 CORS |
| RTMP connection failed | SG or DNS | Open port 1935; `ingest` A record → Elastic IP |
| 502 on `/hls/` | MediaMTX down | `docker compose logs mediamtx` |
| API 404 | Wrong nginx path | `/api/v1/` → api, `/api/` → mtx-manager |
| Chat not connecting | WebSocket blocked | CloudFront/origin must allow `Upgrade`; use `wss://app.../ws` |
| VOD 404 on media CDN | Not synced yet | Wait 60s; check `s3-sync` logs and IAM role |
| S3 sync AccessDenied | IAM role missing | Attach `LiveStreamEC2Role` with bucket policy |
| Frontend still WebRTC | Old build | Rebuild frontend: `docker compose ... up -d --build frontend` |
| Wrong region | Bucket vs EC2 mismatch | Use same `AWS_REGION` everywhere |

### Useful log commands

```bash
cd ~/Live-Stream/deploy

docker compose -f docker-compose.prod.yml logs nginx --tail=50
docker compose -f docker-compose.prod.yml logs mediamtx --tail=50
docker compose -f docker-compose.prod.yml logs mtx-manager --tail=50
docker compose -f docker-compose.prod.yml logs s3-sync --tail=50
docker compose -f docker-compose.prod.yml logs frontend --tail=50
```

---

## Cost estimate (test, rough)

| Service | Approx. monthly |
|---------|-----------------|
| EC2 `c6g.xlarge` | ~$50–70 |
| 100 GB EBS | ~$8 |
| S3 storage (100 GB) | ~$2–3 |
| CloudFront egress (100 GB) | ~$8–15 |
| Route 53 hosted zone | ~$0.50 |
| **Total** | **~$70–100/mo** (varies by region and traffic) |

Stop the EC2 instance when not testing to save compute cost. S3 + CloudFront charges still apply for stored data and egress.

---

## After testing — production hardening

- [ ] Restrict EC2 port 80 to CloudFront prefix list only
- [ ] Enable nginx `X-Origin-Verify` header check for `/hls/`
- [ ] Move Postgres → RDS, Redis → ElastiCache
- [ ] Replace 60s s3-sync with S3 event → Lambda (optional)
- [ ] Separate ingest origin from app origin
- [ ] Enable CloudWatch alarms (CPU, disk, 5xx rate)
- [ ] Automate backups for Postgres volume or RDS
- [ ] Use AWS WAF on CloudFront if exposed publicly

---

## Related files in this repo

| File | Purpose |
|------|---------|
| [`docker-compose.prod.yml`](./docker-compose.prod.yml) | Full production stack |
| [`.env.production.example`](./.env.production.example) | Environment template |
| [`nginx/prod.conf`](./nginx/prod.conf) | Reverse proxy + HLS origin |
| [`scripts/s3-sync.sh`](./scripts/s3-sync.sh) | Upload recordings/thumbnails to S3 |
| [`mediamtx.docker.yml`](./mediamtx.docker.yml) | MediaMTX config for Docker |
