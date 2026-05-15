# Product Requirements Document (PRD)
## Oro Bot — WhatsApp + Notion AI Assistant for SGA Cakrawala Universe

| Field | Detail |
|-------|--------|
| **Product** | Oro Bot (WhatsApp + Notion AI Bot) |
| **Version** | 2.0.0 |
| **Code Name** | Roro (internal) |
| **Author** | Tim Ristek SGA Cakrawala Universe |
| **Status** | Live — Production |
| **Date** | 2026-05-15 |

---

## 1. Background & Context

### 1.1 Situasi Saat Ini

SGA Cakrawala Universe adalah organisasi kemahasiswaan yang mengelola berbagai divisi, project, dan puluhan anggota. Pengelolaan tugas (backlog), tiket kerja, dan tracking progress saat ini dilakukan secara manual melalui Notion — sebuah workspace yang berisi:

- **Master Backlog** — database tiket/tugas dengan status, prioritas, PIC, divisi, project, deadline
- **Master Projects** — database project aktif beserta Head of Project dan backlog terkait
- **Divisions** — database 12 divisi organisasi
- **Members** — database 100+ anggota beserta relasi divisinya

### 1.2 Masalah Utama

1. Anggota harus membuka Notion untuk setiap aksi (cek tugas, update status, buat tiket) — proses yang lambat dan membebani
2. Koordinasi antar divisi sulit karena informasi tersebar di banyak halaman Notion
3. Ketua/Co-Ketua dan Head of Division tidak memiliki cara cepat untuk cek progress selain membuka Notion langsung
4. Tidak ada notifikasi otomatis ke PIC saat tiket baru dibuat atau di-assign
5. Banyak anggota yang lebih aktif di WhatsApp dibanding Notion — informasi tidak sampai

### 1.3 Peluang

- WhatsApp adalah channel komunikasi utama anggota SGA (penetrasi ~100%)
- Anggota sudah terbiasa dengan chat-based interaction untuk koordinasi
- AI (Anthropic Claude via z.ai proxy) mampu memahami natural language Indonesia dengan akurasi tinggi
- Notion API menyediakan akses penuh ke semua data organisasi — cukup di-orkestrasi via bot

## 2. Goals & Objectives

### 2.1 Goals

| ID | Goal | Success Measure | Status |
|----|------|----------------|--------|
| G1 | Memudahkan akses data Notion via WhatsApp | Anggota bisa cek tugas, buat tiket, dan update status tanpa buka Notion | Achieved |
| G2 | Mengotomasi notifikasi ke PIC | Setiap tiket baru otomatis mengirim WA ke PIC terkait | Achieved |
| G3 | Menyediakan AI-powered natural language understanding | User bisa chat dalam bahasa Indonesia natural, bot memahami dan mengeksekusi | Achieved |
| G4 | Mempercepat koordinasi antar divisi | Backlog bisa difilter per divisi, project, status, dan member dalam hitungan detik | Achieved |
| G5 | Mengurangi beban Notion manual | 30+ command + AI chat meng-cover mayoritas operasi harian | Achieved |

### 2.2 SMART Objectives

- **Specific**: Build WhatsApp bot yang terintegrasi dengan Notion workspace SGA untuk mengelola tiket, backlog, project, divisi, dan anggota
- **Measurable**: 30+ command tersedia, AI accuracy > 85% untuk intent classification, response time < 10 detik
- **Achievable**: Dibangun oleh Tim Ristek menggunakan stack yang familiar (TypeScript, Fastify, Notion API)
- **Relevant**: Menyelesaikan pain point utama — akses data organisasi yang lambat dan koordinasi yang tersebar
- **Time-bound**: Versi 2.0.0 sudah live dan digunakan oleh anggota SGA

## 3. Target Users

### 3.1 Primary Users

**Persona 1: Anggota SGA**
- **Profil**: Mahasiswa aktif, anggota salah satu divisi di SGA Cakrawala Universe
- **Kebutuhan**: Cek tugas yang di-assign, lihat progress project, buat tiket baru untuk request kerjaan
- **Pain point**: Harus buka Notion yang berat dan rumit hanya untuk cek "tugas gw apa aja"
- **Expectation**: Chat di WhatsApp, langsung dapat jawaban. Pakai bahasa santai ("tugas gw dong", "backlog ristek")
- **Cara pakai**: DM ke bot atau mention di grup. Bisa pakai command (!tugas, !list) atau natural language

**Persona 2: Ketua / Co-Ketua SGA**
- **Profil**: Pimpinan organisasi, perlu overview cepat
- **Kebutuhan**: Cek statistik backlog, progress per divisi, identifikasi blocker, broadcast notifikasi ke semua anggota
- **Pain point**: Tidak ada ringkasan cepat — harus scroll Notion manual
- **Expectation**: Ketik "stats" langsung dapat ringkasan. Ketik "broadcast" langsung kirim notifikasi ke semua anggota

**Persona 3: Head of Division**
- **Profil**: Pimpinan divisi, mengelola 5-15 anggota
- **Kebutuhan**: Cek backlog divisinya, assign PIC ke tiket, update status, lihat tugas per anggota
- **Pain point**: Tracking tugas anggota manual, koordinasi via chat grup yang tidak terstruktur
- **Expectation**: Ketik "!backlog divisi ristek" atau "tugas iqbal" langsung dapat info

**Persona 4: Tim Ristek (Developer)**
- **Profil**: Developer yang membangun dan maintain bot
- **Kebutuhan**: Monitor AI usage (token, response time), debug issue, manage cache
- **Pain point**: Tidak ada visibility ke AI call statistics
- **Expectation**: Endpoint /ai-stats untuk monitoring, command !refresh untuk reset cache

### 3.2 User Volume

- **Total anggota**: 100+ anggota terdaftar di contacts database
- **Divisi**: 12 divisi aktif
- **Project**: 20+ project aktif
- **Daily active users**: Anggota SGA yang berinteraksi dengan bot secara rutin

## 4. System Architecture

### 4.1 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js >= 20, TypeScript | Server-side runtime |
| **Framework** | Fastify 5.x | HTTP server & webhook handler |
| **WhatsApp** | Evolution API (self-hosted) | WhatsApp Web API (not Twilio) |
| **AI** | Anthropic SDK via z.ai proxy | Claude Sonnet 4 for NLU |
| **Database** | Notion API (direct) | Single source of truth — no PostgreSQL |
| **Validation** | Zod | Environment & input validation |
| **Sessions** | In-memory (Map) | Conversation state per user |
| **Caching** | In-memory with TTL | Notion API response cache |
| **Queue** | None (no BullMQ) | Async processing via setImmediate |
| **Testing** | Vitest | Unit tests |

### 4.2 Architecture Diagram

```
WhatsApp User
     │
     ▼
Evolution API (WhatsApp Web)
     │
     ▼ POST /webhook/:instanceName
┌─────────────────────────────────┐
│         Fastify Server          │
│  ┌───────────────────────────┐  │
│  │     Webhook Handler       │  │  Rate limiting, dedup,
│  │  (src/webhook/handler.ts) │  │  mention detection,
│  │                           │  │  image attachment
│  └──────────┬────────────────┘  │
│             │                    │
│  ┌──────────▼────────────────┐  │
│  │      AI Agent             │  │
│  │  (src/ai/agent.ts)        │  │  Command parser,
│  │                           │  │  smart message handler,
│  │                           │  │  follow-up detection
│  └──────┬──────────┬─────────┘  │
│         │          │             │
│  ┌──────▼──┐  ┌───▼──────────┐  │
│  │ Notion  │  │ Anthropic AI │  │
│  │ Service │  │ (z.ai proxy) │  │
│  │         │  │              │  │
│  │ ticket  │  │ Extraction   │  │
│  │ org     │  │ Chat         │  │
│  │ api-core│  │ Casual wrap  │  │
│  └────┬────┘  └──────────────┘  │
│       │                         │
│  ┌────▼────────────────────┐    │
│  │  Notification Service   │    │
│  │  Contact Lookup         │    │
│  │  Session Manager        │    │
│  │  WA Sender              │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
         │
         ▼
   Notion API
   (Master Backlog, Projects,
    Divisions, Members)
```

### 4.3 Key Design Decisions

1. **No external database** — Notion is the single source of truth. All data lives in Notion databases; the bot only reads/writes via Notion API
2. **No message queue** — Operations are processed asynchronously via `setImmediate()` for simplicity. Adequate for current user volume
3. **In-memory sessions** — Conversation state stored in Node.js Map with TTL (30 minutes). Survives for current deployment scale
4. **z.ai proxy for AI** — Anthropic SDK pointed at z.ai proxy endpoint (`api.z.ai/api/anthropic`) instead of direct Anthropic API
5. **Evolution API** — Self-hosted WhatsApp Web API (not Twilio). Supports groups, mentions, media, LID resolution
6. **Command-first, AI-second** — Explicit commands (`!help`, `!list`) are parsed first (fast, deterministic). Natural language falls through to AI (slower, costs tokens)

## 5. Functional Requirements

### 5.1 P0 — Must Have (Live)

#### FR-001: WhatsApp Message Receiver via Evolution API
- Receive incoming WhatsApp messages via Evolution API webhook (`POST /webhook/:instanceName`)
- Support text messages, extended text (with mentions), and image messages (with captions)
- Handle both DM and group chat contexts
- Detect bot mentions in group chats (only respond when `@mentioned`)
- Message deduplication to prevent double processing
- Rate limiting: 20 messages/minute per user
- Self-reference detection: ignore messages from bot itself (`fromMe`)

#### FR-002: AI-Powered Natural Language Understanding
- Classify user intent from natural language Indonesian messages via Anthropic Claude (z.ai proxy)
- Three-way classification: `is_ticket` (create ticket), `is_query` (read data), or `neither` (general chat)
- Extract structured data from ticket creation requests: judul, deskripsi, divisi, project, PIC, prioritas, status, deadline, reviewed by
- AI rephrases user's casual message into professional Notion description
- Supports Indonesian slang and abbreviations (gw, lu, bikin, buatin, dong, yah, etc.)
- Conversation context injection: AI receives previous conversation summary for follow-up awareness
- Retry logic: 3 retries with exponential backoff (2s, 5s, 10s) for API failures
- AI call logging to CSV with timestamp, model, token usage, inference time

#### FR-003: Command Parser (30+ Commands)
- Explicit `!` commands parsed via regex before AI processing (faster, zero token cost)
- Supports bilingual commands (Indonesian/English): `!bantuan`/`!help`, `!hapus`/`!delete`, etc.
- Commands organized by category:

| Category | Commands |
|----------|----------|
| **Ticket CRUD** | `!list`, `!detail`, `!close`, `!delete`, `!update`, `!assign` |
| **Backlog Management** | `!backlog search`, `!backlog divisi`, `!backlog status`, `!backlog update`, `!backlog delete`, `!backlog restore`, `!backlog bulk` |
| **Project** | `!projects`, `!project <name>` |
| **Members & Divisions** | `!members`, `!members <divisi>`, `!divisions` |
| **Task Assignment** | `!tugas <name>`, `!pic <ticket> <member>`, `!removepic <ticket> <member>` |
| **Notes & Comments** | `!note <ticket> <text>`, `!comment <ticket> <text>` |
| **Database** | `!db create`, `!db schema` |
| **Content** | `!subpage <parent> <title>`, `!image <ticket> <url>` |
| **System** | `!help`, `!stats`, `!refresh` |
| **Status Check** | `status TK-xxx`, `cek TK-xxx`, `info TK-xxx` |

#### FR-004: Ticket Creation (Direct to Notion)
- Create backlog items directly in Notion Master Backlog database
- Auto-generate ticket ID format: `TK-YYYYMMDD-NNN`
- Resolve entity relations: division name → Notion page ID, project name → page ID, PIC name → member page ID
- Support multiple PICs per ticket (array of member relations)
- Support "Reviewed By" field (reviewer member relations)
- Support due dates, initial status, and priority
- Auto-notify PICs via WhatsApp outbound message when ticket is created
- Fast execution: no confirmation step — ticket created immediately when data is sufficient
- Conversation state for unresolved PICs: if a PIC name can't be resolved, bot asks for clarification and saves pending state (5-minute TTL)

#### FR-005: Backlog Query & Filtering
- List all backlog items grouped by status
- Filter backlog by division (with alias resolution: "ristek" → "Research and Technology")
- Filter backlog by status (Not started, In progress, Need to review, Need to fix, Done, Blocking)
- Search backlog by keyword (partial match on title)
- Get backlog statistics: total, per status, per priority, per division
- All results include Notion page URL for direct access

#### FR-006: Project Tracking
- List all projects with division, Head of Project, and backlog count
- Get project details including all related backlog items grouped by status
- Search project by name (partial match)

#### FR-007: Member & Division Lookup
- List all members or filter by division
- List all divisions
- Get backlog items assigned to a specific member (by name or nickname)
- Division alias resolution: recognizes 80+ aliases across 12 divisions (e.g., "bnp", "pcr", "ristek", "advo", "minfo", "icd", "controker", "sec", "saw", "pubcom")
- Member nickname resolution: 120+ nickname → full name mappings with fuzzy matching (Levenshtein distance for typo tolerance)

#### FR-008: Outbound WhatsApp Notifications
- Auto-notify PIC via WhatsApp when ticket is created or PIC is assigned
- Personal greeting based on contact database lookup (phone number → full name)
- PIC notification message includes: ticket title, ticket ID, division, creator name, creation date
- Retry once on send failure
- Contact lookup by phone number and by name (for outbound targeting)

#### FR-009: Broadcast Task Notifications
- Mass-distribute task notifications to ALL members with active tasks
- Each member receives a personalized WhatsApp message listing only their active (not Done) tasks
- Members with no active tasks are skipped (no empty messages)
- Rate-limited sending (1 second delay between messages to avoid WhatsApp spam detection)
- Returns summary to requester: total contacts, notified, skipped, failed

#### FR-010: Self-Reference Detection
- Detect when user asks about their own tasks using pronouns: "gw", "gua", "gue", "saya", "aku", "aq"
- Also detect implied self-reference: "cek backlog dong" (short query with particle)
- Resolve user's phone number to full name via contact database
- Query Notion backlog by resolved member name
- Priority: if user mentions another person's name ("tugas farhan"), that takes precedence over self-reference

#### FR-011: Follow-Up Question Detection
- Detect follow-up questions referencing previous conversation context
- Types: `reference_previous` ("yang tadi", "itu"), `question_detail` ("deadline kapan", "siapa pic"), `confirmation` ("ya", "tidak"), `continuation` ("terus gimana"), `update_request` ("ubah statusnya")
- Handle context-specific follow-ups: deadline, PIC, status, project, division, priority, link, detail
- Conversation context preserved per user (phone number) with 30-minute TTL
- Last 10 conversation turns stored per session
- Last 20 Notion results cached for follow-up reference

#### FR-012: Session Management
- Per-user conversation sessions stored in-memory (Map keyed by phone number)
- Session data: user identity, last intent/topic/ticket/project/division/member, recent messages, active entities, last Notion results
- Session TTL: 30 minutes of inactivity
- Cleanup: expired sessions purged every 5 minutes
- Session context injected into AI prompts for continuity

#### FR-013: Image Attachment Handling
- Receive image messages with captions via WhatsApp
- Auto-match caption text to existing backlog items (search by keyword)
- Append image block to matching ticket's Notion page
- Manual image attachment via `!image <ticket> <url>` command

#### FR-014: Casual Response Enhancement
- AI-powered "casual touch" wrapper adds friendly personality to structured command responses
- Oro personality: efficient, direct, friendly but not verbose, uses "aku" not "gw"
- Minimal emoji usage (1-2 max), no excessive pleasantries
- Falls back to simple prefix if AI fails

#### FR-015: Contact Lookup Service
- Static contact database (`contacts.json`) with 100+ members
- Fields: name, phone, nickname, division, role
- Phone normalization: handles +62, 0xxx, 62xxx formats
- Lookup by phone (exact match), by name (exact + partial), by pushName (fuzzy)
- Priority: phone lookup > pushName lookup > WhatsApp pushName

### 5.2 P1 — Should Have (Live)

#### FR-016: Group Chat Support
- Bot responds in group chats only when @mentioned
- Mention detection via `contextInfo.mentionedJid` in WhatsApp payload
- Bot JID auto-fetched from Evolution API at startup
- Strip @mention text from message before processing
- Reply to group (not DM) when message comes from group

#### FR-017: LID Resolution
- WhatsApp privacy feature uses @lid (Linked ID) instead of real phone numbers
- Multi-strategy LID → phone number resolution:
  1. Profile picture URL matching (most reliable)
  2. PushName matching (fallback)
  3. Direct number validation (if LID starts with country code)
  4. Brute-force profile picture comparison across all contacts
- LID cache persisted to disk (`/app/cache/lid-cache.json`) for container restart survival

#### FR-018: Notion API Core with Rate Limiting
- Centralized Notion API client with retry (3 retries, exponential backoff)
- Rate limiting: configurable requests per second (default 3 RPS)
- Response caching with configurable TTL per data type:
  - Backlog: 2 minutes
  - Projects: 5 minutes
  - Members/Divisions: 10 minutes
  - Page details: 1 minute
  - Relation names: 10 minutes
- Auto-pagination for large queries (handles Notion 100-item page limit)
- Manual cache refresh via `!refresh` command

#### FR-019: AI Call Statistics & Monitoring
- Cumulative stats: total calls, input/output tokens, average inference time
- Per-call logging to CSV: timestamp, model, tokens, inference_ms, caller function
- HTTP endpoint `GET /ai-stats` for real-time monitoring
- Caller detection from stack trace (identifies which function triggered AI call)

#### FR-020: Notion Webhook Receiver
- `POST /notion/webhook` receives page update events from Notion
- Auto-invalidates relevant caches when pages are updated
- `GET /notion/webhook` handles Notion webhook verification challenge

### 5.3 P2 — Could Have (Future Enhancements)

#### FR-021: Multi-language Support
- Currently Indonesian-only; could add English command support

#### FR-022: Persistent Session Storage
- Move from in-memory Map to Redis for session persistence across restarts

#### FR-023: Admin Dashboard
- Web-based dashboard for monitoring bot health, AI costs, usage analytics

#### FR-024: Scheduled Notifications
- Cron-based automatic reminders for overdue tasks, approaching deadlines

#### FR-025: Voice Message Handling
- Transcribe voice messages via Whisper API and process as text

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Requirement | Actual |
|--------|-------------|--------|
| Command response time | < 5 seconds | ~1-2 seconds (no AI) |
| AI-powered response time | < 15 seconds | ~5-10 seconds (depends on Claude) |
| Notion API response | < 3 seconds per call | ~1-2 seconds (with caching) |
| Message deduplication | < 100ms | In-memory Map lookup |
| Rate limiting | 20 msg/min per user | In-memory counter |
| Concurrent users | 50+ | Single-threaded Node.js adequate |

### 6.2 Security

| Aspect | Implementation |
|--------|---------------|
| Instance validation | Webhook rejects requests with wrong `instanceName` |
| API key protection | All env vars via `.env`, never exposed in responses |
| Rate limiting | Per-user (20 msg/min), per-minute window |
| Self-message filter | Ignores `fromMe` messages to prevent loops |
| Input sanitization | Message text truncated, regex-validated for commands |
| Notion API auth | Bearer token via `NOTION_API_KEY` env var |
| Evolution API auth | API key header on all outbound requests |

### 6.3 Reliability

| Aspect | Implementation |
|--------|---------------|
| Error handling | Graceful degradation — AI failures fall back to simpler responses |
| Retry logic | 3 retries with exponential backoff (2s, 5s, 10s) for AI and Notion API |
| Message deduplication | In-memory ID tracking with 60-second TTL cleanup |
| Graceful shutdown | SIGINT/SIGTERM handlers close connections cleanly |
| Health check | `GET /health` endpoint returns status, timestamp, instance name |
| Cache resilience | Cache miss triggers fresh fetch; stale cache better than no response |
| LID cache persistence | Written to disk, survives container restart |

### 6.4 Maintainability

| Aspect | Implementation |
|--------|---------------|
| Language | TypeScript with strict compilation |
| Validation | Zod schema for all environment variables |
| Module structure | Clear separation: webhook, ai, notion, services, wa, utils |
| Configuration | All config via environment variables, no hardcoded values |
| Logging | Structured console logging with context prefixes |
| Testing | Vitest for unit tests |
| Code coverage | Tests for message templates and contact lookup |

## 7. Data Model

### 7.1 Notion Databases

| Database | Notion ID Env Var | Purpose |
|----------|------------------|---------|
| Master Backlog | `NOTION_DATABASE_ID` / `NOTION_MASTER_BACKLOG_ID` | Tiket/tugas dengan status, prioritas, PIC, divisi, project |
| Master Projects | `NOTION_MASTER_PROJECTS_ID` | Project aktif dengan HOP, divisi, backlog count |
| Divisions | `NOTION_DIVISIONS_ID` | 12 divisi organisasi |
| Members | `NOTION_MEMBERS_ID` | 100+ anggota dengan relasi divisi |

### 7.2 Master Backlog Properties

| Property | Type | Values |
|----------|------|--------|
| Name | Title | Judul tiket (max 100 char) |
| Status | Status | Not started, In progress, Need to review, Need to fix, Done, Blocking |
| Priority Level | Select | High, Medium, Low |
| Active | Checkbox | true/false |
| PIC | Relation → Members | Multi-value (array of member page IDs) |
| Divisions | Relation → Divisions | Single-value |
| Projects | Relation → Projects | Single-value |
| Reviewed By | Relation → Members | Multi-value |
| Due Date | Date | ISO 8601 |

### 7.3 Divisions (12 Active)

| Division | Common Aliases |
|----------|---------------|
| Research and Technology | ristek, tech, IT, R&D, dev |
| Media and Information | media, minfo, medinfo, konten |
| Public and Community Relations | PCR, pubcom, PR, humas, eksternal |
| Business And Partnership | BNP, bisnis, partnership, sponsor |
| Intellectual & Career Development | ICD, karir, pelatihan, career |
| Student Advocacy and Welfare | advo, advokasi, SAW |
| UKM Development | UKM, unit kegiatan |
| Treasurer | treasurer, keuangan, finance, bendahara |
| Controller | controller, controker, kontrol, audit |
| Secretary | secretary, sekretaris, sec, administrasi |
| Executive | executive, eksekutif, strategi |
| BPH | bph, badan pengurus harian, board |

### 7.4 Active Projects (20+)

- Redesign Landing Page SGA
- SGA Web Manager (CMS)
- Cakrawala Festival 2027
- Ruang Temu
- Hackthon Cakrawala 2026
- Satu Cakrawala — System Integrasi Internal (superApp)
- Research & Feedback Hub
- Cakrawala Arena
- Ruang Informasi
- Academic Safety Net
- AD/ART SGA CU 2026
- SOP SGA CU 2026
- Leadership Class
- Skill Incubation
- Project Pilot: Branding Compass
- And more...

## 8. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/webhook/:instanceName` | Receive WhatsApp messages from Evolution API |
| POST | `/webhook/:instanceName/*` | Wildcard route for v2.x event-based webhooks |
| GET | `/health` | Health check |
| GET | `/` | Bot info (name, version, status) |
| GET | `/ai-stats` | AI call statistics and recent logs |
| POST | `/notion/webhook` | Receive Notion page update events |
| GET | `/notion/webhook` | Notion webhook verification |

## 9. Environment Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | development | Environment mode |
| `PORT` | 3000 | Server port |
| `ANTHROPIC_API_KEY` | (required) | API key for z.ai proxy |
| `ANTHROPIC_BASE_URL` | `https://api.z.ai/api/anthropic` | z.ai proxy endpoint |
| `AI_MODEL` | `claude-sonnet-4-20250514` | Claude model to use |
| `NOTION_API_KEY` | (required) | Notion integration token |
| `NOTION_DATABASE_ID` | (required) | Master Backlog database ID |
| `NOTION_MASTER_PROJECTS_ID` | (optional) | Master Projects database ID |
| `NOTION_MASTER_BACKLOG_ID` | (optional) | Master Backlog database ID |
| `NOTION_DIVISIONS_ID` | (optional) | Divisions database ID |
| `NOTION_MEMBERS_ID` | (optional) | Members database ID |
| `EVOLUTION_API_URL` | `http://evolution-api:8080` | Evolution API base URL |
| `EVOLUTION_API_KEY` | (default key) | Evolution API authentication |
| `EVOLUTION_INSTANCE_NAME` | `wa-bot` | WhatsApp instance name |
| `REDIS_URL` | `redis://redis:6379` | Redis URL (for future use) |
| `CACHE_TTL_BACKLOG_MS` | 120000 | Backlog cache TTL |
| `CACHE_TTL_PROJECTS_MS` | 300000 | Projects cache TTL |
| `CACHE_TTL_MEMBERS_MS` | 600000 | Members cache TTL |
| `NOTION_RATE_LIMIT_RPS` | 3 | Notion API rate limit |
| `NOTION_MAX_RETRIES` | 3 | Notion API max retries |

## 10. Dependencies & Assumptions

### 10.1 Dependencies

| Dependency | Type | Status | Purpose |
|-----------|------|--------|---------|
| Evolution API (self-hosted) | Infrastructure | Running | WhatsApp Web API bridge |
| Anthropic API via z.ai proxy | External Service | Active | AI natural language processing |
| Notion API | External Service | Active | Data storage and management |
| Notion Workspace (SGA CU) | External Resource | Configured | Source databases (backlog, projects, divisions, members) |
| WhatsApp Phone Number | External | Active | Bot's WhatsApp number |
| Node.js >= 20 | Runtime | Installed | Server runtime |
| Fastify 5.x | npm dependency | Installed | HTTP framework |
| @anthropic-ai/sdk | npm dependency | Installed | Anthropic API client |
| zod | npm dependency | Installed | Schema validation |

### 10.2 Assumptions

1. Evolution API instance is running and connected to WhatsApp
2. Notion workspace has the required databases (Master Backlog, Master Projects, Divisions, Members) with correct schema
3. Notion integration has read/write access to all required databases
4. z.ai proxy is operational and has Anthropic API access
5. Bot's WhatsApp number is added to relevant SGA groups
6. Contact database (`contacts.json`) is kept up-to-date with member information
7. Users interact primarily in Bahasa Indonesia
8. User volume is within single-instance Node.js capacity (no horizontal scaling needed yet)

## 11. Source Code Structure

```
whatsapp-gateway/
├── src/
│   ├── index.ts                    # Entry point — Fastify server setup
│   ├── config.ts                   # Zod-validated environment configuration
│   ├── webhook/
│   │   └── handler.ts              # Webhook receiver, mention detection, dedup, rate limit
│   ├── ai/
│   │   ├── agent.ts                # Command parser, smart message handler, 30+ command handlers
│   │   ├── anthropic-client.ts     # Anthropic SDK client (z.ai proxy), retry, logging
│   │   └── prompts.ts              # System prompt, extraction prompt, chat prompt, casual wrap
│   ├── notion/
│   │   ├── notion-api-core.ts      # Core Notion API client: retry, rate limit, cache, pagination
│   │   ├── notion-org-service.ts   # Organization data: backlog, projects, divisions, members
│   │   └── ticket-service.ts       # Ticket CRUD: create, update, archive, detail, notes, comments
│   ├── services/
│   │   ├── contact-lookup.ts       # Contact database lookup (phone, name, pushName)
│   │   ├── notification.ts         # Outbound WA notification to PIC
│   │   └── session-manager.ts      # Per-user conversation state, follow-up detection
│   ├── wa/
│   │   └── sender.ts               # WhatsApp message sending, LID resolution, media download
│   ├── utils/
│   │   ├── helpers.ts              # Ticket ID generation, department normalization, JSON extraction
│   │   └── message-template.ts     # Greeting and notification message templates
│   ├── config/
│   │   └── contacts.json           # Static contact database (100+ members)
│   └── __tests__/
│       ├── message-template.test.ts
│       └── contact-lookup.test.ts
├── package.json
└── tsconfig.json
```

---

*This document reflects the actual Oro Bot implementation as of version 2.0.0. All features listed as P0 and P1 are live in production.*
