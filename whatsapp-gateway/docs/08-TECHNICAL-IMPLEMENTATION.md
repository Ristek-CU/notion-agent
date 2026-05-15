# Technical Implementation Reference

## Oro Bot — WhatsApp-to-Notion Gateway

> Developer reference for the Oro Bot codebase. Covers source structure, module internals, data flow, error handling, logging, and configuration.

---

## 1. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Runtime** | Node.js 20 LTS | Async I/O, event loop |
| **Language** | TypeScript 5.x | Type safety across all modules |
| **Framework** | Fastify 5.x | HTTP server, webhook receiver |
| **AI SDK** | @anthropic-ai/sdk | Claude API via z.ai proxy |
| **AI Model** | claude-sonnet-4-20250514 | Intent extraction, chat, casual wrapping |
| **Notion API** | REST (direct) | All CRUD operations on Notion workspace |
| **MCP** | @modelcontextprotocol/sdk | Optional Notion MCP Server (stdio, fallback) |
| **WhatsApp** | Evolution API v1.8+/v2.x | Send/receive WhatsApp messages |
| **Validation** | Zod | Environment variable schema validation |
| **Session** | In-memory Map | Per-user conversation context (30-min TTL) |
| **Caching** | In-memory Map with TTL | Notion API response caching |
| **Contacts** | Static JSON (contacts.json) | Phone-to-name resolution for outbound notifications |

---

## 2. Source File Structure

```
src/
├── index.ts                  # Fastify server entry point (port 3000)
├── config.ts                 # Zod-validated environment configuration (19 env vars)
├── ai/
│   ├── agent.ts              # Main AI agent (2670 lines) — message routing, commands, smart messages
│   ├── anthropic-client.ts   # Anthropic SDK wrapper via z.ai proxy (167 lines)
│   └── prompts.ts            # System prompts (433 lines) — EXTRACTION, CHAT, CASUAL_WRAP
├── notion/
│   ├── notion-api-core.ts    # Core Notion API client (728 lines) — retry, rate limiting, caching, pagination
│   ├── notion-org-service.ts # Organization data service (1320 lines) — backlog, projects, divisions, members
│   └── ticket-service.ts     # Ticket CRUD operations (375 lines)
├── mcp/
│   └── notion-client.ts      # MCP client for Notion (106 lines) — lazy init, stdio transport, fallback
├── services/
│   ├── session-manager.ts    # In-memory session management (368 lines) — 30-min TTL, follow-up detection
│   ├── contact-lookup.ts     # Phone number normalization and name lookup (209 lines)
│   └── notification.ts       # Outbound WA notification service (124 lines)
├── wa/
│   └── sender.ts             # WhatsApp message sender via Evolution API (489 lines) — LID resolution
├── webhook/
│   └── handler.ts            # Webhook processing pipeline (575 lines) — dedup, rate limit, routing
└── utils/
    ├── helpers.ts            # Utility functions (79 lines) — ticket ID gen, JSON extraction
    └── message-template.ts   # Message formatting templates (71 lines)
```

---

## 3. Module Details

### 3.1 `src/index.ts` — Entry Point

The application bootstrap. Creates a Fastify server, initializes the bot JID for group mention detection, registers webhook routes, and sets up graceful shutdown handlers.

**Startup sequence:**
1. Log environment info (NODE_ENV, PORT, AI_MODEL, EVOLUTION_API_URL, INSTANCE_NAME)
2. Create Fastify instance with environment-aware log level (`debug` in development, `info` in production)
3. `initBotJid()` — fetch the bot's own WhatsApp JID from Evolution API for later mention detection
4. `registerWebhookRoutes(app)` — mount all HTTP routes
5. Listen on `0.0.0.0:{PORT}`

**Graceful shutdown:** On SIGINT/SIGTERM, closes the MCP client connection, then closes Fastify.

**Key references:** `src/index.ts:1-56`

---

### 3.2 `src/config.ts` — Configuration

Zod schema validation for all environment variables. Loaded once at startup via `dotenv`.

**Schema (19 variables):**

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `NODE_ENV` | `enum["development","production"]` | `"development"` | Environment mode |
| `PORT` | `number` | `3000` | HTTP server port |
| `ANTHROPIC_API_KEY` | `string` (required) | — | API key for z.ai proxy |
| `ANTHROPIC_BASE_URL` | `string` | `"https://api.z.ai/api/anthropic"` | z.ai proxy endpoint |
| `AI_MODEL` | `string` | `"claude-sonnet-4-20250514"` | Claude model identifier |
| `NOTION_API_KEY` | `string` (required) | — | Notion integration token |
| `NOTION_DATABASE_ID` | `string` (required) | — | Master Backlog database ID |
| `NOTION_VERSION` | `string` | `"2022-06-28"` | Notion API version header |
| `NOTION_MASTER_PROJECTS_ID` | `string` (optional) | — | Master Projects database ID |
| `NOTION_MASTER_BACKLOG_ID` | `string` (optional) | — | Master Backlog database ID (alternative) |
| `NOTION_DIVISIONS_ID` | `string` (optional) | — | Divisions database ID |
| `NOTION_MEMBERS_ID` | `string` (optional) | — | Members database ID |
| `EVOLUTION_API_URL` | `string` | `"http://evolution-api:8080"` | Evolution API base URL |
| `EVOLUTION_API_KEY` | `string` | `"evolution-api-key-change-this"` | Evolution API authentication key |
| `EVOLUTION_INSTANCE_NAME` | `string` | `"wa-bot"` | WhatsApp instance identifier |
| `REDIS_URL` | `string` | `"redis://redis:6379"` | Redis connection URL (reserved) |
| `CACHE_TTL_BACKLOG_MS` | `number` | `120000` (2 min) | Backlog cache TTL |
| `CACHE_TTL_PROJECTS_MS` | `number` | `300000` (5 min) | Projects cache TTL |
| `CACHE_TTL_MEMBERS_MS` | `number` | `600000` (10 min) | Members cache TTL |
| `CACHE_TTL_RELATIONS_MS` | `number` | `600000` (10 min) | Relation cache TTL |
| `NOTION_RATE_LIMIT_RPS` | `number` | `3` | Notion API rate limit (requests/sec) |
| `NOTION_MAX_RETRIES` | `number` | `3` | Max retry attempts for Notion API |

**Key references:** `src/config.ts:1-46`

---

### 3.3 `src/ai/agent.ts` — Main AI Agent

The central message processing module at 2670 lines. Handles all message routing, command parsing, AI-powered intent detection, ticket creation, backlog queries, and conversation state management.

#### 3.3.1 Exports

- `handleMessage(message, context)` — main entry point called by the webhook handler
- `handleChat(message, context)` — general AI chat fallback
- `MessageContext` interface — phone number, push name, group flag, mention flag

#### 3.3.2 Message Processing Pipeline

```
Incoming message
    │
    ├─ 1. Load/create session (session-manager)
    │
    ├─ 2. parseCommand() — regex-based command parser
    │     ├─ Match found → handleCommand() → addCasualTouch() → return
    │     └─ No match → continue
    │
    ├─ 3. Group + bot mentioned? → handleSmartMessage()
    │
    ├─ 4. Group + NOT mentioned? → return "" (ignore)
    │
    └─ 5. DM → handleSmartMessage()
```

#### 3.3.3 `parseCommand()` — Command Parser

Regex-based parser supporting 30+ commands. Commands are matched in priority order — more specific patterns are checked first.

**Supported commands:**

| Command Pattern | Internal Name | Description |
|----------------|---------------|-------------|
| `!projects`, `!project list` | `project_list` | List all projects |
| `!project <name>` | `project_info` | Get project details |
| `!backlog search <query>` | `backlog_search` | Search backlog items |
| `!backlog division <name>` | `backlog_division` | Backlog by division |
| `!backlog status <value>` | `backlog_status` | Backlog by status |
| `!backlog update <name> status/priority <value>` | `backlog_update` | Update backlog item |
| `!backlog delete <name>` | `backlog_delete` | Archive backlog item |
| `!backlog restore <name>` | `backlog_restore` | Restore archived item |
| `!backlog bulk <from> to <to> [div]` | `backlog_bulk` | Bulk status update |
| `!detail <name/ID>` | `ticket_detail` | Full ticket detail |
| `!note <ticket> <text>` | `ticket_note` | Add note to ticket |
| `!comment <ticket> <text>` | `ticket_comment` | Add comment to ticket |
| `!members [division]` | `members_list` | List members |
| `!divisions` | `divisions_list` | List all divisions |
| `!tugas <name>` | `member_tasks` | Tasks by member |
| `!pic <ticket> <member>` | `assign_pic` | Assign PIC to backlog |
| `!removepic <ticket> <member>` | `unassign_pic` | Remove PIC |
| `!refresh`, `!sync` | `cache_refresh` | Force cache refresh |
| `!list [dept]` | `list_all` / `list_dept` | List backlog items |
| `!help`, `!bantuan` | `show_help` | Help text |
| `!stats`, `!statistik` | `show_stats` | Backlog statistics |
| `!close <TK-ID>` | `close_ticket` | Close ticket (set Done) |
| `!delete <TK-ID>` | `delete_ticket` | Archive ticket |
| `!assign <TK-ID> <name>` | `assign_ticket` | Assign person to ticket |
| `!update <TK-ID> <field> <value>` | `update_ticket` | Update ticket field |
| `!db create <name> in <parent>` | `db_create` | Create Notion database |
| `!db schema <id>` | `db_schema` | Get database schema |
| `!subpage <parent> <title>` | `subpage_create` | Create sub-page |
| `!image <ticket> <url>` | `ticket_image` | Attach image to ticket |
| `status/cek/info <TK-ID>` | `check_status` | Check ticket status |

**Key references:** `src/ai/agent.ts:211-406`

#### 3.3.4 `handleSmartMessage()` — AI-Powered Intent Detection

For messages that don't match any command pattern, this function performs multi-layered intent detection:

1. **Follow-up detection** — checks if message references previous conversation context via `session-manager.detectFollowUp()`
2. **Greeting detection** — short messages matching greeting patterns trigger a time-aware greeting
3. **Pending ticket state** — checks for unresolved PIC names from a previous ticket creation attempt
4. **Broadcast intent** — regex patterns detect mass notification requests
5. **Member name extraction** — parses specific member names from message text (priority over self-reference)
6. **Self-reference detection** — detects "tugas gw", "backlog saya" patterns and resolves sender's tasks via contact lookup
7. **Stats/Project/List/Help/Divisions/Members intent** — keyword-based detection for common intents
8. **Creation intent** — "buat tiket", "bikin backlog" triggers AI extraction
9. **Query keyword detection** — reading-intent keywords trigger `handleQuery()`
10. **AI extraction** — last resort: sends message to Claude for classification (`is_ticket`, `is_query`, or neither)

**Key references:** `src/ai/agent.ts:687-1156`

#### 3.3.5 `handleCreateTicket()` — Ticket Creation

Creates a Notion page in the Master Backlog database:

1. Extract fields from AI-parsed ticket data (judul, deskripsi, divisi, project, pics, prioritas, dueDate, reviewedBy, status)
2. Resolve division/project/member names to Notion page IDs via alias resolution and database lookups
3. If any PIC names cannot be resolved, save conversation state to `pendingTickets` Map and ask user for clarification
4. Call `createTicketDirect()` to create the Notion page
5. Send WhatsApp notifications to all resolved PICs via `notifyPIC()` (async, non-blocking via `setImmediate`)
6. Return confirmation with Notion URL

**Pending ticket state:** Stored in an in-memory Map keyed by phone number, with a 5-minute TTL. Cleaned up every 60 seconds.

**Key references:** `src/ai/agent.ts:1225-1407`

#### 3.3.6 `handleFollowUpQuestion()` — Context-Aware Follow-Up

Handles follow-up messages that reference previous conversation context:

- **Confirmation** — "ya", "tidak", "ok", "bisa" responses
- **Continuation** — "terus gimana", "lalu gimana"
- **Detail questions** — "di akun apa", "deadline kapan", "siapa pic", "statusnya", "linknya", "projectnya", "divisinya", "prioritasnya"
- **Update request** — "ubah statusnya", "ganti pic"
- Falls through to normal detection if unable to answer

**Key references:** `src/ai/agent.ts:527-683`

#### 3.3.7 `addCasualTouch()` — AI Personality Wrapper

Wraps formal command responses with a casual Oro personality using the `CASUAL_WRAP_PROMPT`. Skips wrapping for short messages (<30 chars) and help text. Falls back to a simple prefix if AI fails.

**Key references:** `src/ai/agent.ts:161-191`

#### 3.3.8 `handleBroadcastTaskNotifications()` — Mass Notification

Iterates over all contacts, queries Notion for each member's active tasks, and sends personalized WhatsApp notifications. Includes 1-second delay between sends to avoid WhatsApp spam detection.

**Key references:** `src/ai/agent.ts:2145-2242`

---

### 3.4 `src/ai/anthropic-client.ts` — Anthropic SDK Wrapper

Wraps the Anthropic SDK for communication with Claude via the z.ai proxy.

**Configuration:**
- Base URL: `ANTHROPIC_BASE_URL` (default: `https://api.z.ai/api/anthropic`)
- Model: `claude-sonnet-4-20250514`
- Default max tokens: 1024 (overridable per call)
- Max retries: 3 with exponential backoff (2s, 5s, 10s)

**Retry logic:**
- Retries on HTTP 429 (rate limited) and 5xx (server error)
- Does NOT retry on 4xx client errors

**AI Call Logging:**
- Every API call is logged to `logs/ai-calls.csv` with: timestamp, model, input/output tokens, inference time, caller function name
- Caller detection via stack trace inspection (identifies which agent.ts function initiated the call)
- Cumulative stats tracked in-memory: total calls, total tokens, average inference time

**Exports:**
- `createMessage(messages, options?)` — send messages to Claude, returns `AnthropicResponse`
- `getAIStats()` — returns cumulative AI call statistics

**Key references:** `src/ai/anthropic-client.ts:1-167`

---

### 3.5 `src/ai/prompts.ts` — System Prompts

Four prompts used across the AI pipeline:

#### `SYSTEM_PROMPT`
Defines Oro's personality, capabilities, and rules. Lists all 12 divisions with aliases, priority levels, and anti-loop rules (no double confirmation).

#### `EXTRACTION_PROMPT`
Used for intent classification and data extraction. Classifies messages into:
- `is_query: true` — reading/querying data (returns query_type, division, status, search)
- `is_ticket: true` — creating a ticket (returns judul, deskripsi, departemen, prioritas, pics, project, status, deadline, reviewedBy)
- `is_ticket: false` — general chat (returns reply or empty string)

Includes complete lists of divisions (with aliases), projects (20+), and members (100+ with nicknames) for accurate entity resolution.

#### `CHAT_PROMPT`
General conversation prompt with `{pushName}` and `{message}` placeholders. Defines scope boundaries (only ticket/backlog/Notion-related tasks) and execution rules (fast execution, no confirmation loops).

#### `CASUAL_WRAP_PROMPT`
Lightweight prompt that adds a casual touch to formal system responses without modifying the data content. Output must preserve all formatting (bold, links, etc.).

#### `CASUAL_ERROR_PROMPT`
Generates friendly error messages from technical error details.

**Key references:** `src/ai/prompts.ts:1-433`

---

### 3.6 `src/notion/notion-api-core.ts` — Core Notion API Client

Low-level Notion API client providing retry logic, rate limiting, caching, and auto-pagination. All Notion API calls from other modules go through this layer.

#### Rate Limiter
- Sliding window algorithm: 3 requests per 1-second window
- Configurable via `NOTION_RATE_LIMIT_RPS` env var
- Waits before making request if window is full

#### Cache Layer
- In-memory `Map<string, CacheEntry>` with TTL
- Default TTL: 5 minutes (overridable per call)
- Cache invalidation by prefix or exact key
- Only caches GET-like operations (database queries, page reads)

#### Retry Logic
- Max 3 retries with exponential backoff (1s, 3s, 6s)
- Retries on: HTTP 429 (respects Retry-After header), 5xx server errors, network errors
- Does NOT retry on 4xx client errors (except 429)
- Configurable max retries via options

#### Auto-Pagination
- `queryDatabaseAll()` — fetches all pages from a database query, handling `has_more`/`next_cursor` automatically
- Safety limit: 50 pages (5000 results) to prevent runaway pagination
- `getBlockChildren()` — paginated block retrieval with same safety limits

#### API Operations

| Function | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| `notionRequest()` | Any | Any | Generic request with retry/rate-limit |
| `queryDatabaseAll()` | POST | `/databases/{id}/query` | Auto-paginated database query |
| `queryDatabasePage()` | POST | `/databases/{id}/query` | Single-page query |
| `getPage()` | GET | `/pages/{id}` | Get page by ID |
| `createPage()` | POST | `/pages` | Create new page |
| `updatePage()` | PATCH | `/pages/{id}` | Update page properties |
| `archivePage()` | PATCH | `/pages/{id}` | Soft delete (archive) |
| `restorePage()` | PATCH | `/pages/{id}` | Restore archived page |
| `getBlockChildren()` | GET | `/blocks/{id}/children` | Get page blocks (paginated) |
| `appendBlocks()` | PATCH | `/blocks/{id}/children` | Append blocks to page |
| `updateBlock()` | PATCH | `/blocks/{id}` | Update a block |
| `deleteBlock()` | DELETE | `/blocks/{id}` | Delete a block |
| `getComments()` | GET | `/comments` | Get page comments |
| `createComment()` | POST | `/comments` | Add comment to page |
| `getDatabase()` | GET | `/databases/{id}` | Get database schema (cached 10 min) |
| `createDatabase()` | POST | `/databases` | Create new database |
| `updateDatabase()` | PATCH | `/databases/{id}` | Update database schema |
| `searchNotion()` | POST | `/search` | Search pages/databases |
| `batchUpdatePages()` | — | — | Sequential updates with progress callback |
| `appendImageBlock()` | — | — | Append external image to page |
| `appendEmbedBlock()` | — | — | Append bookmark/embed to page |
| `createSubPage()` | — | — | Create child page under parent |
| `extractFormulaValue()` | — | — | Read formula property |
| `extractRollupValue()` | — | — | Read rollup property |

**Key references:** `src/notion/notion-api-core.ts:1-728`

---

### 3.7 `src/notion/notion-org-service.ts` — Organization Data Service

High-level service for reading and writing SGA organization data in Notion. Uses `notion-api-core` for all API calls.

#### Division Alias System
- 12 divisions with 100+ total aliases
- `resolveDivisionAlias()` — resolves aliases to full division names using word-boundary matching for short aliases (<=3 chars)
- `detectDivisionFromMessage()` — extracts division from free-form message text, prioritizing longer/more specific aliases and requiring division-related context words

**Divisions:**
- Research and Technology (ristek, tech, IT, dev, ...)
- Media and Information (media, minfo, medinfo, ...)
- Public and Community Relations (PCR, pubcom, PR, humas, ...)
- Business And Partnership (BNP, bisnis, sponsor, ...)
- Intellectual & Career Development (ICD, karir, ...)
- Student Advocacy and Welfare (advo, SAW, ...)
- UKM Development (ukm, ...)
- Treasurer (keuangan, finance, ...)
- Controller (controker, audit, ...)
- Secretary (sec, sekretaris, ...)
- Executive (eksekutif, ...)
- BPH (board, ...)

#### Member Nickname System
- 120+ nickname-to-full-name mappings
- `resolveNickname()` — three-tier resolution:
  1. Exact nickname lookup (O(1))
  2. Partial match (prefix/suffix)
  3. Fuzzy match via Levenshtein distance (max 2-3 edits depending on input length)

#### Backlog Operations
- `listBacklog()` — list all items with optional filter/sorts (2-min cache)
- `searchBacklog()` — search by name (partial match)
- `getBacklogByStatus()` — filter by status
- `getBacklogByProject()` — filter by project relation
- `getBacklogByMember()` — filter by PIC relation
- `getBacklogByMemberName()` — multi-strategy member resolution (exact → contains → filtered match)
- `updateBacklogStatus()` / `updateBacklogPriority()` — update single item
- `deleteBacklogItem()` / `restoreBacklogItem()` — archive/restore
- `bulkUpdateBacklogStatus()` — batch status update with progress callback
- `getBacklogByDivision()` — formatted summary by division (resolves aliases)
- `getBacklogByStatusSummary()` — formatted summary by status
- `getBacklogStats()` — statistics by status, priority, and division

#### Project Operations
- `listProjects()` — all projects with caching (5-min TTL)
- `searchProject()` — search by name
- `getProjectDetails()` — project info with related backlog items

#### Division/Member/Relation Operations
- `listDivisions()` / `listMembers()` — cached lists (10-min TTL)
- `getMembersByDivision()` — members filtered by division (alias-aware)
- `addRelation()` / `removeRelation()` — manage page relation properties
- `assignPicToBacklog()` / `removePicFromBacklog()` — PIC relation management
- `refreshAllCaches()` — invalidate all cache prefixes

**Key references:** `src/notion/notion-org-service.ts:1-1320`

---

### 3.8 `src/notion/ticket-service.ts` — Ticket CRUD

Direct Notion API calls for ticket-specific operations. Wraps `notion-api-core` functions with ticket-specific logic.

**Key functions:**
- `createTicketDirect()` — creates a Master Backlog page with properties (Name, Status, Priority Level, Active, PIC relations, Division relations, Project relations, Reviewed By relations, Due Date) and professional description content block
- `searchPagesDirect()` — Notion search API wrapper
- `getTicketDetail()` — full page detail with blocks and comments
- `addTicketNote()` — append timestamped note blocks
- `addTicketComment()` — create Notion comment
- `archiveTicketDirect()` / `restoreTicketDirect()` — archive/restore wrappers

**Status mapping:** Normalizes various status inputs (e.g., "completed" → "Done", "need review" → "Need to review")

**Key references:** `src/notion/ticket-service.ts:1-375`

---

### 3.9 `src/mcp/notion-client.ts` — MCP Client

Optional Model Context Protocol client for Notion. Uses stdio transport to spawn the Notion MCP Server as a child process.

**Behavior:**
- **Lazy initialization** — only connects when `callNotionMCP()` or `listMCPTools()` is called
- **Fallback** — if MCP connection fails, logs a warning and returns `null`; callers fall back to direct API via `notion-api-core`
- **Graceful shutdown** — `closeMcpClient()` called during app shutdown

**Current status:** MCP is retained for compatibility but all internal operations use the direct API for consistency, retry, rate limiting, and caching.

**Key references:** `src/mcp/notion-client.ts:1-106`

---

### 3.10 `src/services/session-manager.ts` — Session Management

In-memory per-user conversation context with TTL-based expiration.

**Session data stored per phone number:**
- User identity (name, phone)
- Last intent, topic, ticket ID/name, project, division, member name
- Recent conversation history (last 10 turns)
- Active entities from last response (ticket IDs/names, project, member)
- Last Notion results (up to 20 items for follow-up questions)
- Metadata (creation time, last activity, message count)

**Configuration:**
- Session TTL: 30 minutes
- Max history: 10 conversation turns
- Max Notion results: 20 items
- Cleanup interval: every 5 minutes

**Follow-up detection (`detectFollowUp()`):**
Returns a `FollowUpType` or null:
- `reference_previous` — "yang tadi", "itu", "barusan"
- `question_detail` — "deadline kapan", "siapa pic", "statusnya", "linknya"
- `confirmation` — "ya", "tidak", "ok", "gas"
- `continuation` — "terus gimana", "lalu"
- `update_request` — "ubah statusnya", "ganti pic"

**Key references:** `src/services/session-manager.ts:1-368`

---

### 3.11 `src/services/contact-lookup.ts` — Contact Lookup

Phone number normalization and name lookup against a static `contacts.json` file.

**Phone normalization:** Strips `+`, spaces, dashes, parentheses; converts leading `0` to `62`.

**Lookup functions:**
- `findNameByPhone()` — exact match after normalization (for inbound caller ID)
- `findPhoneByName()` — exact then partial match against name and nickname (for outbound PIC notification)
- `getDisplayName()` — returns full name or formatted phone number
- `getFullName()` — returns full name or null
- `findContactByPushName()` — matches WhatsApp push name against nicknames, full names, and first names
- `resolveDisplayName()` — priority: phone lookup > push name lookup > raw push name

**Key references:** `src/services/contact-lookup.ts:1-209`

---

### 3.12 `src/services/notification.ts` — Outbound Notifications

WhatsApp notification service for PIC assignment alerts.

**`notifyPIC()`:**
1. Look up PIC phone number by name via `contact-lookup`
2. Build notification message via `message-template`
3. Send via `sendDirectMessage()`
4. On failure: retry once

**Key references:** `src/services/notification.ts:1-124`

---

### 3.13 `src/wa/sender.ts` — WhatsApp Message Sender

Sends messages via Evolution API with LID resolution, message chunking, and media download support.

#### LID Resolution
WhatsApp privacy feature replaces phone numbers with `@lid` JIDs. The sender resolves these to real phone numbers using a multi-strategy approach:

1. **Cache check** — in-memory + disk-persisted cache (`/app/cache/lid-cache.json`)
2. **Profile picture match** — compare LID contact's profile pic with all `@s.whatsapp.net` contacts
3. **Push name match** — match by WhatsApp display name
4. **Direct number check** — if LID number starts with country code, verify via `checkNumberStatus`
5. **Brute-force profile pic** — fetch profile pics for all WA contacts and compare

#### Message Chunking
Messages exceeding 3800 characters are split at newline boundaries. Subsequent chunks are prefixed with `(lanjutan N/M)`.

#### Other Functions
- `sendWhatsAppMessage()` — main send function with number normalization
- `replyToGroup()` / `sendDirectMessage()` — convenience wrappers
- `checkNumberStatus()` — verify if number is registered on WhatsApp
- `fetchBotJid()` — get bot's own JID from Evolution API (cached)
- `downloadMedia()` — download media from WhatsApp message

**Key references:** `src/wa/sender.ts:1-489`

---

### 3.14 `src/webhook/handler.ts` — Webhook Processing Pipeline

Receives Evolution API webhooks and routes messages through the processing pipeline.

#### Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/webhook/:instanceName` | Main webhook receiver |
| POST | `/webhook/:instanceName/*` | Wildcard for v2.x event-based webhooks |
| GET | `/health` | Health check |
| GET | `/ai-stats` | AI call statistics and recent logs |
| GET | `/` | Server info |
| POST | `/notion/webhook` | Notion webhook receiver (cache invalidation) |
| GET | `/notion/webhook` | Notion webhook verification |

#### Processing Pipeline (per message)

1. **Instance validation** — reject if instance name doesn't match config
2. **Event filter** — only process `messages.upsert` events
3. **From-me filter** — ignore messages sent by the bot itself
4. **Deduplication** — Map of processed message IDs, cleaned every 60 seconds
5. **Empty message filter** — skip messages with no text and no image
6. **Image attachment** — if image with caption, try to attach to matching ticket (async)
7. **Group/DM classification** — check `remoteJid` for `@g.us`
8. **Rate limiting** — max 20 messages per minute per user JID
9. **Mention detection** — for groups, check `contextInfo.mentionedJid` against bot JID
10. **Mention stripping** — remove `@<botNumber>` from message text
11. **Reply target resolution** — normalize JID to phone number or group JID
12. **Phone extraction** — extract sender phone for contact lookup
13. **Display name resolution** — contact DB lookup > push name
14. **Async processing** — `setImmediate()` to avoid blocking the webhook response
15. **Response routing** — group replies via `replyToGroup()`, DMs via `sendDirectMessage()`

**Key references:** `src/webhook/handler.ts:1-575`

---

### 3.15 `src/utils/helpers.ts` — Utility Functions

- `generateTicketId()` — generates `TK-YYYYMMDD-XXX` format IDs
- `normalizeDepartment()` — maps department aliases to canonical names
- `extractJSON()` — safely extracts JSON from text that may contain extra content
- `extractNotionUrl()` — extracts Notion page URL from text
- `truncate()` — string truncation with ellipsis
- `sleep()` — promise-based delay
- `formatDate()` — date to YYYY-MM-DD

**Key references:** `src/utils/helpers.ts:1-79`

---

### 3.16 `src/utils/message-template.ts` — Message Templates

- `buildGreeting()` — personalized greeting based on contact recognition
- `buildPICNotificationMessage()` — formatted notification for PIC assignment
- `buildSenderConfirmation()` — confirmation that PIC was notified
- `buildPICNotFoundWarning()` — warning when PIC phone number not found

**Key references:** `src/utils/message-template.ts:1-71`

---

## 4. Data Flow

### 4.1 Incoming Message Flow

```
WhatsApp User
    │
    ▼
Evolution API (WhatsApp bridge)
    │
    ▼ POST /webhook/:instanceName
Fastify Server (src/webhook/handler.ts)
    │
    ├─ Validate instance name
    ├─ Filter: only messages.upsert, not from-me
    ├─ Deduplicate by message ID
    ├─ Rate limit check (20/min/user)
    │
    ├─ [Group] Check bot mention → ignore if not mentioned
    ├─ Strip @mention from text
    ├─ Resolve sender phone & display name
    │
    ▼ setImmediate() — async processing
handleMessage() (src/ai/agent.ts)
    │
    ├─ Load/create session (session-manager)
    ├─ parseCommand() — regex match
    │   ├─ Match → handleCommand() → Notion API → response
    │   └─ No match → continue
    │
    ▼ handleSmartMessage()
    │
    ├─ Follow-up detection (session context)
    ├─ Greeting detection
    ├─ Pending ticket state check
    ├─ Broadcast intent detection
    ├─ Member name extraction
    ├─ Self-reference detection
    ├─ Stats/Project/List/Help/Division/Member intent
    ├─ Creation intent → AI extraction → handleCreateTicket()
    ├─ Query keyword detection → handleQuery()
    ├─ AI extraction (Claude) → classify as ticket/query/chat
    │
    ▼
Response text
    │
    ▼
sendWhatsAppMessage() (src/wa/sender.ts)
    │
    ├─ Normalize number (LID resolution if needed)
    ├─ Split into chunks if >3800 chars
    │
    ▼
Evolution API → WhatsApp User
```

### 4.2 Ticket Creation Flow

```
User: "buat tiket fix navbar untuk ristek, assign ke iqbal, deadline 15 mei"
    │
    ▼ handleSmartMessage()
    │
    ├─ Creation intent detected → AI extraction
    │   ▼ createMessage(EXTRACTION_PROMPT + message)
    │   Returns: { is_ticket: true, judul: "Fix Navbar", 
    │              departemen: "Research and Technology", 
    │              pics: ["Iqbal Azhari Pasaribu"], ... }
    │
    ▼ handleCreateTicket()
    │
    ├─ resolveDivisionPageId("ristek") → alias → Notion page ID
    ├─ resolveProjectPageId() → null (not specified)
    ├─ resolveMemberPageId("iqbal") → nickname → Notion page ID
    │
    ├─ [If PIC unresolved] → save pending state → ask user
    │
    ▼ createTicketDirect()
    │
    ├─ Create Notion page with properties + description block
    │
    ├─ notifyPIC() → async WA notification to PIC
    │
    ▼ Return confirmation with Notion URL
```

### 4.3 Cache Architecture

```
Notion API Response
    │
    ▼ notion-api-core.ts
    │
    ├─ getCached(key, fetcher, ttl)
    │   ├─ Cache hit → return cached data
    │   └─ Cache miss → fetch → store → return
    │
    ├─ Cache keys:
    │   ├─ "backlog:list:{filter}:{sorts}" (2 min TTL)
    │   ├─ "projects:list" (5 min TTL)
    │   ├─ "divisions:list" (10 min TTL)
    │   ├─ "members:list" (10 min TTL)
    │   ├─ "relation:{pageId}" (10 min TTL)
    │   ├─ "page:detail:{pageId}" (1 min TTL)
    │   └─ "db-schema:{id}" (10 min TTL)
    │
    ├─ Invalidation triggers:
    │   ├─ createPage() → invalidate "backlog", "projects"
    │   ├─ updatePage() → invalidate "backlog", "page:{id}"
    │   ├─ archivePage() → invalidate "backlog", "page:{id}"
    │   ├─ appendBlocks() → invalidate "blocks:{id}"
    │   ├─ Notion webhook → invalidate "page:detail:{id}", "backlog"
    │   └─ !refresh command → refreshAllCaches()
```

---

## 5. Error Handling

### 5.1 Notion API Errors

Handled in `notion-api-core.ts:notionRequest()`:

| Error Type | Behavior |
|-----------|----------|
| HTTP 429 (Rate Limited) | Retry with `Retry-After` header delay, up to 3 attempts |
| HTTP 5xx (Server Error) | Retry with exponential backoff (1s, 3s, 6s) |
| HTTP 4xx (Client Error) | Throw immediately — no retry |
| Network Error | Retry with exponential backoff |
| All retries exhausted | Throw last error to caller |

### 5.2 AI API Errors

Handled in `anthropic-client.ts:createMessage()`:

| Error Type | Behavior |
|-----------|----------|
| HTTP 429 (Rate Limited) | Retry with exponential backoff (2s, 5s, 10s) |
| HTTP 5xx (Server Error) | Retry with exponential backoff |
| HTTP 4xx (Client Error) | Throw immediately |
| All retries exhausted | Throw last error |

**Fallback chain in `agent.ts`:**
- AI extraction failure → fall through to `handleChat()`
- `handleChat()` failure → return generic error message
- Command handler failure → return user-friendly error with `!help` suggestion
- `addCasualTouch()` failure → use simple prefix fallback

### 5.3 WhatsApp Errors

- Send failure in `notifyPIC()` → retry once, then log and return false
- LID resolution failure → use raw LID JID (will fail to send, logged as warning)
- Message chunking → automatic split at newline boundaries

### 5.4 Session Errors

- Session not found → create new session
- Cache entry expired → fetch fresh data

---

## 6. Logging

### 6.1 Application Logging

All modules use `console.log`, `console.warn`, and `console.error` with consistent prefixes:

| Prefix | Module |
|--------|--------|
| `[Bot]` | index.ts (startup/shutdown) |
| `[Webhook]` | webhook/handler.ts |
| `[Agent]` | ai/agent.ts |
| `[AI-Call]` | ai/anthropic-client.ts |
| `[AI-Log]` | ai/anthropic-client.ts (CSV logging) |
| `[Notion Core]` | notion/notion-api-core.ts |
| `[Notion]` | notion/notion-org-service.ts |
| `[MCP]` | mcp/notion-client.ts |
| `[WA Sender]` | wa/sender.ts |
| `[Notification]` | services/notification.ts |

### 6.2 AI Call Logging

Every AI API call is logged to `logs/ai-calls.csv`:

```csv
timestamp,model,input_tokens,output_tokens,inference_ms,caller
2026-05-15T10:30:00.000Z,claude-sonnet-4-20250514,1250,380,3200,handleSmartMessage
```

Accessible via `GET /ai-stats` endpoint, which returns cumulative statistics and the last 50 log entries.

### 6.3 Fastify Request Logging

Fastify's built-in logger is configured based on `NODE_ENV`:
- Development: `debug` level
- Production: `info` level

---

## 7. Configuration

### 7.1 Environment Variables

All configuration is via environment variables, validated at startup by Zod. See Section 3.2 for the complete schema.

### 7.2 Contacts Database

Static JSON file at `src/config/contacts.json` containing an array of contact objects:

```json
{
  "name": "Full Name",
  "phone": "6281234567890",
  "nickname": "nickname",
  "division": "Division Name",
  "role": "Role"
}
```

### 7.3 Notion Workspace Structure

The bot expects the following Notion databases:

| Database | Config Var | Purpose |
|----------|-----------|---------|
| Master Backlog | `NOTION_DATABASE_ID` | Ticket/backlog items |
| Master Projects | `NOTION_MASTER_PROJECTS_ID` | Project registry |
| Divisions | `NOTION_DIVISIONS_ID` | Division registry |
| Members | `NOTION_MEMBERS_ID` | Member registry |

**Master Backlog properties:**
- `Name` (title) — ticket title
- `Status` (status) — Not started, In progress, Need to review, Need to fix, Done, Blocking
- `Priority Level` (select) — High, Medium, Low
- `Active` (checkbox) — active flag
- `PIC` (relation → Members) — assigned persons
- `🧏‍♀️ Divisions` (relation → Divisions) — associated divisions
- `📕 Projects` (relation → Projects) — associated projects
- `Reviewed By` (relation → Members) — reviewers
- `Due Date` (date) — deadline
