# Test Scenarios
## WhatsApp Service Gateway (WSG)

---

## 1. POC Validation Tests (Sprint 0)

### T-POC-001: WhatsApp API Connectivity
| Field | Detail |
|-------|--------|
| **Objective** | Verify WhatsApp Business API can send & receive messages |
| **Preconditions** | WhatsApp Business API account active, webhook URL configured |
| **Priority** | Critical |

**Steps:**
1. Send a test message from personal WhatsApp to business number
2. Verify webhook receives the message payload
3. Parse sender phone number and message content
4. Send a response message back to the sender
5. Verify the response appears in sender's WhatsApp

**Expected Result:** Message sent & received within 10 seconds, webhook payload correctly parsed

**Go/No-Go:** PASS = proceed. FAIL = fix WhatsApp setup before continuing.

---

### T-POC-002: Claude SDK Intent Classification
| Field | Detail |
|-------|--------|
| **Objective** | Verify Claude SDK can classify intents with > 80% accuracy |
| **Preconditions** | Claude API key active, SDK installed |
| **Priority** | Critical |

**Test Messages:**

| # | Message | Expected Intent | Expected Confidence |
|---|---------|----------------|-------------------|
| 1 | "Cek nilai semester kemarin" | info_akademik | > 0.85 |
| 2 | "Jadwal kuliah hari ini" | info_akademik | > 0.85 |
| 3 | "Wifi di gedung A mati" | buat_ticket | > 0.80 |
| 4 | "Saya mau buat tiket" | buat_ticket | > 0.85 |
| 5 | "Status tiket TK-001" | cek_status | > 0.85 |
| 6 | "Tiket saya sudah selesai belum" | cek_status | > 0.80 |
| 7 | "Halo, selamat pagi" | greeting | > 0.90 |
| 8 | "Bantuan dong" | help | > 0.85 |
| 9 | "KRS saya berapa SKS?" | info_akademik | > 0.80 |
| 10 | "Print error di lab 3" | buat_ticket | > 0.80 |
| 11 | "Gimana cara daftar ulang?" | help | > 0.75 |
| 12 | "Kampus punya layanan apa aja?" | help | > 0.80 |
| 13 | "Data profil saya" | info_akademik | > 0.85 |
| 14 | "AC di ruang 201 bocor" | buat_ticket | > 0.80 |
| 15 | "Ada update tiket TK-005?" | cek_status | > 0.80 |
| 16 | "Terima kasih" | greeting | > 0.85 |
| 17 | "Laptop saya bluescreen" | buat_ticket | > 0.80 |
| 18 | "IPK saya berapa" | info_akademik | > 0.85 |
| 19 | "Email kampus error" | buat_ticket | > 0.80 |
| 20 | "Siapa kamu?" | greeting | > 0.90 |

**Expected Result:** > 16/20 correct (80%) with average confidence > 0.80

---

### T-POC-003: Mock MCP Execution
| Field | Detail |
|-------|--------|
| **Objective** | Verify MCP pattern works with mock data |
| **Preconditions** | MCP interface implemented, mock data loaded |
| **Priority** | Critical |

**Steps:**
1. Start mock MCP server
2. Send request: `{ action: "get_grades", params: { nim: "2024001001" } }`
3. Verify response follows standard MCP response format
4. Verify response data matches mock data
5. Send request with invalid action
6. Verify error response format
7. Check response time < 1 second

**Expected Result:** All responses follow standard format, correct data returned, < 1s response time

---

### T-POC-004: End-to-End Flow
| Field | Detail |
|-------|--------|
| **Objective** | Verify full flow: WhatsApp → AI → MCP → Response |
| **Preconditions** | All POC components running |
| **Priority** | Critical |

**Steps:**
1. Send "Cek nilai saya" via WhatsApp
2. Verify webhook receives message
3. Verify AI classifies as info_akademik
4. Verify controller routes to MCP Akademik
5. Verify MCP returns mock grades data
6. Verify response sent back to WhatsApp
7. Verify total response time < 10 seconds

**Expected Result:** Full flow completes in < 10 seconds with correct response

---

## 2. Unit Test Scenarios

### T-UNIT-001: Webhook Signature Verification
| Field | Detail |
|-------|--------|
| **Objective** | Ensure only valid WhatsApp messages are processed |
| **Priority** | High |

| Case | Input | Expected |
|------|-------|----------|
| Valid signature | Correct X-Hub-Signature-256 | 200 OK, message processed |
| Invalid signature | Tampered signature | 401 Unauthorized |
| Missing signature | No X-Hub-Signature-256 header | 401 Unauthorized |

---

### T-UNIT-002: Intent Classifier
| Case | Input | Expected Intent | Expected Confidence |
|------|-------|----------------|-------------------|
| Academic query | "nilai saya" | info_akademik | > 0.8 |
| Ticket request | "wifi error" | buat_ticket | > 0.8 |
| Status check | "status TK-001" | cek_status | > 0.8 |
| Greeting | "halo" | greeting | > 0.9 |
| Help request | "bantuan" | help | > 0.85 |
| Unknown input | "xyz abc 123" | unknown | < 0.5 |
| Empty message | "" | unknown | < 0.3 |

---

### T-UNIT-003: MCP Router
| Case | Intent | Expected MCP |
|------|--------|-------------|
| info_akademik | "info_akademik" | mcp_akademik |
| buat_ticket (IT) | "buat_ticket" | mcp_it_support |
| cek_status | "cek_status" | mcp_it_support |
| Unknown intent | "unknown" | no MCP, fallback response |

---

### T-UNIT-004: Response Formatter
| Case | Input Data | Expected Format |
|------|-----------|----------------|
| Grades list | Array of grades | Formatted list with bold headers |
| Single ticket | Ticket object | Ticket ID, status, date |
| Error message | Error object | Friendly error + suggestion |
| Long response | 10+ items | Paginated or summarized |

---

### T-UNIT-005: Session Manager
| Case | Input | Expected Behavior |
|------|-------|------------------|
| New session | New phone number | Create session, set state = active |
| Existing session | Known phone number | Load existing session |
| Expired session | Last activity > 24h | Create new session |
| Clear session | User sends "batal" | Clear context, keep session |

---

## 3. Integration Test Scenarios

### T-INT-001: WhatsApp ↔ Webhook
**Steps:**
1. Send message via WhatsApp API
2. Verify webhook receives POST request
3. Verify message payload is correct
4. Send 200 OK response
5. Verify WhatsApp API confirms delivery

---

### T-INT-002: Webhook ↔ AI Layer
**Steps:**
1. Push message to processing queue
2. Worker picks up message
3. Sends to AI Layer for classification
4. AI returns intent + entities
5. Verify queue processing is correct

---

### T-INT-003: AI Layer ↔ MCP Orchestrator
**Steps:**
1. AI returns intent: info_akademik
2. Controller looks up MCP in Registry
3. Controller sends execute request to MCP
4. MCP returns data
5. Controller builds response

---

### T-INT-004: MCP ↔ External System (Mock)
**Steps:**
1. MCP receives execute request
2. MCP calls external system adapter
3. Adapter makes API call to mock server
4. Mock server returns data
5. MCP transforms and returns response

---

### T-INT-005: Full Pipeline Integration
**Steps:**
1. Send "Cek nilai saya" via WhatsApp mock
2. Verify full flow through all components
3. Verify response arrives in WhatsApp mock
4. Check all logs and traces
5. Verify database records created (message, session)

---

## 4. End-to-End Test Scenarios

### T-E2E-001: Happy Path — Academic Query
```
User: "Cek nilai semester kemarin"
Expected System Flow:
  → Webhook receives message
  → AI classifies: intent = info_akademik, entity = {action: cek_nilai, semester: latest}
  → Route to MCP Akademik
  → MCP calls SIAKAD API
  → Data transformed to WhatsApp format
  → Response sent
Expected Response: List of courses with grades + IPS/IPK
Expected Time: < 5 seconds
```

---

### T-E2E-002: Happy Path — Create Ticket
```
User: "Wifi di gedung A lantai 3 mati sejak pagi"
Expected System Flow:
  → AI classifies: intent = buat_ticket, entity = {category: IT, desc: "wifi mati gedung A lt3"}
  → Route to MCP IT Support
  → Ticket created: TK-20260422-001
  → Confirmation sent
Expected Response: "Ticket TK-20260422-001 berhasil dibuat. Kategori: IT Support. Estimasi response: 2 jam."
Expected Time: < 5 seconds
```

---

### T-E2E-003: Happy Path — Check Ticket Status
```
User: "Status tiket TK-001"
Expected System Flow:
  → AI classifies: intent = cek_status, entity = {ticket_id: "TK-001"}
  → Route to MCP IT Support
  → Ticket status retrieved
  → Response formatted
Expected Response: Ticket status, assigned agent, last update
Expected Time: < 3 seconds
```

---

### T-E2E-004: Error Path — System Unavailable
```
User: "Cek nilai saya"
Expected System Flow:
  → AI classifies: info_akademik
  → Route to MCP Akademik
  → MCP calls SIAKAD → SIAKAD returns timeout/error
  → Error handler catches
  → Fallback response sent
Expected Response: "Maaf, sistem akademik sedang tidak tersedia. Silakan coba lagi dalam 5 menit atau hubungi helpdesk."
Expected Time: < 5 seconds (including timeout)
```

---

### T-E2E-005: Error Path — Unrecognized Intent
```
User: "Beli nasi goreng dong"
Expected System Flow:
  → AI classifies: unknown (confidence < 0.7)
  → Fallback handler activates
  → Help menu sent
Expected Response: "Maaf, saya tidak mengerti permintaan Anda. Berikut layanan yang tersedia:\n1. Info Akademik\n2. Buat Ticket\n3. Cek Status Ticket\nKetik angka atau deskripsikan kebutuhan Anda."
Expected Time: < 3 seconds
```

---

### T-E2E-006: Edge Case — Rapid Messages
```
User sends 5 messages in quick succession (< 1 second apart)
Expected System Flow:
  → All messages queued
  → Processed sequentially
  → Rate limiter kicks in after 5th message
  → Subsequent messages queued for later
Expected: First message processed normally, later messages queued/throttled
```

---

### T-E2E-007: Edge Case — Very Long Message
```
User sends a 2000-word essay about their problem
Expected System Flow:
  → AI processes the full text
  → Extracts relevant intent and entities
  → Responds appropriately (doesn't repeat the long text)
Expected: Succinct response based on the key intent extracted
```

---

## 5. Performance Test Scenarios

### T-PERF-001: Load Test — 100 Concurrent Users
| Parameter | Value |
|-----------|-------|
| Concurrent users | 100 |
| Messages per user | 5 |
| Ramp-up time | 60 seconds |
| Duration | 10 minutes |

**Metrics to Collect:**
- Average response time
- 95th percentile response time
- Error rate
- Throughput (messages/second)
- CPU/memory usage

**Pass Criteria:**
- 95th percentile response time < 5 seconds
- Error rate < 1%
- No crashes or memory leaks

---

### T-PERF-002: Sustained Load Test
| Parameter | Value |
|-----------|-------|
| Users | 50 |
| Duration | 1 hour |
| Message interval | 30 seconds per user |

**Pass Criteria:** No degradation over time, memory usage stable

---

## 6. Security Test Scenarios

### T-SEC-001: Authentication Validation
| Case | Input | Expected |
|------|-------|----------|
| Unregistered phone | Unknown phone number | Prompt for verification |
| Verified user | Known phone number | Access granted |
| Impersonation attempt | Different NIM than registered | Access denied |

### T-SEC-002: Input Sanitization
| Case | Input | Expected |
|------|-------|----------|
| SQL injection attempt | "'; DROP TABLE users;--" | Sanitized, no SQL execution |
| XSS attempt | "<script>alert('xss')</script>" | Escaped, no script execution |
| Command injection | "$(rm -rf /)" | Sanitized, no command execution |

### T-SEC-003: Rate Limiting
| Case | Input | Expected |
|------|-------|----------|
| Normal usage | 10 messages/minute | All processed |
| Excessive usage | 50 messages/minute | Rate limited after threshold |
| Burst | 30 messages in 1 second | Queued and throttled |

### T-SEC-004: Data Privacy
| Case | Scenario | Expected |
|------|----------|----------|
| Cross-user data | User A asks for User B's grades | Access denied |
| Sensitive data | Response contains PII | Properly masked/anonymized in logs |
| Data retention | Check message logs | Data older than policy is purged |

---

## Test Execution Plan

### Sprint 0: POC Tests
- [ ] T-POC-001: WhatsApp Connectivity
- [ ] T-POC-002: Claude Intent Classification
- [ ] T-POC-003: Mock MCP Execution
- [ ] T-POC-004: End-to-End Flow

### Sprint 1: Unit Tests
- [ ] T-UNIT-001 through T-UNIT-005

### Sprint 2: Integration + E2E
- [ ] T-INT-001 through T-INT-005
- [ ] T-E2E-001 through T-E2E-007

### Sprint 3: Performance + Security
- [ ] T-PERF-001, T-PERF-002
- [ ] T-SEC-001 through T-SEC-004
- [ ] Bug fixes re-test

---

*Update status setiap test execution. Mark PASS/FAIL dan catat actual results.*
