# Orchestrator Design — Oro Bot Agent

> The actual implementation of the Oro Bot brain, as found in `src/ai/agent.ts` (2670 lines).

---

## 1. Architecture Overview

Oro Bot is a WhatsApp-based AI assistant for SGA Cakrawala Universe. It manages tickets, backlog items, projects, and team coordination through Notion. The agent is a single-file orchestrator that combines regex-based command parsing with AI-powered natural language understanding.

### 1.1 Component Map

```
                        ┌──────────────────────────────────────────────────┐
                        │                  ORO BOT AGENT                   │
                        │              (src/ai/agent.ts)                   │
                        │                                                  │
  WhatsApp          ──► │  handleMessage(message, context)                │
  Message               │    │                                             │
  (from webhook)        │    ├── Session Manager (session-manager.ts)     │
                        │    │     getOrCreateSession / saveUserMessage   │
                        │    │                                             │
                        │    ├── Command Parser (parseCommand)            │
                        │    │     30+ regex patterns → {command, args}   │
                        │    │     │                                       │
                        │    │     └── handleCommand → switch/case router │
                        │    │                                             │
                        │    └── Smart Message Handler (handleSmartMessage│
                        │          │                                      │
                        │          ├── Follow-up Detection                │
                        │          ├── Greeting Detection                 │
                        │          ├── Pending Ticket State               │
                        │          ├── Broadcast Intent                   │
                        │          ├── Member Name Extraction             │
                        │          ├── Self-Reference Detection           │
                        │          ├── Stats/Project/List/Help Intents    │
                        │          ├── Creation Intent → AI Extraction    │
                        │          ├── Keyword-based Query Detection      │
                        │          └── AI Extraction (last resort)        │
                        │                │                                │
                        │                ├── is_ticket → handleCreateTicket│
                        │                ├── is_query  → handleQuery      │
                        │                └── otherwise → handleChat       │
                        │                                                  │
                        │  Casual Wrapper (addCasualTouch)                │
                        │  Notion Services (ticket-service, org-service)  │
                        │  Contact Lookup (contact-lookup.ts)             │
                        │  Notification Service (notification.ts)         │
                        └──────────────────────────────────────────────────┘
```

### 1.2 Key Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Fast Execution** | Tickets are created immediately without confirmation. No "mau aku proses ya?" loops. |
| **Dual-Path Routing** | Commands (`!`) use regex parsing (fast, free). Natural language uses AI extraction (flexible, costs tokens). |
| **Priority-Based Detection** | Smart message handler uses a strict ordering — follow-ups, greetings, state, then intent detection. Order matters. |
| **Graceful Degradation** | If AI extraction fails, fall back to general chat. If casual wrapper fails, return original message. |
| **Async Notifications** | WhatsApp notifications to PICs are sent via `setImmediate` — non-blocking, fire-and-forget. |

---

## 2. Message Processing Pipeline

### 2.1 Main Entry: `handleMessage(message, context)`

```
  Incoming Message (WhatsApp webhook)
        │
        ▼
  ┌─────────────────────────────┐
  │ 1. SESSION                  │
  │    getOrCreateSession()     │
  │    saveUserMessage()        │
  └─────────────┬───────────────┘
                │
                ▼
  ┌─────────────────────────────┐
  │ 2. COMMAND CHECK            │
  │    parseCommand(message)    │
  │    Returns {command, args}  │
  └─────────────┬───────────────┘
                │
        ┌───────┴───────┐
        │ Command found?│
        └───────┬───────┘
           Yes  │   No
          ┌─────┘   └──────────────────────┐
          ▼                                 ▼
  ┌───────────────┐              ┌─────────────────────┐
  │ handleCommand │              │ 3. GROUP CHECK       │
  │ (switch/case) │              │    isGroup &&        │
  │       │       │              │    !isBotMentioned?  │
  │       ▼       │              └──────────┬──────────┘
  │ addCasualTouch│                    Yes   │   No
  │       │       │               ┌──────────┘   └──────────┐
  │       ▼       │               ▼                         ▼
  │ Return result │         Return ""              ┌─────────────────┐
  └───────────────┘         (ignore)               │ 4. SMART MSG    │
                                                    │ handleSmartMsg  │
                                                    │ (AI-powered)    │
                                                    └────────┬────────┘
                                                             │
                                                             ▼
                                                    ┌─────────────────┐
                                                    │ saveAssistant   │
                                                    │ Response()      │
                                                    │ Return result   │
                                                    └─────────────────┘
```

### 2.2 MessageContext Interface

Every message carries a context object:

```typescript
interface MessageContext {
  phoneNumber: string;     // Group/bot number
  pushName: string;        // Display name of sender
  senderPhone?: string;    // Actual sender phone (for contact lookup)
  groupName?: string;      // Group name (if group message)
  isGroup: boolean;        // Whether from a group chat
  isBotMentioned?: boolean; // Whether bot was @mentioned in group
}
```

### 2.3 Group vs DM Behavior

| Scenario | Behavior |
|----------|----------|
| DM, any message | Full smart message processing |
| Group, bot is mentioned | Full smart message processing |
| Group, bot NOT mentioned | Return `""` (ignore completely) |

---

## 3. Command Parser

### 3.1 `parseCommand(message) → ParsedCommand | null`

The command parser uses **30+ regex patterns** tested in strict order. All commands start with `!` or are natural-language ticket ID references. Returns `{ command: string, args: string }` or `null`.

### 3.2 Complete Command Registry

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          COMMAND REGISTRY                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TICKET MANAGEMENT                                                           │
│  ├─ !status TK-XXXXXXXX-XXX         → check_status                          │
│  ├─ !list [department]              → list_dept / list_all                  │
│  ├─ !update TK-xxx [field] [value]  → update_ticket                         │
│  ├─ !close TK-xxx                   → close_ticket                          │
│  ├─ !delete TK-xxx                  → delete_ticket                         │
│  ├─ !assign TK-xxx @name            → assign_ticket                         │
│  ├─ !detail <name/ID>               → ticket_detail                         │
│  ├─ !note <ticket> <text>           → ticket_note                           │
│  ├─ !comment <ticket> <text>        → ticket_comment                        │
│  └─ !image <ticket> <url>           → ticket_image                          │
│                                                                              │
│  BACKLOG MANAGEMENT                                                          │
│  ├─ !backlog search <query>         → backlog_search                        │
│  ├─ !backlog update <n> <f> <v>     → backlog_update                        │
│  ├─ !backlog division <name>        → backlog_division                      │
│  ├─ !backlog status <value>         → backlog_status                        │
│  ├─ !backlog delete <name>          → backlog_delete                        │
│  ├─ !backlog restore <name>         → backlog_restore                       │
│  └─ !backlog bulk <from> to <to>    → backlog_bulk                          │
│                                                                              │
│  PROJECT & ORGANIZATION                                                      │
│  ├─ !projects                       → project_list                          │
│  ├─ !project <name>                 → project_info                          │
│  ├─ !members [division]             → members_list                          │
│  ├─ !divisions                      → divisions_list                        │
│  ├─ !tugas <member name>            → member_tasks                          │
│  ├─ !assignpic <ticket> <member>    → assign_pic                            │
│  └─ !unassignpic <ticket> <member>  → unassign_pic                          │
│                                                                              │
│  SYSTEM                                                                      │
│  ├─ !help / !bantuan                → show_help                             │
│  ├─ !stats / !statistik             → show_stats                            │
│  ├─ !refresh / !sync                → cache_refresh                         │
│  ├─ !db create <name> in <parent>   → db_create                             │
│  ├─ !db schema <id>                 → db_schema                             │
│  └─ !subpage <parent> <title>       → subpage_create                        │
│                                                                              │
│  NATURAL LANGUAGE (no ! prefix)                                              │
│  └─ status/cek/info TK-XXXXXXXX-XXX → check_status                          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Command Router: `handleCommand(command, args, context)`

A `switch/case` dispatcher maps command strings to handler functions. Each handler is a dedicated async function:

```
handleCommand(command, args, context)
    │
    ├── check_status    → handleCheckStatus(args)
    ├── list_dept       → handleListByDept(args)
    ├── list_all        → handleListAll()
    ├── update_ticket   → handleUpdateTicket(args, context)
    ├── close_ticket    → handleCloseTicket(args, context)
    ├── delete_ticket   → handleDeleteTicket(args, context)
    ├── assign_ticket   → handleAssignTicket(args, context)
    ├── show_stats      → handleStats()
    ├── show_help       → handleHelp()
    ├── project_list    → handleProjectList()
    ├── project_info    → handleProjectInfo(args)
    ├── backlog_*       → handleBacklog*(args, context)
    ├── ticket_detail   → handleTicketDetail(args)
    ├── ticket_note     → handleTicketNote(args, context)
    ├── ticket_comment  → handleTicketComment(args, context)
    ├── members_list    → handleMembersList(args)
    ├── divisions_list  → handleDivisionsList()
    ├── member_tasks    → handleMemberTasks(args)
    ├── assign_pic      → handleAssignPic(args, context)
    ├── unassign_pic    → handleUnassignPic(args, context)
    ├── cache_refresh   → handleCacheRefresh()
    ├── db_create       → handleDbCreate(args, context)
    ├── db_schema       → handleDbSchema(args)
    ├── subpage_create  → handleSubPageCreate(args, context)
    ├── ticket_image    → handleTicketImage(args, context)
    └── default         → return ""
```

All command responses pass through `addCasualTouch()` before being returned.

---

## 4. Smart Message Handler

### 4.1 `handleSmartMessage(message, context, session)`

This is the AI-powered path for natural language messages. It uses a **strict priority-ordered detection chain** — the first match wins, and order is critical.

### 4.2 Detection Priority Chain (CRITICAL — Order Matters)

```
  Incoming Natural Language Message
        │
        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 1: Follow-up Question Detection                           │
  │   detectFollowUp(message, phone)                               │
  │   Types: confirmation, continuation, question_detail,          │
  │          reference_previous, update_request                    │
  │   → If matched: handleFollowUpQuestion() → RETURN             │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 2: Greeting Detection                                     │
  │   Pattern: /^(hai|halo|hello|hi|hey|pagi|siang|sore|malam)/   │
  │   Constraint: message length <= 25 chars                       │
  │   → Time-aware greeting + tip message → RETURN                 │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 3: Pending Ticket State Check                             │
  │   pendingTickets.get(phoneNumber)                              │
  │   TTL: 5 minutes                                               │
  │   → If pending: resolve PIC name → create ticket → RETURN      │
  │   → If "batal"/"cancel": delete state → RETURN                 │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 4: Broadcast Intent Detection                             │
  │   6 regex patterns for mass notification patterns              │
  │   e.g. "kirim notif ke semua anggota"                          │
  │   → handleBroadcastTaskNotifications() → RETURN                │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 5: Member Name Extraction                                 │
  │   4 primary patterns + 2 simple patterns                      │
  │   e.g. "tugas farhan", "kirim pesan ke faza"                  │
  │   Skipped if creation intent detected                          │
  │   → getBacklogByMemberName() → RETURN                          │
  │   → If notify intent: also send WA message to member           │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 6: Self-Reference Detection                               │
  │   Pronouns: gw/gua/gue/saya/aku/aq + task keywords            │
  │   OR short query with dong/yah/sih                            │
  │   → Resolve phone → full name via contact-lookup               │
  │   → getBacklogByMemberName(fullName) → RETURN                  │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 7: Stats Intent Detection                                 │
  │   "statistik backlog", "stats backlog", "ringkasan"            │
  │   → handleStats() → RETURN                                     │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 8: Project Intent Detection                               │
  │   "detail project X", "project landing page"                   │
  │   → handleProjectInfo() → RETURN                               │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 9: List-All Intent Detection                              │
  │   "list backlog", "semua backlog", "daftar backlog"            │
  │   → handleListAll() → RETURN                                   │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 10: Help Intent Detection                                 │
  │   "panduan", "bantuan", "cara pakai", "help"                   │
  │   → handleHelp() → RETURN                                      │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 11: Members/Divisions List Intent                         │
  │   "daftar anggota", "anggota ristek", "daftar divisi"          │
  │   → handleMembersList() / handleDivisionsList() → RETURN       │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 12: Creation Intent Detection                             │
  │   /\b(buat|bikin|tambah|create|new)\b/ + task keyword          │
  │   → Falls through to AI Extraction (step 14)                   │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 13: Keyword-Based Query Detection                         │
  │   50+ query keywords + division detection + reading intent     │
  │   → handleQuery() → RETURN                                     │
  └───────────────────────────┬─────────────────────────────────────┘
                              │ (no match)
                              ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ STEP 14: AI Extraction (Last Resort)                           │
  │   EXTRACTION_PROMPT → Claude AI → JSON parse                   │
  │   → is_ticket: handleCreateTicket() → RETURN                   │
  │   → is_query:  handleQuery() → RETURN                          │
  │   → otherwise: handleChat() → RETURN                           │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 5. AI Extraction Flow

### 5.1 Overview

When no pattern-based detection matches, the agent sends the message to Claude AI with the `EXTRACTION_PROMPT`. The AI returns structured JSON indicating whether the message is a ticket, query, or general chat.

### 5.2 Flow Diagram

```
  ┌──────────────────────────────────────────────────────────┐
  │                    AI EXTRACTION FLOW                     │
  │                                                          │
  │  1. Build prompt                                         │
  │     EXTRACTION_PROMPT.replace("{message}", message)      │
  │     + conversation context (if available)                │
  │                                                          │
  │  2. Call Claude AI                                       │
  │     createMessage([{ role: "user", content: prompt }])   │
  │                                                          │
  │  3. Parse response                                       │
  │     extractJSON(textBlock.text)                          │
  │                                                          │
  │  4. Route based on result:                               │
  │     ┌───────────────────────────────────────────┐        │
  │     │                                           │        │
  │     │  is_query === true                        │        │
  │     │    → handleQuery(parsed, context)         │        │
  │     │    → addCasualTouch() → RETURN            │        │
  │     │                                           │        │
  │     │  is_ticket === true                       │        │
  │     │    → handleCreateTicket(parsed, context)  │        │
  │     │    → RETURN (no casual wrap on tickets)   │        │
  │     │                                           │        │
  │     │  is_ticket === false && is_query !== true │        │
  │     │    → handleChat(message, context)         │        │
  │     │    → RETURN                               │        │
  │     │                                           │        │
  │     └───────────────────────────────────────────┘        │
  │                                                          │
  │  ERROR FALLBACK:                                         │
  │     Any error → handleChat(message, context) → RETURN    │
  └──────────────────────────────────────────────────────────┘
```

### 5.3 AI Response Schema

```typescript
// Ticket creation response
{
  is_ticket: true,
  judul: string,          // max 60 chars, formal title
  deskripsi: string,      // professionally rephrased description
  departemen: string,     // division name from known list
  prioritas: "High" | "Medium" | "Low",
  pics: string[],         // full names, can be multiple
  project: string | null, // project name from known list
  status: string | null,  // initial status
  deadline: string | null,// YYYY-MM-DD format
  reviewedBy: string[] | null
}

// Query response
{
  is_query: true,
  query_type: "backlog_by_division" | "backlog_by_status" | "backlog_search" | "project_detail" | "stats",
  division: string | null,
  status: string | null,
  search: string | null
}

// Non-scope response
{
  is_ticket: false,
  reply: string   // empty string for out-of-scope, short reply for in-scope chat
}
```

### 5.4 Conversation Context Injection

When a session has conversation history, the agent injects a context summary into the extraction prompt:

```
--- CONVERSATION CONTEXT ---
Last intent: member_tasks
Topic: tugas iqbal
Last ticket: Fix Navbar Bug
Recent conversation:
  User: tugas iqbal apa aja
  Roro: *Tugas Iqbal* (5 item)...
--- END CONTEXT ---
IMPORTANT: If the message is a follow-up question referencing previous context,
set is_ticket=false and is_query=false.
```

---

## 6. Ticket Creation Flow

### 6.1 `handleCreateTicket(ticketData, context)`

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                     TICKET CREATION FLOW                            │
  │                                                                     │
  │  1. EXTRACT FIELDS                                                  │
  │     judul, deskripsi, divisi, project, prioritas,                  │
  │     pics[], reviewedBy[], deadline, status                          │
  │                                                                     │
  │  2. GENERATE TICKET ID                                              │
  │     generateTicketId() → TK-XXXXXXXX-XXX                           │
  │                                                                     │
  │  3. RESOLVE RELATIONS (parallel)                                    │
  │     ┌────────────────────────────────────────────────┐              │
  │     │  Promise.all([                                  │              │
  │     │    resolveDivisionPageId(divisi),               │              │
  │     │    resolveProjectPageId(project),               │              │
  │     │    ...pics.map(p => resolveMemberPageId(p)),    │              │
  │     │    ...reviewedBy.map(r => resolveMemberPageId(r))│             │
  │     │  ])                                            │              │
  │     └────────────────────────────────────────────────┘              │
  │              │                                                      │
  │              ▼                                                      │
  │  4. CHECK UNRESOLVED PICs                                           │
  │     ┌────────────────────┐                                          │
  │     │ Unresolved PICs?   │                                          │
  │     └────────┬───────────┘                                          │
  │         Yes  │    No                                                 │
  │        ┌─────┘    └──────────┐                                      │
  │        ▼                     ▼                                      │
  │  ┌──────────────┐    ┌──────────────────┐                           │
  │  │ Save pending │    │ 5. CREATE TICKET │                           │
  │  │ state in     │    │ createTicketDirect│                           │
  │  │ pendingTickets│    │ (Notion API)     │                           │
  │  │ Map          │    └────────┬─────────┘                           │
  │  │              │             │                                      │
  │  │ Ask user for │             ▼                                      │
  │  │ full PIC name│    ┌──────────────────┐                           │
  │  │ → RETURN     │    │ 6. NOTIFY PICs  │                           │
  │  └──────────────┘    │ setImmediate()   │                           │
  │                      │ notifyPIC()      │                           │
  │                      │ (async, non-     │                           │
  │                      │  blocking)       │                           │
  │                      └────────┬─────────┘                           │
  │                               │                                     │
  │                               ▼                                     │
  │                      ┌──────────────────┐                           │
  │                      │ 7. BUILD RESPONSE│                           │
  │                      │ Ticket ID, title,│                           │
  │                      │ PICs, division,  │                           │
  │                      │ priority, status,│                           │
  │                      │ project, deadline│                           │
  │                      │ Notion URL       │                           │
  │                      │ → RETURN         │                           │
  │                      └──────────────────┘                           │
  └─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Relation Resolution

Three resolver functions map human-readable names to Notion page IDs:

**`resolveDivisionPageId(name)`** — Alias resolution chain:
1. Try `resolveDivisionAlias()` (e.g., "ristek" → "Research and Technology")
2. Exact match against division list
3. Contains match (bidirectional)
4. Alias keywords match against division names

**`resolveProjectPageId(name)`** — Direct search:
1. `searchProject(name)` via Notion API
2. Returns project page ID or undefined

**`resolveMemberPageId(name)`** — Multi-strategy resolution:
1. Try `resolveNickname()` (e.g., "iqbal" → "Iqbal Azhari Pasaribu")
2. Exact match against member list
3. Full name contains match
4. Partial word match (split by space, skip parts < 2 chars)

### 6.3 Ticket ID Format

```
TK-XXXXXXXX-XXX
│   │        │
│   │        └── 3-digit sequence
│   └────────── 8-digit date (YYYYMMDD)
└────────────── "TK-" prefix

Example: TK-20260515-042
```

---

## 7. Follow-up Handler

### 7.1 `handleFollowUpQuestion(message, session, context, followUpType)`

The follow-up handler enables multi-turn conversations by detecting references to previously discussed topics. It uses session state (last intent, last topic, last Notion results) to resolve ambiguous follow-up messages.

### 7.2 Follow-up Types and Responses

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        FOLLOW-UP TYPE HANDLING                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CONFIRMATION ("ya", "tidak", "ok", "bisa")                              │
│  ├── "ya/betul/ok/gas/lanjut" → "Oke! Kalau ada yang lain, bilang aja"  │
│  ├── "tidak/gak/bukan"       → "Oke sip! Kalau butuh apa-apa lagi..."   │
│  └── "bisa"                  → "Bisa banget! Mau aku bantu apa nih?"    │
│                                                                          │
│  CONTINUATION ("terus gimana", "lalu")                                   │
│  ├── session.lastTopic exists → "Maksudnya soal *{topic}* yang tadi?"   │
│  └── no context              → "Maksudnya lanjut apa nih?"              │
│                                                                          │
│  QUESTION_DETAIL / REFERENCE_PREVIOUS                                    │
│  ├── "akun apa/cara akses"  → Notion access explanation                  │
│  ├── "deadline kapan"       → Filter lastNotionResults for deadlines     │
│  ├── "siapa pic"            → Filter lastNotionResults for PICs          │
│  ├── "statusnya/progress"   → List status from lastNotionResults         │
│  ├── "linknya/urlnya"       → Extract URLs from lastNotionResults        │
│  ├── "projectnya"           → Extract projects from lastNotionResults    │
│  ├── "divisinya"            → Return session.lastDivision                │
│  ├── "prioritasnya"         → List priorities from lastNotionResults     │
│  ├── "yang tadi/itu"        → Reference session.lastTopic or results     │
│  └── "detailnya"            → Re-run handleTicketDetail(lastTicketName)  │
│                                                                          │
│  UPDATE_REQUEST ("ubah status", "ganti pic")                             │
│  └── List active ticket names from session → "Mau ubah yang mana?"       │
│                                                                          │
│  FALLTHROUGH: return null → continue to normal detection chain           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Follow-up Detection (`detectFollowUp` in session-manager.ts)

The detection function checks 20+ patterns organized by type. Critical guard: if the message contains ticket creation intent (`buat tiket`, `bikin task`, etc.), it returns `null` immediately — creation intents are never treated as follow-ups.

```
detectFollowUp(message, phone)
    │
    ├── No session or no history? → return null
    │
    ├── Creation intent detected? → return null (never treat as follow-up)
    │
    ├── Pattern matching (in order):
    │   ├── reference_previous: "yang tadi", "yang itu", "barusan"
    │   ├── question_detail: "di akun apa", "deadline", "siapa pic", etc.
    │   ├── confirmation: "ya", "tidak", "ok", "bisa" (exact match, short)
    │   ├── continuation: "terus gimana", "lalu"
    │   ├── question_detail: "projectnya", "divisinya", "prioritasnya"
    │   └── update_request: "ubah status", "ganti pic"
    │
    └── Short question (< 30 chars) starting with question word + lastIntent?
        └── return "question_detail"
```

---

## 8. Casual Wrapper

### 8.1 `addCasualTouch(message, context)`

Wraps formal command responses with a friendly, casual personality. Uses AI to add a light conversational touch without modifying data.

### 8.2 Logic

```
  addCasualTouch(message, context)
        │
        ├── Message < 30 chars? → return original (too short)
        ├── Contains "Oro Bot"? → return original (help text)
        │
        ├── Try AI wrapping:
        │   ├── CASUAL_WRAP_PROMPT + message + pushName
        │   ├── createMessage() → Claude AI
        │   └── Return wrapped text
        │
        └── AI failed? (fallback)
            └── return "Sip, nih {pushName}!\n\n{message}"
```

### 8.3 CASUAL_WRAP_PROMPT Rules

The prompt enforces strict constraints:
1. Do NOT modify data, facts, or formatting
2. May add 1 short opening sentence (max 5 words)
3. Do NOT add closing remarks
4. Do NOT over-use emojis (max 1 if appropriate)
5. Output ONLY the enhanced message, no explanations
6. Never ask for confirmation

---

## 9. Pending Ticket State

### 9.1 Purpose

When a ticket creation request includes PIC names that cannot be resolved to known members, the agent saves the ticket data in a temporary state and asks the user to provide the full name.

### 9.2 Data Structure

```typescript
interface PendingTicket {
  ticketData: Record<string, unknown>;  // All parsed ticket fields
  context: MessageContext;               // Original message context
  unresolvedPics: string[];              // PIC names that couldn't be resolved
  createdAt: number;                     // Timestamp for TTL
}

// In-memory storage
const pendingTickets = new Map<string, PendingTicket>();  // phone → pending ticket
const PENDING_TICKET_TTL = 5 * 60 * 1000;  // 5 minutes
```

### 9.3 State Flow

```
  ┌───────────────────────────────────────────────────────────────┐
  │                  PENDING TICKET STATE FLOW                    │
  │                                                               │
  │  User: "buat tiket redesign navbar, assign ke ojan"          │
  │        (ojan not found in member list)                        │
  │                         │                                     │
  │                         ▼                                     │
  │  ┌─────────────────────────────────────┐                     │
  │  │ Save to pendingTickets.set(phone, { │                     │
  │  │   ticketData: {...},                │                     │
  │  │   unresolvedPics: ["ojan"],         │                     │
  │  │   createdAt: Date.now()             │                     │
  │  │ })                                  │                     │
  │  └──────────────┬──────────────────────┘                     │
  │                 │                                             │
  │                 ▼                                             │
  │  Bot: "Oke, tapi nama *ojan* belum aku kenali.              │
  │        Nama lengkapnya siapa ya?"                            │
  │                 │                                             │
  │                 ▼                                             │
  │  ┌──────────────────────────────────────┐                    │
  │  │ Next message from same user:         │                    │
  │  │                                      │                    │
  │  │  Option A: "Andi Fauzan H"           │                    │
  │  │    → resolveMemberPageId() → found!  │                    │
  │  │    → Replace "ojan" in pics[]        │                    │
  │  │    → All resolved? → create ticket   │                    │
  │  │                                      │                    │
  │  │  Option B: Still unresolved          │                    │
  │  │    → Ask again for next unresolved   │                    │
  │  │                                      │                    │
  │  │  Option C: "batal" / "cancel"        │                    │
  │  │    → pendingTickets.delete(phone)    │                    │
  │  │    → "Oke, dibatalkan"              │                    │
  │  └──────────────────────────────────────┘                    │
  │                                                               │
  │  CLEANUP: setInterval every 60s removes expired entries       │
  └───────────────────────────────────────────────────────────────┘
```

---

## 10. Self-Reference Detection

### 10.1 Purpose

Detects when a user is asking about their own tasks using pronouns ("backlog gw", "tugas saya") or implicit self-reference ("cek backlog dong").

### 10.2 Detection Patterns

```typescript
// Pronouns indicating self-reference
const selfPronouns = /\b(gw|gua|gue|saya|aku|aq|aing|me|my|gue)\b/i;

// Task keywords (with typo tolerance)
const taskKeyword = /\b(backlog|baglock|baclog|backlok|tugas|tiket|ticket|task|tasks)\b/i;

// Short query with dong/yah/sih (implicit self-reference)
const shortQueryDong = /\b(cek|lihat|tampilkan)\b.*\b(backlog|tugas|tiket|task)\b.*\b(dong|yah|sih|donk)\s*$/i;

// Combined detection
const isSelfRef = (taskKeyword.test(lowerMsg) && selfPronouns.test(lowerMsg))
              || shortQueryDong.test(lowerMsg);
```

### 10.3 Resolution Flow

```
  "cek backlog gw dong"
        │
        ▼
  Self-reference detected + context.senderPhone exists?
        │
        ├── Yes → getFullName(senderPhone)
        │         │
        │         ├── Name found → getBacklogByMemberName(fullName)
        │         │               → Format and return task list
        │         │
        │         └── Not found → "Nomor kamu belum terdaftar di database"
        │
        └── No senderPhone → Skip (can't resolve)
```

### 10.4 Priority Rule

Self-reference detection runs **after** member name extraction. If a specific member name is found (e.g., "tugas farhan"), it takes priority over self-reference. This prevents "tugas farhan" from being misinterpreted as the sender's own tasks.

---

## 11. Member Name Extraction

### 11.1 Purpose

Extracts a specific person's name from the message to show their tasks. This takes priority over self-reference detection.

### 11.2 Extraction Patterns (Ordered by Specificity)

```
  PATTERN 1: Notify intent (most specific)
  "kirim pesan ke faza", "kasih tau farhan", "ingetin iqbal"
  /(?:kirim(?:kan)?\s+(?:pesan\s+)?(?:ke|untuk)\s+|...)(\w+)/i

  PATTERN 2: Possessive with task
  "tugas yg dipunyai farhan", "tugas yang dimiliki satrio"
  /\b(?:tugas|tiket|backlog|task)\s+(?:ya?n?g?\s+)?(?:di(?:punyai|miliki)|punya)\s+(\w+)/i

  PATTERN 3: Ownership preposition
  "tugas dari farhan", "tiket milik satrio", "backlog punya iqbal"
  /\b(?:tugas|tiket|backlog|task)\s+(?:dari|milik|punya|...)\s+(\w+)/i

  PATTERN 4: Subject-verb inversion
  "farhan punya tugas apa", "satrio memiliki tugas"
  /(\w+(?:\s+\w+)?)\s+(?:punya|miliki)\s+(?:tugas|tiket|backlog|task)/i

  SIMPLE PATTERNS (fallback):
  "tugas farhan" (at end of message)
  "cek tugas satrio"
```

### 11.3 Guard: Skip for Creation Intent

```
  "buatin tiket untuk ivan" → isCreationIntent = true → SKIP extraction
  (This should create a ticket FOR ivan, not show ivan's tasks)
```

### 11.4 Notify Intent: Dual Action

When the message matches a notify pattern ("kirim pesan ke X", "ingetin X"), the agent:
1. Shows the member's task list to the sender
2. Sends a WhatsApp notification to the member directly

```
  User: "kirim pesan ke farhan tentang tugasnya"
        │
        ├── 1. getBacklogByMemberName("farhan") → task list
        ├── 2. Format response for sender
        ├── 3. findPhoneByName("farhan") → phone number
        ├── 4. sendDirectMessage(phone, notification) → WA message
        └── 5. Return response + "Pesan sudah dikirim ke Farhan via WA!"
```

---

## 12. Broadcast Task Notifications

### 12.1 `handleBroadcastTaskNotifications(context)`

Sends personalized task notifications to all members with active tasks. Each member receives ONLY their own tasks.

### 12.2 Flow

```
  ┌───────────────────────────────────────────────────────────────┐
  │               BROADCAST TASK NOTIFICATIONS                    │
  │                                                               │
  │  1. Load all contacts from contacts.json                     │
  │                                                               │
  │  2. FOR EACH contact:                                         │
  │     ├── getBacklogByMemberName(name) → all items             │
  │     ├── Filter: only active statuses                         │
  │     │   (Not started, In progress, Need to review,           │
  │     │    Need to fix, Blocking)                              │
  │     ├── No active tasks? → SKIP                              │
  │     ├── Invalid phone? → SKIP                                │
  │     ├── Build personal message (max 10 items)                │
  │     ├── sendDirectMessage(phone, message)                    │
  │     └── Wait 1 second (rate limit)                           │
  │                                                               │
  │  3. Return summary:                                           │
  │     Total: X | Sent: Y | No tasks: Z | Failed: W             │
  └───────────────────────────────────────────────────────────────┘
```

---

## 13. Query Handler

### 13.1 `handleQuery(queryData, context)`

Handles read/query operations against the backlog. Routes based on `query_type`.

```
  handleQuery(queryData)
        │
        ├── division present?  → getBacklogByDivision(division)
        ├── status present?    → getBacklogByStatusSummary(status)
        ├── keyword present?   → searchBacklog(keyword) → formatted results
        └── none of above?     → getBacklogStats() → summary dashboard
```

### 13.2 Keyword-Based Query Detection

Before falling back to AI extraction, the agent checks 50+ keyword patterns:

```
  Query Keywords:
    "cek status", "cek tiket", "cek backlog", "cek tugas", "cek project",
    "lihat tiket", "lihat backlog", "tampilkan tiket", "apa aja", "apa saja",
    "daftar tiket", "yang open", "yang in progress", "yang done",
    "berapa tiket", "summary", "ringkasan", "statistik",
    "update status", "ubah status", "progress", "udah selesai",
    "info tiket", "detail tiket", "hapus tiket", "tambah catatan",
    "siapa aja", "anggota", "member", "backlog"

  Additional checks:
    - Division alias detected in message + reading intent
    - Message starts with reading verb (cek, lihat, tampilkan, baca, info, detail)
    - NOT a creation intent (no "buat", "bikin", "tambah")
```

---

## 14. Session Management

### 14.1 Session Data Structure

```typescript
interface SessionData {
  userName: string;
  userPhone: string;

  // Conversation context
  lastIntent: string | null;           // "ticket_created", "member_tasks", etc.
  lastTopic: string | null;
  lastTicketId: string | null;
  lastTicketName: string | null;
  lastProject: string | null;
  lastDivision: string | null;
  lastMemberName: string | null;

  // History
  recentMessages: ConversationTurn[];  // Last 10 turns
  lastNotionResults: NotionResultItem[]; // Last 20 results

  // Active entities
  activeTicketIds: string[];
  activeTicketNames: string[];
  activeProject: string | null;
  activeMemberName: string | null;

  // Metadata
  createdAt: number;
  lastActivityAt: number;
  messageCount: number;
}
```

### 14.2 Session Lifecycle

```
  TTL: 30 minutes (SESSION_TTL)
  Cleanup: every 5 minutes, expired sessions are deleted
  History: max 10 conversation turns (MAX_HISTORY)
  Notion results: max 20 items (MAX_NOTION_RESULTS)
  Response truncation: responses saved at max 500 chars
```

---

## 15. Error Handling

### 15.1 Error Strategy

```
  ┌───────────────────────────────────────────────────────────────┐
  │                    ERROR HANDLING STRATEGY                     │
  │                                                               │
  │  Command Processing Error:                                    │
  │    try/catch around handleCommand()                           │
  │    → Return friendly error + "!help" suggestion               │
  │                                                               │
  │  AI Extraction Error:                                         │
  │    try/catch around createMessage() + extractJSON()           │
  │    → Fall back to handleChat() (general AI conversation)      │
  │                                                               │
  │  Casual Wrapper Error:                                        │
  │    try/catch around CASUAL_WRAP_PROMPT                        │
  │    → Fall back to "Sip, nih {pushName}!\n\n{original}"        │
  │                                                               │
  │  Ticket Creation Error:                                       │
  │    try/catch around createTicketDirect()                      │
  │    → Return "Waduh, gagal bikin tiket di Notion nih..."       │
  │                                                               │
  │  PIC Notification Error:                                      │
  │    try/catch inside setImmediate (fire-and-forget)            │
  │    → console.warn only, does NOT affect ticket creation       │
  │                                                               │
  │  Broadcast Notification Error:                                │
  │    Per-contact try/catch, increments failed counter           │
  │    → Continue to next contact, return summary with failures   │
  │                                                               │
  │  General Principle:                                           │
  │    Errors NEVER leave the user without a response.            │
  │    Every path returns a string (never throws to caller).      │
  └───────────────────────────────────────────────────────────────┘
```

### 15.2 Error Response Examples

| Error Context | User-Facing Response |
|---------------|---------------------|
| Command failed | "Waduh, terjadi error nih... Coba lagi ya! Ketik *!help*" |
| Ticket creation failed | "Waduh, gagal bikin tiket di Notion nih... Coba lagi nanti ya!" |
| AI extraction failed | Falls through to `handleChat()` — general AI conversation |
| PIC notification failed | Silent (logged), ticket still created successfully |
| Backlog query failed | "Gagal mengambil data backlog. Coba lagi nanti." |
| Member resolution failed | "Member 'X' tidak ditemukan di database." |

---

## 16. AI Chat Handler

### 16.1 `handleChat(message, context)`

The fallback handler for messages that are neither commands, tickets, nor queries. Uses the `CHAT_PROMPT` with conversation context injection.

```
  handleChat(message, context)
        │
        ├── Group && !isBotMentioned? → return "" (ignore)
        │
        ├── Build CHAT_PROMPT
        │   ├── Replace {pushName}, {phoneNumber}, {message}
        │   └── Append conversation context if available
        │
        ├── createMessage() → Claude AI
        │
        ├── Success → return AI text response
        │
        └── Error → "Maaf, sedang ada gangguan. Coba lagi dalam beberapa saat."
```

### 16.2 Scope Limitation

The `CHAT_PROMPT` enforces strict scope: the AI only assists with ticket/backlog/project/Notion-related tasks. Out-of-scope requests (coding help, recipes, general chat) are politely declined and redirected.

---

## 17. Status Emoji Mapping

```
  ┌──────────────────────────────────────────────┐
  │            STATUS → EMOJI MAP                │
  ├──────────────────────────────────────────────┤
  │  Not started / To-do / Backlog / Blocking    │ → 📋
  │  In progress                                 │ → 🔄
  │  Need to review / Need to fix                │ → 🛠
  │  Complete / Done                             │ → ✅
  │  (anything else)                             │ → 📍
  └──────────────────────────────────────────────┘
```

---

## 18. Complete Message Flow (End-to-End Example)

### Example: Natural Language Ticket Creation

```
  User sends: "buat tiket untuk ristek, fix bug navbar, assign ke iqbal, deadline 15 mei"

  Step 1: handleMessage()
    ├── getOrCreateSession() → new session for user
    ├── saveUserMessage() → stored in history
    └── parseCommand() → null (no ! prefix)

  Step 2: Not group → proceed to handleSmartMessage()

  Step 3: Smart Message Handler
    ├── detectFollowUp() → null (creation intent guard)
    ├── Greeting? → no
    ├── Pending ticket? → no
    ├── Broadcast? → no
    ├── Member name? → skipped (isCreationIntent = true)
    ├── Self-reference? → no
    ├── Stats/Project/List/Help? → no
    ├── Creation intent? → YES (buat + tiket)
    │   └── Fall through to AI extraction

  Step 4: AI Extraction
    ├── EXTRACTION_PROMPT + message → Claude AI
    └── Returns: {
          is_ticket: true,
          judul: "Fix Bug Navbar",
          departemen: "Research and Technology",
          pics: ["Iqbal Azhari Pasaribu"],
          prioritas: "Medium",
          deadline: "2026-05-15"
        }

  Step 5: handleCreateTicket()
    ├── generateTicketId() → TK-20260515-001
    ├── resolveDivisionPageId("Research and Technology") → page ID
    ├── resolveMemberPageId("Iqbal Azhari Pasaribu") → { id, fullName }
    ├── All PICs resolved → proceed
    ├── createTicketDirect({ ... }) → Notion page created
    ├── notifyPIC() via setImmediate → WA notification to Iqbal
    └── Return formatted success message

  Step 6: saveAssistantResponse() → stored with intent "smart_message"

  Bot replies:
    "Tiket berhasil dibuat ✅
     Fix Bug Navbar
     PIC: Iqbal Azhari Pasaribu
     Divisi: Research and Technology
     Prioritas: Medium
     Deadline: 2026-05-15
     Ticket ID: TK-20260515-001
     Notion: https://notion.so/...

     Notifikasi sudah dikirim ke Iqbal Azhari Pasaribu."
```

---

## 19. Architecture Diagram (Full System)

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          WHATSAPP                                       │
  │                    (Evolution API)                                      │
  └────────────────────────────────┬────────────────────────────────────────┘
                                   │ webhook
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        MESSAGE HANDLER                                  │
  │                   (src/wa/receiver.ts)                                  │
  │                                                                         │
  │   webhook → parse → build MessageContext → handleMessage()              │
  └────────────────────────────────┬────────────────────────────────────────┘
                                   │
                                   ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        ORO BOT AGENT                                    │
  │                    (src/ai/agent.ts)                                    │
  │                                                                         │
  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐                   │
  │  │   Session    │  │   Command    │  │    Smart     │                   │
  │  │   Manager    │  │    Parser    │  │   Message    │                   │
  │  │             │  │  (30+ regex) │  │   Handler    │                   │
  │  │ getOrCreate │  │             │  │              │                   │
  │  │ saveMsg     │  │ parseCommand│  │ 14-step      │                   │
  │  │ detectFollow│  │             │  │ detection    │                   │
  │  │ getContext  │  └──────┬──────┘  │ chain        │                   │
  │  └─────────────┘         │          └──────┬───────┘                   │
  │                          │                │                            │
  │                          ▼                ▼                            │
  │  ┌──────────────────────────────────────────────────────────┐          │
  │  │                    HANDLER FUNCTIONS                      │          │
  │  │                                                           │          │
  │  │  handleCheckStatus    handleBacklogSearch                 │          │
  │  │  handleListAll        handleBacklogUpdate                 │          │
  │  │  handleUpdateTicket   handleBacklogDivision               │          │
  │  │  handleCloseTicket    handleBacklogDelete/Restore         │          │
  │  │  handleDeleteTicket   handleBacklogBulk                   │          │
  │  │  handleAssignTicket   handleTicketDetail                  │          │
  │  │  handleStats          handleTicketNote                    │          │
  │  │  handleHelp           handleTicketComment                 │          │
  │  │  handleProjectList    handleMembersList                   │          │
  │  │  handleProjectInfo    handleDivisionsList                 │          │
  │  │  handleMemberTasks    handleAssignPic/UnassignPic         │          │
  │  │  handleCreateTicket   handleBroadcastTaskNotifications   │          │
  │  │  handleQuery          handleChat                          │          │
  │  │  handleDbCreate       handleSubPageCreate                 │          │
  │  │  handleDbSchema       handleTicketImage                   │          │
  │  └──────────────────────────────────────────────────────────┘          │
  │                          │                                              │
  │                          ▼                                              │
  │  ┌──────────────────────────────────────────────────────────┐          │
  │  │                    RESOLVERS                              │          │
  │  │                                                           │          │
  │  │  resolveDivisionPageId  → Division alias + Notion lookup │          │
  │  │  resolveProjectPageId   → Project search via Notion      │          │
  │  │  resolveMemberPageId    → Nickname + member list lookup  │          │
  │  └──────────────────────────────────────────────────────────┘          │
  └──────────────────────────────┬──────────────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
          ┌──────────────┐ ┌──────────┐ ┌──────────────┐
          │    NOTION     │ │  CLAUDE  │ │  WHATSAPP    │
          │     API       │ │   AI     │ │   SENDER     │
          │              │ │          │ │              │
          │ ticket-svc   │ │ anthropic│ │ notifyPIC()  │
          │ org-service  │ │ -client  │ │ sendDirect() │
          │ notion-core  │ │          │ │              │
          └──────────────┘ └──────────┘ └──────────────┘
```

---

*This document describes the actual implementation of the Oro Bot agent orchestrator as implemented in `src/ai/agent.ts`.*
