# User Stories & Backlog
## WhatsApp Service Gateway (WSG)

---

## Epic 1: WhatsApp Integration

### US-001: Receive WhatsApp Message
**As a** user,
**I want to** send a message via WhatsApp to the service number,
**So that** I can access campus services through a familiar channel.

**Acceptance Criteria:**
- Given a user sends a text message, When the webhook receives it, Then the message content, sender phone number, and timestamp are extracted
- Given the webhook receives a message, When the signature is verified, Then the message is pushed to the processing queue
- Given an invalid signature, When the webhook receives it, Then the request is rejected with 401

**Priority**: Must | **Points**: 5 | **Dependencies**: WhatsApp Business API setup

---

### US-002: Send WhatsApp Response
**As a** user,
**I want to** receive a response message in WhatsApp,
**So that** I get the information I requested.

**Acceptance Criteria:**
- Given a response is ready, When the system sends it, Then the user receives the message within 5 seconds
- Given a response exceeds WhatsApp text limit, When formatted, Then the message is split into multiple messages
- Given the WhatsApp API is down, When send fails, Then the system retries 3 times with exponential backoff

**Priority**: Must | **Points**: 5 | **Dependencies**: US-001

---

### US-003: Handle Quick Replies & Buttons
**As a** user,
**I want to** use quick reply buttons to select options,
**So that** I don't have to type full messages.

**Acceptance Criteria:**
- Given the system sends options, When formatted for WhatsApp, Then interactive buttons are displayed
- Given a user taps a button, When the response arrives, Then the system treats it as a text message with the button value

**Priority**: Should | **Points**: 3 | **Dependencies**: US-001, US-002

---

## Epic 2: AI Intent Processing

### US-010: Classify User Intent
**As a** system,
**I want to** classify the intent of user messages using AI,
**So that** I can route the request to the correct service.

**Acceptance Criteria:**
- Given "cek nilai semester kemarin", When classified, Then intent = `info_akademik` with confidence > 0.85
- Given "wifi saya tidak bisa connect", When classified, Then intent = `buat_ticket` with category = `IT`
- Given "halo", When classified, Then intent = `greeting`
- Given an ambiguous message with confidence < 0.7, When classified, Then system asks for clarification

**Priority**: Must | **Points**: 8 | **Dependencies**: Claude SDK setup

---

### US-011: Extract Entities from Message
**As a** system,
**I want to** extract relevant entities from user messages,
**So that** I can pass structured data to the MCP.

**Acceptance Criteria:**
- Given "cek nilai semester 2 tahun ini", When extracted, Then entities = { action: "cek_nilai", semester: "2" }
- Given "tiket saya TK-001 sudah selesai belum", When extracted, Then entities = { ticket_id: "TK-001", action: "cek_status" }
- Given no entities found, When extracted, Then system prompts user for more information

**Priority**: Must | **Points**: 5 | **Dependencies**: US-010

---

### US-012: Generate Natural Response
**As a** user,
**I want to** receive responses in natural, friendly language,
**So that** the interaction feels human-like.

**Acceptance Criteria:**
- Given MCP returns raw data, When response is generated, Then it's formatted in friendly Bahasa Indonesia
- Given an error occurs, When response is generated, Then the error message is helpful and suggests next steps
- Given the response contains multiple data points, When formatted, Then it uses WhatsApp formatting (bold, lists)

**Priority**: Must | **Points**: 5 | **Dependencies**: US-010, US-011

---

## Epic 3: MCP Framework

### US-020: MCP Module Registration
**As a** developer,
**I want to** register a new MCP module to the system,
**So that** it becomes available for routing.

**Acceptance Criteria:**
- Given a new MCP is started, When it calls register, Then it appears in the MCP Registry
- Given the MCP health check fails, When monitored, Then it's marked as unhealthy and not routed to
- Given a MCP is deregistered, When it shuts down, Then it's removed from the Registry

**Priority**: Must | **Points**: 5 | **Dependencies**: Database setup

---

### US-021: MCP Standard Interface
**As a** developer,
**I want to** implement a standard interface for my MCP,
**So that** it works seamlessly with the orchestrator.

**Acceptance Criteria:**
- Given the interface is implemented, When the MCP starts, Then all required endpoints are available
- Given a request comes in standard format, When processed, Then the response follows the standard MCP response schema
- Given invalid parameters, When processed, Then the response includes a standard error code

**Priority**: Must | **Points**: 5 | **Dependencies**: MCP interface design

---

### US-022: MCP Health Monitoring
**As a** admin,
**I want to** see the health status of all MCP modules,
**So that** I can identify and fix issues quickly.

**Acceptance Criteria:**
- Given MCPs are running, When health check runs, Then each MCP returns healthy/degraded/unhealthy status
- Given an MCP becomes unhealthy, When detected, Then an alert is triggered
- Given the health endpoint is called, Then it returns response time and dependency status

**Priority**: Should | **Points**: 3 | **Dependencies**: US-020

---

## Epic 4: Layanan Akademik

### US-030: Query Student Profile
**As a** mahasiswa,
**I want to** check my academic profile via WhatsApp,
**So that** I can quickly verify my student data.

**Acceptance Criteria:**
- Given user sends "siapa data saya" or "profil saya", When processed, Then the response shows: Nama, NIM, Jurusan, Semester, Status
- Given user is not authenticated, When requesting profile, Then the system prompts for NIM verification
- Given NIM is not found, When processed, Then response says "Data mahasiswa tidak ditemukan"

**Priority**: Must | **Points**: 3 | **Dependencies**: MCP Akademik, US-011

---

### US-031: Query Grades/Nilai
**As a** mahasiswa,
**I want to** check my grades via WhatsApp,
**So that** I don't need to login to SIAKAD.

**Acceptance Criteria:**
- Given user sends "cek nilai" or "nilai semester kemarin", When processed, Then response shows list of courses with grades and IPS/IPK
- Given user specifies a semester, When processed, Then only that semester's grades are shown
- Given no semester specified, When processed, Then the latest semester grades are shown
- Given grades data is unavailable, When processed, Then response says "Data nilai belum tersedia"

**Priority**: Must | **Points**: 5 | **Dependencies**: MCP Akademik, US-011

---

### US-032: Query Class Schedule
**As a** mahasiswa,
**I want to** check my class schedule via WhatsApp,
**So that** I can quickly know my upcoming classes.

**Acceptance Criteria:**
- Given user sends "jadwal kuliah" or "jadwal besok", When processed, Then response shows schedule with day, time, course, room
- Given user asks for "jadwal hari ini", When processed, Then only today's classes are shown
- Given no classes scheduled, When processed, Then response says "Tidak ada jadwal hari ini"

**Priority**: Must | **Points**: 5 | **Dependencies**: MCP Akademik, US-011

---

### US-033: Query KRS Data
**As a** mahasiswa,
**I want to** check my KRS via WhatsApp,
**So that** I can verify my enrolled courses.

**Acceptance Criteria:**
- Given user sends "KRS saya" or "matakuliah semester ini", When processed, Then response shows list of enrolled courses with SKS
- Given KRS is not yet approved, When processed, Then response shows "KRS belum disetujui"
- Given total SKS, When shown, Then display total SKS taken vs max SKS

**Priority**: Should | **Points**: 3 | **Dependencies**: MCP Akademik, US-011

---

## Epic 5: Ticket System

### US-040: Create New Ticket
**As a** user,
**I want to** create a support ticket via WhatsApp chat,
**So that** I can report an issue without switching apps.

**Acceptance Criteria:**
- Given user sends "wifi mati di gedung A", When processed, Then a ticket is created with auto-generated ID (e.g., TK-20260422-001)
- Given ticket is created, When confirmed, Then user receives: ticket ID, category, estimated response time
- Given user provides incomplete info, When processed, Then system asks follow-up questions
- Given ticket system is down, When processed, Then user gets a fallback message to contact helpdesk directly

**Priority**: Must | **Points**: 8 | **Dependencies**: MCP IT Support, US-010

---

### US-041: Check Ticket Status
**As a** user,
**I want to** check the status of my ticket via WhatsApp,
**So that** I know the progress without calling helpdesk.

**Acceptance Criteria:**
- Given user sends "status ticket TK-001", When processed, Then response shows: status, assigned to, last update, estimated resolution
- Given ticket is not found, When processed, Then response says "Ticket tidak ditemukan"
- Given ticket belongs to another user, When processed, Then response says "Anda tidak memiliki akses ke ticket ini"

**Priority**: Must | **Points**: 5 | **Dependencies**: MCP IT Support, US-040

---

### US-042: List My Tickets
**As a** user,
**I want to** see all my active tickets,
**So that** I can track multiple requests at once.

**Acceptance Criteria:**
- Given user sends "tiket saya" or "daftar tiket", When processed, Then response shows list of all open tickets with status
- Given no active tickets, When processed, Then response says "Tidak ada ticket aktif"
- Given tickets are displayed, When formatted, Then each shows: ID, title, status, date

**Priority**: Should | **Points**: 3 | **Dependencies**: MCP IT Support, US-040

---

## Epic 6: User Authentication

### US-050: User Registration/Verification
**As a** new user,
**I want to** verify my identity via WhatsApp,
**So that** I can access personalized services.

**Acceptance Criteria:**
- Given first-time user sends a message, When processed, Then system asks for NIM/Employee ID
- Given valid NIM is provided, When verified against database, Then phone number is linked to the user
- Given invalid NIM, When verified, Then system says "NIM tidak ditemukan" and offers to try again
- Given already verified user, When sending a message, Then no re-verification needed

**Priority**: Must | **Points**: 5 | **Dependencies**: User database

---

### US-051: Session Management
**As a** system,
**I want to** maintain user sessions,
**So that** multi-turn conversations work correctly.

**Acceptance Criteria:**
- Given a user starts a conversation, When session is created, Then it persists for 24 hours
- Given a user sends a follow-up message within session, When processed, Then context from previous messages is available
- Given session expires after 24h, When user sends a new message, Then a new session is created
- Given user sends "batal" or "menu", When processed, Then current context is cleared

**Priority**: Should | **Points**: 5 | **Dependencies**: Redis setup

---

## Backlog Summary

### By Priority

| Priority | Count | Total Points |
|----------|-------|-------------|
| **Must** | 14 stories | 77 pts |
| **Should** | 7 stories | 27 pts |
| **Total** | 21 stories | 104 pts |

### By Epic

| Epic | Stories | Points |
|------|---------|--------|
| E1: WhatsApp Integration | 3 | 13 |
| E2: AI Intent Processing | 3 | 18 |
| E3: MCP Framework | 3 | 13 |
| E4: Layanan Akademik | 4 | 16 |
| E5: Ticket System | 3 | 16 |
| E6: User Authentication | 2 | 10 |
| **Total** | **18** | **86** |

### Sprint Allocation

| Sprint | Stories | Points |
|--------|---------|--------|
| Sprint 0 (POC) | US-001, US-010, US-020 | 18 |
| Sprint 1 | US-001, US-002, US-010, US-011, US-012, US-020, US-021 | 36 |
| Sprint 2 | US-030, US-031, US-032, US-033, US-040, US-041 | 29 |
| Sprint 3 | US-003, US-022, US-042, US-050, US-051 + QA/Polish | 23 + QA |

---

*Backlog ini akan di-refine setiap sprint planning session.*
