# Progress Log — SmartProductDiscoveryAISystem

> Catatan lengkap semua yang sudah dilakukan dan yang masih harus dilakukan.
> Terakhir diupdate: 2026-05-06

---

## Status Saat Ini: ONLINE (Quick Tunnel)

| Service | URL |
|---------|-----|
| Bot (Public) | `https://raise-disposition-whether-sing.trycloudflare.com` |
| Health Check | `https://raise-disposition-whether-sing.trycloudflare.com/health` |
| Evolution API (Local) | `http://localhost:8080` |
| Manager UI (Local) | `http://localhost:8080/manager` |

---

## Yang Sudah Dilakukan

### 1. Audit Cacat (2026-05-05)

Ditemukan **22 cacat** di codebase whatsapp-gateway. Ringkasan per severity:

#### KRITIS (3)
| # | Issue | File |
|---|-------|------|
| 1.1 | API keys ter-expose di `.env` yang mungkin ter-commit | `whatsapp-gateway/.env:6-17` |
| 1.2 | Evolution API key hardcoded di docker-compose | `docker-compose.yml:51` (sudah difix) |
| 1.4 | Webhook signature verification palsu (selalu return true) | `notion-api-core.ts:596-606` |

#### TINGGI (3)
| # | Issue | File |
|---|-------|------|
| 1.5 | Tidak ada webhook auth dari Evolution API | `handler.ts:107-109` |
| 2.1 | `pushName` digunakan sebelum didefinisikan di image handler | `handler.ts:141-143` |
| 2.2 | `!backlog restore` tidak bisa menemukan archived item (Notion default exclude archived) | `notion-org-service.ts:469-474` |
| 2.3 | `normalizeDepartment` return "Ristek" tapi Notion pakai "Research and Technology" | `helpers.ts:16-36` |

#### SEDANG (5)
| # | Issue | File |
|---|-------|------|
| 2.5 | `resolveNickname` bisa false positive (partial match) | `notion-org-service.ts:262-264` |
| 2.6 | Ticket ID collision risk (hanya 3 digit milidetik) | `helpers.ts:6-11` |
| 3.1-3.4 | Memory leak: Maps tanpa max size (rateLimitMap, pendingTickets, apiCache, relationCache) | multiple files |
| 5.1-5.3 | Tidak ada timeout pada semua HTTP fetch (Anthropic, Notion, Evolution) | multiple files |
| 5.4 | `addCasualTouch` bisa double-wrap pada pending ticket resolution | `agent.ts:536` |

#### RENDAH (6)
| # | Issue | File |
|---|-------|------|
| 4.1 | `ioredis` di dependency tapi tidak dipakai | `package.json:19` |
| 4.2 | `@anthropic-ai/sdk` di dependency tapi tidak dipakai | `package.json:15` |
| 4.3 | MCP client dead code (tidak pernah dipanggil) | `mcp/notion-client.ts` |
| 4.4 | `CASUAL_ERROR_PROMPT` didefinisikan tapi tidak dipakai | `prompts.ts:387-397` |
| 4.5 | `SYSTEM_PROMPT` didefinisikan tapi tidak dipakai | `prompts.ts:3` |
| 6.2 | Helper functions duplikat di 3 file (extractTitle, extractStatus, extractPriority) | multiple files |
| 7.1 | Dockerfile tidak multi-stage (typescript di production) | `Dockerfile:9` |
| 7.2 | `qrcode.png` ada di repo root | `/qrcode.png` |

---

### 2. Setup Cloudflare Tunnel (2026-05-06)

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

## Yang Masih Harus Dilakukan

### Prioritas 1 — Bug Kritis
- [ ] Fix webhook signature verification di `notion-api-core.ts` (implementasi HMAC-SHA256 yang bener)
- [ ] Fix `pushName` undefined di image handler (`handler.ts:141-143`)
- [ ] Fix `!backlog restore` tidak bisa nemu archived items
- [ ] Fix `normalizeDepartment` return nama yang salah

### Prioritas 2 — Keamanan
- [ ] Tambah webhook authentication untuk Evolution API endpoint
- [ ] Pastikan `.env` ada di `.gitignore` dan tidak ter-commit (sudah ada, tapi verify)
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
