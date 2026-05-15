# Sprint Plan
## Oro Bot (Roro) — WhatsApp + Notion AI Bot for SGA Cakrawala Universe

**Version**: 2.0.0 | **Status**: Live in Production | **Last Updated**: 2026-05-15

---

## Sprint Overview

| Sprint | Name | Duration | Focus | Status |
|--------|------|----------|-------|--------|
| Sprint 0 | Technical Spike & POC | Week 1-2 | WhatsApp connectivity + AI extraction proof-of-concept | **COMPLETE** |
| Sprint 1 | Core Infrastructure | Week 3-5 | Fastify server, AI layer, Notion integration, session management | **COMPLETE** |
| Sprint 2 | Command System & Ticket CRUD | Week 6-8 | 30+ commands, ticket lifecycle, backlog management | **COMPLETE** |
| Sprint 3 | Intelligence & Notifications | Week 9-11 | Self-reference, outbound WA, fuzzy matching, broadcast | **COMPLETE** |
| Sprint 4 | Privacy & Observability | Week 12-14 | LID resolution, AI call logging, Notion webhooks | **IN PROGRESS** |
| Sprint 5 | Persistence & Scale | Week 15+ | Redis sessions, PostgreSQL logging, admin dashboard | **PLANNED** |

### Release Roadmap

```
Week  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15+
      +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
      |S0 POC  |  Sprint 1   | Sprint 2  | Sprint 3 |
      |WA + AI | Infra + AI  | Commands +| Intel +  |
      |validate| Notion API  | Tickets   | Notify   |
      +--------+-------------+----------+----------+
      |Sprint 4                    | Sprint 5       |
      |LID + Observability         |Scale + Persist |
      +----------------------------+----------------+
      |<--- Phase 1 (LIVE) -------->|<-- Phase 2 -->|
```

---

## Sprint 0: Technical Spike & POC (Week 1-2)

### Sprint Goal
Validate the core technical concept: WhatsApp message → AI extraction → Notion API → Response back to WhatsApp.

### Deliverables

| ID | Deliverable | Status |
|----|-------------|--------|
| S0-01 | Evolution API connected to WhatsApp Business number | **DONE** |
| S0-02 | Send/receive message flow validated via Evolution API | **DONE** |
| S0-03 | z.ai proxy configured with Anthropic SDK (claude-sonnet-4-20250514) | **DONE** |
| S0-04 | AI intent extraction tested with 10+ command patterns | **DONE** |
| S0-05 | Notion API connection tested (read database, query pages) | **DONE** |
| S0-06 | End-to-end POC: WA message → AI → Notion lookup → WA reply | **DONE** |
| S0-07 | POC demo presented to SGA Cakrawala stakeholders | **DONE** |

### Key Decisions
- **WhatsApp Provider**: Evolution API (self-hosted, no per-message cost)
- **AI Provider**: Anthropic via z.ai proxy (claude-sonnet-4-20250514)
- **Backend Framework**: Fastify (chosen over Express for performance)
- **Data Store**: Notion API as primary data layer (no separate DB at this stage)
- **Project Codename**: "Oro Bot" / "Roro"

### Definition of Done
- [x] WhatsApp message received and acknowledged within 5s
- [x] AI extracts command intent and parameters from natural language
- [x] Notion API returns real data from SGA Cakrawala workspace
- [x] Full round-trip: message in → response out within 15s
- [x] POC demo approved by stakeholders

---

## Sprint 1: Core Infrastructure (Week 3-5)

### Sprint Goal
Build production-ready backbone: Fastify webhook server, AI extraction pipeline, Notion API integration with resilience patterns, and session management.

### Deliverables

| ID | Deliverable | Status |
|----|-------------|--------|
| S1-01 | Fastify webhook server with message routing | **DONE** |
| S1-02 | Evolution API integration layer (send/receive/ack) | **DONE** |
| S1-03 | AI extraction pipeline via z.ai proxy (Anthropic SDK) | **DONE** |
| S1-04 | Notion API direct integration with retry logic | **DONE** |
| S1-05 | Notion API rate limiting and caching layer | **DONE** |
| S1-06 | Session management with 30-minute TTL | **DONE** |
| S1-07 | Follow-up question detection | **DONE** |
| S1-08 | AI casual response wrapping (natural language replies) | **DONE** |
| S1-09 | Error handling and graceful fallback responses | **DONE** |
| S1-10 | TypeScript project structure, linting, configuration | **DONE** |

### Key Decisions
- **No Redis yet**: Sessions stored in-memory with 30-min TTL (acceptable for single-instance deployment)
- **No message queue**: Direct processing (sufficient for current message volume)
- **Notion as source of truth**: All project/ticket/member data lives in Notion databases
- **z.ai proxy**: Acts as AI gateway — simplifies auth, enables model switching without code changes

### Definition of Done
- [x] Webhook server receives and validates incoming WhatsApp messages
- [x] AI layer extracts structured data from natural language with >90% accuracy
- [x] Notion API calls succeed with automatic retry on rate-limit (429) and server errors (5xx)
- [x] Session management tracks conversation context per user (30-min TTL)
- [x] Follow-up questions detected and routed with previous context
- [x] Casual responses wrap structured data in natural Indonesian language

---

## Sprint 2: Command System & Ticket CRUD (Week 6-8)

### Sprint Goal
Implement the full command system (30+ commands) with ticket lifecycle management, backlog operations, and project tracking.

### Deliverables

| ID | Deliverable | Status |
|----|-------------|--------|
| S2-01 | Command parser and router (`!help`, `!projects`, `!backlog`, etc.) | **DONE** |
| S2-02 | Ticket CRUD: create, read, update, delete, close | **DONE** |
| S2-03 | Ticket assignment (`!assign`) | **DONE** |
| S2-04 | Ticket status transitions (`!close`, `!update`) | **DONE** |
| S2-05 | Backlog management: search, filter, bulk update | **DONE** |
| S2-06 | Backlog by division and by status queries | **DONE** |
| S2-07 | Project tracking: list projects, project detail, backlog per project | **DONE** |
| S2-08 | Member lookup with alias resolution | **DONE** |
| S2-09 | Division lookup with alias system (12 divisions, 100+ aliases) | **DONE** |
| S2-10 | Image attachment to tickets | **DONE** |
| S2-11 | Sub-page creation in Notion | **DONE** |
| S2-12 | Database creation via command | **DONE** |
| S2-13 | Contact lookup with phone number normalization | **DONE** |
| S2-14 | Member nickname resolution with fuzzy matching (Levenshtein) | **DONE** |

### Command Reference (30+ Commands)

**Ticket Management**: `!create`, `!ticket`, `!update`, `!close`, `!assign`, `!delete`

**Backlog Operations**: `!backlog`, `!backlog search`, `!backlog filter`, `!backlog division`, `!backlog status`, `!backlog bulk`

**Project Tracking**: `!projects`, `!project detail`, `!project backlog`

**Lookup & Info**: `!help`, `!members`, `!divisions`, `!contact`, `!whoami`

**Utility**: `!database create`, `!subpage`, `!image`

### Definition of Done
- [x] All 30+ commands functional and tested with real Notion data
- [x] Ticket full lifecycle: create → assign → update → close
- [x] Backlog queries return filtered results from Notion databases
- [x] Division aliases resolve correctly (e.g., "dev" → "Development", "hr" → "Human Resources")
- [x] Member lookup works with nicknames and fuzzy matching
- [x] Image attachments upload to Notion correctly
- [x] Sub-pages created under correct parent pages

---

## Sprint 3: Intelligence & Notifications (Week 9-11)

### Sprint Goal
Add intelligent features (self-reference, outbound notifications, broadcast) and polish for production stability.

### Deliverables

| ID | Deliverable | Status |
|----|-------------|--------|
| S3-01 | Self-reference detection ("tugas gw", "tugas saya" → sender's tasks) | **DONE** |
| S3-02 | Outbound WhatsApp notifications to PIC on ticket assignment | **DONE** |
| S3-03 | Broadcast notifications to all members | **DONE** |
| S3-04 | Division alias system expanded (12 divisions, 100+ aliases) | **DONE** |
| S3-05 | Member nickname resolution with Levenshtein fuzzy matching | **DONE** |
| S3-06 | Contact lookup with phone number normalization (international format handling) | **DONE** |
| S3-07 | AI casual response improvements for natural conversation flow | **DONE** |
| S3-08 | Production deployment and stability hardening | **DONE** |
| S3-09 | UAT with SGA Cakrawala team members | **DONE** |

### Key Achievements
- Bot handles colloquial Indonesian ("tugas gw", "task gue", "tugas ane") and resolves to sender's WhatsApp number → Notion member mapping
- Outbound notifications push to PIC's WhatsApp when tickets are assigned, ensuring real-time awareness
- Broadcast feature enables organization-wide announcements via WhatsApp
- Fuzzy matching tolerates typos in member names (Levenshtein distance ≤ 3)
- Phone normalization handles +62, 62, 08xx formats uniformly

### Definition of Done
- [x] Self-reference queries return the sender's own tasks
- [x] Outbound WA notifications delivered to assigned PIC
- [x] Broadcast messages sent to all registered members
- [x] Division aliases cover all 12 divisions with common abbreviations
- [x] Fuzzy matching resolves nicknames with >95% accuracy
- [x] Bot stable in production with real SGA Cakrawala users
- [x] Version 2.0.0 tagged and deployed

---

## Sprint 4: Privacy & Observability (Week 12-14) — IN PROGRESS

### Sprint Goal
Resolve WhatsApp privacy-mode limitations (LID), add AI call tracking, and integrate Notion webhooks for real-time sync.

### Sprint Backlog

| ID | Task | Priority | Status |
|----|------|----------|--------|
| S4-01 | LID (Lid) resolution for privacy-mode WhatsApp numbers | P0 | **IN PROGRESS** |
| S4-02 | AI call logging — track every Anthropic API call (tokens, latency, cost) | P0 | **IN PROGRESS** |
| S4-03 | AI call statistics dashboard data (aggregation queries) | P1 | **PENDING** |
| S4-04 | Notion webhook integration for real-time database change detection | P1 | **IN PROGRESS** |
| S4-05 | Notion change event processing (invalidate cache, notify affected users) | P1 | **PENDING** |
| S4-06 | Rate limiting improvements based on production usage patterns | P2 | **PENDING** |

### Technical Context

**LID Problem**: When WhatsApp users enable privacy mode (hide phone number), the API returns a LID (opaque identifier) instead of a real phone number. The bot must map LID → known member to function correctly.

**AI Call Logging**: Currently no visibility into AI costs. Need to log every `claude-sonnet-4-20250514` call with input/output token counts, latency, and estimated cost for budget tracking.

**Notion Webhooks**: Currently the bot polls Notion or queries on-demand. Webhook integration would enable push-based updates — cache invalidation and proactive notifications when data changes.

### Definition of Done
- [ ] LID resolution maps privacy-mode users to known members
- [ ] Every AI API call logged with tokens, latency, and cost
- [ ] AI call statistics queryable by date range
- [ ] Notion webhooks received and processed for key databases
- [ ] Cache invalidated automatically on Notion data changes

---

## Sprint 5: Persistence & Scale (Week 15+) — PLANNED

### Sprint Goal
Replace in-memory stores with persistent backends, add admin tooling, and prepare for multi-organization support.

### Planned Backlog

| ID | Task | Priority | Notes |
|----|------|----------|-------|
| S5-01 | Redis integration for persistent session storage | P0 | Replace in-memory 30-min TTL sessions |
| S5-02 | PostgreSQL setup for message logging | P0 | Full message history, search, analytics |
| S5-03 | Message log schema and ingestion pipeline | P0 | Store every inbound/outbound message |
| S5-04 | Admin dashboard (web-based) | P1 | View stats, manage members, monitor health |
| S5-05 | Multi-organization support | P2 | Support multiple SGA chapters or organizations |
| S5-06 | Horizontal scaling preparation | P2 | Stateless workers, shared Redis state |

### Definition of Done
- [ ] Sessions survive server restarts (Redis-backed)
- [ ] Full message history queryable via PostgreSQL
- [ ] Admin dashboard accessible and functional
- [ ] Architecture supports multi-org data isolation

---

## Overall Progress

### Feature Completion Matrix

| Category | Feature | Sprint | Status |
|----------|---------|--------|--------|
| **Connectivity** | Evolution API + WhatsApp | S0 | DONE |
| **Connectivity** | Fastify webhook server | S1 | DONE |
| **AI** | z.ai proxy + Anthropic SDK | S0 | DONE |
| **AI** | claude-sonnet-4-20250514 extraction | S1 | DONE |
| **AI** | Casual response wrapping | S1 | DONE |
| **AI** | Follow-up question detection | S1 | DONE |
| **Notion** | Direct API integration + retry | S1 | DONE |
| **Notion** | Rate limiting & caching | S1 | DONE |
| **Notion** | Sub-page creation | S2 | DONE |
| **Notion** | Database creation via command | S2 | DONE |
| **Notion** | Webhook integration | S4 | IN PROGRESS |
| **Commands** | 30+ command system | S2 | DONE |
| **Commands** | Ticket CRUD (create, read, update, delete, close) | S2 | DONE |
| **Commands** | Ticket assignment | S2 | DONE |
| **Commands** | Backlog management (search, filter, bulk) | S2 | DONE |
| **Commands** | Project tracking | S2 | DONE |
| **Commands** | Member & division lookup | S2 | DONE |
| **Commands** | Image attachment to tickets | S2 | DONE |
| **Intelligence** | Self-reference detection | S3 | DONE |
| **Intelligence** | Member nickname fuzzy matching (Levenshtein) | S3 | DONE |
| **Intelligence** | Division alias system (12 div, 100+ aliases) | S3 | DONE |
| **Intelligence** | Phone number normalization | S3 | DONE |
| **Notifications** | Outbound WA to PIC on assignment | S3 | DONE |
| **Notifications** | Broadcast to all members | S3 | DONE |
| **Session** | In-memory session with 30-min TTL | S1 | DONE |
| **Session** | Redis persistent sessions | S5 | PLANNED |
| **Privacy** | LID resolution for privacy-mode WA | S4 | IN PROGRESS |
| **Observability** | AI call logging & statistics | S4 | IN PROGRESS |
| **Persistence** | PostgreSQL message logging | S5 | PLANNED |
| **Tooling** | Admin dashboard | S5 | PLANNED |
| **Scale** | Multi-organization support | S5 | PLANNED |

### Summary Statistics

| Metric | Value |
|--------|-------|
| Total features delivered | 27 |
| Features in progress | 3 |
| Features planned | 4 |
| Sprint completion | 4 of 6 sprints done |
| Commands implemented | 30+ |
| Divisions supported | 12 |
| Division aliases | 100+ |
| AI model | claude-sonnet-4-20250514 |
| Current version | 2.0.0 |
| Production status | LIVE |

---

## Risks & Mitigations

| Risk | Sprint | Probability | Impact | Mitigation |
|------|--------|-------------|--------|------------|
| LID resolution fails for new privacy-mode users | S4 | Medium | High | Maintain manual fallback mapping; prompt users to share number once |
| Anthropic API cost overrun (no current tracking) | S4 | High | Medium | S4-02 logging is P0; set budget alerts once tracking is live |
| Notion API rate limits under heavy load | Any | Medium | High | Already mitigated with retry logic + caching; monitor with S4 webhooks |
| In-memory sessions lost on server restart | Current | Low | Medium | Acceptable for single-instance; Redis planned in S5 |
| Evolution API breaking changes | Any | Low | High | Pin API version; test updates in staging before production |
| Scope creep from SGA Cakrawala feature requests | Any | High | Medium | Strict sprint backlog; defer non-critical requests to next sprint |
| WhatsApp number format inconsistency across countries | S3 | Low | Low | Phone normalization handles +62/62/08xx; extend for intl formats in S5 |
| Single point of failure (one server) | Current | Medium | High | Acceptable for current scale; horizontal scaling planned in S5 |

---

## Architecture Reference

```
User (WhatsApp)
    │
    ▼
Evolution API (WhatsApp Gateway)
    │
    ▼
Fastify Webhook Server (Oro Bot)
    ├── AI Layer (z.ai proxy → Anthropic claude-sonnet-4-20250514)
    ├── Notion API Client (with retry, rate-limit, cache)
    ├── Command Router (30+ commands)
    ├── Session Manager (in-memory, 30-min TTL)
    ├── Notification Engine (outbound WA)
    └── Member Resolver (fuzzy matching, aliases)
    │
    ▼
Notion Workspace (SGA Cakrawala Universe)
    ├── Projects Database
    ├── Tickets/Backlog Database
    ├── Members Database
    └── Divisions Database
```
