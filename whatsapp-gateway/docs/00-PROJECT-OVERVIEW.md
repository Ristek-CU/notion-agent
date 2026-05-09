# One-Stop Service Gateway via WhatsApp + MCP

## Project Identity

| Field | Detail |
|-------|--------|
| **Project Name** | WhatsApp Service Gateway (WSG) |
| **Tagline** | Satu Chat, Semua Layanan |
| **Version** | 0.1.0 (Concept Phase) |
| **Status** | Prototyping / POC |
| **Date Created** | 2026-04-22 |

---

## 1. Vision

Menjadi platform layanan digital terdepan yang menyatukan akses ke seluruh sistem layanan melalui satu pintu komunikasi — WhatsApp — dengan kecerdasan buatan sebagai penghubung utama.

## 2. Problem Statement

### Pain Points
1. **Sistem tersebar** — Mahasiswa dan staf harus mengakses 5-10 sistem berbeda untuk berbagai kebutuhan (akademik, admisi, inventori, IT support)
2. **UX kompleks** — Setiap sistem punya UI/UX berbeda, login berbeda, alur berbeda
3. **Response time lambat** — Proses manual request membutuhkan waktu berhari-hari
4. **Tidak ada tracking** — User tidak bisa melacak status request secara real-time
5. **Human-dependent** — Banyak proses yang membutuhkan interaksi manusia padahal bisa diotomasi

### Impact Saat Ini
- Waktu rata-rata akses layanan: 2-5 hari kerja
- Jumlah sistem yang harus diakses: 5-10 sistem
- Tingkat kepuasan user: rendah (belum terukur)
- Efisiensi staf: banyak waktu habis untuk proses manual

## 3. Solution Overview

Platform WhatsApp Service Gateway (WSG) — layanan satu pintu berbasis chat yang menghubungkan user ke berbagai sistem backend melalui AI-powered intent processing dan modular MCP orchestration.

### Core Concept
```
Conversational Interface + AI Decision Engine + MCP Orchestration Layer
```

Komponen utama:
- **WhatsApp** = Interface utama (channel komunikasi)
- **AI (Claude)** = Memahami kebutuhan user, menentukan aksi
- **MCP** = Menjalankan integrasi ke sistem backend secara modular

## 4. Architecture Summary

```
+-------------------+
|    WhatsApp User  |
|   (Mahasiswa/     |
|    Staf/Instansi) |
+--------+----------+
         |
         v
+--------+----------+
| WhatsApp Business |
|   API (Twilio/    |
|   Meta API)       |
+--------+----------+
         |
         v
+--------+----------+
|   Webhook Server  |
| (Entry Point for  |
|  incoming msgs)   |
+--------+----------+
         |
         v
+--------+----------+     +-------------------+
| Backend Controller|<--->|  AI Layer         |
| (Orchestrator)    |     | (Claude SDK)      |
+--------+----------+     | - Intent parsing  |
         |                | - Entity extract  |
         v                | - MCP routing     |
+--------+----------+     +-------------------+
|   MCP Registry    |
| (Service Discovery|
|  & Routing)       |
+--------+----------+
         |
    +----+----+--------+--------+
    |         |        |        |
    v         v        v        v
+-------+ +------+ +--------+ +--------+
| MCP   | | MCP  | | MCP    | | MCP    |
| Akade | | Admi | | Inven  | | IT     |
| mik   | | si   | | tory   | |Support |
+---+---+ +--+---+ +--+-----+ +--+-----+
    |        |        |          |
    v        v        v          v
  [Sistem Akademik] [Admisi] [Inventory] [Ticketing]
```

## 5. Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Interface** | WhatsApp Business API / Twilio | Channel yang paling familiar di Indonesia |
| **Webhook** | Node.js + Express / Fastify | Lightweight, fast, good async support |
| **AI Layer** | Claude API via Anthropic SDK | Best-in-class intent understanding |
| **Backend** | Node.js + TypeScript | Type safety, good ecosystem |
| **MCP Framework** | Custom modular TypeScript | Flexible, decoupled architecture |
| **Database** | PostgreSQL | Relational data, ACID compliance |
| **Cache** | Redis | Session management, response caching |
| **Queue** | BullMQ (Redis-based) | Job queue for async processing |
| **Deployment** | Docker + Docker Compose | Consistent environments |

## 6. Key Stakeholders

| Stakeholder | Role | Interest |
|------------|------|----------|
| Mahasiswa | End User | Akses layanan mudah via WhatsApp |
| Staf Akademik | End User | Tracking request, info internal |
| Admin IT | Operator | Monitoring, konfigurasi sistem |
| Pihak Instansi | Partner | Integrasi layanan instansi |
| Tim Pengembang | Builder | Implementasi dan maintenance |

## 7. Success Metrics

### MVP Success Criteria
| Metric | Target | Measurement |
|--------|--------|-------------|
| End-to-end flow working | Ya | 1 layanan end-to-end |
| Response time | < 5 detik | From message to response |
| Intent accuracy | > 85% | Correct MCP routing |
| Uptime | > 95% | System availability |
| Test coverage | > 70% | Unit + integration tests |

### Long-term Metrics
| Metric | Target |
|--------|--------|
| User adoption | 50% mahasiswa aktif dalam 6 bulan |
| Request via chat | 80% dari total request |
| Resolution time | < 1 jam untuk standard request |
| Satisfaction score | > 4.0/5.0 |

## 8. Project Phases

### Phase 0: Proof of Concept (2 minggu)
- Validasi koneksi WhatsApp API
- Test Claude SDK integration
- POC 1 message flow end-to-end
- Validasi arsitektur MCP
- **Goal**: Buktikan konsep bisa jalan

### Phase 1: MVP — Internal Kampus (6-8 minggu)
- Webhook server production-ready
- AI layer dengan intent processing
- 1 MCP module (Akademik) terintegrasi
- Ticket system via chat
- **Goal**: 1 layanan berjalan end-to-end

### Phase 2: Expansion (8-12 minggu)
- Multi MCP (Akademik + Admisi + Inventory + IT Support)
- Enhanced AI (multi-turn conversation)
- Dashboard monitoring
- **Goal**: Multi-layanan, stabil

### Phase 3: Ecosystem (12-20 minggu)
- Integrasi multi-instansi
- Multi-organisasi support
- Advanced analytics
- **Goal**: Platform ecosystem

## 9. Risk Overview

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WhatsApp API limitations | High | Medium | Riset API limits, fallback via SMS |
| AI intent accuracy rendah | High | Medium | Training data, fallback ke human agent |
| Backend system tidak siap API | High | High | Mock data dulu, gradual integration |
| Security breach | Critical | Low | Encryption, auth, audit trail |
| Scalability issues | Medium | Low | Queue-based architecture, caching |

## 10. Documentation Index

| No | Document | Description |
|----|----------|-------------|
| 00 | PROJECT-OVERVIEW | Dokumen ini — overview utama |
| 01 | PRD | Product Requirements Document |
| 02 | SYSTEM-ARCHITECTURE | Arsitektur sistem detail |
| 03 | MCP-DESIGN | Desain MCP modules |
| 04 | SPRINT-PLAN | Sprint planning & timeline |
| 05 | USER-STORIES | Backlog user stories |
| 06 | TEST-SCENARIOS | Skenario testing |
| 07 | PROTOTYPING-GUIDE | Guide prototyping step-by-step |
| 08 | TECHNICAL-IMPLEMENTATION | Implementasi teknis detail |
| 09 | ORCHESTRATOR-DESIGN | Desain orchestrator AI + MCP |
| 10 | WHATSAPP-NOTIFICATION-OUTBOUND | Fitur notifikasi WA outbound ke PIC tiket |
| 11 | IMPLEMENTATION-PROMPT | Prompt untuk implementasi fitur doc 10 |

---

## 11. Quick Start (Untuk Developer)

```bash
# Clone/setup project
mkdir whatsapp-gateway && cd whatsapp-gateway

# Setup environment
cp .env.example .env
# Edit .env dengan API keys yang diperlukan

# Install dependencies
npm install

# Run development
npm run dev

# Run POC test
npm run test:poc
```

---

*Dokumen ini living document — update seiring progress project.*
