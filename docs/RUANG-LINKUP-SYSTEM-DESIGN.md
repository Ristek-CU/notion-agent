# RuangLinkUp — Detail Infrastruktur Sistem & MCP

**Dokumen**: System Architecture & MCP Detail
**Untuk**: Tim Ristek
**Tanggal**: April 2026

---

# ARSITEKTUR END-TO-END — 6 LAYER

```
+====================================================================+
|                                                                     |
|  LAYER 1                    LAYER 2           LAYER 3               |
|  WHATSAPP      ───────►     WEBHOOK      ───► CLAUDE CODE           |
|  (User Entry)              (Receiver)         (AI Brain)            |
|                                                                     |
+====================================================================+
                                               |
                                               | dual-direction
                                               v
+====================================================================+
|                                                                     |
|  LAYER 4                    LAYER 5           LAYER 6               |
|  MCP ORCHESTRATOR  ────►   MCP MODULES   ───► EXTERNAL SYSTEMS     |
|  (Router & Registry)       (Per Layanan)      (Sistem Asli)        |
|                                                                     |
+====================================================================+
```

---

# LAYER 1: WHATSAPP — Entry Point

## Fungsi
WhatsApp adalah **satu-satunya pintu masuk** user ke seluruh sistem RuangLinkUp. Semua interaksi dimulai dari sini.

## Detail Infrastruktur

```
┌─────────────────────────────────────────────────────┐
│                    WHATSAPP                          │
│                                                      │
│  Yang Pakai:                                        │
│  ├── Mahasiswa (cek nilai, booking kelas, kantin)   │
│  ├── Staf / TU (approve booking, laporan)           │
│  ├── Dosen (cek jadwal, info kelas)                 │
│  ├── Pengelola Kantin (restock, laporan penjualan)  │
│  └── Admin Sistem (monitoring, konfigurasi)         │
│                                                      │
│  Jenis Pesan yang Bisa Masuk:                       │
│  ├── Text biasa            "Mau pinjem kelas besok" │
│  ├── Quick Reply button    user tap pilihan         │
│  ├── Image (future)        foto bukti kerusakan     │
│  └── Location (future)     lokasi user              │
│                                                      │
│  Yang Keluar dari Sistem:                           │
│  ├── Response text        jawaban dari AI           │
│  ├── Interactive list     daftar pilihan            │
│  ├── Button template      konfirmasi ya/tidak       │
│  └── Push notification    reminder, status update   │
│                                                      │
│  Teknologi:                                         │
│  ├── WhatsApp Business API via Twilio (POC)         │
│  └── WhatsApp Cloud API via Meta (production)       │
│                                                      │
│  Satu nomor WA untuk SEMUA layanan.                 │
│  User tidak perlu beda nomor untuk beda layanan.    │
└─────────────────────────────────────────────────────┘
```

## Kenapa WhatsApp?

| Alasan | Penjelasan |
|--------|-----------|
| Zero learning curve | Semua orang sudah bisa pakai WA |
| Zero install | Sudah ada di semua HP |
| Native notification | User langsung dapat notif |
| 24-hour session window | Cukup untuk multi-turn conversation |
| Media support | Text, gambar, button, list |
| End-to-end encryption | Keamanan data percakapan |

---

# LAYER 2: WEBHOOK — Receiver Layer

## Fungsi
Webhook adalah **"telinga" sistem**. Tugasnya menerima setiap pesan yang masuk dari WhatsApp, memvalidasi keasliannya, lalu meneruskan ke AI untuk diproses.

## Detail Infrastruktur

```
┌─────────────────────────────────────────────────────────────────┐
│                        WEBHOOK SERVER                           │
│                                                                  │
│  Teknologi: Node.js + Fastify                                   │
│  Port: 3000                                                      │
│                                                                  │
│  FLOW SAAT PESAN MASUK:                                         │
│                                                                  │
│  WhatsApp API                                                    │
│      │                                                           │
│      │  POST /webhook/whatsapp                                   │
│      │  (payload: From, Body, ProfileName, MessageSid)           │
│      v                                                           │
│  ┌──────────────┐                                                │
│  │  SIGNATURE   │ ─── Validasi bahwa pesan bener dari WA        │
│  │  VERIFIER    │     (bukan fake request / spam)                │
│  └──────┬───────┘                                                │
│         │ valid                                                   │
│         v                                                        │
│  ┌──────────────┐                                                │
│  │  RATE LIMIT  │ ─── Cek: user ini kirim pesan terlalu sering? │
│  │  CHECKER     │     Max 30 pesan/menit per nomor               │
│  └──────┬───────┘                                                │
│         │ ok                                                     │
│         v                                                        │
│  ┌──────────────┐                                                │
│  │  MESSAGE     │ ─── Extract data penting:                     │
│  │  PARSER      │     phone, text, timestamp, message type      │
│  └──────┬───────┘                                                │
│         │                                                        │
│         v                                                        │
│  ┌──────────────┐                                                │
│  │  QUEUE PUSH  │ ─── Masukkan pesan ke Redis Queue (BullMQ)    │
│  │              │     Agar webhook bisa langsung jawab 200 OK    │
│  └──────────────┘     (WA butuh response cepat)                 │
│                                                                  │
│  RESPONSE KE WHATSAPP:                                          │
│  Langsung 200 OK (kosong)                                       │
│  Response asli dikirim NANTI setelah AI selesai proses          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Kenapa Perlu Queue?

```
TANPA QUEUE (buruk):
  WA kirim pesan → Webhook proses → tunggu AI (3-5 detik) → tunggu MCP (1-2 detik)
  → baru jawab 200 OK ke WA
  → WA timeout, pesan dianggap gagal, retry berkali-kali
  → duplicate messages masuk ke sistem

DENGAN QUEUE (baik):
  WA kirim pesan → Webhook terima → push ke queue → jawab 200 OK INSTAN (< 100ms)
  → Worker ambil dari queue → proses pelan-pelan → kirim response via WA API
  → WA happy (cepat dapat 200 OK), user happy (dapat response dalam 3-5 detik)
```

## Data yang Diteruskan ke Queue

```json
{
  "id": "msg-uuid-001",
  "phoneNumber": "whatsapp:+6281234567890",
  "message": "Mau pinjem kelas besok jam 10",
  "profileName": "Budi Santoso",
  "messageType": "text",
  "timestamp": "2026-04-22T10:00:00Z"
}
```

---

# LAYER 3: CLAUDE CODE — AI Processing Layer

## Fungsi
Ini adalah **otak utama seluruh sistem**. Claude menerima pesan user, memahami maksudnya, memutuskan aksi apa yang harus dilakukan, menghasilkan response, dan mengkoordinasikan eksekusi ke MCP.

## Detail Infrastruktur

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLAUDE CODE (AI BRAIN)                       │
│                                                                  │
│  Teknologi: Anthropic SDK (Claude API)                           │
│  Model: claude-haiku-4-5-20251001 (fast) / claude-sonnet (complex)│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    ORCHESTRATOR                           │   │
│  │                    (Controller Utama)                     │   │
│  │                                                          │   │
│  │  Flow per pesan:                                         │   │
│  │                                                          │   │
│  │  1. LOAD SESSION ─── Ambil data percakapan sebelumnya   │   │
│  │        │                                                 │   │
│  │        v                                                 │   │
│  │  2. CLASSIFY INTENT ── Kirim pesan ke Claude untuk:     │   │
│  │        │                 - Identifikasi intent           │   │
│  │        │                 - Extract entities              │   │
│  │        │                 - Tentukan MCP tujuan           │   │
│  │        v                                                 │   │
│  │  3. DECIDE ────────── Berdasarkan hasil AI:             │   │
│  │        │                                                 │   │
│  │        ├── Confidence tinggi (>70%)                     │   │
│  │        │     → Route ke MCP, eksekusi                   │   │
│  │        │                                                 │   │
│  │        ├── Confidence rendah (<70%)                     │   │
│  │        │     → Tanya clarification ke user              │   │
│  │        │                                                 │   │
│  │        └── Intent tidak dikenali                        │   │
│  │              → Tampilkan menu / help                    │   │
│  │                                                          │   │
│  │  4. EXECUTE MCP ───── Kirim request ke MCP yang tepat   │   │
│  │        │                                                 │   │
│  │        v                                                 │   │
│  │  5. BUILD RESPONSE ── Format data dari MCP jadi         │   │
│  │        │                 pesan WA yang friendly          │   │
│  │        v                                                 │   │
│  │  6. SEND ──────────── Kirim balasan ke user via WA      │   │
│  │        │                                                 │   │
│  │        v                                                 │   │
│  │  7. UPDATE SESSION ── Simpan state percakapan terbaru   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌────────────────────┐  ┌─────────────────────────────────┐   │
│  │  SESSION MANAGER    │  │  PROMPT ENGINE                  │   │
│  │                    │  │                                  │   │
│  │  Simpan:           │  │  System Prompt berisi:          │   │
│  │  ├── State perc.   │  │  ├── Identitas bot              │   │
│  │  ├── History pesan │  │  ├── Daftar intent yang dikenal │   │
│  │  ├── Context user  │  │  ├── Format output (JSON)       │   │
│  │  └── Data sementara│  │  ├── Aturan response            │   │
│  │                    │  │  └── Context user (dinamis)      │   │
│  │  Storage: Redis    │  │                                  │   │
│  │  TTL: 24 jam       │  │  Model: claude-haiku-4-5-20251001   │   │
│  └────────────────────┘  └─────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Apa yang Dilakukan Claude

Claude mengerjakan **3 hal utama** secara sequential:

### 1. Intent Recognition — Memahami Maksud User

```
INPUT:  "Mau pinjem kelas besok jam 10"
OUTPUT: {
  "intent": "booking_ruangan",
  "confidence": 0.94,
  "entities": {
    "action": "booking",
    "tanggal": "besok",
    "jam": "10:00",
    "ruangan": null          ← belum disebut, perlu tanya
  }
}
```

Daftar Intent yang Dikenali:

| Intent | Contoh Pesan User | MCP Tujuan |
|--------|-------------------|------------|
| `booking_ruangan` | "pinjem kelas", "booking ruang", "pakai aula" | MCP Booking |
| `cek_jadwal_ruang` | "jadwal A201", "ruang kosong besok" | MCP Booking |
| `batal_booking` | "batal booking", "batalin kelas" | MCP Booking |
| `cek_stok_kantin` | "kantin ada apa", "stok kantin" | MCP Kantin |
| `catat_ambil_barang` | "ambil indomie 2", "beli aqua" | MCP Kantin |
| `catat_bayar` | "sudah bayar", "udah masukin uang" | MCP Kantin |
| `laporan_kantin` | "laporan kantin", "rekap penjualan" | MCP Kantin |
| `restock_kantin` | "tambah stok indomie 50" | MCP Kantin |
| `lapor_fasilitas` | "AC rusak", "wifi mati" | MCP Ticketing |
| `buat_ticket` | "buat tiket", "lapor masalah" | MCP Ticketing |
| `cek_ticket` | "status tiket", "tiket sudah selesai" | MCP Ticketing |
| `info_kampus` | "pengumuman", "info hari ini" | MCP Info |
| `surat_keterangan` | "surat aktif", "surat keterangan" | MCP Akademik |
| `info_akademik` | "cek nilai", "jadwal kuliah" | MCP Akademik |
| `help` | "bantuan", "menu", "bisa apa aja" | — (langsung response) |
| `greeting` | "halo", "pagi", "makasih" | — (langsung response) |
| `unknown` | pesan yang tidak bisa dipahami | — (klarifikasi) |

### 2. Entity Extraction — Mengambil Data Spesifik

```
INPUT:  "Booking A201 besok jam 2 sampai 4 buat rapat organisasi, 20 orang"
OUTPUT: {
  "ruangan": "A201",
  "tanggal": "besok",
  "jam_mulai": "14:00",
  "jam_selesai": "16:00",
  "keperluan": "rapat organisasi",
  "jumlah_orang": 20
}
```

### 3. Response Generation — Menjawab dalam Bahasa yang Natural

```
DATA dari MCP:
{
  "success": true,
  "data": {
    "booking_id": "BK-20260423-001",
    "ruangan": "A201",
    "tanggal": "2026-04-23",
    "jam": "14:00-16:00"
  }
}

OUTPUT ke User:
"Booking dikonfirmasi!

 Ruang: A201
 Tanggal: 23 April 2026 (Rabu)
 Jam: 14:00 - 16:00
 Kode: BK-20260423-001

 Jangan lupa kembalikan kunci ke TU ya!"
```

## Dual-Direction Communication

Claude berkomunikasi **dua arah**:

```
DARI USER (via WA → Webhook → Queue → Claude)
  User kirim pesan → Claude baca, pahami, proses

KE USER (Claude → WA API → User)
  Claude generate response → kirim ke WA API → muncul di HP user

KE MCP (Claude → MCP Orchestrator → MCP Module)
  Claude tentukan aksi → kirim ke MCP → MCP eksekusi

DARI MCP (MCP Module → MCP Orchestrator → Claude)
  MCP return data → Claude terima, format, kirim ke user
```

---

# LAYER 4: MCP ORCHESTRATOR — Router & Registry

## Fungsi
MCP Orchestrator adalah **dispatcher pusat**. Tugasnya menerima perintah dari Claude, menentukan MCP module mana yang harus menangani, mengirim request ke module tersebut, menerima hasilnya, dan mengembalikan ke Claude.

## Detail Infrastruktur

```
┌─────────────────────────────────────────────────────────────────┐
│                  MCP ORCHESTRATOR                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCP REGISTRY                         │   │
│  │                                                         │   │
│  │  Database semua MCP modules yang terdaftar:             │   │
│  │                                                         │   │
│  │  ┌──────────────┬──────────────────┬─────────┐          │   │
│  │  │ Module Name  │ Endpoint         │ Status  │          │   │
│  │  ├──────────────┼──────────────────┼─────────┤          │   │
│  │  │ mcp-booking  │ localhost:3001   │ active  │          │   │
│  │  │ mcp-kantin   │ localhost:3002   │ active  │          │   │
│  │  │ mcp-ticket   │ localhost:3003   │ active  │          │   │
│  │  │ mcp-akademik │ localhost:3004   │ active  │          │   │
│  │  │ mcp-info     │ localhost:3005   │ active  │          │   │
│  │  └──────────────┴──────────────────┴─────────┘          │   │
│  │                                                         │   │
│  │  Registry juga menyimpan:                               │   │
│  │  ├── Capabilities per module (bisa apa aja)             │   │
│  │  ├── Health status (healthy/degraded/down)              │   │
│  │  ├── Last health check timestamp                        │   │
│  │  └── Configuration per module                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCP ROUTER                           │   │
│  │                                                         │   │
│  │  Mapping Intent → MCP:                                  │   │
│  │                                                         │   │
│  │  booking_ruangan    ───► mcp-booking                    │   │
│  │  cek_jadwal_ruang   ───► mcp-booking                    │   │
│  │  batal_booking      ───► mcp-booking                    │   │
│  │  cek_stok_kantin    ───► mcp-kantin                     │   │
│  │  catat_ambil_barang ───► mcp-kantin                     │   │
│  │  catat_bayar        ───► mcp-kantin                     │   │
│  │  laporan_kantin     ───► mcp-kantin                     │   │
│  │  restock_kantin     ───► mcp-kantin                     │   │
│  │  lapor_fasilitas    ───► mcp-ticket                     │   │
│  │  buat_ticket        ───► mcp-ticket                     │   │
│  │  cek_ticket         ───► mcp-ticket                     │   │
│  │  info_akademik      ───► mcp-akademik                   │   │
│  │  surat_keterangan   ───► mcp-akademik                   │   │
│  │  info_kampus        ───► mcp-info                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  HEALTH MONITOR                         │   │
│  │                                                         │   │
│  │  Setiap 30 detik:                                       │   │
│  │  ├── GET /health ke setiap MCP                          │   │
│  │  ├── Update status di Registry                          │   │
│  │  ├── Kalau MCP down → mark as "unhealthy"              │   │
│  │  └── Kalau MCP unhealthy → jangan route ke situ        │   │
│  │      kirim fallback response ke user                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  FALLBACK HANDLER                       │   │
│  │                                                         │   │
│  │  Kalau MCP target sedang down:                          │   │
│  │  ├── Cek cache (Redis) untuk data terakhir             │   │
│  │  ├── Kalau ada cache → return cache                    │   │
│  │  └── Kalau tidak → kirim pesan:                        │   │
│  │      "Maaf, layanan [nama] sedang tidak tersedia.      │   │
│  │       Tim kami sedang menangani. Coba lagi beberapa     │   │
│  │       menit ya."                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Standard Request Format (Orchestrator → MCP)

```json
{
  "id": "req-uuid-001",
  "action": "booking_create",
  "params": {
    "ruangan": "A201",
    "tanggal": "2026-04-23",
    "jam_mulai": "14:00",
    "jam_selesai": "16:00",
    "keperluan": "rapat organisasi",
    "jumlah_orang": 20,
    "user_nim": "2024001001"
  },
  "context": {
    "userId": "user-uuid",
    "phoneNumber": "+6281234567890",
    "role": "student",
    "sessionId": "session-uuid"
  },
  "timestamp": "2026-04-22T10:00:00Z"
}
```

## Standard Response Format (MCP → Orchestrator)

```json
{
  "id": "req-uuid-001",
  "success": true,
  "data": {
    "booking_id": "BK-20260423-001",
    "ruangan": "A201",
    "tanggal": "2026-04-23",
    "jam": "14:00-16:00",
    "status": "confirmed"
  },
  "error": null,
  "metadata": {
    "mcpName": "mcp-booking",
    "action": "booking_create",
    "executionTimeMs": 320,
    "cacheHit": false,
    "sourceSystem": "booking_db"
  }
}
```

---

# LAYER 5: MCP MODULES — Per Layanan

Setiap layanan di RuangLinkUp punya **MCP Module sendiri**. Setiap module:
- Berjalan sebagai **service terpisah** (port sendiri)
- Punya **endpoint standard** yang sama
- Terkoneksi ke **database/API sendiri**
- Bisa **ditambah/tanpa ubah** module lain

---

## MCP MODULE: mcp-booking (Port 3001)

### Tujuan
Menangani semua yang berhubungan dengan booking ruangan kampus.

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP-BOOKING                                 │
│                                                                  │
│  ENDPOINT:                                                       │
│  ├── POST /execute      → Jalankan action                       │
│  ├── GET  /health       → Status check                          │
│  └── GET  /capabilities → Daftar action yang didukung           │
│                                                                  │
│  ACTIONS:                                                        │
│  ┌────────────────────┬─────────────────────────────────────┐  │
│  │ Action             │ Fungsi                               │  │
│  ├────────────────────┼─────────────────────────────────────┤  │
│  │ cek_ketersediaan   │ Cek ruangan kosong di tanggal/jam   │  │
│  │ booking_create     │ Buat booking baru                   │  │
│  │ booking_cancel     │ Batalkan booking                    │  │
│  │ jadwal_ruangan     │ Lihat jadwal 1 ruangan per periode  │  │
│  │ booking_saya       │ Lihat semua booking milik user      │  │
│  │ booking_approve    │ (TU) Approve booking                │  │
│  │ booking_reject     │ (TU) Reject booking                 │  │
│  └────────────────────┴─────────────────────────────────────┘  │
│                                                                  │
│  DATABASE YANG DIHUBUNGKAN:                                      │
│  ├── Table: rooms                                                │
│  │   (id, name, building, floor, capacity, type, facilities)    │
│  │                                                              │
│  ├── Table: bookings                                            │
│  │   (id, booking_code, room_id, user_id, date,                 │
│  │    time_start, time_end, purpose, attendees, status,         │
│  │    created_at, approved_by, approved_at)                     │
│  │                                                              │
│  ├── Table: room_schedules (jadwal tetap kuliah)                │
│  │   (room_id, day, time_start, time_end, course, lecturer)    │
│  │                                                              │
│  └── Table: booking_rules                                       │
│      (role, max_per_week, max_duration_hours, need_approval)    │
│                                                                  │
│  LOGIC YANG DIHANDLE:                                            │
│  ├── Deteksi konflik jadwal otomatis                            │
│  ├── Cek aturan (max booking, max durasi)                       │
│  ├── Auto-approve untuk ruangan reguler                         │
│  ├── Require approval untuk ruangan khusus (aula, lab)          │
│  ├── Auto-cancel kalau no-show                                  │
│  └── Reminder otomatis H-1 dan H-1jam                          │
│                                                                  │
│  RELASI:                                                         │
│  Claude ⇄ Orchestrator ⇄ mcp-booking ⇄ booking_db              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Contoh Eksekusi

```
Request dari Claude:
  action: "cek_ketersediaan"
  params: { tanggal: "2026-04-23", jam_mulai: "14:00", jam_selesai: "16:00" }

Yang dilakukan mcp-booking:
  1. Query semua ruangan
  2. Cek jadwal kuliah tetap di tanggal itu
  3. Cek booking yang sudah ada di jam itu
  4. Return ruangan yang tersedia

Response ke Claude:
  {
    success: true,
    data: {
      ruangan_tersedia: [
        { nama: "A201", gedung: "A", lantai: 2, kapasitas: 30, type: "reguler" },
        { nama: "A305", gedung: "A", lantai: 3, kapasitas: 40, type: "reguler" },
        { nama: "B102", gedung: "B", lantai: 1, kapasitas: 60, type: "besar" }
      ]
    }
  }
```

---

## MCP MODULE: mcp-kantin (Port 3002)

### Tujuan
Menangani semua yang berhubungan dengan Kantin Kejujuran — stok, transaksi, pembayaran, laporan.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP-KANTIN                                 │
│                                                                  │
│  ENDPOINT:                                                       │
│  ├── POST /execute      → Jalankan action                       │
│  ├── GET  /health       → Status check                          │
│  └── GET  /capabilities → Daftar action yang didukung           │
│                                                                  │
│  ACTIONS:                                                        │
│  ┌────────────────────┬─────────────────────────────────────┐  │
│  │ Action             │ Fungsi                               │  │
│  ├────────────────────┼─────────────────────────────────────┤  │
│  │ cek_stok           │ Lihat semua barang + stok saat ini  │  │
│  │ cek_stok_item      │ Lihat stok 1 item tertentu          │  │
│  │ catat_ambil        │ Catat pengambilan barang oleh user  │  │
│  │ catat_bayar        │ Catat pembayaran user                │  │
│  │ restock            │ Tambah stok barang (pengelola)       │  │
│  │ tambah_barang      │ Tambah item baru ke katalog         │  │
│  │ laporan_harian     │ Rekap transaksi hari ini             │  │
│  │ laporan_mingguan   │ Rekap transaksi minggu ini           │  │
│  │ laporan_kejujuran  │ Statistik tingkat kejujuran          │  │
│  │ notifikasi_stok    │ Daftar item yang hampir habis        │  │
│  └────────────────────┴─────────────────────────────────────┘  │
│                                                                  │
│  DATABASE YANG DIHUBUNGKAN:                                      │
│  ├── Table: items                                               │
│  │   (id, nama, kategori, harga, stok, stok_minimum,           │
│  │    aktif, created_at)                                        │
│  │                                                              │
│  ├── Table: transaksi                                           │
│  │   (id, user_phone, items_json, total,                       │
│  │    status_bayar, waktu_ambil, waktu_bayar)                  │
│  │                                                              │
│  ├── Table: restock_log                                         │
│  │   (id, item_id, qty_masuk, oleh, timestamp)                 │
│  │                                                              │
│  └── Table: keuangan                                            │
│      (id, tanggal, total_masuk, total barang diambil,           │
│       selisih, catatan)                                         │
│                                                                  │
│  LOGIC YANG DIHANDLE:                                            │
│  ├── Stok otomatis berkurang saat catat_ambil                  │
│  ├── Alert stok menipis (sisa < stok_minimum)                   │
│  ├── Tracking kejujuran: ambil vs bayar                        │
│  ├── Auto-calculate total harga                                 │
│  ├── Lock stok saat dicatat (belum bayar)                      │
│  ├── Timeout: kalau 1 jam belum bayar, batalkan pencatatan     │
│  └── Rekap otomatis harian/mingguan                            │
│                                                                  │
│  RELASI:                                                         │
│  Claude ⇄ Orchestrator ⇄ mcp-kantin ⇄ kantin_db               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Contoh Eksekusi

```
Request dari Claude:
  action: "catat_ambil"
  params: {
    items: [
      { nama: "Indomie Goreng", qty: 2 },
      { nama: "Aqua 600ml", qty: 1 }
    ],
    user_phone: "+6281234567890"
  }

Yang dilakukan mcp-kantin:
  1. Cek stok tiap item (cukup atau tidak)
  2. Hitung total harga
  3. Kurangi stok sementara
  4. Buat record transaksi (status: belum_bayar)
  5. Return data transaksi

Response ke Claude:
  {
    success: true,
    data: {
      transaksi_id: "TRX-20260422-042",
      items: [
        { nama: "Indomie Goreng", qty: 2, harga_satuan: 5000, subtotal: 10000 },
        { nama: "Aqua 600ml", qty: 1, harga_satuan: 4000, subtotal: 4000 }
      ],
      total: 14000,
      status: "menunggu_bayar",
      expired_at: "2026-04-22T11:00:00Z"   // 1 jam dari sekarang
    }
  }
```

### Tracking Kejujuran — Cara Kerjanya

```
STATE MACHINE TRANSAKSI KANTIN:

[ITEM_DIAMBIL] ──1 jam──► [EXPIRED] (stok dikembalikan)
      │
      │ user ketik "sudah bayar"
      v
[BAYAR_DICATAT] ──► [SELESAI]

Yang tercatat:
- Jumlah barang yang diambil
- Jumlah pembayaran yang dikonfirmasi
- Selisih = barang diambil TAPI belum bayar
- Tingkat kejujuran = total_bayar / total_ambil * 100%

Laporan harian:
"Rekap Hari Ini:
 Total barang diambil: 45 item
 Total pembayaran:     43 konfirmasi
 Selisih:              2 belum bayar
 Tingkat Kejujuran:    95.6%"
```

---

## MCP MODULE: mcp-ticket (Port 3003)

### Tujuan
Menangani pembuatan dan tracking tiket/ticket — laporan fasilitas, keluhan, permintaan bantuan.

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP-TICKET                                 │
│                                                                  │
│  ACTIONS:                                                        │
│  ├── ticket_create     → Buat ticket baru                       │
│  ├── ticket_status     → Cek status 1 ticket                    │
│  ├── ticket_list       → Daftar ticket user                     │
│  ├── ticket_update     → Update progress ticket                 │
│  ├── ticket_close      → Tutup ticket                           │
│  └── ticket_assign     → Assign ke tim/person (admin)           │
│                                                                  │
│  DATABASE:                                                       │
│  ├── Table: tickets                                             │
│  │   (id, ticket_code, user_phone, kategori, judul,             │
│  │    deskripsi, lokasi, prioritas, status, assigned_to,        │
│  │    created_at, updated_at, resolved_at)                      │
│  │                                                              │
│  └── Table: ticket_updates                                      │
│      (id, ticket_id, updater, message, created_at)              │
│                                                                  │
│  KATEGORI:                                                       │
│  ├── fasilitas (AC, listrik, air, toilet)                       │
│  ├── it (wifi, komputer, printer, email)                        │
│  ├── akademik (nilai, jadwal, KRS)                              │
│  └── umum (saran, pertanyaan, lain-lain)                        │
│                                                                  │
│  FLOW:                                                           │
│  User lapor → ticket_create (status: open)                      │
│       │                                                          │
│       v                                                          │
│  Admin lihat → ticket_assign ke tim terkait                     │
│       │                                                          │
│       v                                                          │
│  Tim kerjakan → ticket_update (progress notes)                  │
│       │                                                          │
│       v                                                          │
│  Selesai → ticket_close (status: resolved)                      │
│       │                                                          │
│       v                                                          │
│  User dapat notifikasi via WA: "Tiket Anda sudah diselesaikan"  │
│                                                                  │
│  RELASI:                                                         │
│  Claude ⇄ Orchestrator ⇄ mcp-ticket ⇄ ticket_db                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP MODULE: mcp-akademik (Port 3004)

### Tujuan
Menangani query data akademik dan permintaan surat.

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP-AKADEMIK                                │
│                                                                  │
│  ACTIONS:                                                        │
│  ├── get_profil        → Data mahasiswa                         │
│  ├── get_nilai         → Nilai per semester + IPS/IPK           │
│  ├── get_jadwal        → Jadwal kuliah semester berjalan        │
│  ├── get_krs           → Data KRS                               │
│  ├── request_surat     → Ajukan surat keterangan                │
│  ├── cek_surat         → Cek status permohonan surat            │
│  └── get_pengumuman    → Pengumuman akademik                    │
│                                                                  │
│  SISTEM EKSTERNAL YANG DIHUBUNGKAN:                             │
│  ├── SIAKAD API (nilai, jadwal, KRS, profil)                   │
│  └── Surat DB (permohonan surat internal)                       │
│                                                                  │
│  RELASI:                                                         │
│  Claude ⇄ Orchestrator ⇄ mcp-akademik ⇄ SIAKAD + surat_db     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP MODULE: mcp-info (Port 3005)

### Tujuan
Menangani informasi umum kampus — pengumuman, event, FAQ, kontak.

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP-INFO                                  │
│                                                                  │
│  ACTIONS:                                                        │
│  ├── get_pengumuman      → Pengumuman terbaru                   │
│  ├── get_event           → Event/kegiatan mendatang             │
│  ├── get_faq             → Jawaban FAQ                          │
│  ├── get_kontak          → Nomor kontak penting                 │
│  ├── get_jam_operasional → Jam buka layanan                     │
│  └── search_info         → Cari informasi umum                  │
│                                                                  │
│  DATABASE:                                                       │
│  ├── Table: pengumuman                                          │
│  ├── Table: events                                              │
│  ├── Table: faq                                                 │
│  └── Table: kontak                                              │
│                                                                  │
│  RELASI:                                                         │
│  Claude ⇄ Orchestrator ⇄ mcp-info ⇄ info_db                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# LAYER 6: EXTERNAL SYSTEMS — Sistem Asli Kampus

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SYSTEMS                              │
│                                                                  │
│  Setiap MCP module terkoneksi ke sistem/databasenya sendiri:    │
│                                                                  │
│  mcp-booking  ───► booking_db (PostgreSQL)                      │
│                    ├── rooms (data ruangan)                      │
│                    ├── bookings (data booking)                   │
│                    └── schedules (jadwal kuliah tetap)           │
│                                                                  │
│  mcp-kantin   ───► kantin_db (PostgreSQL)                       │
│                    ├── items (katalog barang)                    │
│                    ├── transaksi (riwayat ambil & bayar)         │
│                    └── restock_log (riwayat restock)             │
│                                                                  │
│  mcp-ticket   ───► ticket_db (PostgreSQL)                       │
│                    ├── tickets (data tiket)                      │
│                    └── ticket_updates (progress notes)           │
│                                                                  │
│  mcp-akademik ───► SIAKAD API (external)                        │
│                    └── surat_db (internal, baru)                 │
│                                                                  │
│  mcp-info     ───► info_db (PostgreSQL)                         │
│                    ├── pengumuman, events, faq, kontak           │
│                                                                  │
│  CATATAN:                                                        │
│  - Untuk POC, semua "external system" bisa berupa mock data     │
│  - SIAKAD API mungkin belum tersedia → mock dulu                │
│  - Kantin dan Booking pakai database sendiri (baru)             │
│  - Setiap database independen, bisa di-migrate terpisah         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# KARAKTERISTIK ARSITEKTUR

## 1. Event-Driven
```
Semua dimulai dari EVENT: user kirim pesan.
Tidak ada polling, tidak ada cron job untuk main flow.
Setiap pesan = 1 event yang diproses end-to-end.
```

## 2. AI-Centered Orchestration
```
Claude adalah DECISION MAKER.
Claude yang memutuskan:
- Apa maksud user
- Layanan mana yang harus dituju
- Apa yang harus dikatakan ke user
- Kapan harus minta klarifikasi
- Kapan harus fallback ke human

Bukan rule-based. Bukan keyword matching.
AI memahami konteks, bahasa natural, bahkan typo.
```

## 3. Loose Coupling via MCP
```
AI TIDAK LANGSUNG berbicara ke database atau SIAKAD.
AI HANYA berbicara ke MCP Orchestrator.
MCP yang handle semua integrasi teknis.

Artinya:
- Ganti SIAKAD? Cukup update adapter di mcp-akademik. AI tidak berubah.
- Ganti database kantin? Cukup update mcp-kantin. Module lain tidak terpengaruh.
- Tambah layanan baru? Tambah MCP baru. Sistem lain tidak berubah.
```

## 4. Scalable
```
Tambah integrasi baru = tambah MCP module. Tidak perlu ubah core.

Masa depan yang bisa ditambah:
├── mcp-perpus (perpustakaan)
├── mcp-ukm (organisasi/UKM)
├── mcp-beasiswa (info & pendaftaran)
├── mcp-parkir (info & pembayaran)
├── mcp-kebersihan (lapor & tracking)
└── mcp-keuangan (pembayaran SPP, etc)
```

---

# FLOW END-TO-END — FULL DETAIL

```
USER kirim pesan: "Mau pinjem kelas besok jam 10 sampai 12 buat rapat"
  │
  v
LAYER 1 — WHATSAPP
  Meta/Twilio kirim POST ke webhook
  Payload: { From: "+62812...", Body: "Mau pinjem kelas..." }
  │
  v
LAYER 2 — WEBHOOK
  Validasi signature → OK
  Parse pesan → extract phone, text, timestamp
  Push ke Redis Queue
  Return 200 OK ke WhatsApp (INSTAN, < 100ms)
  │
  v
LAYER 2 — QUEUE WORKER
  Ambil pesan dari queue
  Load session user dari Redis
  │
  v
LAYER 3 — CLAUDE CODE
  Kirim pesan ke Claude API dengan system prompt + context
  │
  Claude analisis:
  {
    "intent": "booking_ruangan",
    "confidence": 0.96,
    "entities": {
      "action": "booking",
      "tanggal": "besok",
      "jam_mulai": "10:00",
      "jam_selesai": "12:00",
      "keperluan": "rapat"
    },
    "suggested_mcp": "mcp-booking",
    "missing_fields": ["ruangan"]
  }
  │
  Confidence tinggi (96%) tapi ruangan belum ditentukan
  → Claude minta info ruangan
  │
  v
LAYER 3 — RESPONSE KE USER
  "Mau booking kelas besok jam 10-12 buat rapat.
   Ruangan mana yang kamu mau? Atau mau aku carikan yang kosong?"
  │
  via WhatsApp API → User terima pesan
  │
  v
USER reply: "Yang kosong aja"
  │
  v
LAYER 3 — CLAUDE CODE (lagi, dengan context)
  AI pahami: user mau cek ketersediaan
  Route ke MCP Booking: cek_ketersediaan
  │
  v
LAYER 4 — MCP ORCHESTRATOR
  Lookup Registry: "booking_ruangan" → mcp-booking → localhost:3001
  Forward request ke mcp-booking
  │
  v
LAYER 5 — MCP-BOOKING
  POST /execute
  { action: "cek_ketersediaan", params: { tanggal: "2026-04-23", jam: "10:00-12:00" } }
  │
  Query booking_db: rooms + bookings + schedules
  Cek konflik
  │
  Return: { ruangan_tersedia: [A201, A305, B102] }
  │
  v
LAYER 4 — MCP ORCHESTRATOR
  Terima response dari mcp-booking
  Forward ke Claude
  │
  v
LAYER 3 — CLAUDE CODE
  Terima data ruangan tersedia
  Format jadi pesan WA yang friendly
  │
  v
LAYER 1 — WHATSAPP
  Kirim ke user:
  "Ruangan kosong besok 10:00-12:00:
   1. A201 (kapasitas 30)
   2. A305 (kapasitas 40)
   3. B102 (kapasitas 60)
   Mau pilih yang mana?"
  │
  v
USER reply: "1"
  │
  v
(Proses berulang: Claude → Orchestrator → mcp-booking → booking_create)
  │
  v
FINAL RESPONSE:
  "Booking dikonfirmasi!
   Ruang A201 | Besok 10:00-12:00
   Kode: BK-20260423-001"
```

**Total waktu per step: 3-5 detik.**

---

# RELASI DUAL-DIRECTION — SETIAP LEVEL

```
         USER
          ↕
    WHATSAPP API          ← kirim/terima pesan
          ↕
      WEBHOOK             ← terima event, kirim response
          ↕
    REDIS QUEUE           ← push/pull jobs
          ↕
     CLAUDE CODE          ← analisis, generate response
          ↕
  MCP ORCHESTRATOR        ← route request/response
          ↕
    MCP MODULES           ← execute action, return data
          ↕
  EXTERNAL SYSTEMS        ← query/update data

SETIAP HUBUNGAN ADALAH DUA ARAH (⇄):
- WA ⇄ Webhook
- Claude ⇄ Orchestrator
- Orchestrator ⇄ MCP Modules
- MCP Modules ⇄ External Systems
```

---

# USE CASE NYATA — SEMUA BISA DARI WA

## Booking Ruangan
| Perintah User | Aksi Sistem |
|---------------|-------------|
| "Pinjem kelas besok jam 10" | cek_ketersediaan → tanya ruangan → booking_create |
| "Jadwal A201 minggu ini" | jadwal_ruangan → tampilkan |
| "Batal booking BK-001" | booking_cancel → konfirmasi |
| "Booking saya apa aja" | booking_saya → list semua |

## Kantin Kejujuran
| Perintah User | Aksi Sistem |
|---------------|-------------|
| "Kantin ada apa aja" | cek_stok → tampilkan katalog |
| "Ambil indomie 2 aqua 1" | catat_ambil → total harga → tunggu bayar |
| "Sudah bayar" | catat_bayar → konfirmasi |
| "Tambah stok indomie 50" | restock → update stok (pengelola) |
| "Laporan kantin minggu ini" | laporan_mingguan → rekap |

## Tiket & Laporan
| Perintah User | Aksi Sistem |
|---------------|-------------|
| "AC ruang A201 bocor" | ticket_create → auto-categorize → konfirmasi |
| "Status tiket TK-001" | ticket_status → tampilkan |
| "Tiket saya" | ticket_list → semua aktif |
| "Update TK-001 sudah dikerjain" | ticket_update → log progress (admin) |

## Info & Akademik
| Perintah User | Aksi Sistem |
|---------------|-------------|
| "Ada pengumuman apa" | get_pengumuman → list terbaru |
| "Cek nilai semester kemarin" | get_nilai → tampilkan |
| "Mau surat keterangan aktif" | request_surat → proses |
| "Jadwal kuliah saya" | get_jadwal → tampilkan |

---

# GAMBARAN INFRA DEPLOYMENT (POC)

```
┌──────────── ONE SERVER / LAPTOP (POC) ─────────────────┐
│                                                         │
│  Docker Compose:                                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐                    │
│  │ Webhook +    │  │   Redis      │                    │
│  │ Worker       │  │  (queue +    │                    │
│  │ (port 3000)  │  │   cache +    │                    │
│  │              │  │   session)   │                    │
│  └──────┬───────┘  └──────────────┘                    │
│         │                                               │
│  ┌──────┴───────┐  ┌──────────────┐                    │
│  │ PostgreSQL   │  │ ngrok        │                    │
│  │ (semua db    │  │ (expose      │                    │
│  │  dalam 1     │  │  webhook     │                    │
│  │  instance)   │  │  ke internet)│                    │
│  └──────────────┘  └──────────────┘                    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ mcp-booking  │  │ mcp-kantin   │  │ mcp-ticket   │ │
│  │ (port 3001)  │  │ (port 3002)  │  │ (port 3003)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                         │
│  External (cloud):                                      │
│  ├── Twilio WhatsApp API                                │
│  └── Claude API (Anthropic)                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

*RuangLinkUp — Arsitektur modular, AI-centered, satu pintu lewat WhatsApp.*
