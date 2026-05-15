# Setup & Deployment Guide — Oro Bot

> WhatsApp bot with AI-powered ticketing, connected to Notion and powered by Evolution API.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Notion Configuration](#3-notion-configuration)
4. [Evolution API Setup](#4-evolution-api-setup)
5. [Running the Bot](#5-running-the-bot)
6. [Testing Checklist](#6-testing-checklist)
7. [Troubleshooting](#7-troubleshooting)
8. [Production Deployment](#8-production-deployment)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | 20+ | `node -v` to verify |
| **npm** | Comes with Node | Used for installing dependencies |
| **Docker & Docker Compose** | Latest | For running Evolution API, Postgres, Redis |
| **Notion workspace** | — | With 4 databases (see [Section 3](#3-notion-configuration)) |
| **z.ai account** | — | Anthropic-compatible API proxy (`api.z.ai`) |
| **WhatsApp number** | — | Dedicated number for the bot (connects via WhatsApp Web) |

Verify your environment:

```bash
node -v          # v20.x or higher
docker -v        # Docker version 24+
docker compose version  # Docker Compose v2+
```

---

## 2. Environment Setup

### 2.1 Clone and Install

```bash
git clone <repo-url>
cd whatsapp-gateway

# Copy the example env file
cp .env.example .env

# Install dependencies
npm install
```

### 2.2 Configure `.env`

Open `.env` and fill in all values. Here is what each variable controls:

```bash
# ============================================================
# AI — Anthropic SDK via z.ai proxy
# ============================================================
ANTHROPIC_API_KEY=your_z_ai_api_key          # From z.ai dashboard
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic  # Default, don't change
AI_MODEL=claude-sonnet-4-20250514             # Default model

# ============================================================
# Notion — https://www.notion.so/my-integrations
# ============================================================
NOTION_API_KEY=ntn_xxx...                     # Notion integration token
NOTION_DATABASE_ID=xxx...                     # Master Backlog database ID
NOTION_MASTER_BACKLOG_ID=xxx...               # Same as NOTION_DATABASE_ID
NOTION_MASTER_PROJECTS_ID=xxx...              # Master Projects database ID
NOTION_DIVISIONS_ID=xxx...                    # Divisions database ID
NOTION_MEMBERS_ID=xxx...                      # Members database ID
NOTION_VERSION=2022-06-28                     # Notion API version

# ============================================================
# Evolution API
# ============================================================
EVOLUTION_API_KEY=your_evolution_api_key      # Custom key you choose
EVOLUTION_INSTANCE_NAME=wa-bot                # Instance name (must match)

# ============================================================
# Public URL (for webhook callback from Evolution API)
# ============================================================
PUBLIC_URL=https://your-domain.com            # Or ngrok URL for local dev

# ============================================================
# Optional port overrides
# ============================================================
# ORCHESTRATOR_PORT=3000
# EVOLUTION_PORT=8080
# REDIS_PORT=6379
# POSTGRES_PASSWORD=evolution123
```

> **Important**: `EVOLUTION_API_URL` is set automatically inside Docker Compose to `http://wa-evolution-api:8080` (internal network). For local development (`npm run dev`), set it to `http://localhost:8080`.

---

## 3. Notion Configuration

Oro Bot reads and writes to 4 Notion databases. Here is how to set them up.

### 3.1 Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"**
3. Give it a name (e.g., "Oro Bot")
4. Select the workspace where your databases live
5. Click **Submit**
6. Copy the **Internal Integration Secret** — this is your `NOTION_API_KEY` (starts with `ntn_`)

### 3.2 Create or Connect the 4 Databases

You need these 4 databases in your Notion workspace:

| Database | Purpose | Key Properties |
|---|---|---|
| **Master Backlog** | Tickets / work items | Name, Status, Priority, Division, PIC, Ticket ID |
| **Master Projects** | Project tracking | Name, Status, Division |
| **Divisions** | Team/division registry | Name, Alias |
| **Members** | People directory | Name, Division, Phone, Nickname |

If you already have these databases, skip to step 3.3.

### 3.3 Share Databases with the Integration

For **each** of the 4 databases:

1. Open the database in Notion
2. Click the **`...`** menu (top-right)
3. Go to **Connections** → **Connect to**
4. Select the integration you created (e.g., "Oro Bot")
5. Confirm

Without this step, the API will return "object not found" errors.

### 3.4 Get the Database IDs

For each database, extract the ID from its URL:

```
https://www.notion.so/your-workspace/DATABASE_NAME-<DATABASE_ID>?v=...
                                                      ^^^^^^^^^^^^
                                                      This 32-char string
```

The ID is the part after the database name and before the `?`. It looks like `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`. Copy each one into your `.env`:

- `NOTION_DATABASE_ID` = Master Backlog ID
- `NOTION_MASTER_BACKLOG_ID` = same as above
- `NOTION_MASTER_PROJECTS_ID` = Master Projects ID
- `NOTION_DIVISIONS_ID` = Divisions ID
- `NOTION_MEMBERS_ID` = Members ID

### 3.5 Verify Notion Connection

You can quickly verify the connection works:

```bash
curl -X POST 'https://api.notion.com/v1/databases/YOUR_DATABASE_ID/query' \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

You should get a `200 OK` with JSON results, not a `401` or `404`.

---

## 4. Evolution API Setup

Evolution API connects to WhatsApp Web and relays messages to the bot via webhooks. It runs in Docker alongside Postgres and Redis.

### 4.1 Start Infrastructure Services

```bash
# From the whatsapp-gateway directory
docker compose up -d postgres redis evolution-api
```

This starts:
- **postgres** — Database for Evolution API state (port 5432)
- **redis** — Queue and session storage for the orchestrator (port 6379)
- **evolution-api** — WhatsApp Web gateway (port 8080)

Verify all containers are running:

```bash
docker compose ps
```

You should see all 3 services with status `Up` (or `healthy`).

### 4.2 Check Evolution API Health

```bash
curl http://localhost:8080/health
```

Should return something like: `{"status":"OK",...}`

### 4.3 Create a WhatsApp Instance

```bash
curl -X POST http://localhost:8080/instance/create \
  -H 'Content-Type: application/json' \
  -H 'apikey: YOUR_EVOLUTION_API_KEY' \
  -d '{
    "instanceName": "wa-bot",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

Replace `YOUR_EVOLUTION_API_KEY` with the same value from your `.env`.

### 4.4 Connect WhatsApp (Scan QR Code)

```bash
# Fetch the QR code
curl -X GET http://localhost:8080/instance/connect/wa-bot \
  -H 'apikey: YOUR_EVOLUTION_API_KEY'
```

This returns a QR code. Scan it with WhatsApp on your phone:

1. Open WhatsApp → **Settings** → **Linked Devices** → **Link a Device**
2. Scan the QR code from the API response
3. Wait for confirmation — the instance is now connected

### 4.5 Set the Webhook URL

Evolution API needs to know where to forward incoming messages. The bot listens at `POST /webhook/:instanceName`.

**For local development (using ngrok):**

```bash
# Start ngrok in a separate terminal
ngrok http 3000

# Set webhook (use your ngrok URL)
curl -X POST http://localhost:8080/webhook/set/wa-bot \
  -H 'Content-Type: application/json' \
  -H 'apikey: YOUR_EVOLUTION_API_KEY' \
  -d '{
    "enabled": true,
    "url": "https://YOUR-NGROK-DOMAIN.ngrok-free.app/webhook/wa-bot",
    "webhookByEvents": true,
    "events": ["MESSAGES_UPSERT"]
  }'
```

**For production (using your public domain):**

```bash
curl -X POST http://localhost:8080/webhook/set/wa-bot \
  -H 'Content-Type: application/json' \
  -H 'apikey: YOUR_EVOLUTION_API_KEY' \
  -d '{
    "enabled": true,
    "url": "https://your-domain.com/webhook/wa-bot",
    "webhookByEvents": true,
    "events": ["MESSAGES_UPSERT"]
  }'
```

### 4.6 Verify Webhook is Set

```bash
curl -X GET http://localhost:8080/webhook/find/wa-bot \
  -H 'apikey: YOUR_EVOLUTION_API_KEY'
```

Should return the webhook config with your URL.

---

## 5. Running the Bot

### 5.1 Development Mode (Local)

Start only the infrastructure services first:

```bash
docker compose up -d postgres redis evolution-api
```

Then run the bot locally with hot-reload:

```bash
# Make sure EVOLUTION_API_URL is set for local dev
# In .env: EVOLUTION_API_URL=http://localhost:8080
npm run dev
```

You should see:

```
===========================================
  WA Notion Bot — Starting...
===========================================
  Environment: development
  Port: 3000
  AI Model: claude-sonnet-4-20250514 (z.ai proxy)
  Evolution API: http://localhost:8080
  Instance: wa-bot
===========================================

[Bot] Server running on http://0.0.0.0:3000
[Bot] Webhook endpoint: POST /webhook/:instanceName
[Bot] Health check: GET /health

[Bot] Ready to receive WhatsApp messages!
```

### 5.2 Docker Compose (All Services)

To run everything in Docker (including the orchestrator):

```bash
docker compose up -d
```

This starts all 4 services: `orchestrator`, `evolution-api`, `postgres`, `redis`.

Check logs:

```bash
# All services
docker compose logs -f

# Just the bot
docker compose logs -f orchestrator

# Just Evolution API
docker compose logs -f evolution-api
```

### 5.3 Build and Run (Production)

```bash
# Build the TypeScript project
npm run build

# Run the compiled output
npm start
```

Or use the Dockerfile directly:

```bash
docker build -t oro-bot .
docker run -d --env-file .env -p 3000:3000 oro-bot
```

---

## 6. Testing Checklist

Once the bot is running and Evolution API is connected, run through these tests:

### 6.1 Health Check

```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","instance":"wa-bot"}
```

### 6.2 WhatsApp Message Tests

Send each message to the bot's WhatsApp number and verify the response:

| # | Send This | Expected Behavior |
|---|---|---|
| 1 | `hai` | AI greeting response (casual chat) |
| 2 | `!help` | Bot shows all available commands |
| 3 | `!projects` | Lists projects from Notion |
| 4 | `!backlog` | Lists backlog items from Notion |
| 5 | `buatin tiket test` | AI extracts intent, creates a ticket in Notion |
| 6 | `!status TICKET-ID` | Shows ticket status from Notion |
| 7 | `!divisions` | Lists divisions from Notion |
| 8 | `!members` | Lists team members from Notion |

### 6.3 Group Chat Tests

If the bot is in a group:

| # | Action | Expected Behavior |
|---|---|---|
| 1 | Send a message without mentioning the bot | No response (bot ignores) |
| 2 | `@bot hai` (mention the bot) | Bot responds |
| 3 | `@bot buatin tiket server down` | Bot creates a ticket |

### 6.4 AI Stats Endpoint

```bash
curl http://localhost:3000/ai-stats
# Returns: total AI calls, token usage, recent logs
```

---

## 7. Troubleshooting

### Evolution API Not Connecting

**Symptoms**: QR code scan fails, instance shows disconnected.

```bash
# Check Evolution API logs
docker compose logs evolution-api

# Restart the service
docker compose restart evolution-api

# Check instance connection status
curl -X GET http://localhost:8080/instance/connectionState/wa-bot \
  -H 'apikey: YOUR_EVOLUTION_API_KEY'
```

Common fixes:
- Delete and recreate the instance if the QR code is stale
- Ensure the phone has an active internet connection
- WhatsApp only allows 4 linked devices — unlink an old device if needed

### Notion API Errors

**Symptoms**: "object not found", "unauthorized", empty results.

| Error | Fix |
|---|---|
| `401 Unauthorized` | Check `NOTION_API_KEY` is correct |
| `404 Object not found` | Database not shared with integration — see [Section 3.3](#33-share-databases-with-the-integration) |
| Empty results | Check database IDs are correct (no extra spaces, full 32-char ID) |

Quick validation:

```bash
# Test Notion API key
curl https://api.notion.com/v1/users/me \
  -H 'Authorization: Bearer YOUR_NOTION_API_KEY' \
  -H 'Notion-Version: 2022-06-28'
```

### AI Not Responding

**Symptoms**: Bot receives messages but replies with error or no reply.

```bash
# Check AI stats
curl http://localhost:3000/ai-stats

# Check orchestrator logs
docker compose logs orchestrator | grep -i "error\|anthropic\|z.ai"
```

Common fixes:
- Verify `ANTHROPIC_API_KEY` is a valid z.ai key
- Check that `ANTHROPIC_BASE_URL` is `https://api.z.ai/api/anthropic`
- Ensure your z.ai account has credits/quota remaining
- Test the key directly:

```bash
curl https://api.z.ai/api/anthropic/v1/messages \
  -H 'x-api-key: YOUR_KEY' \
  -H 'anthropic-version: 2023-06-01' \
  -H 'content-type: application/json' \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"hi"}]}'
```

### Webhook Not Received

**Symptoms**: Bot logs show no incoming messages, but Evolution API logs show messages arriving.

```bash
# Check webhook config
curl -X GET http://localhost:8080/webhook/find/wa-bot \
  -H 'apikey: YOUR_EVOLUTION_API_KEY'

# Check that the URL is reachable
curl -X POST https://your-webhook-url/webhook/wa-bot \
  -H 'Content-Type: application/json' \
  -d '{"event":"messages.upsert","instance":"wa-bot","data":{"key":{"remoteJid":"test@s.whatsapp.net","fromMe":false,"id":"test"},"pushName":"Test","message":{"conversation":"test"},"messageType":"conversation"}}'
```

Common fixes:
- If using ngrok, ensure it is running and the URL has not changed (ngrok free tier URLs change on restart)
- If using a tunnel/domain, ensure it routes to port 3000
- Verify the webhook URL ends with `/webhook/wa-bot` (matching your `EVOLUTION_INSTANCE_NAME`)

### Docker Issues

```bash
# Full reset (destroys all data — use with caution)
docker compose down -v
docker compose up -d

# Check container health
docker compose ps

# View resource usage
docker stats
```

---

## 8. Production Deployment

### 8.1 Environment

Before deploying to production, ensure:

- [ ] `.env` has production values (not dev/test keys)
- [ ] `NODE_ENV=production` is set
- [ ] `PUBLIC_URL` points to your production domain
- [ ] Evolution API webhook URL uses the production domain
- [ ] A reverse proxy (nginx, Caddy, Cloudflare Tunnel) sits in front of port 3000
- [ ] HTTPS is enabled (required for Evolution API webhooks)

### 8.2 Deploy with Docker Compose

```bash
# Build and start all services
docker compose up -d --build

# Verify
docker compose ps
docker compose logs -f orchestrator --tail=50
```

The orchestrator Dockerfile:
- Uses `node:20-slim` base image
- Installs production dependencies only
- Compiles TypeScript
- Runs `node dist/index.js` on port 3000

### 8.3 Reverse Proxy Example (nginx)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 8.4 Cloudflare Tunnel (Alternative)

If using Cloudflare Tunnel (as referenced in `.env.example`):

```bash
cloudflared tunnel create oro-bot
cloudflared tunnel route dns oro-bot wa-bot.yourdomain.com
cloudflared tunnel run --url http://localhost:3000 oro-bot
```

Set `PUBLIC_URL=https://wa-bot.yourdomain.com` in `.env`.

### 8.5 Monitoring

| Endpoint | Purpose |
|---|---|
| `GET /health` | Basic health check |
| `GET /ai-stats` | AI call count, token usage, recent logs |
| `GET /` | Service name and version |

Set up external monitoring (UptimeRobot, etc.) to hit `/health` periodically.

### 8.6 Updating

```bash
git pull origin main
docker compose up -d --build orchestrator
# Only the orchestrator is rebuilt; Evolution API, Postgres, Redis persist
```

### 8.7 Backup

The Docker volumes contain persistent data:

- `postgres_data` — Evolution API state (instance config, message history)
- `redis_data` — Session data (ephemeral, safe to lose)
- `evolution_store`, `evolution_instances` — WhatsApp auth files

To back up Postgres:

```bash
docker compose exec postgres pg_dump -U evolution evolution > backup.sql
```

To restore:

```bash
cat backup.sql | docker compose exec -T postgres psql -U evolution evolution
```
