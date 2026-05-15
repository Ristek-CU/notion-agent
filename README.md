# Oro Bot — WhatsApp AI Agent + Notion Ticketing

Oro Bot adalah WhatsApp bot berbasis AI yang terintegrasi dengan Notion untuk manajemen tiket dan backlog organisasi. Bot ini menggunakan Anthropic Claude (via z.ai proxy) sebagai AI agent dan Evolution API sebagai WhatsApp gateway.

## Fitur

- **AI Chat** — Percakapan natural dengan bot tentang backlog, tugas, dan informasi organisasi
- **Notion Integration** — Baca backlog, tiket, proyek, dan data member dari Notion database
- **WhatsApp Gateway** — Terima dan kirim pesan via Evolution API
- **Smart Intent Detection** — Deteksi otomatis: command, query backlog, member lookup, greeting, dll
- **Member Lookup** — Cari tugas member berdasarkan nama/nickname (120+ nickname mapping + fuzzy match)
- **Notify Member** — Kirim backlog/tiket ke member tertentu via WhatsApp
- **LID Resolution** — Resolve WhatsApp privacy LID ke nomor asli (manual map + profile pic + fuzzy nickname)
- **Session Management** — Context-aware conversation dengan Redis session
- **Division Filter** — Filter backlog berdasarkan divisi organisasi

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ / TypeScript |
| AI | Anthropic Claude (z.ai proxy) |
| WhatsApp | Evolution API v1.8.7 |
| Database | Notion API |
| Session/Cache | Redis 7 |
| Framework | Fastify 5 |
| Container | Docker Compose |

## Architecture

```
WhatsApp User
     |
     v
Evolution API (WhatsApp Gateway)
     |
     v (webhook)
Orchestrator (Fastify + AI Agent)
     |
     +---> Notion API (backlog, tickets, members)
     +---> Anthropic Claude (AI responses)
     +---> Redis (session, cache)
     +---> Evolution API (send messages)
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Notion Integration Token + Database IDs
- Anthropic API Key (or z.ai proxy)
- Evolution API instance (included in docker-compose)

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/Ristek-CU/notion-agent.git
cd notion-agent
cp .env.example .env
```

### 2. Configure `.env`

Edit `.env` dan isi semua value:

```env
# AI
ANTHROPIC_API_KEY=your_api_key
ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic
AI_MODEL=claude-sonnet-4-20250514

# Notion
NOTION_API_KEY=your_notion_integration_token
NOTION_DATABASE_ID=your_database_id
NOTION_MASTER_BACKLOG_ID=your_backlog_id
NOTION_MASTER_PROJECTS_ID=your_projects_id
NOTION_DIVISIONS_ID=your_divisions_id
NOTION_MEMBERS_ID=your_members_id

# Evolution API
EVOLUTION_API_KEY=your_evolution_api_key
EVOLUTION_INSTANCE_NAME=wa-bot

# Optional: Manual LID mapping (format: "lid:phone,lid:phone")
LID_PHONE_MAP=
```

### 3. Setup Contacts

Buat file `src/config/contacts.json` dengan format:

```json
[
  {
    "name": "Full Name",
    "phone": "6281234567890",
    "nickname": "nickname",
    "division": "Division Name",
    "role": "Role"
  }
]
```

### 4. Build & Run

```bash
npm install
npm run build
docker compose up -d
```

### 5. Connect WhatsApp

Scan QR code dari Evolution API untuk connect nomor WhatsApp bot:

```bash
# Check logs for QR code
docker compose logs evolution-api -f
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `!help` | Daftar semua command |
| `!list` | Semua backlog items |
| `!stats` | Statistik backlog |
| `!members` | Daftar member organisasi |
| `!divisions` | Daftar divisi |
| `!projects` | Daftar proyek |
| Natural language | Tanya pakai bahasa bebas |

### Contoh Percakapan

```
User: halo bot
Bot: Halo! Aku Oro Bot, asisten...

User: tugas ivan apa aja
Bot: [daftar tugas Ivander]

User: kirimin tiket dong ke ivan
Bot: [kirim semua backlog ke Ivander via WA]

User: backlog divisi ristek
Bot: [daftar backlog Research and Technology]

User: cek backlog
Bot: [statistik backlog]
```

## Project Structure

```
src/
├── ai/
│   ├── agent.ts              # AI agent logic & intent detection
│   ├── anthropic-client.ts   # Anthropic API client
│   └── prompts.ts            # System prompts
├── config/
│   └── contacts.json         # Member contacts (excluded from repo)
├── notion/
│   ├── notion-api-core.ts    # Notion API client
│   ├── notion-org-service.ts # Organization data service
│   └── ticket-service.ts     # Backlog/ticket service
├── services/
│   ├── contact-lookup.ts     # Contact resolution
│   ├── notification.ts       # Notification service
│   └── session-manager.ts    # Redis session management
├── wa/
│   └── sender.ts             # WhatsApp message sender + LID resolver
├── webhook/
│   └── handler.ts            # Webhook handler (Evolution API)
├── config.ts                 # Environment config (Zod)
└── index.ts                  # Entry point (Fastify server)
```

## Branch & CI/CD

| Branch | Purpose | Deploy |
|--------|---------|--------|
| `main` | Production | Auto deploy via GitHub Actions |
| `dev` | Development | CI build & test only |

### Workflow

```
dev branch → push → CI (build + test)
dev → PR → main → CI (build + test) → CD (deploy to server)
```

### Setup CI/CD Secrets

Tambahkan secrets di GitHub repo settings (`Settings > Secrets and variables > Actions`):

| Secret | Description |
|--------|-------------|
| `SERVER_HOST` | IP/hostname server production |
| `SERVER_USER` | SSH username |
| `SERVER_SSH_KEY` | SSH private key |
| `PROJECT_PATH` | Path project di server (e.g. `/home/user/notion-agent`) |

### Manual Deploy

Kalau perlu deploy manual di server:

```bash
./scripts/deploy.sh
```

## Development

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev

# Build
npm run build

# Type check
npm run lint

# Run tests
npm test

# Run tests (watch mode)
npm run test:watch
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/webhook/:instanceName` | Evolution API webhook |
| POST | `/webhook/:instanceName/*` | Evolution API webhook (wildcard) |

## License

Private — Ristek-CU
