# One-Stop Service Gateway via WhatsApp + MCP
## Briefing Lengkap untuk Tim Ristek

**Tanggal**: 22 April 2026
**Dokumen**: Briefing Project — Untuk Internal Tim Ristek
**Status**: Concept Proposal — Siap Untuk Diskusi

---

# BAGIAN 1: THE BIG PICTURE

## Apa yang Kita Mau Bikin?

Kita mau bikin **satu pintu layanan** — semua kebutuhan user (mahasiswa, staf, dosen) bisa diakses **cukup dari satu chat WhatsApp**.

**Tagline**: *Satu Chat, Semua Layanan.*

```
SEBELUM:
User → Login SIAKAD (cek nilai)
User → Login PMB (cek admisi)
User → Email IT (lapor masalah)
User → Form inventory (ajukan barang)
User → Ke kantor (buat surat)
= 5 sistem, 5 login, 5 cara berbeda

SESUDAH:
User → Chat WhatsApp → "Cek nilai" / "Wifi mati" / "Mau ajukan barang"
= 1 channel, 1 cara, semuanya terhandle
```

## Kenapa Ini Penting?

**Masalah yang kita lihat sekarang:**

1. **Sistem tersebar** — Ada 5-10 sistem berbeda yang masing-masing punya cara akses, login, dan alur sendiri. User harus hafal banyak URL, banyak password, banyak alur.

2. **Lambat** — Request manual (email, form fisik, datang ke kantor) memakan waktu berhari-hari. Sesuatu yang seharusnya bisa 5 detik, jadi 5 hari.

3. **Frustrasi user** — Bayangkan mahasiswa yang cuma mau cek nilai, tapi harus login ke SIAKAD yang down, cari-cari menunya, dan akhirnya menyerah lalu tanya keorang satu-satu.

4. **Tidak ada tracking** — User nggak bisa lihat progress request mereka. "Sudah diproses belum ya?" → harus tanya manual.

5. **Beban staf** — Staf menghabiskan banyak waktu untuk hal-hal repetitive yang bisa diotomasi.

**Kenapa sekarang?**

- WhatsApp penetrasi > 90% di Indonesia — semua orang sudah pakai
- AI (LLM seperti Claude) sudah sangat capable memahami bahasa natural
- Arsitektur modular sudah matang — kita bisa mulai kecil dan scale bertahap
- Tren global menuju conversational AI — ini bukan eksperimen, ini masa depan

---

# BAGIAN 2: CARA KERJANYA (KONSEP)

## Analogi Sederhana

Bayangkan seperti **receptionist super pintar** di lobby gedung kampus:

```
Mahasiswa datang → Receptionist bertanya "Ada yang bisa dibantu?"
Mahasiswa bilang → "Mau cek nilai semester kemarin"
Receptionist tahu → "Oh, ini urusan akademik, saya hubungkan ke bagian akademik"
Receptionist ambil data → Dari sistem SIAKAD
Receptionist jawab → "Nilai semester kemarin: Algoritma A, Basis Data B+, IPS 3.67"
```

Di project kita, **receptionist itu adalah AI (Claude)** dan **lobbinya adalah WhatsApp**.

## Arsitektur Inti — 3 Layer

```
+=================================================================+
|                    LAYER 1: INTERFACE                            |
|                                                                   |
|    WhatsApp Business API (Twilio)                                 |
|    - User kirim pesan → masuk ke sistem kita                     |
|    - Sistem kirim response → muncul di WhatsApp user              |
+=================================================================+
                              |
                              v
+=================================================================+
|                    LAYER 2: OTAK AI                              |
|                                                                   |
|    AI Engine (Claude via SDK)                                     |
|    - Baca pesan user                                              |
|    - Pahami maksudnya (intent classification)                    |
|    - Tentukan layanan apa yang dibutuhkan                        |
|    - Format response yang ramah                                   |
|                                                                   |
|    + Backend Controller (Orchestrator)                            |
|    - Atur alur request dari awal sampai akhir                    |
|    - Manage session percakapan                                    |
|    - Route ke MCP yang tepat                                      |
+=================================================================+
                              |
                              v
+=================================================================+
|                    LAYER 3: TUKANG LAYANAN (MCP)                 |
|                                                                   |
|    MCP = Modular Service Module                                   |
|                                                                   |
|    +-------------+  +-------------+  +-------------+             |
|    | MCP         |  | MCP         |  | MCP         |             |
|    | Akademik    |  | IT Support  |  | Admisi      |             |
|    |             |  |             |  |             |             |
|    | Nilai       |  | Buat tiket  |  | Status      |             |
|    | Jadwal      |  | Cek status  |  | Persyaratan |             |
|    | KRS         |  | FAQ         |  | Timeline    |             |
|    +------+------+  +------+------+  +------+------+             |
|           |                |                |                     |
+===========|================|================|=====================+
            |                |                |
            v                v                v
    [Sistem SIAKAD]  [Ticketing Sys]  [Sistem PMB]
```

## Flow Lengkap — Step by Step

Ini yang terjadi setiap kali user kirim pesan:

```
1. USER kirim pesan via WhatsApp
   "Cek nilai semester kemarin"
          |
          v
2. WHATSAPP API forward pesan ke WEBHOOK kita
          |
          v
3. WEBHOOK terima pesan → masukkan ke ANTRIAN (Redis Queue)
   (langsung jawab 200 OK ke WhatsApp — fast!)
          |
          v
4. WORKER ambil pesan dari antrian → kirim ke AI LAYER
          |
          v
5. AI LAYER (Claude) analisis:
   - Intent: "info_akademik"        ← user mau cek data akademik
   - Entities: { action: "cek_nilai", semester: "latest" }
   - Confidence: 0.95               ← AI yakin 95%
   - Suggested MCP: "mcp_akademik"  ← route ke MCP akademik
          |
          v
6. CONTROLLER route request ke MCP AKADEMIK
   POST http://mcp-akademik:3001/execute
   { action: "get_grades", params: { nim: "...", semester: "latest" } }
          |
          v
7. MCP AKADEMIK panggil SIAKAD API → ambil data nilai
          |
          v
8. MCP return data ke CONTROLLER
   { success: true, data: { grades: [...], ips: 3.67, ipk: 3.54 } }
          |
          v
9. CONTROLLER format response jadi pesan WhatsApp-friendly
   "Nilai Semester 2025-2:
    CS101 - Algoritma: A (3 SKS)
    CS102 - Basis Data: B+ (3 SKS)
    IPS: 3.67 | IPK: 3.54"
          |
          v
10. RESPONSE dikirim ke user via WhatsApp
          |
          v
11. USER baca hasilnya dalam ~3-5 detik
```

**Total waktu: 3-5 detik.** Bandingkan dengan login SIAKAD yang bisa 5-15 menit (kalau tidak down).

---

# BAGIAN 3: MCP — MODULAR SERVICE MODULE (Deep Dive)

## Apa Itu MCP?

MCP adalah **modul layanan yang berdiri sendiri**. Setiap MCP:

- Punya **endpoint API sendiri**
- Terkoneksi ke **satu sistem backend spesifik**
- Bisa **di-deploy terpisah** dari sistem utama
- Mengikuti **interface yang standard** (sama untuk semua MCP)
- Bisa **ditest terisolasi** tanpa ganggu MCP lain

**Analoginya**: MCP itu seperti **plugin** — tinggal pasang, sistem langsung punya layanan baru.

## Interface Standard MCP

Setiap MCP wajib mengikuti format ini:

```
ENDPOINT yang harus disediakan:
  POST /execute       → Jalankan aksi (ex: get_grades, create_ticket)
  GET  /health        → Cek status kesehatan MCP
  GET  /capabilities  → Lihat kemampuan MCP

FORMAT REQUEST:
{
  "id": "req-001",
  "action": "get_grades",
  "params": { "nim": "2024001001", "semester": "2025-2" },
  "context": { "userId": "...", "role": "student" }
}

FORMAT RESPONSE:
{
  "id": "req-001",
  "success": true,
  "data": { "grades": [...] },
  "error": null,
  "metadata": { "executionTimeMs": 450, "sourceSystem": "SIAKAD" }
}
```

## MCP yang Akan Kita Bangun

### MCP Akademik (Prioritas #1 — Sprint 2)
```
Actions:
  get_profile    → Profil mahasiswa (nama, NIM, jurusan, semester)
  get_grades     → Nilai per semester + IPS/IPK
  get_schedule   → Jadwal kuliah
  get_krs        → Data KRS semester berjalan

Backend: SIAKAD API
```

### MCP IT Support (Prioritas #1 — Sprint 2)
```
Actions:
  create_ticket  → Buat ticket baru
  check_ticket   → Cek status ticket
  list_tickets   → Daftar ticket user

Backend: Ticketing System
```

### MCP Admisi (Prioritas #2 — Phase 2)
```
Actions:
  get_registration_status → Status pendaftaran
  get_requirements        → Persyaratan masuk
  get_timeline            → Timeline seleksi

Backend: Sistem PMB
```

### MCP Inventory (Prioritas #2 — Phase 2)
```
Actions:
  check_stock         → Cek ketersediaan barang
  request_item        → Ajukan permintaan barang
  get_request_status  → Status permintaan

Backend: Inventory System
```

## Cara Tambah MCP Baru

```
1. Bikin folder baru: src/mcp/nama-mcp/
2. Implement interface standard (IMCPModule)
3. Tulis adapter ke sistem backend
4. Tulis transformer data
5. Tulis unit test
6. Register di MCP Registry
7. Selesai — sistem otomatis bisa route ke MCP baru
```

**Point penting**: Kalau ada layanan baru, kita TIDAK perlu ubah core system. Cukup bikin MCP baru, pasang, jalan.

---

# BAGIAN 4: CONTOH SCENARIO — BAGAIMANA USER PAKAI

## Scenario 1: Mahasiswa Cek Nilai

```
User:  "Halo"
Bot:   "Halo Budi! Saya asisten layanan kampus.
       Ada yang bisa saya bantu?
       1. Info Akademik (nilai, jadwal, KRS)
       2. Buat Ticket (lapor masalah)
       3. Cek Status Ticket"

User:  "Cek nilai semester kemarin"
Bot:   "Nilai Semester 2025-2

       CS101 - Algoritma & Pemrograman: A (3 SKS)
       CS102 - Basis Data: B+ (3 SKS)
       CS103 - Jaringan Komputer: A- (3 SKS)
       MA101 - Kalkulus II: B (4 SKS)

       IPS: 3.50
       IPK Kumulatif: 3.54"

       [Waktu: ~3 detik]
```

## Scenario 2: Staf Lapor Masalah IT

```
User:  "Wifi di gedung A lantai 3 mati sejak pagi"
Bot:   "Ticket berhasil dibuat!

       ID: TK-20260422-001
       Kategori: IT Support - Jaringan
       Deskripsi: Wifi di gedung A lantai 3 mati sejak pagi
       Status: Open
       Estimasi response: 2 jam

       Kami akan update progressnya via chat ini."

User:  "Status tiket TK-20260422-001"
Bot:   "Ticket TK-20260422-001
       Status: In Progress
       Ditangani oleh: Tim Network
       Update: Sedang pengecekan router gedung A
       Estimasi selesai: Hari ini, sebelum jam 3 sore"
```

## Scenario 3: Multi-Intent (Phase 2)

```
User:  "Info lengkap tentang statusku dong"
Bot:   (Parallel: call MCP Akademik + MCP IT Support)

       "Berikut ringkasan status kamu:

       AKADEMIK:
       Nama: Budi Santoso | NIM: 2024001001
       Jurusan: Teknik Informatika - Semester 4
       IPS: 3.50 | IPK: 3.54 | Status: Aktif

       TICKET AKTIF:
       TK-20260422-001: Wifi gedung A - In Progress
       TK-20260420-003: Email error - Resolved"
```

---

# BAGIAN 5: TECHNOLOGY STACK

## Stack yang Kita Pilih

| Layer | Teknologi | Kenapa? |
|-------|-----------|---------|
| **Interface** | WhatsApp Business API via Twilio | Paling familiar di Indonesia, sandbox gratis untuk testing |
| **Webhook Server** | Node.js + Fastify | Fast, lightweight, async-native |
| **AI Engine** | Claude API (Anthropic SDK) | Intent understanding terbaik, structured output |
| **Language** | TypeScript | Type safety, fewer bugs, better DX |
| **Database** | PostgreSQL 16 | ACID, JSONB support, proven |
| **Cache & Session** | Redis 7 | Ultra-fast, good for queue + cache |
| **Message Queue** | BullMQ (Redis-based) | Reliable, built-in retry & DLQ |
| **Testing** | Vitest | Fast, TypeScript-native |
| **Containerization** | Docker + Compose | Consistent dev & prod environments |
| **CI/CD** | GitHub Actions | Automation |

## Project Structure

```
whatsapp-gateway/
├── src/
│   ├── webhook/           # Webhook server (receive WhatsApp messages)
│   ├── ai/                # Claude SDK integration + prompts
│   ├── controller/        # Orchestrator + router + session manager
│   ├── mcp/
│   │   ├── core/          # MCP framework (interface, registry, client)
│   │   ├── akademik/      # MCP Akademik module
│   │   ├── admisi/        # MCP Admisi module
│   │   ├── inventory/     # MCP Inventory module
│   │   └── it-support/    # MCP IT Support module
│   ├── db/                # Database schema + migrations
│   ├── queue/             # BullMQ workers + processors
│   └── services/          # WhatsApp service, user service, etc.
├── tests/
├── docker/
├── docs/                  # All documentation
└── package.json
```

---

# BAGIAN 6: DATA FLOW — DETAIL TEKNIS

## Sequence Diagram — Full Request

```
User        WhatsApp      Webhook     Queue     AI Layer    Controller   MCP Akademik   SIAKAD
 |              |            |          |           |            |             |           |
 |--"Cek nilai"-->|           |          |           |            |             |           |
 |              |--POST------>|          |           |            |             |           |
 |              |            |--push---->|           |            |             |           |
 |              |            |  200 OK  |           |            |             |           |
 |              |            |          |--pull-----|            |             |           |
 |              |            |          |    worker |            |             |           |
 |              |            |          |           |--classify->|             |           |
 |              |            |          |           |<--intent---|             |           |
 |              |            |          |           |            |--execute--->|           |
 |              |            |          |           |            |             |--GET------>|
 |              |            |          |           |            |             |<--grades---|
 |              |            |          |           |            |<--data------|           |
 |              |            |          |           |            |             |           |
 |              |            |          |           |            |--send reply------------>|(WA API)
 |<--"Nilai Anda.."--------- |----------|-----------|------------|-------------|-----------|
```

## Database Schema (Simplified)

```
+-------------+     +-------------+     +-------------+
|   users     |     |  sessions   |     |  messages   |
+-------------+     +-------------+     +-------------+
| id (UUID)   |<--->| id (UUID)   |<--->| id (UUID)   |
| phone       | 1:N | user_id     | 1:N | session_id  |
| name        |     | state       |     | direction   |
| nim         |     | context     |     | content     |
| role        |     | last_intent |     | intent      |
+-------------+     +-------------+     | mcp_used    |
      |                                  +-------------+
      | 1:N
      v
+-------------+                    +-------------+
|  tickets    |                    | mcp_registry|
+-------------+                    +-------------+
| id (UUID)   |                    | name        |
| ticket_no   |                    | endpoint    |
| user_id     |                    | status      |
| category    |                    | health      |
| status      |                    +-------------+
| description |
+-------------+
```

---

# BAGIAN 7: APPROACH — TESTING FIRST, BUILD LATER

## Filosofi Kami

> **Jangan langsung bangun besar. Coba dulu, buktikan bisa, baru scale.**

Kita pakai pendekatan **POC (Proof of Concept)** dulu sebelum development penuh:

```
PHASE 0: POC (2 minggu) — BUKTIKAN KONSEP BISA JALAN
    |
    | Go?
    v
PHASE 1: MVP (6-8 minggu) — BANGUN MINIMAL YANG BERGUNA
    |
    | Go?
    v
PHASE 2: EXPANSION (8-12 minggu) — TAMBAH LAYANAN LAIN
    |
    | Go?
    v
PHASE 3: ECOSYSTEM (12-20 minggu) — BUKA KE MULTI-INSTANSI
```

## Phase 0: POC — Step by Step

Ini yang akan kita lakukan **2 minggu pertama**:

### Week 1: Validasi Komponen Individual

```
Day 1-2:  WHATSAPP SANDBOX
          Setup Twilio WhatsApp sandbox
          Kirim-terima pesan test
          Verifikasi webhook bisa terima message
          ✓/✗ Kalau berhasil → lanjut
          ✓/✗ Kalau gagal → coba alternatif (Telegram bot untuk testing)

Day 3-4:  AI INTENT CLASSIFICATION
          Setup Claude API + SDK
          Build simple intent classifier
          Test dengan 50 pesan sample
          Target: >80% akurasi
          ✓/✗ Kalau berhasil → lanjut
          ✓/✗ Kalau gagal → tune prompt / coba approach hybrid

Day 5-6:  MOCK MCP
          Build MCP dengan hardcoded responses
          Implement standard interface
          Test format request/response
          ✓/✗ Kalau berhasil → lanjut
```

### Week 2: Integrasi End-to-End

```
Day 7-10: WIRE SEMUA KOMPONEN
          Gabungkan WhatsApp + AI + Mock MCP
          Test full flow dengan 20+ skenario pesan
          Ukur response time
          ✓/✗ Kalau berhasil → lanjut

Day 11-14: CONNECT KE 1 SISTEM NYATA (jika memungkinkan)
          Integrasi dengan SIAKAD (atau mock yang comprehensive)
          Test dengan data real
          Document findings
          ✓/✗ POC COMPLETE → decision untuk lanjut ke development
```

### Decision Gate — Go/No-Go

| Kriteria | Harus Pencapaian | Cara Ukur |
|----------|-----------------|-----------|
| WhatsApp connectivity | Pesan terkirim & diterima < 10 detik | Manual test |
| AI accuracy | > 80% intent benar | 50 test messages |
| MCP pattern viable | Response < 1 detik (mock) | Automated test |
| End-to-end flow | Berjalan dengan mock data | Scripted test |

**Jika semua GO** → Lanjut ke Phase 1 (Sprint 1 development)
**Jika ada yang gagal** → Iterate, fix, retry
**Jika fundamental gagal** → Pivot arsitektur

---

# BAGIAN 8: ROADMAP & TIMELINE

## Sprint Plan Overview

```
Minggu  1   2   3   4   5   6   7   8
       +---+---+---+---+---+---+---+---+
       |Spr0|  Spr 1  | Spr 2 | Spr 3  |
       |POC | Infra+  | 1st   | Polish |
       |    | AI+DB   | MCP   | + QA   |
       +---+---+---+---+---+---+---+---+
       |<- POC ->|<------ MVP ---------->|
```

### Sprint 0: POC (Week 1-2)
**Goal**: Buktiin konsep bisa jalan
- Setup WhatsApp sandbox
- AI intent classification test
- Mock MCP
- Full flow POC
- **Deliverable**: Demo POC + Go/No-Go decision

### Sprint 1: Core Infrastructure (Week 3-4)
**Goal**: Bangun fondasi production-ready
- Webhook server (Fastify)
- AI Layer (Claude SDK)
- Backend Controller (orchestrator)
- Database (PostgreSQL)
- Redis + BullMQ queue
- MCP Framework (core)
- **Deliverable**: Full infrastructure running

### Sprint 2: First MCP + Tickets (Week 5-6)
**Goal**: 1 layanan end-to-end bekerja
- MCP Akademik (grades, schedule, KRS)
- SIAKAD adapter
- Ticket creation via chat
- Ticket status check
- **Deliverable**: User bisa cek nilai + buat ticket via WhatsApp

### Sprint 3: Polish + QA + Go-Live (Week 7-8)
**Goal**: Production-ready
- Multi-turn conversation
- User authentication
- Performance optimization
- Load testing (100 concurrent users)
- Security review
- UAT with real users
- **Deliverable**: MVP live

## Resource yang Dibutuhkan

| Role | Jumlah | Alokasi |
|------|--------|---------|
| Backend Developer | 1-2 | Full-time |
| AI / ML Engineer | 1 | Full-time |
| QA Engineer | 1 | Part-time → Full-time |
| DevOps | 1 | Part-time |

**Minimal team untuk POC**: 1 Backend + 1 AI Engineer

---

# BAGIAN 9: RISKS & MITIGATIONS

| Risiko | Dampak | Kemungkinan | Mitigasi |
|--------|--------|-------------|----------|
| **WhatsApp API limit** | Tinggi | Sedang | Riset limits dari awal (Twilio sandbox free), fallback ke SMS jika perlu |
| **AI kurang akurat** | Tinggi | Sedang | Iterative prompt tuning, fallback ke human agent, hybrid keyword+AI |
| **Sistem backend belum punya API** | Tinggi | Tinggi | PAKAI MOCK DATA DULU. Build adapter gradually. Ini POC, bukan integration project |
| **Security concern** | Kritis | Rendah | Encryption, rate limiting, audit trail, no sensitive data in logs |
| **Scope creep** | Sedang | Tinggi | Strict MVP scope, defer semua yang P2 ke phase berikutnya |
| **Performance bottleneck** | Sedang | Rendah | Queue-based architecture, async processing, caching |

---

# BAGIAN 10: KPI & SUCCESS METRICS

## MVP Success Criteria (End of Sprint 3)

| Metric | Target | Cara Ukur |
|--------|--------|-----------|
| End-to-end flow bekerja | Ya, minimal 1 layanan | Live demo |
| Response time | < 5 detik | Monitoring |
| AI Intent accuracy | > 85% | Test suite (50+ messages) |
| System uptime | > 95% | Health monitoring |
| Test coverage | > 70% | Vitest coverage report |
| User acceptance | Approved by 5 UAT testers | UAT sign-off |

## Long-term Metrics (6-12 Bulan)

| Metric | Target |
|--------|--------|
| User adoption | 50% mahasiswa aktif |
| Request via chat | 80% dari total request |
| Resolution time | < 1 jam untuk standard request |
| User satisfaction | > 4.0/5.0 |
| MCP modules active | 4+ modules |

---

# BAGIAN 11: APA YANG SUDAH KITA SIAPKAN

Dokumentasi lengkap sudah tersedia di `whatsapp-gateway/docs/`:

| File | Isi | Untuk Siapa |
|------|-----|-------------|
| `00-PROJECT-OVERVIEW.md` | Vision, arsitektur, tech stack, phases | Semua orang |
| `01-PRD.md` | Requirements detail, MVP scope, success criteria | PM, Developer |
| `02-SYSTEM-ARCHITECTURE.md` | Arsitektur lengkap, DB schema, API design, security | Developer |
| `03-MCP-DESIGN.md` | MCP interface, specs per module, cara tambah MCP baru | Developer |
| `04-SPRINT-PLAN.md` | Sprint backlog, timeline, velocity, retrospective template | PM, Developer |
| `05-USER-STORIES.md` | 18 user stories, 6 epics, acceptance criteria | Developer, QA |
| `06-TEST-SCENARIOS.md` | POC, unit, integration, E2E, performance, security tests | QA, Developer |
| `07-PROTOTYPING-GUIDE.md` | Step-by-step POC dengan runnable code | Developer |
| `08-TECHNICAL-IMPLEMENTATION.md` | Tech stack, project structure, code examples, Docker | Developer |
| `09-ORCHESTRATOR-DESIGN.md` | Orchestrator patterns, state machine, queue design | Developer |

---

# BAGIAN 12: NEXT STEPS — DISCUSSION POINTS

## Yang Perlu Kita Diskusikan Bersama

### 1. Kesiapan Tim
- [ ] Siapa yang bisa alokasi untuk POC (2 minggu)?
- [ ] Ada pengalaman dengan WhatsApp API / Twilio?
- [ ] Ada pengalaman dengan Claude API / Anthropic SDK?
- [ ] Stack Node.js/TypeScript OK untuk semua?

### 2. Akses & Dependencies
- [ ] Apakah kita bisa dapat akses WhatsApp Business API? (atau pakai Twilio sandbox dulu)
- [ ] Apakah SIAKAD punya API yang bisa kita pakai? (kalau tidak, mock dulu)
- [ ] Budget untuk API keys (Claude API, Twilio)?
- [ ] Server/infra untuk deployment?

### 3. Scope Agreement
- [ ] Setuju dengan pendekatan POC dulu → baru development?
- [ ] Setuju dengan MVP scope (1 MCP Akademik + Ticket)?
- [ ] Apa ada layanan lain yang harus diprioritaskan?
- [ ] Timeline 8 minggu realistis untuk tim kita?

### 4. Go/No-Go Framework
- [ ] Setuju dengan decision gate di akhir POC?
- [ ] Siapa yang jadi decision maker untuk Go/No-Go?
- [ ] Kapan kita mulai Sprint 0?

---

# PENUTUP

Project ini bukan sekadar "bikin chatbot". Ini tentang **mengubah cara orang berinteraksi dengan layanan digital** — dari yang tersebar dan kompleks menjadi terpusat dan sederhana.

Kita mulai dari sesuatu yang kecil: **1 channel (WhatsApp), 1 AI (Claude), 1 layanan (Akademik)**. Tapi arsitekturnya sudah didesain untuk **scale** — kalau konsepnya terbukti, tinggal pasang MCP baru untuk setiap layanan tambahan.

**Momentum kita**:
- AI sudah sangat capable
- WhatsApp sudah ada di semua HP
- Arsitektur modular sudah mature
- Kita punya tim yang bisa jalankan ini

**Langkah pertama kita**: 2 minggu POC untuk membuktikan bahwa ini bisa jalan. Bukan 2 bulan planning, bukan 6 bulan development. **2 minggu eksperimen, kemudian kita putuskan bersama**.

Mari kita mulai.

---

*Dokumen ini dibuat untuk briefing internal tim Ristek. Untuk detail teknis lengkap, silakan lihat dokumen-dokumen pendukung di folder `whatsapp-gateway/docs/`.*

*Pertanyaan? Diskusi? Masukan? Silakan kita bahas.*
