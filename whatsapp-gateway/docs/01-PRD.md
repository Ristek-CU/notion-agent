# Product Requirements Document (PRD)
## WhatsApp Service Gateway (WSG)

| Field | Detail |
|-------|--------|
| **Product** | WhatsApp Service Gateway |
| **Version** | 0.1.0 |
| **Author** | PM Team |
| **Status** | Draft — Prototyping Phase |
| **Date** | 2026-04-22 |

---

## 1. Background & Context

### 1.1 Situasi Saat Ini
Institusi pendidikan (kampus) memiliki berbagai sistem layanan yang beroperasi secara terpisah:
- Sistem Akademik (SIAKAD) — nilai, jadwal, KRS
- Sistem Admisi (PMB) — pendaftaran, status seleksi
- Sistem Inventory — pengadaan barang, stock
- Sistem IT Support — ticket troubleshooting
- Sistem Perpustakaan — pinjam/kembali buku

Setiap sistem memiliki:
- URL/login berbeda
- Interface berbeda
- Alur kerja berbeda
- Tim pengelola berbeda

### 1.2 Masalah Utama
1. User harus menghafal/mem-bookmark banyak sistem
2. Alur yang tidak intuitif menyebabkan banyak error dan pertanyaan ke helpdesk
3. Tidak ada tracking unified untuk semua request
4. Banyak proses yang repetitive dan bisa diotomasi
5. Respons terhadap request membutuhkan waktu berhari-hari

### 1.3 Peluang
- WhatsApp penetrasi > 90% di Indonesia
- User sudah terbiasa dengan chat-based interaction
- AI (LLM) sudah capable untuk memahami natural language dengan baik
- Arsitektur modular (MCP) memungkinkan scaling bertahap

## 2. Goals & Objectives

### 2.1 Goals
| ID | Goal | Success Measure | Target |
|----|------|----------------|--------|
| G1 | Memvalidasi konsep teknis | POC end-to-end berhasil | Phase 0 (2 minggu) |
| G2 | Menjalankan 1 layanan end-to-end | MCP Akademik live | Phase 1 (8 minggu) |
| G3 | Mengurangi waktu akses layanan | Dari hari ke menit | Phase 1 |
| G4 | Multi-layanan aktif | 3+ MCP modules live | Phase 2 |
| G5 | Platform stabil dan scalable | 99% uptime, <3s response | Phase 2 |

### 2.2 SMART Objectives (Phase 1 — MVP)
- **Specific**: Build WhatsApp chatbot yang bisa menjawab pertanyaan akademik dan membuat ticket IT support
- **Measurable**: 85% intent accuracy, <5s response time, 70% test coverage
- **Achievable**: 1 tim kecil (2-3 developer), 8 minggu, menggunakan stack yang familiar
- **Relevant**: Menyelesaikan pain point #1 (sistem tersebar) dan #2 (UX kompleks)
- **Time-bound**: 8 minggu dari kick-off

## 3. Target Users

### 3.1 Primary Users

**Persona 1: Mahasiswa Aktif**
- **Demografis**: Umur 18-25, gen Z, mobile-native
- **Kebutuhan**: Cek nilai, jadwal, status SKS, buat surat keterangan
- **Pain point**: Harus buka SIAKAD yang sering down, UI confusing
- **Expectation**: Quick answer via chat, <30 detik

**Persona 2: Staf Administrasi**
- **Demografis**: Umur 25-45, moderate tech skill
- **Kebutuhan**: Tracking request, cek status pengajuan, monitoring
- **Pain point**: Follow-up manual via email/telepon, data tersebar
- **Expectation**: Status real-time, notifikasi otomatis

**Persona 3: Admin IT**
- **Demografis**: Umur 25-40, tech-savvy
- **Kebutuhan**: Monitor sistem, handle ticket, configure services
- **Pain point**: Banyak repetitive tickets, troubleshooting manual
- **Expectation**: Automation, quick ticket routing, dashboard

### 3.2 Secondary Users (Future)
- Calon mahasiswa (cek info admisi)
- Pihak instansi eksternal
- Vendor/supplier

## 4. Epics & User Stories (High Level)

### Epic 1: WhatsApp Integration
> Sebagai user, saya bisa berinteraksi dengan sistem melalui WhatsApp

### Epic 2: AI Intent Processing
> Sebagai sistem, AI dapat memahami maksud user dan merouting ke layanan yang tepat

### Epic 3: MCP Framework
> Sebagai developer, saya bisa menambah layanan baru secara modular

### Epic 4: Layanan Akademik
> Sebagai mahasiswa, saya bisa cek info akademik via chat

### Epic 5: Ticket System
> Sebagai user, saya bisa membuat dan melacak ticket via chat

### Epic 6: Admin & Monitoring
> Sebagai admin, saya bisa monitor dan mengelola sistem

*(Detail user stories ada di `05-USER-STORIES.md`)*

## 5. Functional Requirements

### 5.1 P0 — Must Have (MVP)

#### FR-001: WhatsApp Message Receiver
- Sistem menerima pesan masuk dari WhatsApp
- Support text message dan quick reply
- Handle message timestamp dan sender info

#### FR-002: AI Intent Classification
- Klasifikasi intent dari pesan user
- Minimum 5 intent: `info_akademik`, `buat_ticket`, `cek_status`, `help`, `greeting`
- Confidence score threshold: 0.7
- Fallback ke human agent jika confidence < 0.7

#### FR-003: MCP Routing
- Route request ke MCP yang sesuai berdasarkan intent
- Support single MCP execution
- Error handling jika MCP tidak tersedia

#### FR-004: MCP Akademik
- Query informasi mahasiswa (nama, NIM, jurusan)
- Query jadwal kuliah
- Query nilai/KHS
- Query status KRS

#### FR-005: Ticket Creation
- Buat ticket baru via chat
- Auto-categorize berdasarkan intent
- Generate ticket ID
- Kirim konfirmasi ke user

#### FR-006: Ticket Status Check
- Cek status ticket berdasarkan ticket ID
- Informasi: status, assignee, estimasi selesai

#### FR-007: Response Formatting
- Format response untuk WhatsApp (text, list, buttons)
- Bahasa Indonesia
- Friendly dan helpful tone

### 5.2 P1 — Should Have (Phase 2)

#### FR-008: Multi-turn Conversation
- Handle percakapan yang butuh >1 message
- Context preservation antar message
- Clarification questions jika intent ambiguous

#### FR-009: MCP Admisi
- Cek status pendaftaran
- Info persyaratan
- Timeline seleksi

#### FR-010: MCP Inventory
- Cek stock barang
- Request pengadaan
- Status pengadaan

#### FR-011: MCP IT Support
- Buat ticket IT
- Knowledge base search
- FAQ auto-response

#### FR-012: Notification
- Push notification untuk status update
- Reminder untuk deadline
- Broadcast announcement

### 5.3 P2 — Could Have (Phase 3)

#### FR-013: Multi-instansi Integration
- Gateway ke layanan instansi eksternal
- Standardized API per instansi

#### FR-014: Analytics Dashboard
- Usage statistics
- Intent distribution
- Response time monitoring
- User satisfaction tracking

#### FR-015: Multi-organization Support
- Tenant isolation
- Organization-specific MCP configuration
- Custom branding

## 6. Non-Functional Requirements

### 6.1 Performance
| Metric | Requirement |
|--------|-------------|
| Response time | < 5 detik (95th percentile) |
| Throughput | 100 concurrent users |
| Uptime | 99.5% |

### 6.2 Security
| Aspect | Requirement |
|--------|-------------|
| Authentication | User verification via phone number + NIM/Employee ID |
| Data encryption | TLS 1.3 untuk transit, AES-256 untuk rest |
| Rate limiting | Max 30 messages/minute per user |
| Audit trail | Log semua akses dan perubahan data |
| Data retention | Sesuai kebijakan institusi |

### 6.3 Reliability
| Aspect | Requirement |
|--------|-------------|
| Error handling | Graceful degradation, never crash |
| Retry logic | Max 3 retries dengan exponential backoff |
| Dead letter queue | Handle unprocessable messages |
| Health check | Monitoring endpoint untuk setiap MCP |

### 6.4 Maintainability
| Aspect | Requirement |
|--------|-------------|
| Code coverage | > 70% |
| Documentation | API docs, architecture docs, runbooks |
| Modular | Setiap MCP independen, bisa di-deploy terpisah |
| Configuration | Environment-based, no hardcoded values |

## 7. MVP Scope Definition

### In Scope (Phase 1)
- WhatsApp message receive & respond
- AI intent classification (5 intents)
- 1 MCP module (Akademik)
- Ticket creation & status check
- Basic error handling
- Basic logging

### Out of Scope (Phase 1)
- Multi-turn conversation (complex)
- Payment/transaction processing
- Multi-instansi integration
- Admin dashboard
- Image/file processing
- Voice message handling
- Multi-language (English)
- Push notifications
- Rate limiting (advanced)

## 8. Dependencies & Assumptions

### 8.1 Dependencies
| Dependency | Type | Status |
|-----------|------|--------|
| WhatsApp Business API access | External | Perlu setup |
| Claude API key | External | Perlu setup |
| Sistem Akademik API access | External | Perlu koordinasi |
| Server/infrastructure | Internal | Perlu provisioning |
| Phone number for WhatsApp | External | Perlu setup |

### 8.2 Assumptions
1. WhatsApp Business API tersedia dan bisa diakses
2. Sistem Akademik memiliki API yang bisa dikonsumsi (atau bisa dibuat mock)
3. Claude API cukup akurat untuk intent classification
4. User memiliki WhatsApp aktif
5. Institusi mendukung digitalisasi layanan

## 9. Testing-First Approach

> **Prinsip**: Validasi dulu, bangun kemudian. Prototype sebelum production.

### 9.1 Testing Strategy

```
Phase 0: POC Validation (Week 1-2)
  +--> Test WhatsApp API connectivity ✓/✗
  +--> Test Claude SDK intent accuracy ✓/✗
  +--> Test MCP pattern (mock) ✓/✗
  +--> Decision Gate: Lanjut / Pivot / Stop

Phase 1: Development with Tests
  +--> Write test → Write code → Verify
  +--> Every feature has unit test
  +--> Integration test per component pair
  +--> E2E test for critical paths

Phase 2: Quality Assurance
  +--> Load testing
  +--> Security testing
  +--> UAT with real users
```

### 9.2 Validation Criteria (Go/No-Go)

| Criteria | Go Threshold | Measurement |
|----------|-------------|-------------|
| WhatsApp connectivity | Message sent & received | Manual test |
| AI accuracy | > 80% correct intent | 50 test messages |
| MCP pattern viable | Response < 3s | Mock test |
| End-to-end flow | Works with mock data | Scripted test |

### 9.3 Decision Points

- **POC Success** → Lanjut ke Phase 1 development
- **POC Partial** → Iterate pada komponen yang gagal, retry POC
- **POC Fail** → Pivot arsitektur atau stop project

---

*Dokumen ini akan diupdate seiring dengan hasil prototyping dan feedback dari stakeholder.*
