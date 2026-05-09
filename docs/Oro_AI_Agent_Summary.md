# ORO — WhatsApp AI Agent untuk SGA Cakrawala Universe

## Apa Itu Oro?

Oro adalah AI Agent berbasis WhatsApp yang terhubung langsung ke Notion workspace SGA Cakrawala Universe. User cukup chat biasa dalam bahasa Indonesia, AI otomatis memproses dan mengoperasikan data backlog/tiket/project di Notion secara real-time.

**Personality:** Ceria, jenaka, ramah, helpful — kayak temen ngobrol yang cerdas.

---

## Arsitektur Sistem

```
WhatsApp User → Evolution API → Webhook (Fastify) → AI Agent (Claude) → Notion API
                                       ↓                                      ↑
                                  Handler/Router                         Data Backlog
```

| Komponen | Fungsi |
|----------|--------|
| WhatsApp | Platform input/output user |
| Evolution API | WhatsApp gateway (open source) |
| Fastify | High-performance HTTP server untuk webhook |
| AI Agent (Claude) | Natural language understanding + intent detection |
| Notion API | Database backlog, projects, members, divisions |
| Docker | Containerized deployment |
| Cloudflare Tunnel | Secure tunnel untuk webhook dari internet |

---

## Statistik Sistem

| Metrik | Nilai |
|--------|-------|
| Total Lines of Code | 6,300+ |
| Anggota Terdaftar | 101 |
| Divisi | 11 |
| Project Aktif | 24 |
| Command & Fitur | 30+ |
| Nickname Mappings | 120 |
| Unit Tests | 32 |

---

## Fitur Lengkap

### 1. Pembuatan Tiket Otomatis via Chat Natural

User chat biasa, AI otomatis detect dan buat tiket di Notion.

**Contoh:**
```
"tolong buatin fitur login buat ristek, assign ke iqbal dan raihan, deadline 30 mei, urgent"
```

**AI extract:**
- Judul + deskripsi profesional (di-rephrase oleh AI)
- Divisi: Ristek
- PIC: Iqbal + Raihan (multi-PIC support)
- Prioritas: High
- Deadline: 30 Mei
- Project linking otomatis
- Reviewer assignment

**Fitur tambahan:**
- Notifikasi WA otomatis ke PIC yang di-assign
- Clarifikasi kalau nama PIC tidak dikenali (conversation state)
- Deskripsi di-rephrase jadi bahasa formal, bukan copy-paste pesan user

---

### 2. Query & Monitoring Backlog

#### Command (!) — Cepat & Hemat Token

| Command | Fungsi |
|---------|--------|
| `!list` | Lihat semua backlog, dikelompokkan per status |
| `!backlog divisi <nama>` | Backlog per divisi |
| `!backlog status "<status>"` | Filter per status |
| `!backlog search <keyword>` | Cari backlog |
| `!stats` | Statistik: total, per status, per prioritas, per divisi |
| `!tugas <nama>` | Lihat semua tugas seseorang |
| `!detail <tiket>` | Detail lengkap tiket + komentar |
| `!projects` | Daftar 24 project |
| `!project <nama>` | Detail project + backlog items |
| `!members` | Daftar semua anggota |
| `!members <divisi>` | Anggota per divisi |
| `!divisions` | Daftar semua divisi |
| `!refresh` | Refresh cache dari Notion |

#### Natural Language — Chat Biasa

| Contoh Pesan | Fungsi |
|---|---|
| "cek backlog ristek gimana" | Backlog per divisi |
| "yang statusnya in progress apa aja" | Filter per status |
| "stats backlog dong" | Statistik lengkap |
| "progress project web sga gimana" | Detail project |
| "tugas ivander" | Lihat tugas seseorang |
| "tampilkan tugas satrio" | Lihat tugas seseorang |
| "detail project landing page" | Detail project |
| "list semua backlog" | Lihat semua backlog |
| "statistik backlog" | Statistik |

**Status yang tersedia:** Not started, In progress, Need to review, Need to fix, Done, Blocking

---

### 3. Self-Reference & Smart Name Resolution

#### Self-Reference Detection

Oro tahu siapa yang chat dan auto-cek tugasnya berdasarkan nomor WA.

| Contoh Pesan | Yang Terjadi |
|---|---|
| "cek tugas gw dong" | Cek nomor → cari nama → tampilkan tugas sender |
| "backlog aku ada apa aja" | Sama — tampilkan tugas sender |
| "cek baglock gw" | Typo tetap detect (fuzzy matching) |
| "tugas gua ada berapa" | Jumlah tugas sender |
| "cek backlog dong" | Auto self-reference |

**Flow:**
```
Nomor WA → contacts.json → nama lengkap → query Notion → tampilkan tiket yang benar
```

#### Smart Name Resolution (3 Layer)

| Layer | Cara Kerja | Contoh |
|-------|-----------|--------|
| 1. Exact Match | Langsung cocok | "satrio" → Satrio Lehandika Putra |
| 2. Partial Match | Prefix/suffix | "satri" → prefix of "satrio" |
| 3. Fuzzy Match | Levenshtein distance (max 2-3 edits) | "sastrio" → 1 char diff → Satrio |

**Coverage:**
- 101 anggota di contacts.json
- 120 nickname mappings (101 + 19 extra aliases)
- Typo tolerance: "satiro", "ojaan", "iqbla", "heddy" tetap detect

#### Member Task Query

| Contoh Pesan | Intent |
|---|---|
| "tugas farhan" | Member tasks: Farhan |
| "kirim pesan ke faza dong, tugasnya apa aja" | Member tasks + notifikasi WA ke Faza |
| "tugas yg dipunyai iqbal" | Member tasks: Iqbal |
| "kasih tau robby soal tugasnya" | Member tasks + notifikasi WA ke Robby |
| "farhan punya tugas apa" | Member tasks: Farhan |
| "ingetin mika soal tugas" | Member tasks + notifikasi WA ke Mika |

---

### 4. Broadcast & Notifikasi Otomatis

#### Notifikasi Otomatis ke PIC

Saat tiket dibuat dan ada PIC yang di-assign:
- Oro otomatis kirim pesan WhatsApp ke PIC
- Pesan berisi: judul tiket, divisi, prioritas, siapa yang assign, link Notion
- Retry 1x kalau gagal kirim
- Personal greeting pakai nama panggilan

#### Mass Broadcast Task Notification

| Trigger | Contoh |
|---------|--------|
| "kirim semua notifikasi ke semua anggota" | Broadcast semua member |
| "broadcast task ke semua member" | Broadcast semua member |
| "sesuai tasknya masing masing" | Distribusi per orang |
| "notifikasi semua anggota tentang tugasnya" | Broadcast semua member |

**Flow:**
```
getAllContacts() → 101 contacts
  → LOOP each contact:
      → member_name = contact.name (full name)
      → query Notion by member_name (FRESH query, no cache)
      → filter active tasks only
      → IF no active tasks → SKIP (don't send anything)
      → IF has active tasks:
          → generate PERSONAL message with THEIR tasks
          → validate phone number
          → sendDirectMessage to THEIR phone number
          → wait 1 second (rate limit)
  → RETURN summary to requester
```

**Hasil nyata:**
- 25 notifikasi terkirim ke anggota yang punya task aktif
- 76 anggota tidak punya task aktif (di-skip, tidak kirim pesan kosong)
- 0 gagal — semua WA message terkirim sukses

**Format pesan ke setiap anggota:**
```
Halo Satrio!

Berikut daftar task/tiket kamu yang masih aktif di backlog SGA:

🔄 Open Recruitment BPH Cakrawala Festival 2027
   Status: In progress | Priority: High | Project: Cakrawala Festival 2027
   https://notion.so/...

Total: 4 task aktif. Cek detailnya di Notion ya! Semangat!
```

---

### 5. Session Memory & Conversation Context

Setiap nomor HP punya session sendiri — tidak ada cross-contamination.

#### Session Data Structure

```
session[phone] = {
  userName, userPhone,
  lastIntent, lastTopic, lastTicketId, lastTicketName,
  lastProject, lastDivision, lastMemberName,
  recentMessages: ConversationTurn[],     // last 10 turns
  activeTicketIds, activeTicketNames,
  activeProject, activeMemberName,
  lastNotionResults: NotionResultItem[],  // last 20 results
  createdAt, lastActivityAt, messageCount
}
```

#### Fitur

| Fitur | Detail |
|-------|--------|
| Per-user sessions | Setiap nomor HP punya session sendiri |
| Session TTL | 30 menit tidak aktif → session expired |
| Auto cleanup | Setiap 5 menit bersihkan session expired |
| Conversation history | Simpan 10 exchange terakhir per user |
| Notion results cache | Simpan 20 hasil Notion terakhir untuk follow-up |
| Context injection | Ringkasan percakapan di-inject ke AI prompt |

#### Follow-up Detection

AI bisa memahami konteks dari chat sebelumnya:

| Contoh Pesan | Response |
|---|---|
| "di akun apa gw bisa akses" | Jawab soal akses Notion (BUKAN buat tiket baru) |
| "siapa pic nya" | Tampilkan PIC dari tiket yang tadi dibahas |
| "deadline kapan" | Tampilkan deadline dari konteks terakhir |
| "statusnya" | Status tiket dari percakapan sebelumnya |
| "yang tadi" | Referensi ke topik yang baru dibahas |
| "linknya dong" | Kirim link Notion dari tiket terakhir |

#### Ticket Creation Guard

AI membedakan antara:
- Pertanyaan lanjutan → jawab berdasarkan konteks
- Pertanyaan baru → proses normal
- Request create ticket → buat tiket
- Request check ticket → tampilkan data

---

### 6. Update, Modifikasi & Kolaborasi Tiket

#### Update & Modifikasi

| Command | Fungsi |
|---------|--------|
| `!update TK-xxx status In progress` | Update status tiket |
| `!update TK-xxx prioritas High` | Update prioritas |
| `!close TK-xxx` | Tutup tiket (set Done) |
| `!delete TK-xxx` | Archive tiket |
| `!backlog bulk "Not started" ke "In progress"` | Update masal |
| `!pic <tiket> <nama>` | Assign PIC ke tiket |
| `!removepic <tiket> <nama>` | Hapus PIC dari tiket |

#### Kolaborasi & Detail

| Command | Fungsi |
|---------|--------|
| `!detail <tiket>` | Detail lengkap: isi, komentar, link |
| `!note <tiket> <catatan>` | Tambah catatan ke tiket |
| `!comment <tiket> <komentar>` | Tambah komentar |
| `!image <tiket> <url>` | Lampirkan gambar |
| `!subpage <tiket> <judul>` | Buat sub-page di bawah tiket |
| `!refresh` | Refresh cache dari Notion |
| `!db create <nama> in <page_id>` | Buat database baru di Notion |
| `!db schema <database_id>` | Lihat schema database |

---

### 7. Contact Recognition

- Mengenali pengirim berdasarkan nomor HP
- Greeting personal pakai nama panggilan
- PIC notification dikirim ke nomor WA yang benar
- Prioritas nama: contacts.json (nickname) > WhatsApp pushName > "Unknown"

---

### 8. Grup & DM Support

- **DM**: Langsung respon ke user
- **Grup**: Hanya respon kalau di-mention (@bot)
- Rate limiting: max 20 pesan/menit per user
- Message deduplication (hindari double processing)

---

## Teknologi

| Teknologi | Fungsi |
|-----------|--------|
| TypeScript / Node.js | Bahasa utama, type-safe |
| Anthropic Claude AI | AI engine untuk natural language understanding |
| Notion API | Database backlog, projects, members, divisions |
| Evolution API | WhatsApp gateway (open source) |
| Fastify | High-performance HTTP server |
| Docker | Containerized deployment |
| Cloudflare Tunnel | Secure tunnel untuk webhook |

---

## Rekomendasi Fitur Baru

### High Priority
- Deadline Reminder (H-1, H-3 sebelum deadline)
- Overdue Alert (tiket lewat deadline tapi belum Done)
- Daily/Weekly Summary Report (auto-send ke group chat)
- Notion Webhook Real-time (edit di Notion → notif ke WA)
- Group Mention Support

### Medium Priority
- Poll/Voting di WhatsApp
- Export Report (PDF/Image)
- Sprint Management
- Access Control (role-based permission)
- Voice Message Support

### Future Enhancement
- Google Calendar Integration
- Analytics Dashboard (Web)
- Auto-assign by Workload
- Template Tiket
- Multi-Workspace Support

---

## Cara Menjalankan

### Cek Status
```bash
docker compose ps                    # Cek container
curl localhost:3002/health           # Cek bot health
ps aux | grep cloudflared            # Cek tunnel
```

### Start Bot
```bash
cd /Users/mekari/SmartProductDiscoveryAISystem/whatsapp-gateway
ORCHESTRATOR_PORT=3002 docker compose up -d orchestrator
```

### Start Tunnel
```bash
pkill cloudflared
nohup cloudflared tunnel --url http://localhost:3002 > /tmp/cloudflared.log 2>&1 &
cat /tmp/cloudflared.log | grep "https://.*trycloudflare"
```

### Update Webhook
```bash
curl -s -X POST "http://localhost:8080/webhook/set/teste" \
  -H "apikey: Ev0lution2026Secur3Key!" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "url": "https://URL-BARU.trycloudflare.com/webhook/teste", "webhookByEvents": true, "events": ["MESSAGES_UPSERT"]}'
```
