# System Architecture — Oro Bot (WhatsApp + Notion AI Agent)

> Oro Bot is a WhatsApp-integrated AI agent that manages tickets, backlog, projects, and organization data via Notion API. It receives WhatsApp messages through Evolution API, processes them with an AI agent powered by Anthropic Claude (via z.ai proxy), and performs CRUD operations against Notion databases.

---

## 1. Architecture Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER LAYER                                 │
│    WhatsApp Mobile App  ·  WhatsApp Group Chats                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ WhatsApp Protocol (E2E Encrypted)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     WHATSAPP GATEWAY LAYER                          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              Evolution API v1.8.7 (Docker)                  │   │
│   │                                                             │   │
│   │  • WhatsApp Web.js multi-device bridge                     │   │
│   │  • QR code pairing / session persistence                   │   │
│   │  • Webhook delivery (MESSAGES_UPSERT events)               │   │
│   │  • Message send API (text, media)                          │   │
│   │  • Contact store (LID ↔ phone number resolution)           │   │
│   │  • Instance management REST API                             │   │
│   │                                                             │   │
│   │  Backing services:                                          │   │
│   │    PostgreSQL 16 — session/auth store for Evolution         │   │
│   │    Redis 7        — internal cache for Evolution            │   │
│   └──────────────────────────┬──────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ HTTP POST webhook
                               │ (MESSAGES_UPSERT event)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ORO BOT APPLICATION                            │
│                  Fastify Server · Port 3000                         │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   WEBHOOK HANDLER LAYER                       │   │
│  │                                                              │   │
│  │  src/webhook/handler.ts                                      │   │
│  │  • POST /webhook/:instanceName — receive WA messages         │   │
│  │  • POST /webhook/:instanceName/* — v2.x event routes         │   │
│  │  • GET  /health — health check                               │   │
│  │  • GET  /ai-stats — AI call statistics                       │   │
│  │  • POST /notion/webhook — Notion page change events          │   │
│  │                                                              │   │
│  │  Pipeline per message:                                       │   │
│  │    1. Instance name validation                               │   │
│  │    2. Event type filter (MESSAGES_UPSERT only)               │   │
│  │    3. From-me skip (ignore bot's own messages)               │   │
│  │    4. Message deduplication (in-memory ID set, 60s TTL)      │   │
│  │    5. Text extraction (conversation / extendedText / caption) │   │
│  │    6. Image attachment handling (attach to matching ticket)   │   │
│  │    7. Rate limiting (20 msg/min per user, in-memory)         │   │
│  │    8. Group mention detection (bot JID lookup)               │   │
│  │    9. @mention text stripping                                │   │
│  │   10. Contact lookup (phone normalization + DB match)        │   │
│  │   11. Async dispatch to AI Agent (setImmediate)              │   │
│  │   12. Return 200 OK immediately                              │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                            │                                        │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │               AI AGENT ORCHESTRATOR                          │   │
│  │                                                              │   │
│  │  src/ai/agent.ts — handleMessage() / handleChat()            │   │
│  │                                                              │   │
│  │  Decision tree:                                              │   │
│  │    ├─ Command detected (!prefix)?  → handleCommand()         │   │
│  │    ├─ Group + mentioned?           → handleSmartMessage()    │   │
│  │    ├─ Group + not mentioned?       → ignore                  │   │
│  │    └─ DM?                          → handleSmartMessage()    │   │
│  │                                                              │   │
│  │  handleSmartMessage() pipeline:                              │   │
│  │    ├─ Follow-up detection (session context)                  │   │
│  │    ├─ Greeting detection (short message pattern)             │   │
│  │    ├─ Pending ticket resolution (conversation state)         │   │
│  │    ├─ Broadcast intent detection                             │   │
│  │    ├─ Member name extraction (task queries)                  │   │
│  │    ├─ Self-reference detection ("tugas gw")                  │   │
│  │    ├─ Keyword-based query detection                          │   │
│  │    ├─ Creation intent → AI extraction → direct ticket create │   │
│  │    └─ Fallback → AI chat (CHAT_PROMPT)                      │   │
│  │                                                              │   │
│  │  Casual wrapper: addCasualTouch() — wraps responses with     │   │
│  │  Oro personality via lightweight AI call                     │   │
│  └────────────────────────┬─────────────────────────────────────┘   │
│                            │                                        │
│  ┌────────────────────────┼────────────────────────────────────┐   │
│  │            AI CLIENT (Anthropic SDK via z.ai)                │   │
│  │                                                              │   │
│  │  src/ai/anthropic-client.ts                                  │   │
│  │  • Anthropic SDK client → z.ai proxy endpoint                │   │
│  │  • Model: claude-sonnet-4-20250514                           │   │
│  │  • Retry with exponential backoff (3 attempts)               │   │
│  │  • Token usage tracking + CSV logging                        │   │
│  │  • Caller detection via stack trace                          │   │
│  │                                                              │   │
│  │  src/ai/prompts.ts                                           │   │
│  │  • SYSTEM_PROMPT — Oro personality definition                │   │
│  │  • EXTRACTION_PROMPT — ticket/query classification           │   │
│  │  • CHAT_PROMPT — conversational AI fallback                  │   │
│  │  • CASUAL_WRAP_PROMPT — response personality wrapper         │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                NOTION INTEGRATION LAYER                       │   │
│  │                                                              │   │
│  │  src/notion/notion-api-core.ts                               │   │
│  │  • Base HTTP client for Notion REST API v1                   │   │
│  │  • Rate limiter (3 req/sec sliding window)                   │   │
│  │  • Retry with exponential backoff (3 attempts)               │   │
│  │  • In-memory cache with configurable TTL per data type       │   │
│  │  • Auto-pagination for large query results                   │   │
│  │                                                              │   │
│  │  src/notion/notion-org-service.ts                            │   │
│  │  • Organization data: divisions, members, projects           │   │
│  │  • Backlog CRUD: list, search, update status/priority        │   │
│  │  • Division alias resolution (e.g. "ristek" → full name)    │   │
│  │  • Member nickname resolution                               │   │
│  │  • Bulk operations, assignment, stats                        │   │
│  │                                                              │   │
│  │  src/notion/ticket-service.ts                                │   │
│  │  • Ticket CRUD: create, search, archive, restore            │   │
│  │  • Detail retrieval (properties + blocks + comments)         │   │
│  │  • Note and comment addition                                │   │
│  │                                                              │   │
│  │  src/mcp/notion-client.ts                                    │   │
│  │  • MCP SDK client (stdio transport to Notion MCP Server)     │   │
│  │  • Lazy initialization, fallback to direct API               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  SUPPORTING SERVICES                          │   │
│  │                                                              │   │
│  │  src/services/session-manager.ts                             │   │
│  │  • In-memory per-user session store (Map<string, Session>)   │   │
│  │  • Conversation history (last 10 turns per user)             │   │
│  │  • Context tracking (last intent, topic, entities)           │   │
│  │  • Follow-up detection (reference, confirmation, detail)     │   │
│  │  • TTL-based expiry (30 min idle → evicted)                  │   │
│  │                                                              │   │
│  │  src/services/contact-lookup.ts                              │   │
│  │  • Phone number normalization (→ 62xxx format)               │   │
│  │  • Contact lookup by phone, name, nickname, pushName         │   │
│  │  • Static contact database (contacts.json)                   │   │
│  │                                                              │   │
│  │  src/services/notification.ts                                │   │
│  │  • Outbound WA notification to PIC on ticket creation        │   │
│  │  • Retry once on failure                                     │   │
│  │                                                              │   │
│  │  src/wa/sender.ts                                            │   │
│  │  • Evolution API message sender (text, media)                │   │
│  │  • LID → phone number resolution (5 strategies)              │   │
│  │  • Message chunking (>3800 chars split at line boundaries)   │   │
│  │  • LID cache persistence to disk (/app/cache/lid-cache.json) │   │
│  │                                                              │   │
│  │  src/utils/helpers.ts                                        │   │
│  │  • Ticket ID generation (TK-YYYYMMDD-XXX)                   │   │
│  │  • Department normalization, JSON extraction                  │   │
│  │                                                              │   │
│  │  src/utils/message-template.ts                               │   │
│  │  • Greeting templates, PIC notification templates             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTPS REST API
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                               │
│                                                                     │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐   │
│  │  Notion API          │    │  z.ai API Proxy                  │   │
│  │  (api.notion.com/v1) │    │  (api.z.ai/api/anthropic)        │   │
│  │                      │    │                                  │   │
│  │  Databases:          │    │  Anthropic-compatible endpoint   │   │
│  │  • Master Backlog    │    │  Model: claude-sonnet-4-20250514 │   │
│  │  • Master Projects   │    │  Backend: GLM                    │   │
│  │  • Divisions         │    └──────────────────────────────────┘   │
│  │  • Members           │                                         │
│  └──────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        src/index.ts                              │
│                  Fastify Server Entry Point                      │
│                  Port 3000 · tsx runtime                         │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│  src/config.ts           │    │  src/webhook/handler.ts          │
│  Zod-validated env       │    │  Route registration              │
│  config                  │    │  Message processing pipeline      │
└──────────────────────────┘    └──────────┬───────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
┌───────────────────────┐ ┌──────────────────────┐ ┌────────────────────┐
│ src/ai/agent.ts       │ │ src/services/*.ts    │ │ src/wa/sender.ts   │
│ Message routing       │ │                      │ │                    │
│ Command parsing       │ │ session-manager.ts   │ │ Evolution API      │
│ Intent detection      │ │ contact-lookup.ts    │ │ message sender     │
│ Ticket creation       │ │ notification.ts      │ │ LID resolution     │
│ Query handling        │ └──────────────────────┘ │ Media download     │
│ Broadcast             │                          └────────────────────┘
│ Casual wrapper        │
└───────┬───────┬───────┘
        │       │
        ▼       ▼
┌──────────────┐ ┌──────────────────────────────────────────────────┐
│ src/ai/      │ │ src/notion/                                      │
│              │ │                                                  │
│ anthropic-   │ │ notion-api-core.ts    — Base HTTP client        │
│ client.ts    │ │   Rate limiting · Retry · Cache · Pagination    │
│              │ │                                                  │
│ prompts.ts   │ │ notion-org-service.ts  — Organization data      │
│              │ │   Divisions · Members · Projects · Backlog      │
│              │ │   Alias resolution · Stats · Bulk ops           │
│              │ │                                                  │
│              │ │ ticket-service.ts      — Ticket CRUD             │
│              │ │   Create · Search · Archive · Restore           │
│              │ │   Detail · Notes · Comments                     │
│              │ │                                                  │
│              │ │ src/mcp/notion-client.ts                         │
│              │ │   MCP SDK client (stdio, lazy init)             │
└──────────────┘ └──────────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
┌──────────────┐         ┌──────────────────┐
│ z.ai Proxy   │         │ Notion API       │
│ (Anthropic   │         │ (REST v1)        │
│  compatible) │         │                  │
└──────────────┘         │ 4 Databases:     │
                         │  Master Backlog   │
                         │  Master Projects  │
                         │  Divisions        │
                         │  Members          │
                         └──────────────────┘
```

---

## 3. Data Flow — End-to-End Message Processing

```
User       WhatsApp   Evolution API   Fastify Webhook   AI Agent    Notion API
 |            |            |               |                |             |
 |──"buat    |            |               |                |             |
 |  tiket"──>│            |               |                |             |
 |           │──message──>│               |                |             |
 |           │            │──POST         |                |             |
 |           │            │  webhook─────>│                |             |
 |           │            │               │─validate       |             |
 |           │            │               │─deduplicate    |             |
 |           │            │               │─rate limit     |             |
 |           │            │               │─extract text   |             |
 |           │            │               │─contact lookup |             |
 |           │            │               │─session check  |             |
 |           │            │<──200 OK──────│                |             |
 |           │            │               │                |             |
 |           │            │               │──async────────>│             |
 |           │            │               │                │─parse cmd   |
 |           │            │               │                │─no command  |
 |           │            │               │                │─AI extract──┤
 |           │            │               │                │<──JSON      |
 |           │            │               │                │  is_ticket  |
 |           │            │               │                │             |
 |           │            │               │                │─resolve IDs─┤
 |           │            │               │                │  (division, |
 |           │            │               │                │   project,  |
 |           │            │               │                │   members)──┤
 |           │            │               │                │<──page IDs──|
 |           │            │               │                │             |
 |           │            │               │                │─create──────┤
 |           │            │               │                │  ticket─────>│
 |           │            │               │                │<──page URL──|
 |           │            │               │                │             |
 |           │            │               │                │─notify PIC  |
 |           │            │               │                │ (async)     |
 |           │            │               │<──response─────│             |
 |           │            │               │                │             |
 |           │            │──send message─│                │             |
 |           │<──"Tiket   │               │                │             |
 |<──"Tiket──│  berhasil  │               │                │             |
 |  berhasil │  dibuat"───│               │                │             |
 |  dibuat"  │            │               │                │             |
```

---

## 4. API Flow

### 4.1 Inbound: WhatsApp Message Reception

```
Evolution API ──POST──> /webhook/:instanceName
                        │
                        ├─ Validate instance name
                        ├─ Filter: MESSAGES_UPSERT only
                        ├─ Skip: fromMe === true
                        ├─ Deduplicate: msgId check (60s window)
                        ├─ Extract: text / image caption
                        ├─ Handle: image attachment to ticket
                        ├─ Rate limit: 20/min per user
                        ├─ Group: check bot mention
                        ├─ Lookup: contact by phone
                        ├─ Dispatch: async to AI agent
                        └─ Return: 200 { status: "received" }
```

### 4.2 Outbound: Message Sending via Evolution API

```
Oro Bot ──POST──> Evolution API /message/sendText/:instance
                  │
                  ├─ Resolve LID → phone number (if needed)
                  ├─ Split message if > 3800 chars
                  ├─ Send with presence: "composing"
                  └─ Return: message key
```

### 4.3 AI Processing Flow

```
handleMessage(message, context)
  │
  ├─ getOrCreateSession(phone, name)
  ├─ saveUserMessage(phone, message)
  │
  ├─ parseCommand(message)?
  │    └─ YES → handleCommand() → 30+ command handlers
  │
  ├─ isGroup && isBotMentioned?
  │    └─ YES → handleSmartMessage()
  │
  ├─ isGroup && !mentioned?
  │    └─ return "" (ignore)
  │
  └─ DM → handleSmartMessage()
       │
       ├─ detectFollowUp() → handleFollowUpQuestion()
       ├─ Greeting pattern → return greeting
       ├─ Pending ticket? → resolve PIC name
       ├─ Broadcast intent → handleBroadcastTaskNotifications()
       ├─ Member name extracted → getBacklogByMemberName()
       ├─ Self-reference detected → getBacklogByMemberName(self)
       ├─ Stats/project/list/help intent → direct handler
       ├─ Keyword-based query → handleQuery()
       ├─ Creation intent → AI extraction (EXTRACTION_PROMPT)
       │    ├─ is_query → handleQuery()
       │    ├─ is_ticket → handleCreateTicket()
       │    └─ neither → handleChat()
       └─ Fallback → handleChat() (CHAT_PROMPT)
```

### 4.4 Notion API Interaction

```
Agent Layer
  │
  ├─ notion-api-core.ts (base client)
  │    ├─ notionRequest() — rate-limited, retried HTTP calls
  │    ├─ queryDatabaseAll() — auto-paginated queries
  │    ├─ getCached() — TTL-based in-memory cache
  │    ├─ createPage() / updatePage() / archivePage()
  │    ├─ getBlockChildren() / appendBlocks()
  │    └─ getComments() / createComment()
  │
  ├─ notion-org-service.ts
  │    ├─ listBacklog() / searchBacklog()
  │    ├─ listProjects() / getProjectDetails()
  │    ├─ listDivisions() / listMembers()
  │    ├─ updateBacklogStatus() / updateBacklogPriority()
  │    ├─ getBacklogByDivision() / getBacklogByMemberName()
  │    ├─ assignPicToBacklog() / removePicFromBacklog()
  │    ├─ bulkUpdateBacklogStatus()
  │    └─ resolveDivisionAlias() / resolveNickname()
  │
  └─ ticket-service.ts
       ├─ createTicketDirect() — full ticket creation with relations
       ├─ searchPagesDirect() — search by ticket ID or text
       ├─ archiveTicketDirect() / restoreTicketDirect()
       ├─ getTicketDetail() — properties + blocks + comments
       └─ addTicketNote() / addTicketComment()
```

---

## 5. Notion Database Schema

The bot interacts with **4 Notion databases** in a single workspace:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     NOTION WORKSPACE                                │
│                                                                     │
│  ┌──────────────────┐     ┌──────────────────────────────────┐     │
│  │  Master Backlog   │     │  Master Projects                 │     │
│  │  (NOTION_MASTER_  │     │  (NOTION_MASTER_PROJECTS_ID)     │     │
│  │   BACKLOG_ID)     │     │                                  │     │
│  │                   │     │  Properties:                     │     │
│  │  Properties:      │     │  • Name (title)                  │     │
│  │  • Name (title)   │     │  • Divisions (relation → Div)    │     │
│  │  • Status         │     │  • Head of Project (relation)    │     │
│  │    (Not started,  │     │  • Backlog (relation ← Backlog)  │     │
│  │     In progress,  │     └──────────────┬───────────────────┘     │
│  │     Need to       │                    │                         │
│  │     review,       │     ┌──────────────┴───────────────────┐     │
│  │     Need to fix,  │     │  Divisions                       │     │
│  │     Done,         │     │  (NOTION_DIVISIONS_ID)            │     │
│  │     Blocking)     │     │                                  │     │
│  │  • Priority       │     │  Properties:                     │     │
│  │    (High, Medium, │     │  • Name (title)                  │     │
│  │     Low)          │     │  • Members (relation → Members)  │     │
│  │  • PIC            │     └──────────────┬───────────────────┘     │
│  │    (relation →    │                    │                         │
│  │     Members)      │     ┌──────────────┴───────────────────┐     │
│  │  • Division       │     │  Members                         │     │
│  │    (relation →    │     │  (NOTION_MEMBERS_ID)              │     │
│  │     Divisions)    │     │                                  │     │
│  │  • Project        │     │  Properties:                     │     │
│  │    (relation →    │     │  • Name (title)                  │     │
│  │     Projects)     │     │  • Division (relation → Div)     │     │
│  │  • Ticket ID      │     │  • Phone (phone number)          │     │
│  │    (TK-XXXXXXXX-  │     │  • Role                          │     │
│  │     XXX)          │     └──────────────────────────────────┘     │
│  │  • Reporter       │                                            │
│  │  • Reviewed By    │     Relations:                              │
│  │    (relation →    │     Backlog ←→ Division (N:N)              │
│  │     Members)      │     Backlog ←→ Project  (N:N)              │
│  │  • Deadline       │     Backlog ←→ Members/PIC (N:N)           │
│  │  • Description    │     Backlog ←→ Members/Reviewer (N:N)      │
│  │    (page content) │     Project ←→ Division (N:N)              │
│  └───────────────────┘     Project ←→ Members/HOP (N:N)           │
│                             Division ←→ Members (N:N)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Session Management (In-Memory)

Sessions are stored entirely in-memory using a `Map<string, SessionData>` keyed by phone number.

```
SessionData
├── User Identity
│   ├── userName: string
│   └── userPhone: string
├── Conversation Context
│   ├── lastIntent: string | null        (e.g. "ticket_created", "member_tasks")
│   ├── lastTopic: string | null
│   ├── lastTicketId: string | null
│   ├── lastTicketName: string | null
│   ├── lastProject: string | null
│   ├── lastDivision: string | null
│   └── lastMemberName: string | null
├── Active Entities
│   ├── activeTicketIds: string[]
│   ├── activeTicketNames: string[]
│   ├── activeProject: string | null
│   ├── activeMemberName: string | null
│   └── lastNotionResults: NotionResultItem[]  (up to 20)
├── Conversation History
│   └── recentMessages: ConversationTurn[]    (last 10 turns)
└── Metadata
    ├── createdAt: number
    ├── lastActivityAt: number
    └── messageCount: number
```

**Lifecycle:**
- Created on first message from a phone number
- Updated on every message (user + assistant)
- Evicted after 30 minutes of inactivity (cleanup interval: 5 minutes)
- Conversation history capped at 10 turns (FIFO)
- Notion results capped at 20 items

---

## 7. Command System

Oro supports both `!`-prefixed commands and natural language:

### 7.1 Explicit Commands (!-prefix)

| Command | Handler | Description |
|---|---|---|
| `!list [dept]` | handleListAll / handleListByDept | List all or filtered backlog |
| `!status TK-xxx` | handleCheckStatus | Check ticket status |
| `!close TK-xxx` | handleCloseTicket | Mark ticket as Done |
| `!delete TK-xxx` | handleDeleteTicket | Archive a ticket |
| `!assign TK-xxx @name` | handleAssignTicket | Assign PIC to ticket |
| `!update TK-xxx field value` | handleUpdateTicket | Update status/priority |
| `!projects` | handleProjectList | List all projects |
| `!project <name>` | handleProjectInfo | Project details + backlog |
| `!backlog search <q>` | handleBacklogSearch | Search backlog items |
| `!backlog update <n> field val` | handleBacklogUpdate | Update backlog item |
| `!backlog division <name>` | handleBacklogDivision | Backlog by division |
| `!backlog status <value>` | handleBacklogByStatus | Backlog by status |
| `!backlog delete <name>` | handleBacklogDelete | Archive backlog item |
| `!backlog restore <name>` | handleBacklogRestore | Restore archived item |
| `!backlog bulk <from> to <to>` | handleBacklogBulk | Bulk status update |
| `!detail <ticket>` | handleTicketDetail | Full ticket detail |
| `!note <ticket> <text>` | handleTicketNote | Add note to ticket |
| `!comment <ticket> <text>` | handleTicketComment | Add comment to ticket |
| `!members [division]` | handleMembersList | List members |
| `!divisions` | handleDivisionsList | List all divisions |
| `!tugas <member>` | handleMemberTasks | Tasks assigned to member |
| `!assignpic <ticket> <member>` | handleAssignPic | Assign PIC to backlog |
| `!unassignpic <ticket> <member>` | handleUnassignPic | Remove PIC from backlog |
| `!refresh` | handleCacheRefresh | Force cache refresh |
| `!stats` | handleStats | Backlog statistics |
| `!help` | handleHelp | Show help text |
| `!db create <name> in <parent>` | handleDbCreate | Create Notion database |
| `!db schema <id>` | handleDbSchema | Get database schema |
| `!subpage <parent> <title>` | handleSubPageCreate | Create sub-page |
| `!image <ticket> <url>` | handleTicketImage | Attach image to ticket |

### 7.2 Natural Language Processing

Messages without `!` prefix go through the smart message pipeline:

1. **Follow-up detection** — references to previous context ("yang tadi", "statusnya")
2. **Greeting detection** — short greeting messages get time-aware response
3. **Pending ticket resolution** — multi-turn PIC name clarification
4. **Broadcast intent** — mass notification to all members
5. **Member task query** — "tugas farhan", "backlog punya iqbal"
6. **Self-reference** — "tugas gw", "backlog saya"
7. **Keyword-based query** — detected via pattern matching
8. **AI extraction** — EXTRACTION_PROMPT classifies as ticket/query/chat
9. **AI chat fallback** — CHAT_PROMPT for conversational responses

---

## 8. AI Integration

### 8.1 Anthropic Client via z.ai Proxy

```
Configuration:
  Base URL:  https://api.z.ai/api/anthropic  (Anthropic-compatible)
  Model:     claude-sonnet-4-20250514
  SDK:       @anthropic-ai/sdk ^0.91.1
  Max Tokens: 1024 (default), configurable per call

Retry Strategy:
  Max retries: 3
  Delays: 2s → 5s → 10s (exponential backoff)
  Retry on: HTTP 429 (rate limit), 5xx (server error)

Observability:
  • CSV log: logs/ai-calls.csv
  • Fields: timestamp, model, input_tokens, output_tokens, inference_ms, caller
  • Cumulative stats: totalCalls, totalTokens, avgInferenceMs
  • Stack-trace-based caller detection (agent.ts function names)
```

### 8.2 Prompt Architecture

| Prompt | Purpose | Input | Output |
|---|---|---|---|
| `SYSTEM_PROMPT` | Oro personality definition | N/A | N/A (system context) |
| `EXTRACTION_PROMPT` | Classify message as ticket/query/chat | User message + conversation context | JSON: `{is_ticket, is_query, judul, deskripsi, pics, ...}` |
| `CHAT_PROMPT` | Conversational AI fallback | User message + pushName | Natural language response |
| `CASUAL_WRAP_PROMPT` | Add Oro personality to system responses | System-generated message | Wrapped message with casual touch |

---

## 9. Deployment Architecture

### 9.1 Docker Compose Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                       Docker Network                             │
│                    wa-bot-network (bridge)                       │
│                                                                  │
│  ┌──────────────────────┐     ┌──────────────────────────────┐  │
│  │  orchestrator         │     │  evolution-api               │  │
│  │  wa-orchestrator      │     │  wa-evolution-api            │  │
│  │                      │     │                              │  │
│  │  Node.js 20 (slim)   │     │  atendai/evolution-api:v1.8.7│  │
│  │  TypeScript compiled │     │                              │  │
│  │  Port: 3000          │     │  Port: 8080                  │  │
│  │                      │     │  WhatsApp Web.js bridge      │  │
│  │  Env vars:           │     │  Session persistence         │  │
│  │  • AI keys           │     │  Contact store               │  │
│  │  • Notion keys       │     │  Webhook delivery            │  │
│  │  • Evolution URL     │     │                              │  │
│  │                      │     │  Depends on:                 │  │
│  │  Depends on:         │     │  • postgres                  │  │
│  │  • redis (healthy)   │     │                              │  │
│  └──────────┬───────────┘     └──────────┬───────────────────┘  │
│             │                             │                      │
│             │    ┌──────────────────┐     │                      │
│             │    │  redis            │     │                      │
│             │    │  wa-redis         │     │                      │
│             │    │                  │     │                      │
│             │    │  Redis 7 Alpine  │     │                      │
│             │    │  Port: 6379      │     │                      │
│             │    │  Volume: data    │     │                      │
│             │    └──────────────────┘     │                      │
│             │                              │                      │
│             │    ┌─────────────────────────┘                      │
│             │    │                                                │
│             │    ▼                                                │
│             │  ┌──────────────────┐                              │
│             │  │  postgres         │                              │
│             │  │  wa-postgres      │                              │
│             │  │                   │                              │
│             │  │  PostgreSQL 16    │                              │
│             │  │  Alpine           │                              │
│             │  │  Port: 5432       │                              │
│             │  │  DB: evolution    │                              │
│             │  │  Volume: data     │                              │
│             │  └──────────────────┘                              │
│             │                                                     │
│             │  Volumes:                                          │
│             │  • postgres_data — Evolution DB                    │
│             │  • redis_data — Evolution cache                    │
│             │  • evolution_store — WA session files              │
│             │  • evolution_instances — WA instances              │
│             │  • lid_cache — LID→phone mapping (orchestrator)    │
└─────────────┴────────────────────────────────────────────────────┘
```

### 9.2 Service Details

| Service | Image | Port | Purpose |
|---|---|---|---|
| **orchestrator** | Custom Dockerfile (node:20-slim) | 3000 | Fastify server, AI agent, Notion client |
| **evolution-api** | atendai/evolution-api:v1.8.7 | 8080 | WhatsApp gateway, webhook delivery |
| **postgres** | postgres:16-alpine | 5432 | Evolution API session/auth database |
| **redis** | redis:7-alpine | 6379 | Evolution API internal cache |

### 9.3 Important Notes

- **PostgreSQL and Redis** are used exclusively by Evolution API — the Oro Bot application itself does not use them directly
- **Oro Bot session management** is entirely in-memory (no Redis dependency for sessions)
- **LID cache** is persisted to disk at `/app/cache/lid-cache.json` inside the orchestrator container
- **AI call logs** are written to `/app/logs/ai-calls.csv` inside the orchestrator container
- The orchestrator depends on Redis being healthy (for future use), but current session management is in-memory

---

## 10. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | 20 (slim) | Server runtime |
| **Language** | TypeScript | ^5.8.3 | Type-safe development |
| **Dev Runtime** | tsx | ^4.19.4 | TypeScript execution (dev mode) |
| **Web Framework** | Fastify | ^5.3.3 | HTTP server and routing |
| **AI SDK** | @anthropic-ai/sdk | ^0.91.1 | Anthropic API client |
| **AI Provider** | z.ai proxy | — | Anthropic-compatible API endpoint |
| **AI Model** | claude-sonnet-4-20250514 | — | Message classification, extraction, chat |
| **MCP SDK** | @modelcontextprotocol/sdk | ^1.12.1 | Notion MCP Server client (stdio) |
| **Notion API** | REST v1 | 2022-06-28 | Database CRUD, page operations |
| **WhatsApp Gateway** | Evolution API | v1.8.7 | WhatsApp Web.js bridge |
| **Validation** | Zod | ^3.24.4 | Environment config validation |
| **Database** | PostgreSQL | 16-alpine | Evolution API backing store |
| **Cache** | Redis | 7-alpine | Evolution API internal cache |
| **Containerization** | Docker Compose | — | Multi-service orchestration |
| **Testing** | Vitest | ^3.1.3 | Unit tests |

---

## 11. Security Architecture

### 11.1 Inbound Message Security

```
Layer 1: WhatsApp E2E Encryption (user ↔ WhatsApp server)
Layer 2: HTTPS (Evolution API ↔ Oro Bot webhook)
Layer 3: Instance name validation (reject unknown instances)
Layer 4: Message deduplication (prevent replay attacks)
Layer 5: Rate limiting (20 msg/min per user, in-memory)
Layer 6: From-me filtering (ignore bot's own messages)
```

### 11.2 Outbound Security

```
Layer 1: API key authentication (Evolution API key header)
Layer 2: Notion API bearer token authentication
Layer 3: z.ai API key authentication (Anthropic-compatible)
Layer 4: Internal Docker network (services not exposed externally)
```

### 11.3 Data Security

```
• No persistent user data storage (sessions are in-memory only)
• Contact database is static JSON (contacts.json, not user-facing)
• AI call logs contain only metadata (no message content)
• LID cache contains only JID → phone mappings
• Environment secrets via Docker Compose env vars
```

---

## 12. Caching Strategy

The Notion integration uses a multi-tier in-memory caching system:

| Cache Key | TTL | Purpose |
|---|---|---|
| `backlog` | 2 min | Master Backlog query results |
| `projects` | 5 min | Master Projects list |
| `members` | 10 min | Members database |
| `relations` | 10 min | Division/member relation data |
| `page:detail:<id>` | Until invalidated | Individual page details |

- Cache is invalidated on write operations (ticket creation, updates)
- Notion webhook events (`POST /notion/webhook`) trigger targeted cache invalidation
- `!refresh` command forces full cache refresh via `refreshAllCaches()`

---

## 13. Error Handling

### 13.1 AI Layer

```
• Retry: 3 attempts with exponential backoff (2s, 5s, 10s)
• Retryable: HTTP 429, 5xx
• Non-retryable: HTTP 4xx (except 429)
• Fallback: On extraction failure → route to handleChat()
• Casual wrap failure → return original message with simple prefix
```

### 13.2 Notion API

```
• Retry: 3 attempts with exponential backoff (1s, 3s, 6s)
• Rate limiting: 3 req/sec sliding window
• Auto-pagination: transparent handling of large result sets
• Cache fallback: stale data served on API failure
```

### 13.3 WhatsApp Sending

```
• LID resolution: 5 fallback strategies (profilePic → pushName → direct → brute-force → last resort)
• Message chunking: automatic split at >3800 chars
• PIC notification: retry once on failure
```

---

## 14. Logging & Observability

### 14.1 Application Logs (stdout)

```
[Webhook] DM from John: "buat tiket untuk ristek..."
[Agent] Creation intent detected from John: "buat tiket untuk ristek" — routing to AI extraction
[AI-Call] handleSmartMessage | 450in 120out tokens | 2300ms
[Agent] Direct ticket creation from John: "buat tiket untuk ristek"
[Agent] Creating ticket TK-20260515-789: divisi=Research and Technology, priority=Medium
[Agent] Ticket TK-20260515-789 created successfully
[WA Sender] Sending to DM: 6281234567890... (chunk 1/1, 245 chars)
[Webhook] Replied to John
```

### 14.2 AI Call Log (CSV)

```csv
timestamp,model,input_tokens,output_tokens,inference_ms,caller
2026-05-15T10:00:00Z,claude-sonnet-4-20250514,450,120,2300,handleSmartMessage
```

### 14.3 Monitoring Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Service health check |
| `GET /ai-stats` | AI call statistics + recent logs |
| `GET /` | Service info (name, version, status) |
