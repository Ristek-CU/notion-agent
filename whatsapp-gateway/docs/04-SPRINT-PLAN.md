# Sprint Plan
## WhatsApp Service Gateway (WSG)

---

## Release Roadmap

```
Week  1  2  3  4  5  6  7  8  9  10  11  12  13  14
      +--+--+--+--+--+--+--+--+---+---+---+---+---+---+
      |Sprint 0|  Sprint 1  | Sprint 2 | Sprint 3  |
      |  POC   | Infra Core | 1st MCP  | Enhance &  |
      | Validate| + AI Layer |+ Tickets |   QA       |
      +--------+------------+---------+-------------+
      |<-- Phase 0 -->|<---------- Phase 1 (MVP) ---------->|
```

## Sprint 0: Technical Spike & POC (Week 1-2)

### Sprint Goal
Validasi bahwa konsep teknis bisa berjalan: WhatsApp → AI → MCP → Response

### Sprint Backlog

| ID | Task | Assignee | Points | Status |
|----|------|----------|--------|--------|
| S0-01 | Setup WhatsApp Business API sandbox | Backend | 3 | - |
| S0-02 | Test send/receive message via API | Backend | 2 | - |
| S0-03 | Setup Claude API key + SDK | AI | 2 | - |
| S0-04 | Build simple intent classifier (5 intents) | AI | 5 | - |
| S0-05 | Create MCP interface skeleton | Backend | 5 | - |
| S0-06 | Build mock MCP with hardcoded responses | Backend | 3 | - |
| S0-07 | Wire: WhatsApp → AI → Mock MCP → Response | Full Team | 8 | - |
| S0-08 | Test end-to-end with 20+ messages | QA | 3 | - |
| S0-09 | Document findings & decision | PM | 2 | - |

**Total Story Points**: 33

### Definition of Done — Sprint 0
- [ ] Dapat kirim pesan ke WhatsApp sandbox dan terima response
- [ ] AI dapat klasifikasi 5 intent dengan accuracy > 80%
- [ ] Mock MCP meresponse sesuai format standard
- [ ] Full flow: WhatsApp → AI → MCP → Response bekerja
- [ ] POC demo ready untuk stakeholder

### Decision Gate (Go/No-Go)
| Criteria | Must Achieve |
|----------|-------------|
| WhatsApp connectivity | Message sent & received within 10s |
| AI intent accuracy | > 80% on test set (50 messages) |
| MCP pattern works | Mock response < 1s |
| End-to-end latency | < 10s total |

**Jika gagal**: Iterate pada komponen yang gagal, extend Sprint 0, atau pivot.

---

## Sprint 1: Core Infrastructure (Week 3-4)

### Sprint Goal
Bangun infrastruktur production-ready: Webhook server, AI Layer, Backend Controller, MCP Framework

### Sprint Backlog

| ID | Task | Assignee | Points | Priority |
|----|------|----------|--------|----------|
| S1-01 | Setup project structure (TypeScript, linting, testing) | Backend | 3 | P0 |
| S1-02 | Build Webhook server (Express/Fastify) | Backend | 5 | P0 |
| S1-03 | Implement signature verification | Backend | 3 | P0 |
| S1-04 | Setup Redis + BullMQ message queue | Backend | 5 | P0 |
| S1-05 | Build AI Layer (Claude SDK integration) | AI | 8 | P0 |
| S1-06 | Implement intent classification (production) | AI | 8 | P0 |
| S1-07 | Build Backend Controller (orchestrator) | Backend | 8 | P0 |
| S1-08 | Implement MCP Registry | Backend | 5 | P1 |
| S1-09 | Setup PostgreSQL + database schema | Backend | 5 | P0 |
| S1-10 | Implement session management | Backend | 5 | P1 |
| S1-11 | Build response formatter (WhatsApp format) | Backend | 3 | P0 |
| S1-12 | Docker Compose setup (dev environment) | DevOps | 3 | P0 |
| S1-13 | Write unit tests (>50% coverage) | All | 5 | P0 |
| S1-14 | Setup CI pipeline | DevOps | 3 | P1 |

**Total Story Points**: 69

### Definition of Done — Sprint 1
- [ ] Webhook server menerima dan memvalidasi pesan WhatsApp
- [ ] Message queue berfungsi (Redis + BullMQ)
- [ ] AI Layer mengklasifikasi intent dengan >85% accuracy
- [ ] Backend Controller meroute ke MCP yang tepat
- [ ] MCP Registry bisa register/deregister MCP
- [ ] Database schema terbuat dan tested
- [ ] Docker Compose bisa `docker-compose up` full stack
- [ ] CI pipeline berjalan

### Demo Criteria
- Kirim pesan ke WhatsApp → System log menunjukkan full processing flow
- Intent terklasifikasi dengan benar
- Response terformat dengan baik

---

## Sprint 2: First MCP Integration (Week 5-6)

### Sprint Goal
MCP Akademik terintegrasi dengan sistem nyata (atau mock yang comprehensive), full end-to-end flow bekerja

### Sprint Backlog

| ID | Task | Assignee | Points | Priority |
|----|------|----------|--------|----------|
| S2-01 | Build MCP Akademik (full implementation) | Backend | 13 | P0 |
| S2-02 | Build SIAKAD API adapter | Backend | 8 | P0 |
| S2-03 | Data transformers (SIAKAD → WSG format) | Backend | 5 | P0 |
| S2-04 | Implement action: get_profile | Backend | 3 | P0 |
| S2-05 | Implement action: get_grades | Backend | 3 | P0 |
| S2-06 | Implement action: get_schedule | Backend | 3 | P0 |
| S2-07 | Implement action: get_krs | Backend | 3 | P0 |
| S2-08 | Build ticket creation flow | Backend | 8 | P0 |
| S2-09 | Build ticket status check flow | Backend | 5 | P0 |
| S2-10 | AI prompt optimization for academic queries | AI | 5 | P0 |
| S2-11 | Error handling & fallback responses | Backend | 5 | P0 |
| S2-12 | Integration tests (per component pair) | QA | 5 | P0 |
| S2-13 | End-to-end test (happy path) | QA | 3 | P0 |
| S2-14 | Logging & basic monitoring | Backend | 3 | P1 |

**Total Story Points**: 76

### Definition of Done — Sprint 2
- [ ] MCP Akademik menjawab query: profil, nilai, jadwal, KRS
- [ ] Ticket bisa dibuat dan dicek statusnya via chat
- [ ] Full flow: WhatsApp → AI → MCP Akademik → SIAKAD → Response
- [ ] Error handling: SIAKAD down → graceful fallback
- [ ] Integration tests pass untuk semua flows
- [ ] E2E test pass untuk happy path

### Demo Criteria
- "Cek nilai semester kemarin" → Mendapat response nilai
- "Saya mau buat ticket" → Ticket terbuat, dapat ticket ID
- "Status ticket TK-001" → Dapat info status

---

## Sprint 3: Enhancement & QA (Week 7-8)

### Sprint Goal
Polish, optimize, dan prepare untuk go-live MVP

### Sprint Backlog

| ID | Task | Assignee | Points | Priority |
|----|------|----------|--------|----------|
| S3-01 | Multi-turn conversation support | AI | 13 | P1 |
| S3-02 | User authentication (phone → NIM link) | Backend | 8 | P0 |
| S3-03 | Response time optimization | Backend | 5 | P1 |
| S3-04 | Caching strategy (Redis) | Backend | 5 | P1 |
| S3-05 | Rate limiting implementation | Backend | 3 | P0 |
| S3-06 | Error message improvements | AI | 3 | P1 |
| S3-07 | Edge case handling | Backend | 5 | P1 |
| S3-08 | Load testing (100 concurrent users) | QA | 5 | P0 |
| S3-09 | Security review | QA | 5 | P0 |
| S3-10 | UAT with 5 real users | PM | 5 | P0 |
| S3-11 | Bug fixes (from UAT) | Full Team | 8 | P0 |
| S3-12 | Runbook & deployment docs | Backend | 3 | P0 |
| S3-13 | Production deployment | DevOps | 5 | P0 |
| S3-14 | Monitoring dashboard setup | DevOps | 5 | P1 |

**Total Story Points**: 78

### Definition of Done — Sprint 3
- [ ] Multi-turn conversation berfungsi (minimal 2-turn)
- [ ] User authentication via phone number
- [ ] Response time < 5 detik (95th percentile)
- [ ] Load test pass: 100 concurrent users
- [ ] Security review pass (no critical findings)
- [ ] UAT completed, all critical bugs fixed
- [ ] Runbook ready
- [ ] Production deployment successful

### Go-Live Criteria
- [ ] All P0 features working
- [ ] No critical bugs
- [ ] Response time < 5s
- [ ] UAT approved
- [ ] Runbook ready
- [ ] Monitoring active

---

## Capacity Planning

### Team Composition

| Role | Count | Allocation |
|------|-------|-----------|
| Backend Developer | 1-2 | Full-time |
| AI Engineer | 1 | Full-time |
| QA Engineer | 1 | Part-time (Sprint 0-1), Full-time (Sprint 2-3) |
| DevOps | 1 | Part-time |
| PM | 1 | Part-time |

### Velocity Estimation

| Sprint | Points | Team Capacity | Predicted Completion |
|--------|--------|--------------|---------------------|
| Sprint 0 | 33 | 20 pts/week | 2 weeks |
| Sprint 1 | 69 | 35 pts/week | 2 weeks |
| Sprint 2 | 76 | 35 pts/week | 2 weeks |
| Sprint 3 | 78 | 35 pts/week | 2-3 weeks |

---

## Retrospective Template

### Per Sprint:
```
## Sprint [X] Retrospective

### What went well?
-

### What didn't go well?
-

### What to improve?
-

### Action items (for next sprint):
1. [Action] - Owner - Due date
```

---

## Risk Register

| Risk | Sprint | Probability | Impact | Mitigation |
|------|--------|-------------|--------|------------|
| WhatsApp API setup delay | S0 | Medium | High | Start early, use Twilio as alternative |
| SIAKAD API not available | S2 | High | High | Use comprehensive mock, plan integration meeting |
| AI accuracy below target | S1 | Medium | High | Iterative prompt tuning, add training examples |
| Performance issues | S3 | Low | Medium | Load test early in S2, optimize from S3 |
| Scope creep | Any | High | Medium | Strict MVP scope, defer all P2 items |
