# Oro Bot — WhatsApp + Notion AI Assistant for SGA Cakrawala Universe

## Project Identity

| Field | Detail |
|-------|--------|
| **Project Name** | Oro Bot (WA Notion Bot) |
| **Tagline** | Asisten AI Pengelola Tiket & Backlog SGA via WhatsApp |
| **Version** | 2.0.0 (Production) |
| **Status** | Live / Active Development |
| **Date Created** | 2026-04-22 |
| **Last Updated** | 2026-05-15 |

---

## 1. Vision

Menjadi asisten AI utama untuk pengelolaan tiket, backlog, project, dan tugas di organisasi SGA Cakrawala Universe melalui WhatsApp — satu chat untuk mengelola seluruh operasional organisasi.

## 2. Problem Statement

### Pain Points
1. **Manajemen tugas tersebar** — Tiket dan backlog tersebar di berbagai channel (chat, spreadsheet, meeting notes) tanpa tracking terpusat
2. **Kesulitan tracking progress** — Anggota tidak bisa melihat progress project dan status tugas secara real-time
3. **Komunikasi lambat** — Koordinasi antar divisi membutuhkan banyak back-and-forth di grup WhatsApp
4. **Notifikasi manual** — PIC harus di-tag satu per satu saat ada tugas baru
5. **Tidak ada visibility** — Ketua organisasi tidak bisa melihat overview statistik backlog dan project

### Impact
- Waktu rata-rata assign tugas: manual via chat group
- Tracking progress: harus buka Notion langsung
- Koordinasi antar divisi: melalui meeting atau chat manual
- Notifikasi: tidak ada otomasi

## 3. Solution Overview

**Oro Bot** — WhatsApp AI bot yang terintegrasi langsung dengan Notion workspace SGA Cakrawala Universe. Menggunakan AI (via z.ai proxy) untuk memahami bahasa natural dan mengelola tiket, backlog, project, divisi, dan anggota.

### Core Concept
```
WhatsApp (Interface) + AI Agent (Oro) + Notion API (Data Layer)
```

Komponen utama:
- **WhatsApp via Evolution API** = Interface utama (DM dan Group dengan mention)
- **AI Agent (Oro)** = Memahami kebutuhan user, membuat/membaca/mengupdate data
- **Notion API** = Single source of truth untuk semua data organisasi

## 4. Architecture Summary

```
+-------------------+
|   WhatsApp User   |
| (Anggota SGA /    |
|  Pengurus)        |
+--------+----------+
         |
         | WhatsApp Protocol
         v
+--------+----------+
|  Evolution API    |
|  (WhatsApp        |
|   Gateway)        |
+--------+----------+
         |
         | HTTP POST (webhook)
         v
+--------+----------+
|  Fastify Server   |
|  (Entry Point)    |
|  - Webhook handler|
|  - Rate limiting  |
|  - Deduplication  |
+--------+----------+
         |
         v
+--------+----------+     +-------------------+
|  AI Agent (Oro)   |<--->|  z.ai Proxy       |
|  - Intent detect  |     |  (Anthropic API   |
|  - Command parser |     |   compatible)     |
|  - Smart routing  |     |  Backend: GLM     |
+--------+----------+     +-------------------+
         |
         v
+--------+----------+
|  Notion API       |
|  - Master Backlog |
|  - Master Projects|
|  - Divisions      |
|  - Members        |
|  - Ticket Detail  |
+-------------------+
```

## 5. Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Interface** | WhatsApp via Evolution API | Gratis, familiar, tidak perlu WhatsApp Business API |
| **Server** | Node.js + Fastify | Lightweight, fast, good async support |
| **Language** | TypeScript | Type safety, better DX |
| **AI Layer** | Anthropic SDK via z.ai proxy (GLM backend) | Cost-effective AI, Anthropic-compatible API |
| **AI Model** | claude-sonnet-4-20250514 | Good balance of speed and intelligence |
| **Data Layer** | Notion API (direct) | SGA sudah pakai Notion, no additional DB needed |
| **Cache** | In-memory (Map) + Notion-side caching | Simple, no Redis dependency for MVP |
| **Session** | In-memory (Map) | Per-user conversation context, 30-min TTL |
| **Validation** | Zod | Environment config validation |
| **Deployment** | Docker + Docker Compose | Consistent environments |

## 6. Key Stakeholders

| Stakeholder | Role | Interest |
|------------|------|----------|
| Anggota SGA | End User | Buat tiket, cek tugas, lihat backlog via WhatsApp |
| Ketua/Co-Ketua SGA | Admin | Overview statistik, tracking progress seluruh divisi |
| Head of Division | PIC | Assign tugas, tracking progress divisi |
| Tim Ristek | Developer | Maintenance dan pengembangan bot |

## 7. Success Metrics

### Current Metrics
| Metric | Target | Status |
|--------|--------|--------|
| End-to-end flow working | Ya | Achieved |
| Response time | < 10 detik | Achieved |
| Intent accuracy (AI extraction) | > 85% | Achieved |
| Command coverage | 30+ commands | Achieved |
| Uptime | > 95% | In Progress |

## 8. Project Phases

### Phase 0: Proof of Concept (Completed)
- Koneksi Evolution API + WhatsApp
- AI extraction via z.ai proxy
- Notion API direct integration
- Basic ticket creation flow

### Phase 1: Core Features (Completed)
- Webhook server production-ready
- AI agent with smart message routing
- Full command system (30+ commands)
- Ticket CRUD (create, read, update, delete, close, assign)
- Backlog management (search, filter, bulk update)
- Project tracking
- Member & division lookup
- Session management & follow-up detection
- Outbound WhatsApp notifications to PIC

### Phase 2: Enhancement (In Progress)
- Broadcast notifications
- Self-reference detection ("tugas gw")
- Image attachment to tickets
- LID resolution for privacy-mode WhatsApp
- AI call logging & statistics
- Notion webhook integration

### Phase 3: Scale (Planned)
- Redis for persistent sessions
- PostgreSQL for message logging
- Admin dashboard
- Multi-organization support

## 9. Risk Overview

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Evolution API downtime | High | Low | Health check, auto-reconnect |
| z.ai proxy rate limit | Medium | Medium | Retry with exponential backoff |
| Notion API rate limit (3 req/s) | Medium | Medium | Rate limiter + caching |
| WhatsApp number ban | High | Low | Follow WhatsApp ToS, rate limit messages |
| Session data loss (in-memory) | Low | Medium | Accept for MVP, migrate to Redis |

## 10. Documentation Index

| No | Document | Description |
|----|----------|-------------|
| 00 | PROJECT-OVERVIEW | Dokumen ini — overview utama |
| 01 | PRD | Product Requirements Document |
| 02 | SYSTEM-ARCHITECTURE | Arsitektur sistem detail |
| 03 | NOTION-INTEGRATION | Desain integrasi Notion API |
| 04 | SPRINT-PLAN | Sprint planning & timeline |
| 05 | USER-STORIES | Backlog user stories |
| 06 | TEST-SCENARIOS | Skenario testing |
| 07 | DEPLOYMENT-GUIDE | Guide deployment & setup |
| 08 | TECHNICAL-IMPLEMENTATION | Implementasi teknis detail |
| 09 | AGENT-DESIGN | Desain AI Agent Oro |
| 10 | WHATSAPP-NOTIFICATION-OUTBOUND | Fitur notifikasi WA outbound ke PIC tiket |

---

## 11. Quick Start (Untuk Developer)

```bash
# Clone/setup project
cd whatsapp-gateway

# Setup environment
cp .env.example .env
# Edit .env dengan API keys yang diperlukan:
# - ANTHROPIC_API_KEY (z.ai)
# - NOTION_API_KEY
# - NOTION_DATABASE_ID
# - EVOLUTION_API_URL
# - EVOLUTION_API_KEY
# - EVOLUTION_INSTANCE_NAME

# Install dependencies
npm install

# Build
npm run build

# Run development
npm run dev

# Run with Docker
docker compose up -d
```

---

*Dokumen ini living document — update seiring progress project.*
