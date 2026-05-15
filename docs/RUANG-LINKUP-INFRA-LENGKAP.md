# RuangLinkUp — Infrastruktur Lengkap: Tech, Tools & Cara Server Bekerja

**Untuk**: Tim Ristek
**Tanggal**: April 2026
**Sifat**: Dokumen Infrastruktur — Apa yang Dipasang, Apa yang Dibangun, Bagaimana Semuanya Bekerja

---

# GAMBARAN BESAR — APA YANG KITA BANGUN

Kita membangun **1 sistem** yang terdiri dari **beberapa service yang berjalan bersamaan** di dalam **1 server**. Setiap service punya tugas spesifik dan berkomunikasi satu sama lain.

```
┌──────────────────────────── SERVER KITA ─────────────────────────────┐
│                                                                       │
│   Service 1          Service 2          Service 3          Service 4  │
│   WEBHOOK            WORKER             MCP-BOOKING       MCP-KANTIN │
│   (pintu masuk)      (otak + routing)   (layanan booking) (layanan   │
│   port 3000          port -             port 3001         kantin)    │
│                                         port 3002                    │
│                                                                       │
│   Service 5          Service 6          Service 7          Service 8  │
│   MCP-TICKET         MCP-AKADEMIK       MCP-INFO           REDIS     │
│   port 3003          port 3004          port 3005          port 6379  │
│                                                                       │
│   Service 9                                                                        │
│   POSTGRESQL                                                                                        │
│   port 5432                                                                                         │
│                                                                                                     │
└───────────┬───────────────────────────────────────────────────────────────────────────────────────────┘
            │
            │ HTTPS (internet)
            │
    ┌───────┴──────────┐
    │  CLOUD SERVICES   │
    │  (di luar server) │
    │                   │
    │  - Twilio (WA)    │
    │  - Claude API     │
    │  - ngrok (POC)    │
    └───────────────────┘
```

---

# DAFTAR LENGKAP — TECH & TOOLS

## A. Yang Kita INSTALL (Software di Server)

| # | Teknologi | Versi | Fungsi di Sistem | Kenapa Ini? |
|---|-----------|-------|-------------------|-------------|
| 1 | **Node.js** | 20 LTS | Runtime untuk semua service kita | Stabil, cepat, ekosistem besar, tim familiar |
| 2 | **TypeScript** | 5.x | Bahasa pemrograman | Type safety, bikin bug berkurang, code lebih rapi |
| 3 | **PostgreSQL** | 16 | Database utama | Simpan semua data (booking, kantin, tiket, user, session) |
| 4 | **Redis** | 7 | Cache + Queue + Session | Antrian pesan, simpan session percakapan, cache data |
| 5 | **Docker** | Latest | Containerization | Bungkus setiap service jadi container, mudah jalan bareng |
| 6 | **Docker Compose** | Latest | Orchestration | Jalankan semua container dengan 1 perintah |
| 7 | **ngrok** | Latest | Tunnel (POC only) | Expose localhost ke internet supaya Twilio bisa kirim webhook |
| 8 | **Git** | Latest | Version control | Kolaborasi kode tim |

## B. Yang Kita PAKAI (Library/Framework)

| # | Library/Package | Fungsi |
|---|----------------|--------|
| 1 | **Fastify** | Web framework (lebih cepat dari Express) |
| 2 | **@anthropic-ai/sdk** | SDK resmi Claude — untuk memanggil AI |
| 3 | **twilio** | SDK Twilio — kirim/terima pesan WhatsApp |
| 4 | **bullmq** | Job queue berbasis Redis — antrian pesan |
| 5 | **drizzle-orm** | ORM untuk PostgreSQL — query database dengan TypeScript |
| 6 | **ioredis** | Redis client — koneksi ke Redis |
| 7 | **zod** | Validation library — validasi input/output |
| 8 | **vitest** | Testing framework — tulis dan jalankan test |
| 9 | **dotenv** | Baca file .env — simpan API key dengan aman |
| 10 | **uuid** | Generate unique ID — untuk request ID, session ID |

## C. Yang Kita PAKAI di Cloud (External Services)

| # | Service | Fungsi | Biaya |
|---|---------|--------|-------|
| 1 | **Twilio WhatsApp API** | Kirim/terima pesan WhatsApp | Sandbox gratis, production bayar per percakapan |
| 2 | **Anthropic Claude API** | AI brain — pahami pesan user, generate response | Bayar per token (~$0.25 per 1000 request kecil) |
| 3 | **ngrok** (POC) | Expose localhost ke internet | Gratis |

## D. Yang Kita BANGUN (Code Sendiri)

| # | Apa | Lokasi di Project | Bahasa |
|---|-----|-------------------|--------|
| 1 | Webhook Server | `src/webhook/` | TypeScript |
| 2 | Queue Worker | `src/worker/` | TypeScript |
| 3 | AI Engine (Claude integration) | `src/ai/` | TypeScript |
| 4 | Orchestrator (controller + router) | `src/controller/` | TypeScript |
| 5 | MCP Core Framework | `src/mcp/core/` | TypeScript |
| 6 | MCP Booking | `src/mcp/booking/` | TypeScript |
| 7 | MCP Kantin | `src/mcp/kantin/` | TypeScript |
| 8 | MCP Ticket | `src/mcp/ticket/` | TypeScript |
| 9 | MCP Akademik | `src/mcp/akademik/` | TypeScript |
| 10 | MCP Info | `src/mcp/info/` | TypeScript |
| 11 | Database Schema | `src/db/schema/` | SQL + TypeScript |
| 12 | Tests | `tests/` | TypeScript |

---

# CARA SERVER BEKERJA — STEP BY STEP

## Bagaimana 1 Pesan WhatsApp Diproses

Ambil contoh: User kirim **"Pinjem kelas besok jam 10"**

```
WAKTU    PROSES                          DI MANA          PORT    TEKNOLOGI
────────────────────────────────────────────────────────────────────────────────
0.0s     User kirim pesan via WA         [Cloud]          —       WhatsApp App
         │
         │ Twilio forward via HTTPS POST
         v
0.1s     Webhook terima pesan            [Server:3000]    3000    Fastify
         │
         │ Validasi signature (pastikan dari Twilio)
         │ Parse: phone="+62812...", text="Pinjem kelas..."
         │ Push ke Redis Queue
         │ Return 200 OK ke Twilio (INSTAN)
         v
0.2s     Pesan masuk antrian             [Server:6379]    6379    Redis + BullMQ
         │
         │ Worker mengambil pesan dari queue
         v
0.3s     Load session user               [Server:6379]    6379    Redis
         │ (cek: user ini pernah chat? ambil context sebelumnya)
         │
         │ Kirim pesan ke Claude API
         v
0.4s     Claude analisis pesan           [Cloud]          —       Anthropic SDK
         │
         │ Claude return:
         │ {
         │   intent: "booking_ruangan",
         │   confidence: 0.96,
         │   entities: { tanggal:"besok", jam:"10:00" },
         │   suggested_mcp: "mcp-booking"
         │ }
         │
         │ Waktu Claude: ~1.5 detik
         v
1.9s     Orchestrator cek Registry       [Server:3000]    3000    Internal logic
         │ (booking_ruangan → mcp-booking → localhost:3001)
         │
         │ Kirim HTTP request ke MCP Booking
         v
2.0s     MCP Booking proses              [Server:3001]    3001    Fastify + PostgreSQL
         │
         │ 1. Cek tabel rooms → daftar semua ruangan
         │ 2. Cek tabel bookings → ada yang bentrok?
         │ 3. Cek tabel schedules → ada jadwal kuliah?
         │ 4. Return ruangan yang tersedia
         │
         │ Waktu query DB: ~50ms
         v
2.1s     MCP return data ke Orchestrator [Server:3001]    3001    HTTP response
         │
         v
2.1s     AI format response              [Server:3000]    3000    Claude / internal
         │ (ubah data jadi pesan WA yang friendly)
         │
         v
2.2s     Kirim response via Twilio       [Cloud]          —       Twilio SDK
         │
         │ Twilio kirim ke WhatsApp user
         v
2.5s     User terima pesan di WA         [Cloud]          —       WhatsApp App

         "Ruangan tersedia besok jam 10:
          1. A201 (kapasitas 30)
          2. A305 (kapasitas 40)
          3. B102 (kapasitas 60)
          Mau pilih yang mana?"

TOTAL WAKTU: ~2.5 detik
```

---

# DETAIL SETIAP SERVICE — APA YANG BERJALAN DI SERVER

## Service 1: Webhook Server

```
TEKNOLOGI: Node.js + Fastify
PORT: 3000
FILE UTAMA: src/webhook/server.ts

TANGGUNG JAWAB:
- Terima HTTP POST dari Twilio saat ada pesan WA masuk
- Validasi bahwa request bener-bener dari Twilio (bukan attacker)
- Parse data pesan (nomor pengirim, isi pesan, timestamp)
- Masukkan pesan ke antrian Redis (BullMQ)
- Langsung balas 200 OK (supaya Twilio tidak timeout)

CARA KERJA:
  Twilio ──POST──► Fastify route handler
                      │
                      ├── verifySignature()  → valid?
                      ├── rateLimit()        → ok?
                      ├── parseMessage()     → extract data
                      └── queue.add(msg)     → push ke Redis

  Lalu jawab 200 OK kosong.
  Response asli ke user dikirim NANTI oleh Worker.

KENAPA PERLU TERPISAH DARI WORKER?
  Karena webhook harus jawab CEPAT (< 200ms).
  Kalau webhook harus tunggu AI proses (3-5 detik), Twilio timeout.
  Makanya: webhook terima → push ke queue → balas cepat.
  Worker ambil dari queue → proses pelan-pelan.
```

## Service 2: Queue Worker

```
TEKNOLOGI: Node.js + BullMQ
PORT: tidak punya (bukan HTTP server, berjalan sebagai background process)
FILE UTAMA: src/worker/processor.ts

TANGGUNG JAWAB:
- Ambil pesan dari antrian Redis satu per satu
- Load session user dari Redis
- Panggil Claude API untuk analisis intent
- Tentukan MCP mana yang harus dituju
- Kirim request ke MCP module
- Format response
- Kirim balasan ke user via Twilio
- Update session

INI ADALAH "OTAK" DARI SISTEM.
Semua logic orchestration ada di sini.

CARA KERJA:
  Redis Queue ──pull──► Worker
                          │
                          ├── sessionManager.load(phone)
                          ├── ai.classify(message, context)
                          │     │
                          │     └── Claude API call
                          │         return: intent + entities + mcp target
                          │
                          ├── router.route(intent) → MCP endpoint
                          │
                          ├── mcpClient.execute(endpoint, request)
                          │     │
                          │     └── HTTP POST ke MCP module
                          │         return: data dari MCP
                          │
                          ├── responseBuilder.format(data)
                          │
                          ├── twilioClient.send(phone, response)
                          │
                          └── sessionManager.update(phone, newState)
```

## Service 3-7: MCP Modules

Setiap MCP module punya struktur yang **identik**, bedanya cuma:
- Data yang di-handle (booking vs kantin vs tiket)
- Database table yang diakses
- Business logic internal

### Struktur Universal 1 MCP Module

```
┌─────────────────────────────────────────────────────┐
│              SATU MCP MODULE                         │
│                                                      │
│  TIPE: Microservice kecil (HTTP server)              │
│  TEKNOLOGI: Node.js + Fastify                        │
│  PORT: 3001-3005 (masing-masing beda)                │
│                                                      │
│  ENDPOINT YANG WAJIB ADA:                            │
│                                                      │
│  POST /execute                                       │
│    Terima: { action, params, context }               │
│    Proses: business logic                            │
│    Return: { success, data, error, metadata }        │
│                                                      │
│  GET /health                                         │
│    Return: { status: "healthy", uptime: 12345 }      │
│                                                      │
│  GET /capabilities                                   │
│    Return: { actions: [...], description: "..." }     │
│                                                      │
│  KOMPONEN INTERNAL:                                  │
│  ├── routes.ts      → Definisi endpoint              │
│  ├── actions/       → 1 file per action              │
│  │   ├── action-a.ts                                 │
│  │   ├── action-b.ts                                 │
│  │   └── ...                                         │
│  ├── db/            → Database query                 │
│  │   └── repository.ts                               │
│  ├── transformer/   → Ubah data DB → format response│
│  └── validator/     → Validasi input params          │
│                                                      │
│  DATABASE: PostgreSQL (shared atau terpisah)         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Detail Per Module

```
MCP-BOOKING (port 3001)
├── Actions: cek_ketersediaan, booking_create, booking_cancel,
│            jadwal_ruangan, booking_saya, booking_approve
├── DB Tables: rooms, bookings, room_schedules, booking_rules
└── Logic: deteksi konflik jadwal, auto-approve, aturan booking

MCP-KANTIN (port 3002)
├── Actions: cek_stok, catat_ambil, catat_bayar, restock,
│            laporan_harian, laporan_mingguan, notifikasi_stok
├── DB Tables: items, transaksi, restock_log, keuangan
└── Logic: stok otomatis berkurang, tracking kejujuran, timeout bayar

MCP-TICKET (port 3003)
├── Actions: ticket_create, ticket_status, ticket_list,
│            ticket_update, ticket_close, ticket_assign
├── DB Tables: tickets, ticket_updates
└── Logic: auto-categorize, notifikasi ke admin, SLA tracking

MCP-AKADEMIK (port 3004)
├── Actions: get_profil, get_nilai, get_jadwal, get_krs,
│            request_surat, cek_surat
├── DB Tables: surat_requests (internal)
├── External API: SIAKAD (nilai, jadwal, profil)
└── Logic: data dari SIAKAD ditransform ke format response kita

MCP-INFO (port 3005)
├── Actions: get_pengumuman, get_event, get_faq,
│            get_kontak, search_info
├── DB Tables: pengumuman, events, faq, kontak
└── Logic: content management sederhana
```

## Service 8: Redis

```
TEKNOLOGI: Redis 7
PORT: 6379
TIDAK PERLU DIKODING — cukup jalan sebagai container Docker

3 FUNGSI DALAM 1 SERVICE:

1. MESSAGE QUEUE (BullMQ)
   ┌──────────────────────────────────────┐
   │  Antrian pesan yang masuk            │
   │                                      │
   │  Queue: "wsg-messages"               │
   │  ├── Job 1: { phone, text, time }    │
   │ ├── Job 2: { phone, text, time }    │
   │  ├── Job 3: { phone, text, time }    │
   │  └── ...                             │
   │                                      │
   │  Konfigurasi:                        │
   │  ├── Max retry: 3                    │
   │  ├── Backoff: exponential (2s, 4s, 8s)│
   │  └── DLQ: pesan yang gagal 3x        │
   └──────────────────────────────────────┘

2. SESSION STORE
   ┌──────────────────────────────────────┐
   │  Data percakapan per user            │
   │                                      │
   │  Key: "session:+6281234567890"       │
   │  Value: {                            │
   │    state: "idle",                    │
   │    lastIntent: "booking_ruangan",    │
   │    history: [                        │
   │      { role:"user", text:"..." },   │
   │      { role:"bot", text:"..." }      │
   │    ],                                │
   │    context: { nim: "...", nama: "..." } │
   │  }                                   │
   │                                      │
   │  TTL: 24 jam (auto-delete setelah 24h)│
   └──────────────────────────────────────┘

3. DATA CACHE
   ┌──────────────────────────────────────┐
   │  Cache response yang sering dipakai  │
   │                                      │
   │  Key: "cache:kantin:stok"            │
   │  Value: { items: [...] }             │
   │  TTL: 5 menit                        │
   │                                      │
   │  Tujuan: kalau 10 user bertanya      │
   │  "kantin ada apa" dalam 5 menit,     │
   │  cukup 1x query DB, 9x ambil cache   │
   └──────────────────────────────────────┘
```

## Service 9: PostgreSQL

```
TEKNOLOGI: PostgreSQL 16
PORT: 5432
TIDAK PERLU DIKODING — cukup jalan sebagai container Docker

SEMUA TABLE DALAM 1 DATABASE "ruanglinkup":

┌─────────────────────────────────────────────────────────┐
│                    SCHEMA DATABASE                       │
│                                                          │
│  USERS & AUTH:                                           │
│  ├── users (id, phone, name, nim, role, org, created)   │
│  └── sessions (id, user_id, state, context, last_intent)│
│                                                          │
│  BOOKING:                                                │
│  ├── rooms (id, name, building, floor, capacity, type)  │
│  ├── bookings (id, code, room_id, user_id, date,        │
│  │             time_start, time_end, purpose, status)    │
│  ├── room_schedules (room_id, day, start, end, course)  │
│  └── booking_rules (role, max_week, max_hours, approve)  │
│                                                          │
│  KANTIN:                                                 │
│  ├── items (id, nama, kategori, harga, stok, min_stok)  │
│  ├── transaksi (id, user_phone, items_json, total,       │
│  │             status_bayar, waktu_ambil, waktu_bayar)   │
│  ├── restock_log (id, item_id, qty, oleh, timestamp)     │
│  └── keuangan (id, tanggal, total_masuk, selisih)        │
│                                                          │
│  TICKET:                                                 │
│  ├── tickets (id, code, user_phone, kategori, judul,     │
│  │            deskripsi, prioritas, status, assigned_to)  │
│  └── ticket_updates (id, ticket_id, message, oleh, time) │
│                                                          │
│  AKADEMIK:                                               │
│  └── surat_requests (id, user_id, jenis, data, status)   │
│                                                          │
│  INFO:                                                   │
│  ├── pengumuman (id, judul, isi, kategori, tanggal)      │
│  ├── events (id, nama, tanggal, lokasi, deskripsi)       │
│  ├── faq (id, pertanyaan, jawaban, kategori)              │
│  └── kontak (id, nama, jabatan, phone, email)             │
│                                                          │
│  LOGGING:                                                │
│  └── messages (id, session_id, direction, content,        │
│               intent, mcp_used, response_time, created)   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

# BAGAIMANA SEMUA SERVICE BERKOMUNIKASI

```
KOMUNIKASI ANTAR SERVICE:

Webhook ──push──► Redis Queue ──pull──► Worker
                                            │
                                            │ HTTP POST (localhost)
                                            ├──► mcp-booking:3001
                                            ├──► mcp-kantin:3002
                                            ├──► mcp-ticket:3003
                                            ├──► mcp-akademik:3004
                                            └──► mcp-info:3005

Worker ──read/write──► Redis (session + cache)
Worker ──read/write──► PostgreSQL (via MCP modules)
Worker ──HTTPS──► Claude API (cloud)
Worker ──HTTPS──► Twilio API (cloud)

Setiap MCP ──read/write──► PostgreSQL (database table mereka sendiri)

KESIMPULAN:
- Service berkomunikasi via HTTP (antara Worker dan MCP)
- Data disimpan di PostgreSQL (via MCP)
- Session/cache di Redis
- AI dan WhatsApp di cloud (API call)
```

### Detail Protokol Komunikasi

```
┌──────────────┐                      ┌──────────────┐
│   WORKER     │ ─── HTTP POST ─────► │  MCP MODULE  │
│              │                      │              │
│  kirim:      │ ─── JSON body ─────► │  terima:     │
│  {           │                      │  {           │
│    action,   │                      │    action,   │
│    params,   │                      │    params,   │
│    context   │                      │    context   │
│  }           │                      │  }           │
│              │ ◄─── JSON response ── │              │
│  terima:     │                      │  kirim:      │
│  {           │                      │  {           │
│    success,  │                      │    success,  │
│    data,     │                      │    data,     │
│    error,    │                      │    error,    │
│    metadata  │                      │    metadata  │
│  }           │                      │  }           │
└──────────────┘                      └──────────────┘

PORT: Worker kirim ke localhost:3001-3005
FORMAT: JSON
TIMEOUT: 10 detik
RETRY: 3x dengan exponential backoff (jika MCP tidak merespon)
```

---

# NETWORK MAP — PORT & KONEKSI

```
┌─────────────────────── INTERNET ──────────────────────────┐
│                                                            │
│   WhatsApp User ◄──HTTPS──► Twilio API ◄──HTTPS──► ngrok │
│                                                (POC only) │
│   Claude API ◄──HTTPS──► Worker                           │
│                                                            │
└───────────────────────────┬────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │   SERVER    │
                    │ (localhost)  │
                    └──────┬──────┘
                           │
    ┌──────────┬──────────┬┴──────────┬──────────┬──────────┐
    │          │          │           │          │          │
:3000      :3001      :3002       :3003      :3004      :3005
Webhook    MCP        MCP         MCP        MCP        MCP
+ Worker   Booking    Kantin      Ticket     Akademik   Info
    │          │          │           │          │          │
    ├──► :6379 Redis ◄───┘───────────┘──────────┘──────────┘
    │    (queue, session, cache)
    │
    └──► :5432 PostgreSQL ◄─────────────────────────────────┘
         (semua data)
```

### Port Allocation

| Port | Service | Akses Dari |
|------|---------|-----------|
| 3000 | Webhook + Worker | ngrok → internet (hanya /webhook) |
| 3001 | MCP Booking | Worker only (internal) |
| 3002 | MCP Kantin | Worker only (internal) |
| 3003 | MCP Ticket | Worker only (internal) |
| 3004 | MCP Akademik | Worker only (internal) |
| 3005 | MCP Info | Worker only (internal) |
| 5432 | PostgreSQL | MCP modules only (internal) |
| 6379 | Redis | Worker + MCP modules (internal) |

**HANYA port 3000 yang terekspos ke internet** (via ngrok). Semua port lain internal.

---

# CARA MENJALANKAN SEMUANYA

## Step 1: Install Prerequisites (Sekali Saja)

```bash
# Install Docker Desktop
# Download dari docker.com → install → restart

# Install Node.js 20 LTS
# Download dari nodejs.org → install

# Install ngrok
# Download dari ngrok.com → install

# Verify
docker --version     # Docker version 24+
node --version       # v20+
npm --version        # v10+
```

## Step 2: Setup Project

```bash
# Buat folder project
mkdir ruanglinkup && cd ruanglinkup

# Init project
npm init -y
npm install fastify @anthropic-ai/sdk twilio bullmq drizzle-orm ioredis zod uuid dotenv
npm install -D typescript vitest @types/node tsx

# Buat .env file
cp .env.example .env
# Isi API key: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ANTHROPIC_API_KEY
```

## Step 3: Start Infrastructure

```bash
# Start Redis + PostgreSQL (via Docker)
docker compose up -d redis postgres

# Ini menjalankan:
# - PostgreSQL di port 5432
# - Redis di port 6379
# - Data disimpan di Docker volume (persistent)
```

## Step 4: Start Services

```bash
# Terminal 1: Start MCP modules
npm run start:mcp-booking    # port 3001
npm run start:mcp-kantin     # port 3002
npm run start:mcp-ticket     # port 3003

# Terminal 2: Start Webhook + Worker
npm run start:webhook        # port 3000
npm run start:worker         # background process

# Terminal 3: Start ngrok (POC)
ngrok http 3000
# Copy URL: https://abc123.ngrok.io
# Set di Twilio webhook: https://abc123.ngrok.io/webhook/whatsapp
```

## Atau: Satu Perintah Jalan Semua

```bash
# Docker Compose menjalankan SEMUA service sekaligus
docker compose up -d

# Ini menjalankan 9 container sekaligus:
# 1. webhook (port 3000)
# 2. worker (background)
# 3. mcp-booking (port 3001)
# 4. mcp-kantin (port 3002)
# 5. mcp-ticket (port 3003)
# 6. mcp-akademik (port 3004)
# 7. mcp-info (port 3005)
# 8. postgres (port 5432)
# 9. redis (port 6379)

# Cek status semua:
docker compose ps

# Lihat log semua:
docker compose logs -f

# Stop semua:
docker compose down
```

---

# DOCKER COMPOSE — FILE YANG MENGATUR SEMUANYA

```yaml
# docker-compose.yml
version: '3.8'

services:
  # === INFRASTRUCTURE ===
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: ruanglinkup
      POSTGRES_USER: rlu
      POSTGRES_PASSWORD: rlu_dev_2026
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rlu"]
      interval: 10s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 5

  # === MAIN APP ===
  webhook:
    build: .
    command: node dist/webhook.js
    ports: ["3000:3000"]
    env_file: .env
    depends_on:
      redis:    { condition: service_healthy }
      postgres: { condition: service_healthy }
    restart: unless-stopped

  worker:
    build: .
    command: node dist/worker.js
    env_file: .env
    depends_on:
      redis:       { condition: service_healthy }
      mcp-booking: { condition: service_started }
      mcp-kantin:  { condition: service_started }
      mcp-ticket:  { condition: service_started }
    restart: unless-stopped

  # === MCP MODULES ===
  mcp-booking:
    build: .
    command: node dist/mcp/booking/index.js
    ports: ["3001:3001"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  mcp-kantin:
    build: .
    command: node dist/mcp/kantin/index.js
    ports: ["3002:3002"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  mcp-ticket:
    build: .
    command: node dist/mcp/ticket/index.js
    ports: ["3003:3003"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  mcp-akademik:
    build: .
    command: node dist/mcp/akademik/index.js
    ports: ["3004:3004"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

  mcp-info:
    build: .
    command: node dist/mcp/info/index.js
    ports: ["3005:3005"]
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

---

# ENVIRONMENT VARIABLES — .env FILE

```bash
# .env — FILE INI JANGAN DI-COMMIT KE GIT!

# === SERVER ===
NODE_ENV=development
PORT=3000

# === TWILIO (WhatsApp) ===
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+14155238886

# === ANTHROPIC (Claude AI) ===
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
AI_MODEL=claude-haiku-4-5-20251001
AI_MAX_TOKENS=500
AI_CONFIDENCE_THRESHOLD=0.7

# === DATABASE ===
DATABASE_URL=postgresql://rlu:rlu_dev_2026@localhost:5432/ruanglinkup

# === REDIS ===
REDIS_URL=redis://localhost:6379

# === MCP ENDPOINTS ===
MCP_BOOKING_URL=http://localhost:3001
MCP_KANTIN_URL=http://localhost:3002
MCP_TICKET_URL=http://localhost:3003
MCP_AKADEMIK_URL=http://localhost:3004
MCP_INFO_URL=http://localhost:3005

# === LIMITS ===
RATE_LIMIT_PER_MINUTE=30
REQUEST_TIMEOUT_MS=10000
SESSION_TTL_SECONDS=86400
```

---

# BAGAIMANA DATA BERGERAK — DALAM ANGKA

## Ukuran Data per Request

```
1 pesan WhatsApp masuk:
  ├── Webhook terima:          ~200 bytes (HTTP POST body)
  ├── Push ke Redis Queue:     ~300 bytes (BullMQ job)
  ├── Kirim ke Claude:         ~1.5 KB   (system prompt + user message)
  ├── Claude response:         ~500 bytes (JSON intent classification)
  ├── Kirim ke MCP:            ~400 bytes (MCP request)
  ├── MCP query ke PostgreSQL: ~100 bytes (SQL query)
  ├── MCP response:            ~1 KB     (data dari DB)
  ├── Response ke user:        ~500 bytes (WA message)
  └── Total data transfer:     ~4.5 KB per request

1 hari operasional (estimasi 500 pesan):
  ├── Claude API calls:        500 × $0.002 = ~$1
  ├── Twilio messages:         500 × $0.005 = ~$2.50
  ├── Database queries:        ~1000 queries
  ├── Redis operations:        ~2000 ops
  └── Total biaya:             ~$3.50/hari
```

## Resource Server

```
Minimum untuk POC:
  ├── CPU:      2 core
  ├── RAM:      2 GB
  ├── Storage:  10 GB
  └── Bandwidth: 1 GB/bulan

Minimum untuk Production (1000 user aktif):
  ├── CPU:      4 core
  ├── RAM:      8 GB
  ├── Storage:  50 GB SSD
  └── Bandwidth: 10 GB/bulan
```

---

# KEAMANAN INFRASTRUCTURE

```
┌─────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                       │
│                                                          │
│  Layer 1: WHATSAPP ENCRYPTION                           │
│  │  E2E encryption antara user dan WhatsApp             │
│  │                                                      │
│  Layer 2: HTTPS / TLS                                   │
│  │  Semua komunikasi ke cloud (Twilio, Claude) di-enkripsi│
│  │                                                      │
│  Layer 3: WEBHOOK SIGNATURE                             │
│  │  Setiap request ke webhook diverifikasi signature    │
│  │  Hanya request bener dari Twilio yang diproses       │
│  │                                                      │
│  Layer 4: API KEY ISOLATION                             │
│  │  Claude API key dan Twilio token disimpan di .env    │
│  │  Tidak hardcoded di kode, tidak di-commit ke git     │
│  │                                                      │
│  Layer 5: INTERNAL NETWORK                              │
│  │  MCP modules hanya bisa diakses dari localhost       │
│  │  Tidak terekspos ke internet                         │
│  │  Hanya port 3000 (via ngrok) yang terekspos          │
│  │                                                      │
│  Layer 6: RATE LIMITING                                 │
│  │  Max 30 pesan per menit per nomor                    │
│  │  Mencegah spam dan abuse                             │
│  │                                                      │
│  Layer 7: INPUT SANITIZATION                            │
│  │  Semua input user di-sanitize sebelum diproses      │
│  │  Mencegah SQL injection, XSS, command injection      │
│  │                                                      │
│  Layer 8: AUDIT LOG                                     │
│  │  Setiap akses dicatat: siapa, kapan, apa, hasil     │
│  │  Bisa ditelusuri kalau ada masalah                   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

# MONITORING — BAGAIMANA TAU SEMUANYA JALAN

```
Setiap service punya endpoint GET /health

Worker mengecek semua service setiap 30 detik:

GET http://localhost:3000/health → webhook:  {"status":"up"}
GET http://localhost:3001/health → booking:  {"status":"up"}
GET http://localhost:3002/health → kantin:   {"status":"up"}
GET http://localhost:3003/health → ticket:   {"status":"up"}
GET http://localhost:3004/health → akademik: {"status":"up"}
GET http://localhost:3005/health → info:     {"status":"up"}

Redis: PING → PONG
PostgreSQL: SELECT 1 → 1

Kalau ada yang DOWN:
- Health check gagal
- Log error ke terminal
- Orchestrator stop routing ke MCP tersebut
- User dapat pesan: "Layanan X sedang tidak tersedia"
- Admin dapat alert (opsional: kirim WA ke admin)
```

---

# RINGKASAN — APA YANG PERLU DI-DOWNLOAD, DIBANGUN, DIJALANKAN

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  DOWNLOAD & INSTALL (sekalii):                              │
│  ├── Node.js 20 LTS          → dari nodejs.org             │
│  ├── Docker Desktop          → dari docker.com              │
│  ├── ngrok                   → dari ngrok.com               │
│  └── Git                     → dari git-scm.com             │
│                                                              │
│  DAFTAR CLOUD SERVICE:                                      │
│  ├── Twilio account          → twilio.com (sandbox gratis)  │
│  ├── Anthropic account       → console.anthropic.com        │
│  └── ngrok account           → ngrok.com (gratis)           │
│                                                              │
│  DAPATKAN API KEY:                                          │
│  ├── Twilio Account SID + Auth Token                        │
│  ├── Twilio WhatsApp sandbox number                         │
│  └── Anthropic API key (Claude)                             │
│                                                              │
│  KODE YANG DIBANGUN:                                        │
│  ├── src/webhook/           → Webhook server                │
│  ├── src/worker/            → Queue worker + orchestrator   │
│  ├── src/ai/                → Claude SDK integration        │
│  ├── src/controller/        → Router, session, response     │
│  ├── src/mcp/core/          → MCP framework (interface)     │
│  ├── src/mcp/booking/       → MCP Booking                   │
│  ├── src/mcp/kantin/        → MCP Kantin                    │
│  ├── src/mcp/ticket/        → MCP Ticket                    │
│  ├── src/mcp/akademik/      → MCP Akademik                  │
│  ├── src/mcp/info/          → MCP Info                      │
│  ├── src/db/                → Database schema               │
│  └── tests/                 → Testing                       │
│                                                              │
│  FILE KONFIGURASI:                                          │
│  ├── .env                   → API keys dan konfigurasi      │
│  ├── docker-compose.yml     → Semua service definition      │
│  ├── Dockerfile             → Build image untuk app         │
│  ├── tsconfig.json          → TypeScript config             │
│  ├── package.json           → Dependencies                  │
│  └── .gitignore             → Exclude .env dan sensitive    │
│                                                              │
│  JALANKAN:                                                  │
│  docker compose up -d        → Semua service jalan          │
│  ngrok http 3000             → Expose ke internet           │
│  Set Twilio webhook          → Arahkan ke ngrok URL         │
│  Test: kirim WA ke nomor sandbox                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

*RuangLinkUp — Infrastruktur lengkap: 1 server, 9 service, 1 WhatsApp number, semua layanan kampus.*
