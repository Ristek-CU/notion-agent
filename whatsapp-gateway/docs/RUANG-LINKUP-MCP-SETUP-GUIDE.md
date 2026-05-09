# RuangLinkUp — Setup MCP & Infrastructure dengan Docker MCP Toolkit

**Untuk**: Tim Ristek
**Tanggal**: April 2026
**Fokus**: MCP Setup (Docker MCP Toolkit + Notion MCP untuk Tiket) + Step-by-Step

---

# PERUBAHAN ARSITEKTUR — DARI CUSTOM MCP KE DOCKER MCP TOOLKIT

Sebelumnya kita rencananya **bangun semua MCP sendiri**. Sekarang pendekatannya berubah:

```
SEBELUM:
  Bangun semua MCP dari nol (booking, kantin, tiket, akademik, info)
  → Banyak kerja, banyak testing, lama

SEKARANG:
  Pakai Docker MCP Toolkit untuk mengelola MCP servers
  Pakai Notion MCP untuk ticketing (sudah jadi, tinggal pakai)
  Tetap bangun custom MCP untuk booking & kantin (yang spesifik)
  → Lebih cepat, lebih stabil, kurangi kerja
```

---

# ARSITEKTUR BARU

```
┌─────────────────────────────────── SERVER ───────────────────────────────────┐
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    DOCKER MCP TOOLKIT                                   │ │
│  │                    (Profile: ruanglinkup)                               │ │
│  │                                                                         │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │ │
│  │  │ NOTION MCP  │  │ POSTGRES    │  │ GITHUB MCP  │  │ MEMORY MCP  │  │ │
│  │  │ (tiket &    │  │ MCP         │  │ (opsional)  │  │ (context    │  │ │
│  │  │  database)  │  │ (database   │  │             │  │  store)     │  │ │
│  │  │             │  │  queries)   │  │             │  │             │  │ │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘  └─────────────┘  │ │
│  │         │                │                                            │ │
│  └─────────┼────────────────┼────────────────────────────────────────────┘ │
│            │                │                                              │
│  ┌─────────┴────────────────┴──────────────────────────────────────────┐   │
│  │                    GATEWAY (docker mcp gateway run)                  │   │
│  │                    Menghubungkan semua MCP ke AI agent               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│            │                                                                │
│  ┌─────────┴─────────────────────────────────────────────────────────────┐  │
│  │                    WEBHOOK + WORKER (code kita)                       │  │
│  │                    port 3000                                          │  │
│  │                    Terima WA → proses → panggil MCP → respond        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                                 │
│  │ REDIS            │  │ POSTGRESQL       │                                 │
│  │ port 6379        │  │ port 5432        │                                 │
│  │ (queue + session)│  │ (data lokal)     │                                 │
│  └──────────────────┘  └──────────────────┘                                 │
│                                                                               │
└───────────┬───────────────────────────────────────────────────────────────────┘
            │
    ┌───────┴──────────┐
    │  CLOUD SERVICES   │
    │                   │
    │  - Twilio (WA)    │
    │  - Claude API     │
    │  - Notion API     │ ← BARU: Notion jadi ticketing backend
    │  - ngrok (POC)    │
    └───────────────────┘
```

---

# APA ITU DOCKER MCP TOOLKIT?

Docker MCP Toolkit adalah fitur built-in di **Docker Desktop** yang memudahkan:
- **Install** MCP servers dari catalog (tinggal klik)
- **Manage** MCP servers dalam profiles
- **Connect** MCP servers ke AI agents (Claude Code, Cursor, dll)
- **Run** semua MCP via 1 gateway

**Jadi kita nggak perlu build MCP dari nol untuk hal yang sudah ada.**

### MCP yang Kita Pakai

| MCP | Sumber | Fungsi di RuangLinkUp | Status |
|-----|--------|----------------------|--------|
| **Notion MCP** | GitHub (makenotion) | Ticketing — buat tiket, update status, tracking | Utama, dari catalog |
| **PostgreSQL MCP** | Docker Catalog | Query database booking & kantin | Dari catalog |
| **Memory MCP** | Docker Catalog | Simpan context percakapan user | Dari catalog |
| **GitHub MCP** | Docker Catalog | Tracking issue (opsional, backup ticketing) | Opsional |

---

# MCP NOTION — UNTUK TICKETING

## Kenapa Notion?

```
SEBELUMNYA RENCANA:
  Bangun mcp-ticket sendiri (database, CRUD, API)
  → Kerja: 1-2 minggu develop + test

SEKARANG PAKAI NOTION:
  Notion MCP sudah jadi → tinggal setup + konfigurasi
  → Kerja: 1 hari setup
  → Plus: UI visual (Notion board) gratis untuk admin lihat tiket
  → Plus: bisa diakses manual juga di web Notion
```

## Cara Notion MCP Bekerja di RuangLinkUp

```
User:  "AC ruang A201 bocor, lantai basah"
  │
  v
Claude AI analisis:
  intent: "buat_ticket"
  entities: { lokasi: "A201", masalah: "AC bocor, lantai basah" }
  │
  v
Worker panggil Notion MCP:
  action: create_page di database "RuangLinkUp Tickets"
  │
  v
Notion MCP:
  - Buat page baru di Notion database
  - Isi: judul, lokasi, kategori, status, reporter
  - Return: page ID + URL
  │
  v
Worker kirim ke user:
  "Tiket berhasil dibuat!
   ID: TK-20260424-001
   Status: Open
   Kelola via: https://notion.so/..."
```

## Notion Database Setup untuk Ticketing

Kita perlu buat **1 database di Notion** dengan kolom berikut:

```
DATABASE: "RuangLinkUp - Tickets"

Kolom:
┌─────────────┬──────────┬───────────────────────────────────────────┐
│ Nama Kolom  │ Type     │ Contoh Value                              │
├─────────────┼──────────┼───────────────────────────────────────────┤
│ Ticket ID   │ Title    │ TK-20260424-001                           │
│ Status      │ Select   │ Open / In Progress / Resolved / Closed    │
│ Kategori    │ Select   │ Fasilitas / IT / Akademik / Umum          │
│ Prioritas   │ Select   │ Low / Medium / High / Critical            │
│ Pelapor     │ Text     │ +6281234567890 (Budi Santoso)             │
│ Lokasi      │ Text     │ Gedung A - Lt.2 - A201                    │
│ Deskripsi   │ Text     │ AC bocor, lantai basah                    │
│ Ditugaskan  │ Person   │ @TimFasilitas                             │
│ Tanggal     │ Date     │ 24 April 2026                             │
│ Resolved    │ Date     │ (kosong sampai selesai)                   │
│ Progress    │ Text     │ Update notes...                           │
│ Source      │ Select   │ WhatsApp / Manual                         │
└─────────────┴──────────┴───────────────────────────────────────────┘

Views (bisa dibuat di Notion):
├── Board View (kanban by Status) → untuk visual tracking
├── Table View (semua tiket) → untuk detail & filtering
├── My Tickets (filter by Ditugaskan) → untuk tim terkait
└── Open Tickets (filter Status ≠ Closed) → untuk monitoring
```

---

# STEP-BY-STEP SETUP

## PHASE 1: Docker MCP Toolkit Setup

### Step 1: Install Docker Desktop (Kalau belum)

```bash
# Download Docker Desktop terbaru
# https://www.docker.com/products/docker-desktop/

# Install, lalu buka Docker Desktop
# Pastikan versi 4.62 atau yang lebih baru
```

### Step 2: Enable MCP Toolkit

```
1. Buka Docker Desktop
2. Buka Settings (gear icon)
3. Pilih "Beta features"
4. Centang "Enable Docker MCP Toolkit"
5. Klik "Apply"
```

### Step 3: Buat Profile

```
1. Di Docker Desktop, klik "MCP Toolkit" di sidebar
2. Klik tab "Profiles"
3. Klik "Create profile"
4. Nama: "ruanglinkup"
5. Klik "Create"
```

---

## PHASE 2: Notion MCP Setup

### Step 4: Buat Notion Integration

```
1. Buka https://www.notion.so/my-integrations
2. Klik "+ New integration"
3. Nama: "RuangLinkUp Ticket Bot"
4. Workspace: pilih workspace kampus
5. Capabilities:
   - Read content: ON
   - Update content: ON
   - Insert content: ON
6. Klik "Submit"
7. COPY "Internal Integration Secret" (dimulai dengan "ntn_...")
   → Simpan ini, ini jadi NOTION_API_KEY
```

### Step 5: Buat Database Ticketing di Notion

```
1. Buka Notion workspace
2. Buat page baru: "RuangLinkUp Tickets"
3. Di dalam page, buat database (table view)
4. Tambahkan kolom sesuai tabel di atas:
   - Ticket ID (Title)
   - Status (Select: Open, In Progress, Resolved, Closed)
   - Kategori (Select: Fasilitas, IT, Akademik, Umum)
   - Prioritas (Select: Low, Medium, High, Critical)
   - Pelapor (Text)
   - Lokasi (Text)
   - Deskripsi (Text)
   - Ditugaskan (Person)
   - Tanggal (Date)
   - Source (Select: WhatsApp, Manual)
5. Buka menu database → Copy database ID dari URL
   URL format: notion.so/xxx?v=yyy
   Database ID = bagian xxx
6. SHARE database ke integration:
   - Klik "..." di database
   - Pilih "Connections"
   - Pilih "RuangLinkUp Ticket Bot"
   - Confirm
```

### Step 6: Install Notion MCP ke Docker MCP Toolkit

```
Option A — Dari Docker Desktop UI:
  1. MCP Toolkit → Catalog tab
  2. Cari "Notion"
  3. Klik "Add to" → pilih profile "ruanglinkup"
  4. Saat diminta configuration, masukkan:
     - OPENAPI_MCP_HEADERS: {"Authorization":"Bearer ntn_xxxxx","Notion-Version":"2022-06-28"}

Option B — Dari Terminal (lebih detail):
```

```bash
# Clone Notion MCP server
git clone https://github.com/makenotion/notion-mcp-server.git
cd notion-mcp-server

# Install dependencies
npm install

# Build
npm run build
```

### Step 7: Konfigurasi Notion MCP untuk Claude Code

Buat atau edit file `.mcp.json` di root project:

```json
{
  "mcpServers": {
    "notion": {
      "command": "node",
      "args": ["/path/ke/notion-mcp-server/build/index.js"],
      "env": {
        "OPENAPI_MCP_HEADERS": "{\"Authorization\":\"Bearer ntn_xxxxx_your_key_here\",\"Notion-Version\":\"2022-06-28\"}"
      }
    }
  }
}
```

Atau kalau pakai Docker MCP Toolkit gateway:

```json
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "ruanglinkup"],
      "type": "stdio"
    }
  }
}
```

### Step 8: Test Notion MCP

```bash
# Dari terminal, di directory project
claude mcp list

# Output harusnya:
# notion: node /path/to/notion-mcp-server - Connected
# atau
# MCP_DOCKER: docker mcp gateway run - Connected

# Test dengan prompt:
claude "Use the Notion MCP to show me databases in my workspace"

# Kalau berhasil, lanjut test buat tiket:
claude "Create a new page in the RuangLinkUp Tickets database with title 'TK-TEST-001', status 'Open', category 'IT', location 'A201', description 'AC bocor test'"
```

---

## PHASE 3: MCP Lainnya dari Docker Catalog

### Step 9: Tambah MCP dari Catalog

```
Di Docker Desktop → MCP Toolkit → Catalog:

1. Cari dan tambahkan ke profile "ruanglinkup":

   a. PostgreSQL MCP
      - Untuk: query database booking & kantin
      - Configuration: DATABASE_URL=postgresql://rlu:xxx@localhost:5432/ruanglinkup

   b. Memory MCP (kalau ada di catalog)
      - Untuk: simpan context percakapan antar session
      - Tanpa configuration tambahan

   c. GitHub MCP (opsional)
      - Untuk: tracking issue dan development
      - Configuration: GITHUB_TOKEN=ghp_xxxxx
```

### Step 10: Konfigurasi Docker MCP Gateway

File konfigurasi untuk semua MCP dalam 1 profile:

```json
// .mcp.json — di root project
{
  "mcpServers": {
    "MCP_DOCKER": {
      "command": "docker",
      "args": ["mcp", "gateway", "run", "--profile", "ruanglinkup"],
      "type": "stdio"
    }
  }
}
```

Docker MCP Toolkit otomatis meng-orchestrate semua MCP dalam profile.

---

## PHASE 4: Integrasi ke RuangLinkUp Worker

### Step 11: Update Worker — Panggil Notion MCP

Worker kita perlu bisa memanggil Notion MCP untuk operasi tiket. Ada 2 cara:

#### Cara 1: Worker panggil Notion API langsung (recommended untuk production)

```typescript
// src/services/notion-ticket-service.ts

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_TICKET_DB_ID;
const NOTION_VERSION = "2022-06-28";

export class NotionTicketService {

  // Buat tiket baru di Notion
  async createTicket(data: {
    ticketId: string;
    kategori: string;
    deskripsi: string;
    pelapor: string;
    lokasi?: string;
    prioritas?: string;
  }) {
    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          "Ticket ID": { title: [{ text: { content: data.ticketId } }] },
          "Status": { select: { name: "Open" } },
          "Kategori": { select: { name: data.kategori } },
          "Prioritas": { select: { name: data.prioritas || "Medium" } },
          "Pelapor": { rich_text: [{ text: { content: data.pelapor } }] },
          "Lokasi": { rich_text: [{ text: { content: data.lokasi || "-" } }] },
          "Deskripsi": { rich_text: [{ text: { content: data.deskripsi } }] },
          "Tanggal": { date: { start: new Date().toISOString().split("T")[0] } },
          "Source": { select: { name: "WhatsApp" } },
        },
      }),
    });

    return response.json();
  }

  // Cek status tiket
  async getTicket(ticketId: string) {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            property: "Ticket ID",
            title: { equals: ticketId },
          },
        }),
      }
    );

    const result = await response.json();
    if (result.results.length === 0) return null;
    return this.formatTicket(result.results[0]);
  }

  // Update status tiket
  async updateTicketStatus(ticketId: string, status: string, notes?: string) {
    const ticket = await this.getTicket(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const response = await fetch(
      `https://api.notion.com/v1/pages/${ticket.pageId}`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            "Status": { select: { name: status } },
            ...(notes && {
              "Progress": { rich_text: [{ text: { content: notes } }] },
            }),
            ...(status === "Resolved" && {
              "Resolved": { date: { start: new Date().toISOString().split("T")[0] } },
            }),
          },
        }),
      }
    );

    return response.json();
  }

  // Daftar tiket user
  async listUserTickets(phone: string) {
    const response = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Pelapor", rich_text: { contains: phone } },
              { property: "Status", select: { does_not_equal: "Closed" } },
            ],
          },
          sorts: [{ property: "Tanggal", direction: "descending" }],
        }),
      }
    );

    const result = await response.json();
    return result.results.map(this.formatTicket);
  }

  private formatTicket(page: any) {
    const props = page.properties;
    return {
      pageId: page.id,
      ticketId: props["Ticket ID"]?.title?.[0]?.text?.content,
      status: props["Status"]?.select?.name,
      kategori: props["Kategori"]?.select?.name,
      prioritas: props["Prioritas"]?.select?.name,
      pelapor: props["Pelapor"]?.rich_text?.[0]?.text?.content,
      lokasi: props["Lokasi"]?.rich_text?.[0]?.text?.content,
      deskripsi: props["Deskripsi"]?.rich_text?.[0]?.text?.content,
      tanggal: props["Tanggal"]?.date?.start,
      ditugaskan: props["Ditugaskan"]?.people?.[0]?.name,
      progress: props["Progress"]?.rich_text?.[0]?.text?.content,
    };
  }
}
```

#### Cara 2: Worker panggil via Docker MCP Gateway (untuk testing/prototyping)

```bash
# Worker memanggil MCP gateway yang sudah menjalankan Notion MCP
# Gateway menangani auth dan format

# CLI testing:
docker mcp gateway run --profile ruanglinkup

# Dalam code, gunakan stdio transport ke MCP gateway
```

### Step 12: Update Worker Router — Route ke Notion

```typescript
// src/controller/router.ts — updated

// Mapping intent → action
const TICKET_INTENTS = {
  lapor_fasilitas: { action: "create_ticket", autoCategorize: true },
  buat_ticket:     { action: "create_ticket" },
  cek_ticket:      { action: "check_ticket" },
  list_ticket:     { action: "list_tickets" },
};

async function handleTicketIntent(intent: string, entities: any, context: any) {
  const ticketService = new NotionTicketService();

  switch (TICKET_INTENTS[intent]?.action) {
    case "create_ticket": {
      const ticketId = `TK-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(Date.now()).slice(-3)}`;

      const kategori = entities.kategori || autoCategorize(entities);
      // "AC bocor" → "Fasilitas"
      // "wifi mati" → "IT"
      // "nilai salah" → "Akademik"

      const ticket = await ticketService.createTicket({
        ticketId,
        kategori,
        deskripsi: entities.deskripsi || entities.description || "Tidak ada deskripsi",
        pelapor: context.phoneNumber,
        lokasi: entities.lokasi || "-",
        prioritas: entities.prioritas || autoPriority(entities),
      });

      return {
        success: true,
        data: {
          ticketId,
          status: "Open",
          kategori,
          deskripsi: entities.deskripsi,
          notionUrl: ticket.url,
        }
      };
    }

    case "check_ticket": {
      const ticket = await ticketService.getTicket(entities.ticket_id);
      if (!ticket) {
        return { success: false, error: { message: "Tiket tidak ditemukan" } };
      }
      return { success: true, data: ticket };
    }

    case "list_tickets": {
      const tickets = await ticketService.listUserTickets(context.phoneNumber);
      return { success: true, data: { tickets } };
    }
  }
}

// Auto-categorize berdasarkan keyword
function autoCategorize(entities: any): string {
  const text = (entities.deskripsi || "").toLowerCase();
  if (/ac|listrik|air|toilet|atap|lantai|tembok/.test(text)) return "Fasilitas";
  if (/wifi|internet|komputer|printer|email|server/.test(text)) return "IT";
  if (/nilai|jadwal|krs|sks|dosen|kelas/.test(text)) return "Akademik";
  return "Umum";
}

function autoPriority(entities: any): string {
  const text = (entities.deskripsi || "").toLowerCase();
  if (/kebakaran|bahaya|macet total|mati semua/.test(text)) return "Critical";
  if (/bocor|mati|rusak|error/.test(text)) return "High";
  return "Medium";
}
```

---

## PHASE 5: Update Environment Variables

### Step 13: Update .env

```bash
# .env — Updated dengan Notion

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

# === NOTION (Ticketing) === ← BARU
NOTION_API_KEY=ntn_xxxxxxxxxxxxxxxxxxxxx
NOTION_TICKET_DB_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_VERSION=2022-06-28

# === DATABASE ===
DATABASE_URL=postgresql://rlu:rlu_dev_2026@localhost:5432/ruanglinkup

# === REDIS ===
REDIS_URL=redis://localhost:6379

# === MCP ENDPOINTS (custom modules) ===
MCP_BOOKING_URL=http://localhost:3001
MCP_KANTIN_URL=http://localhost:3002
# MCP-TICKET DIHAPUS — diganti Notion API langsung

# === LIMITS ===
RATE_LIMIT_PER_MINUTE=30
REQUEST_TIMEOUT_MS=10000
SESSION_TTL_SECONDS=86400
```

---

# ARSITEKTUR FINAL — SETELAH INTEGRASI MCP

```
┌─────────────────────────────────── SERVER ───────────────────────────────────┐
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                    DOCKER DESktop + MCP TOOLKIT                        │ │
│  │                    Profile: "ruanglinkup"                              │ │
│  │                                                                         │ │
│  │  MCP Servers:                                                          │ │
│  │  ├── Notion MCP ────► Notion API ────► Ticket Database                │ │
│  │  ├── Postgres MCP ──► PostgreSQL ───► Booking & Kantin data           │ │
│  │  └── Memory MCP ────► Local store ──► Context percakapan              │ │
│  │                                                                         │ │
│  │  Gateway: docker mcp gateway run --profile ruanglinkup                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    RUANGLINKUP APP (code kita)                        │  │
│  │                    port 3000                                          │  │
│  │                                                                       │  │
│  │  Webhook ──► Queue ──► Worker ──► [route ke MCP yang tepat]         │  │
│  │                                                                       │  │
│  │  Routing logic:                                                       │  │
│  │  ├── Intent booking/kantin → Custom MCP (localhost:3001-3002)        │  │
│  │  ├── Intent tiket/lapor  → Notion API (via NotionTicketService)      │  │
│  │  └── Intent info/akademik → Custom MCP (localhost:3004-3005)        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ REDIS        │  │ POSTGRESQL   │  │ MCP-BOOKING  │  │ MCP-KANTIN   │    │
│  │ :6379        │  │ :5432        │  │ :3001        │  │ :3002        │    │
│  │ queue+sesi   │  │ data lokal   │  │ custom       │  │ custom       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                               │
└───────────┬───────────────────────────────────────────────────────────────────┘
            │
    ┌───────┴──────────────────┐
    │       CLOUD SERVICES     │
    │                          │
    │  Twilio (WhatsApp)       │
    │  Anthropic (Claude AI)   │
    │  Notion (Ticketing DB)   │ ← database tiket ada di Notion cloud
    │  ngrok (POC tunnel)      │
    └──────────────────────────┘
```

---

# DAFTAR TOOLS FINAL — YANG PERLU DI-SETUP

## Yang Perlu Di-download & Install

| # | Apa | Dari Mana | Untuk Apa |
|---|-----|-----------|-----------|
| 1 | Docker Desktop 4.62+ | docker.com | MCP Toolkit + container runtime |
| 2 | Node.js 20 LTS | nodejs.org | Jalankan code RuangLinkUp |
| 3 | ngrok | ngrok.com | Expose localhost (POC) |
| 4 | Git | git-scm.com | Clone repo + version control |

## Yang Perlu Daftar Account

| # | Service | URL | Dapat Apa |
|---|---------|-----|-----------|
| 1 | Twilio | twilio.com | Account SID, Auth Token, WA sandbox |
| 2 | Anthropic | console.anthropic.com | Claude API key |
| 3 | Notion | notion.so | Integration token (ntn_...) + Database ID |
| 4 | ngrok | ngrok.com | Auth token untuk tunnel |

## MCP yang Dipasang via Docker MCP Toolkit

| # | MCP | Dari | Konfigurasi |
|---|-----|------|-------------|
| 1 | Notion MCP | Docker Catalog / GitHub | OPENAPI_MCP_HEADERS dengan Bearer token |
| 2 | PostgreSQL MCP | Docker Catalog | DATABASE_URL |
| 3 | Memory MCP | Docker Catalog | Tanpa config |

## Custom MCP yang Tetap Dibangun Sendiri

| # | MCP | Port | Kenapa Custom |
|---|-----|------|---------------|
| 1 | mcp-booking | 3001 | Logic khusus (konflik jadwal, aturan booking) |
| 2 | mcp-kantin | 3002 | Logic khusus (stok, kejujuran, timeout) |
| 3 | mcp-info | 3005 | Content khusus kampus |

---

# STEP-BY-STEP EKSEKUSI — URUTAN KERJA

```
STEP 1  (30 menit)
  ├── Install Docker Desktop + enable MCP Toolkit
  ├── Install Node.js
  └── Install ngrok

STEP 2  (30 menit)
  ├── Daftar Twilio → dapat sandbox WA
  ├── Daftar Anthropic → dapat API key Claude
  ├── Daftar ngrok → dapat auth token
  └── Setup .env file dengan semua key

STEP 3  (1 jam)
  ├── Buat Notion workspace / gunakan yang sudah ada
  ├── Buat Integration "RuangLinkUp Ticket Bot"
  ├── Buat database "RuangLinkUp Tickets" dengan semua kolom
  ├── Share database ke integration
  └── Copy Integration token + Database ID ke .env

STEP 4  (30 menit)
  ├── Docker Desktop → MCP Toolkit → Create profile "ruanglinkup"
  ├── Add Notion MCP dari catalog → configure dengan token
  ├── Add PostgreSQL MCP dari catalog → configure dengan DATABASE_URL
  └── Test via Claude Code: "Show me my Notion databases"

STEP 5  (1 jam)
  ├── Clone notion-mcp-server repo (kalau perlu local)
  ├── Build project RuangLinkUp (npm init, install deps)
  ├── Buat NotionTicketService (copy dari Step 11)
  ├── Buat webhook server sederhana
  └── Test: kirim WA → buat tiket → cek di Notion

STEP 6  (2 jam)
  ├── Buat database PostgreSQL (booking, kantin, info)
  ├── Build MCP Booking (simple CRUD dulu)
  ├── Build MCP Kantin (simple CRUD dulu)
  └── Test end-to-end: WA → AI → MCP → response

STEP 7  (ongoing)
  ├── Tambah logic (konflik jadwal, stok otomatis, dll)
  ├── Polish AI prompt untuk accuracy
  ├── Testing dengan berbagai skenario
  └── Iterate
```

---

# CONTOH FLOW — TIKET VIA NOTION

```
User kirim WA: "AC ruang A201 bocor, lantai basah"

1. Webhook terima pesan → push ke queue
   │
2. Worker ambil → kirim ke Claude AI
   │
3. Claude return:
   {
     intent: "buat_ticket",
     confidence: 0.94,
     entities: {
       lokasi: "A201",
       deskripsi: "AC bocor, lantai basah",
       kategori: "Fasilitas"
     }
   }
   │
4. Worker route → NotionTicketService.createTicket()
   │
5. NotionTicketService kirim POST ke Notion API:
   {
     parent: { database_id: "xxx" },
     properties: {
       "Ticket ID": "TK-20260424-001",
       "Status": "Open",
       "Kategori": "Fasilitas",
       "Prioritas": "High",
       "Pelapor": "+6281234567890",
       "Lokasi": "A201",
       "Deskripsi": "AC bocor, lantai basah",
       "Tanggal": "2026-04-24",
       "Source": "WhatsApp"
     }
   }
   │
6. Notion buat page baru → return page ID + URL
   │
7. Worker kirim response ke WA:
   "Tiket berhasil dibuat!

    ID: TK-20260424-001
    Status: Open
    Kategori: Fasilitas
    Lokasi: A201
    Prioritas: High

    Tim fasilitas sudah diberitahu.
    Ketik 'status TK-20260424-001' untuk cek progress."

8. Admin buka Notion → lihat tiket baru muncul di Board View
   → Assign ke tim terkait
   → Update status → User dapat update via WA

TOTAL WAKTU: ~3 detik
```

---

# TESTING CHECKLIST

```
SETUP VERIFICATION:
  [ ] Docker Desktop terinstall, MCP Toolkit aktif
  [ ] Profile "ruanglinkup" dibuat
  [ ] Notion MCP terhubung (claude mcp list → Connected)
  [ ] Notion database bisa diakses dari MCP

TICKET CREATION TEST:
  [ ] WA: "AC bocor di A201" → Tiket terbuat di Notion
  [ ] Cek Notion board → tiket muncul dengan data benar
  [ ] WA: "Status tiket TK-xxx" → Dapat info status
  [ ] Admin update status di Notion → User cek via WA → status updated
  [ ] WA: "Tiket saya" → List semua tiket user

BOOKING TEST (setelah MCP booking jalan):
  [ ] WA: "Pinjem kelas besok jam 10" → Dapat daftar ruangan
  [ ] WA: "Pilih 1" → Booking dikonfirmasi

KANTIN TEST (setelah MCP kantin jalan):
  [ ] WA: "Kantin ada apa" → List stok
  [ ] WA: "Ambil indomie 2" → Dicatat + total harga
  [ ] WA: "Sudah bayar" → Pembayaran dikonfirmasi
```

---

*RuangLinkUp — MCP-powered: Notion untuk tiket, Docker MCP Toolkit untuk orchestration, WhatsApp untuk interface.*
