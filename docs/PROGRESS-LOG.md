# Progress Log — SmartProductDiscoveryAISystem

> Catatan lengkap semua yang sudah dilakukan dan yang masih harus dilakukan.
> Terakhir diupdate: 2026-05-15

---

## Status Saat Ini: ONLINE (Quick Tunnel)

| Service | URL |
|---------|-----|
| Bot (Public) | `https://raise-disposition-whether-sing.trycloudflare.com` |
| Health Check | `https://raise-disposition-whether-sing.trycloudflare.com/health` |
| Evolution API (Local) | `http://localhost:8080` |
| Manager UI (Local) | `http://localhost:8080/manager` |

### Project Status

| Aspect | Status |
|--------|--------|
| **Version** | 2.0.0 (Production) |
| **Core Features** | 30+ commands, all live |
| **AI Agent** | claude-sonnet-4-20250514 via z.ai proxy |
| **Notion Integration** | Direct API with retry, rate limiting, caching |
| **SDD Documentation** | Complete (10 docs, all updated to match implementation) |

---

## Riwayat Perubahan

### 2026-05-15: SDD Documentation Overhaul

Semua 10 dokumen SDD ditulis ulang agar sesuai dengan implementasi aktual.

**Masalah**: Dokumen SDD (00-09) mendeskripsikan sistem fiktif — "WhatsApp Service Gateway (WSG)" untuk layanan kampus dengan MCP modules (Akademik, Admisi, Inventory, IT Support), Twilio, PostgreSQL, BullMQ. Padahal implementasi sebenarnya adalah **Oro Bot** — WhatsApp + Notion AI bot untuk SGA Cakrawala Universe.

**Perubahan**:

| No | Dokumen | Sebelum | Sesudah |
|----|---------|---------|---------|
| 00 | PROJECT-OVERVIEW | Sudah akurat | Tidak diubah |
| 01 | PRD | WSG campus gateway | Oro Bot PRD — 25 FR, 4 user personas |
| 02 | SYSTEM-ARCHITECTURE | Twilio + Express + PostgreSQL | Evolution API + Fastify + Notion API |
| 03 | MCP-DESIGN | 4 MCP modules fiktif | Dual-path Notion integration (Direct API + MCP fallback) |
| 04 | SPRINT-PLAN | Generic sprints | Sprint 0-5 real status, 27 features completed |
| 05 | USER-STORIES | Campus service stories | 20 user stories dengan acceptance criteria |
| 06 | TEST-SCENARIOS | Fictional test cases | 80+ test cases across 12 categories |
| 07 | PROTOTYPING-GUIDE | Generic POC guide | Setup/deployment guide lengkap |
| 08 | TECHNICAL-IMPLEMENTATION | Generic modules | 14 source files documented |
| 09 | ORCHESTRATOR-DESIGN | Generic orchestrator | agent.ts (2670 lines) fully documented |

---

### 2026-05-06: Setup Cloudflare Tunnel

#### Arsitektur
```
Internet (HTTPS)           Machine (Docker)
─────────────────          ─────────────────────
                            ┌─────────────────────┐
https://xxx.trycloudflare.com → cloudflared tunnel  → localhost:3000 (Orchestrator)
                            │                     │
                            └─────────────────────┘
```

#### File yang Dibuat/Diubah
| File | Aksi | Keterangan |
|------|------|------------|
| `cloudflared-config.yml` | Baru | Template config tunnel (untuk named tunnel) |
| `scripts/start-tunnel.sh` | Baru | Script start/stop/status (quick + named tunnel) |
| `docker-compose.yml` | Diubah | Semua secret pakai env var, Evolution API masuk compose |
| `.env.example` | Diubah | Ditambah config tunnel + semua env var |
| `.env` | Diubah | Ditambah EVOLUTION_API_KEY + PUBLIC_URL |
| `.gitignore` | Diubah | Ditambah `.cloudflared/` |

#### Masalah yang Difix
| Masalah | Solusi |
|---------|--------|
| `cloudflared` error `cert.pem not found` | Pakai Quick Tunnel (tanpa login/domain) |
| Docker `docker-credential-desktop not found` | Hapus `credsStore: "desktop"` dari `~/.docker/config.json` |
| `EVOLUTION_API_KEY` variable not set | Tambah ke `.env` |
| Container name conflict `/wa-evolution-api` | `docker rm -f wa-evolution-api` |

---

### 2026-05-05: Audit Cacat

Ditemukan **22 cacat** di codebase whatsapp-gateway. Ringkasan per severity:

#### KRITIS (3)
| # | Issue | File |
|---|-------|------|
| 1.1 | API keys ter-expose di `.env` yang mungkin ter-commit | `whatsapp-gateway/.env:6-17` |
| 1.2 | Evolution API key hardcoded di docker-compose | `docker-compose.yml:51` (sudah difix) |
| 1.4 | Webhook signature verification palsu (selalu return true) | `notion-api-core.ts:596-606` |

#### TINGGI (4)
| # | Issue | File |
|---|-------|------|
| 1.5 | Tidak ada webhook auth dari Evolution API | `handler.ts:107-109` |
| 2.1 | `pushName` digunakan sebelum didefinisikan di image handler | `handler.ts:141-143` |
| 2.2 | `!backlog restore` tidak bisa menemukan archived item | `notion-org-service.ts:469-474` |
| 2.3 | `normalizeDepartment` return "Ristek" tapi Notion pakai "Research and Technology" | `helpers.ts:16-36` |

#### SEDANG (5)
| # | Issue | File |
|---|-------|------|
| 2.5 | `resolveNickname` bisa false positive (partial match) | `notion-org-service.ts:262-264` |
| 2.6 | Ticket ID collision risk (hanya 3 digit milidetik) | `helpers.ts:6-11` |
| 3.1-3.4 | Memory leak: Maps tanpa max size | multiple files |
| 5.1-5.3 | Tidak ada timeout pada semua HTTP fetch | multiple files |
| 5.4 | `addCasualTouch` bisa double-wrap pada pending ticket resolution | `agent.ts:536` |

#### RENDAH (7)
| # | Issue | File |
|---|-------|------|
| 4.1 | `ioredis` di dependency tapi tidak dipakai | `package.json:19` |
| 4.2 | `@anthropic-ai/sdk` di dependency tapi tidak dipakai | `package.json:15` |
| 4.3 | MCP client dead code (tidak pernah dipanggil) | `mcp/notion-client.ts` |
| 4.4 | `CASUAL_ERROR_PROMPT` didefinisikan tapi tidak dipakai | `prompts.ts:387-397` |
| 4.5 | `SYSTEM_PROMPT` didefinisikan tapi tidak dipakai | `prompts.ts:3` |
| 6.2 | Helper functions duplikat di 3 file | multiple files |
| 7.1 | Dockerfile tidak multi-stage | `Dockerfile:9` |
| 7.2 | `qrcode.png` ada di repo root | `/qrcode.png` |

---

## Yang Masih Harus Dilakukan

### Prioritas 1 — Bug Kritis
- [ ] Fix webhook signature verification di `notion-api-core.ts` (implementasi HMAC-SHA256 yang bener)
- [ ] Fix `pushName` undefined di image handler (`handler.ts:141-143`)
- [ ] Fix `!backlog restore` tidak bisa nemu archived items
- [ ] Fix `normalizeDepartment` return nama yang salah

### Prioritas 2 — Keamanan
- [ ] Tambah webhook authentication untuk Evolution API endpoint
- [ ] Pastikan `.env` ada di `.gitignore` dan tidak ter-commit
- [ ] Hapus API key dari git history kalau sudah pernah ter-commit

### Prioritas 3 — Performance & Memory
- [ ] Tambah max size pada semua Maps (rateLimitMap, pendingTickets, apiCache, relationCache)
- [ ] Tambah timeout pada semua HTTP fetch (AbortController)
- [ ] Fix `resolveNickname` false positive

### Prioritas 4 — Cleanup
- [ ] Hapus unused dependencies (`ioredis`, `@anthropic-ai/sdk`)
- [ ] Hapus dead code (MCP client, unused prompts)
- [ ] Extract duplikat helper functions ke shared module
- [ ] Dockerfile multi-stage build

### Prioritas 5 — Production
- [ ] Beli domain murah (~Rp 10-15rb/tahun)
- [ ] Setup Named Tunnel dengan domain sendiri
- [ ] Set webhook URL permanent di Evolution API
- [ ] Setup monitoring/logging

---

## Cara Menjalankan

### Quick Tunnel (development, tanpa domain)
```bash
cd whatsapp-gateway
./scripts/start-tunnel.sh          # start semua
./scripts/start-tunnel.sh stop     # stop semua
./scripts/start-tunnel.sh status   # cek status
```

### Named Tunnel (production, perlu domain)
```bash
# Setup sekali saja:
cloudflared tunnel login
cloudflared tunnel create wa-bot
# Edit ~/.cloudflared/config.yml dengan Tunnel ID
# cloudflared tunnel route dns wa-bot <subdomain>.domain.com

./scripts/start-tunnel.sh named    # start dengan named tunnel
```

### Manual (tanpa script)
```bash
# Terminal 1: Docker
cd whatsapp-gateway && docker compose up -d

# Terminal 2: Quick Tunnel
cloudflared tunnel --url http://localhost:3000

# Terminal 3 (opsional): Tunnel untuk Evolution API
cloudflared tunnel --url http://localhost:8080
```

---

## Konfigurasi Environment

### Variabel yang Wajib Diisi (`.env`)
```
ANTHROPIC_API_KEY=         # API key z.ai proxy
NOTION_API_KEY=            # Notion integration token
NOTION_DATABASE_ID=        # Master Backlog database ID
NOTION_MASTER_BACKLOG_ID=  # Sama dengan NOTION_DATABASE_ID
NOTION_MASTER_PROJECTS_ID= # Master Projects database ID
NOTION_DIVISIONS_ID=       # Divisions database ID
NOTION_MEMBERS_ID=         # Members database ID
EVOLUTION_API_KEY=         # API key untuk Evolution API
EVOLUTION_INSTANCE_NAME=   # Instance name (default: wa-bot)
```

### Variabel Opsional
```
PUBLIC_URL=                # URL public dari tunnel
ORCHESTRATOR_PORT=3000     # Port orchestrator
EVOLUTION_PORT=8080        # Port Evolution API
REDIS_PORT=6379            # Port Redis
POSTGRES_PASSWORD=         # Password Postgres
```

---

## Catatan Penting
- Quick Tunnel URL **berubah setiap restart** — tidak cocok untuk production
- Evolution API Manager UI hanya bisa diakses via `localhost:8080/manager` (tidak di-tunnel)
- Webhook URL harus di-update di Evolution API setiap kali URL tunnel berubah
- `docker compose logs -f` untuk lihat logs real-time

---

*Dokumen ini living document — update seiring progress project.*
