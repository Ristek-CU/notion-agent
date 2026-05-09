# Prototyping Guide — Testing-First Approach
## WhatsApp Service Gateway (WSG)

> **Prinsip**: Coba dulu, buktikan bisa, baru bangun beneran.

---

## Overview

Panduan ini memberikan step-by-step instructions untuk mem-validasi konsep WhatsApp Service Gateway sebelum membangun sistem production. Setiap phase punya **Go/No-Go criteria** yang jelas.

```
Phase 0.1: WhatsApp Sandbox (Day 1-2)
    ↓ Go?
Phase 0.2: AI Processing Prototype (Day 3-4)
    ↓ Go?
Phase 0.3: Mock MCP Prototype (Day 5-6)
    ↓ Go?
Phase 0.4: Integration POC (Day 7-10)
    ↓ Go?
Phase 0.5: Real System Connection (Day 11-14)
    ↓ Go? → Start Sprint 1 (Development)
```

---

## Phase 0.1: WhatsApp Sandbox (Day 1-2)

### Objective
Buktikan bahwa kita bisa menerima dan mengirim pesan melalui WhatsApp.

### Prerequisites
- [ ] Laptop/PC dengan internet
- [ ] Node.js 18+ terinstall
- [ ] WhatsApp account (personal, untuk testing)
- [ ] Twilio account (free trial) ATAU Meta Business account

### Option A: Using Twilio (Recommended for POC)

#### Step 1: Setup Twilio Account
```bash
# Install Twilio CLI
npm install -g twilio-cli

# Login
twilio login

# Get credentials from Twilio Console:
# Account SID: ACxxxx...
# Auth Token: xxxx...
# WhatsApp Number: +1 415 523 8886 (sandbox)
```

#### Step 2: Join WhatsApp Sandbox
```
1. Send "join <sandbox-code>" to +1 415 523 8886 via WhatsApp
2. You'll get confirmation: "You've joined the sandbox!"
3. Now you can send/receive messages with this number
```

#### Step 3: Simple Webhook Receiver
```bash
# Create project
mkdir wsg-poc && cd wsg-poc
npm init -y
npm install express twilio dotenv
```

```javascript
// server.js — Simple WhatsApp webhook
require('dotenv').config();
const express = require('express');
const { MessagingResponse } = require('twilio').twiml;

const app = express();
app.use(express.urlencoded({ extended: false }));

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const from = req.body.From;         // e.g., "whatsapp:+6281234567890"
  const body = req.body.Body;          // message text
  const profileName = req.body.ProfileName;

  console.log(`From: ${profileName} (${from})`);
  console.log(`Message: ${body}`);

  // Echo back
  const twiml = new MessagingResponse();
  twiml.message(`Halo ${profileName}! Pesan kamu: "${body}"`);

  res.type('text/xml').send(twiml.toString());
});

// Verification endpoint
app.get('/webhook', (req, res) => {
  res.status(200).send('Webhook is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
});
```

```bash
# .env file
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+14155238886
PORT=3000
```

#### Step 4: Expose Local Server
```bash
# Install ngrok
# https://ngrok.com/download

# Expose local server
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

#### Step 5: Configure Twilio Webhook
```
1. Go to Twilio Console → WhatsApp → Sandbox
2. Set "WHEN A MESSAGE COMES IN" to: https://abc123.ngrok.io/webhook
3. Save
```

#### Step 6: Test!
```
1. Send "Halo" to +1 415 523 8886 via WhatsApp
2. You should receive: "Halo [Nama]! Pesan kamu: "Halo""
3. Check terminal console for incoming message log
```

### Success Criteria
- [ ] Dapat mengirim pesan ke WhatsApp sandbox number
- [ ] Webhook menerima dan mem-parse pesan
- [ ] Dapat membalas pesan via WhatsApp
- [ ] Round-trip time < 10 detik

### Common Issues & Solutions
| Issue | Solution |
|-------|---------|
| Sandbox code not accepted | Make sure format is "join xxx-xxx" with the exact code |
| Webhook not receiving | Check ngrok is running, URL is correct in Twilio |
| No response received | Check server logs for errors |
| Rate limited | Twilio sandbox has 1 msg/sec limit |

### Decision Gate
- **GO**: WhatsApp send/receive works → Continue to Phase 0.2
- **NO-GO**: WhatsApp setup fails → Consider alternative (Telegram Bot for testing)

---

## Phase 0.2: AI Processing Prototype (Day 3-4)

### Objective
Buktikan Claude SDK bisa mengklasifikasi intent dengan akurat.

### Prerequisites
- [ ] Phase 0.1 passed
- [ ] Anthropic API key (https://console.anthropic.com)

#### Step 1: Install Claude SDK
```bash
cd wsg-poc
npm install @anthropic-ai/sdk
```

#### Step 2: Intent Classifier
```javascript
// ai-layer.js — Claude-based intent classifier
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Kamu adalah sistem klasifikasi intent untuk chatbot layanan kampus.
Analisis pesan user dan tentukan intent serta entities.

Available intents:
- info_akademik: query data akademik (nilai, jadwal, KRS, KHS, profil)
- buat_ticket: buat ticket/request bantuan (laporkan masalah)
- cek_status: cek status ticket/request yang sudah dibuat
- help: user butuh bantuan atau bertanya tentang layanan
- greeting: sapaan (halo, hai, terima kasih, dll)
- unknown: tidak bisa ditentukan

WAJIB response dalam JSON format:
{
  "intent": "nama_intent",
  "confidence": 0.0-1.0,
  "entities": {
    "action": "aksi_spesifik",
    "ticket_id": "jika_ada",
    "semester": "jika_ada",
    "category": "jika_ada",
    "description": "jika_ada"
  },
  "suggested_mcp": "mcp_yang_tepat",
  "clarification_needed": false,
  "clarification_question": "jika_perlu"
}

Contoh:
User: "Cek nilai semester kemarin"
Response: {"intent":"info_akademik","confidence":0.95,"entities":{"action":"cek_nilai","semester":"latest"},"suggested_mcp":"mcp_akademik","clarification_needed":false,"clarification_question":null}`;

async function classifyIntent(userMessage) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage }
    ]
  });

  try {
    const text = response.content[0].text;
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return { intent: 'unknown', confidence: 0, entities: {} };
  }
}

// Test
async function testClassification() {
  const testMessages = [
    "Cek nilai semester kemarin",
    "Wifi di gedung A mati",
    "Status tiket TK-001",
    "Halo selamat pagi",
    "Bantuan dong",
    "KRS saya berapa SKS",
    "Print error di lab 3",
    "Beli nasi goreng"
  ];

  for (const msg of testMessages) {
    const result = await classifyIntent(msg);
    console.log(`\n"${msg}"`);
    console.log(`  → Intent: ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`);
    console.log(`  → MCP: ${result.suggested_mcp}`);
    console.log(`  → Entities: ${JSON.stringify(result.entities)}`);
  }
}

testClassification();
```

```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-xxxx

# Run test
node ai-layer.js
```

#### Step 3: Test with 20 Messages
Use the test messages from `06-TEST-SCENARIOS.md` T-POC-002.

### Success Criteria
- [ ] AI mengklasifikasi > 80% intent dengan benar
- [ ] Response time < 3 detik per classification
- [ ] Entity extraction bekerja (NIM, ticket ID, semester, dll)
- [ ] Confidence score akurat

### Decision Gate
- **GO**: Accuracy > 80% → Continue to Phase 0.3
- **ITERATE**: Accuracy 60-80% → Improve system prompt, add more examples
- **NO-GO**: Accuracy < 60% → Consider alternative approach (keyword-based + AI hybrid)

---

## Phase 0.3: Mock MCP Prototype (Day 5-6)

### Objective
Buktikan MCP pattern bekerja dengan mock data.

#### Step 1: MCP Server Template
```javascript
// mcp-mock.js — Mock MCP Server
const express = require('express');
const app = express();
app.use(express.json());

// Mock data
const MOCK_DATA = {
  students: {
    "2024001001": {
      nim: "2024001001",
      name: "Budi Santoso",
      major: "Teknik Informatika",
      semester: 4,
      status: "Aktif",
      gpa: 3.54
    }
  },
  grades: {
    "2024001001": {
      "2025-2": [
        { code: "CS101", name: "Algoritma & Pemrograman", grade: "A", sks: 3 },
        { code: "CS102", name: "Basis Data", grade: "B+", sks: 3 },
        { code: "CS103", name: "Jaringan Komputer", grade: "A-", sks: 3 },
        { code: "MA101", name: "Kalkulus II", grade: "B", sks: 4 }
      ],
      ips: 3.50,
      ipk: 3.54
    }
  },
  schedule: {
    "2024001001": [
      { day: "Senin", time: "08:00-10:00", course: "CS101 - Algoritma", room: "Lab 1" },
      { day: "Selasa", time: "10:00-12:00", course: "CS102 - Basis Data", room: "R.204" },
      { day: "Rabu", time: "13:00-15:00", course: "CS103 - Jaringan", room: "Lab 3" }
    ]
  },
  tickets: []
};

// MCP Info
const MCP_INFO = {
  name: "mcp-akademik-mock",
  version: "0.1.0",
  description: "Mock MCP Akademik untuk POC"
};

// Execute endpoint
app.post('/execute', (req, res) => {
  const { action, params } = req.body;
  const startTime = Date.now();

  console.log(`[${MCP_INFO.name}] Execute: ${action}`, params);

  let result;
  switch (action) {
    case 'get_profile':
      result = handleGetProfile(params);
      break;
    case 'get_grades':
      result = handleGetGrades(params);
      break;
    case 'get_schedule':
      result = handleGetSchedule(params);
      break;
    case 'create_ticket':
      result = handleCreateTicket(params);
      break;
    case 'check_ticket':
      result = handleCheckTicket(params);
      break;
    default:
      result = { success: false, error: { code: 'UNKNOWN_ACTION', message: `Action "${action}" not found` } };
  }

  res.json({
    id: req.body.id || 'mock-001',
    ...result,
    metadata: {
      mcpName: MCP_INFO.name,
      action,
      executionTimeMs: Date.now() - startTime,
      cacheHit: false,
      sourceSystem: 'mock'
    }
  });
});

function handleGetProfile(params) {
  const student = MOCK_DATA.students[params.nim];
  if (!student) {
    return { success: false, error: { code: 'MCP_AKADEMIK_003', message: 'Mahasiswa tidak ditemukan' } };
  }
  return { success: true, data: student };
}

function handleGetGrades(params) {
  const grades = MOCK_DATA.grades[params.nim];
  if (!grades) {
    return { success: false, error: { code: 'MCP_AKADEMIK_003', message: 'Data nilai tidak ditemukan' } };
  }
  const semester = params.semester || Object.keys(grades)[0];
  return { success: true, data: { nim: params.nim, semester, grades: grades[semester], ips: grades.ips, ipk: grades.ipk } };
}

function handleGetSchedule(params) {
  const schedule = MOCK_DATA.schedule[params.nim];
  if (!schedule) {
    return { success: false, error: { code: 'MCP_AKADEMIK_003', message: 'Jadwal tidak ditemukan' } };
  }
  return { success: true, data: { nim: params.nim, schedule } };
}

function handleCreateTicket(params) {
  const ticketId = `TK-${Date.now().toString(36).toUpperCase()}`;
  const ticket = {
    id: ticketId,
    title: params.title || 'New Ticket',
    description: params.description,
    category: params.category || 'general',
    status: 'open',
    createdAt: new Date().toISOString()
  };
  MOCK_DATA.tickets.push(ticket);
  return { success: true, data: ticket };
}

function handleCheckTicket(params) {
  const ticket = MOCK_DATA.tickets.find(t => t.id === params.ticket_id);
  if (!ticket) {
    return { success: false, error: { code: 'MCP_IT_003', message: 'Ticket tidak ditemukan' } };
  }
  return { success: true, data: ticket };
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), mcp: MCP_INFO.name });
});

// Capabilities endpoint
app.get('/capabilities', (req, res) => {
  res.json({
    name: MCP_INFO.name,
    capabilities: ['academic_query', 'ticket_management'],
    actions: ['get_profile', 'get_grades', 'get_schedule', 'create_ticket', 'check_ticket']
  });
});

app.listen(3001, () => {
  console.log(`Mock MCP running on port 3001`);
});
```

#### Step 2: Test Mock MCP
```bash
# Terminal 1: Start mock MCP
node mcp-mock.js

# Terminal 2: Test with curl
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{"id":"test-1","action":"get_grades","params":{"nim":"2024001001","semester":"2025-2"}}'

# Test health
curl http://localhost:3001/health
```

### Success Criteria
- [ ] Mock MCP meresponse sesuai standard format
- [ ] Semua actions mengembalikan data yang benar
- [ ] Error handling bekerja (invalid NIM, unknown action)
- [ ] Health endpoint returns healthy
- [ ] Response time < 100ms (mock)

---

## Phase 0.4: Integration POC (Day 7-10)

### Objective
Gabungkan semua komponen: WhatsApp + AI + MCP → Full flow end-to-end

#### Step 1: Wire Everything Together
```javascript
// orchestrator-poc.js — Simple orchestrator connecting all components
require('dotenv').config();
const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MCP_ENDPOINT = process.env.MCP_ENDPOINT || 'http://localhost:3001';

// AI Classification (reuse from Phase 0.2)
async function classifyIntent(message) {
  // ... (same as ai-layer.js)
}

// MCP Execution
async function executeMCP(action, params) {
  const response = await fetch(`${MCP_ENDPOINT}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `req-${Date.now()}`, action, params })
  });
  return response.json();
}

// Response Formatting
function formatResponse(mcpResponse) {
  if (!mcpResponse.success) {
    return `Maaf, terjadi kesalahan: ${mcpResponse.error.message}. Silakan coba lagi.`;
  }

  const data = mcpResponse.data;

  // Format based on data type
  if (data.grades) {
    let text = `*Nilai Semester ${data.semester}*\n\n`;
    data.grades.forEach(g => {
      text += `${g.code} - ${g.name}: *${g.grade}* (${g.sks} SKS)\n`;
    });
    text += `\nIPS: *${data.ips}* | IPK: *${data.ipk}*`;
    return text;
  }

  if (data.schedule) {
    let text = `*Jadwal Kuliah*\n\n`;
    data.schedule.forEach(s => {
      text += `${s.day} ${s.time}\n${s.course}\nRuang: ${s.room}\n\n`;
    });
    return text;
  }

  if (data.id && data.status) {
    return `*Ticket ${data.id}*\nStatus: *${data.status}*\nKategori: ${data.category}\nDibuat: ${data.createdAt}`;
  }

  return JSON.stringify(data, null, 2);
}

// Main Webhook Handler
app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;
  const profileName = req.body.ProfileName;

  console.log(`\n=== New Message ===`);
  console.log(`From: ${profileName} (${from})`);
  console.log(`Message: ${body}`);

  try {
    // Step 1: Classify intent
    console.log('Classifying intent...');
    const intent = await classifyIntent(body);
    console.log(`Intent: ${intent.intent} (${(intent.confidence * 100).toFixed(0)}%)`);

    // Step 2: Handle based on intent
    let mcpResponse;

    switch (intent.intent) {
      case 'info_akademik':
        if (intent.entities.action === 'cek_nilai') {
          mcpResponse = await executeMCP('get_grades', { nim: '2024001001', semester: intent.entities.semester });
        } else if (intent.entities.action === 'jadwal') {
          mcpResponse = await executeMCP('get_schedule', { nim: '2024001001' });
        } else {
          mcpResponse = await executeMCP('get_profile', { nim: '2024001001' });
        }
        break;

      case 'buat_ticket':
        mcpResponse = await executeMCP('create_ticket', {
          title: intent.entities.description || body,
          description: body,
          category: intent.entities.category || 'general'
        });
        break;

      case 'cek_status':
        mcpResponse = await executeMCP('check_ticket', {
          ticket_id: intent.entities.ticket_id
        });
        break;

      case 'greeting':
        mcpResponse = { success: true, data: { message: `Halo ${profileName}! Saya adalah asisten layanan kampus. Ada yang bisa saya bantu?\n\nKetik:\n- "Cek nilai" untuk info akademik\n- "Buat ticket" untuk laporan masalah\n- "Status ticket" untuk cek tiket` } };
        break;

      default:
        mcpResponse = { success: true, data: { message: 'Maaf, saya belum mengerti. Ketik "help" untuk melihat layanan yang tersedia.' } };
    }

    // Step 3: Format and send response
    const replyText = mcpResponse.data?.message || formatResponse(mcpResponse);
    console.log(`Response: ${replyText.substring(0, 100)}...`);

    const twiml = new MessagingResponse();
    twiml.message(replyText);
    res.type('text/xml').send(twiml.toString());

  } catch (error) {
    console.error('Error:', error);
    const twiml = new MessagingResponse();
    twiml.message('Maaf, sedang ada gangguan. Silakan coba lagi.');
    res.type('text/xml').send(twiml.toString());
  }
});

app.listen(3000, () => {
  console.log('Orchestrator POC running on port 3000');
});
```

#### Step 2: Run Full POC
```bash
# Terminal 1: Start Mock MCP
node mcp-mock.js

# Terminal 2: Start Orchestrator + Webhook
node orchestrator-poc.js

# Terminal 3: Start ngrok
ngrok http 3000

# Configure Twilio webhook to ngrok URL
# Then test via WhatsApp!
```

#### Step 3: Test Scenarios via WhatsApp

Send these messages via WhatsApp and verify responses:

| # | Message | Expected |
|---|---------|----------|
| 1 | "Halo" | Greeting + menu |
| 2 | "Cek nilai semester kemarin" | Grades list |
| 3 | "Jadwal kuliah saya" | Schedule |
| 4 | "Wifi gedung A mati" | Ticket created |
| 5 | "Status ticket TK-xxx" | Ticket info (or not found) |
| 6 | "Bantuan" | Help menu |
| 7 | "Beli pizza" | Unknown response |
| 8 | "Terima kasih" | Greeting |

### Success Criteria
- [ ] All 8 test messages get correct responses
- [ ] Full flow completes in < 10 seconds
- [ ] No crashes or unhandled errors
- [ ] Console shows full processing log

### Decision Gate
- **GO**: POC works → Proceed to Phase 0.5 (or directly to Sprint 1)
- **ITERATE**: Some flows fail → Fix specific issues, re-test
- **NO-GO**: Fundamental issues → Re-evaluate architecture

---

## Phase 0.5: Real System Connection (Day 11-14)

### Objective
Connect ke 1 real backend system (jika tersedia) atau buat mock yang lebih comprehensive.

### Option A: Connect to Real API
```
1. Dapatkan API access ke sistem akademik
2. Build adapter di MCP Akademik
3. Transform data dari format SIAKAD ke format WSG
4. Test dengan data real
5. Compare results dengan manual check
```

### Option B: Comprehensive Mock
```
1. Expand mock data (10+ students, various scenarios)
2. Add error scenarios (timeout, invalid data)
3. Add realistic delays (simulate network latency)
4. Test edge cases
```

### Success Criteria
- [ ] Real API connected OR comprehensive mock validated
- [ ] Data accurate (matches manual check)
- [ ] Error handling tested
- [ ] Performance acceptable (< 5s)

---

## POC Summary Template

```markdown
## POC Results Summary

**Date**: [date]
**Duration**: [days]

### Results per Phase:
| Phase | Status | Notes |
|-------|--------|-------|
| 0.1 WhatsApp | PASS/FAIL | |
| 0.2 AI Intent | PASS/FAIL | Accuracy: X% |
| 0.3 Mock MCP | PASS/FAIL | |
| 0.4 Integration | PASS/FAIL | |
| 0.5 Real System | PASS/FAIL | |

### Key Findings:
1.
2.
3.

### Risks Identified:
1.
2.

### Recommendation:
[ ] Proceed to Sprint 1 (development)
[ ] Iterate on POC
[ ] Pivot / Stop

### Sign-off:
PM: ___  Tech Lead: ___  Date: ___
```

---

*Dokumen ini living document. Update dengan hasil aktual dari setiap phase POC.*
