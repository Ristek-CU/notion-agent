# System Architecture
## WhatsApp Service Gateway (WSG)

---

## 1. High-Level Architecture

```
                        +-----------------------+
                        |      USER LAYER       |
                        |  WhatsApp Client App  |
                        +-----------+-----------+
                                    |
                                    | HTTPS (WhatsApp Protocol)
                                    v
+-------------------------------------------------------------------+
|                        CHANNEL LAYER                               |
|  +-------------------------------------------------------------+  |
|  |              WhatsApp Business API / Twilio                  |  |
|  |  - Message webhook delivery                                  |  |
|  |  - Message send API                                          |  |
|  |  - Template management                                       |  |
|  +-----------------------------+-------------------------------+  |
+--------------------------------+----------------------------------+
                                 |
                                 | HTTPS POST (webhook)
                                 v
+-------------------------------------------------------------------+
|                       WEBHOOK LAYER                                |
|  +-------------------------------------------------------------+  |
|  |                    Webhook Server                            |  |
|  |  - Signature verification                                   |  |
|  |  - Message parsing                                          |  |
|  |  - Rate limiting                                            |  |
|  |  - Message queue push                                       |  |
|  +-----------------------------+-------------------------------+  |
+--------------------------------+----------------------------------+
                                 |
                                 | Redis Queue (BullMQ)
                                 v
+-------------------------------------------------------------------+
|                     ORCHESTRATION LAYER                            |
|  +---------------------------+  +------------------------------+  |
|  |    Backend Controller     |  |        AI Layer              |  |
|  |  - Request lifecycle      |<-+->  - Claude SDK              |  |
|  |  - State management       |  |  - Intent classification     |  |
|  |  - MCP routing            |  |  - Entity extraction         |  |
|  |  - Response builder       |  |  - Response generation       |  |
|  +------------+--------------+  +------------------------------+  |
|               |                                                   |
|               | Internal API                                      |
|               v                                                   |
|  +---------------------------+  +------------------------------+  |
|  |     MCP Registry          |  |     Session Manager         |  |
|  |  - Service discovery      |  |  - Conversation state       |  |
|  |  - Health monitoring      |  |  - Context window           |  |
|  |  - MCP lifecycle          |  |  - User preferences         |  |
|  +------------+--------------+  +------------------------------+  |
+---------------+---------------------------------------------------+
                |
                | MCP Protocol (Internal HTTP/gRPC)
                v
+-------------------------------------------------------------------+
|                        MCP LAYER                                   |
|  +----------+  +----------+  +----------+  +----------+          |
|  |   MCP    |  |   MCP    |  |   MCP    |  |   MCP    |          |
|  | Akademik |  |  Admisi  |  | Inventory|  |IT Support|          |
|  |          |  |          |  |          |  |          |          |
|  | - grades |  | - status |  | - stock  |  | - ticket |          |
|  | - sched  |  | - info   |  | - req    |  | - troub  |          |
|  +----+-----+  +----+-----+  +----+-----+  +----+-----+          |
+-------+-------------+-------------+-------------+-----------------+
        |             |             |             |
        | REST API    | REST API    | REST API    | REST API
        v             v             v             v
+-------------------------------------------------------------------+
|                     EXTERNAL SYSTEMS                               |
|  +----------+  +----------+  +----------+  +----------+          |
|  | SIAKAD   |  |  PMB     |  | Inventory|  | Ticketing|          |
|  | System   |  |  System  |  | System   |  | System   |          |
|  +----------+  +----------+  +----------+  +----------+          |
+-------------------------------------------------------------------+
```

## 2. Component Detail

### 2.1 Channel Layer — WhatsApp Business API

**Responsibility**: Interface komunikasi antara user dan sistem.

```
Komponen:
- WhatsApp Business API (Meta) atau Twilio WhatsApp API
- Phone number management
- Message template management
- Webhook configuration
```

**API Flow**:
```
Incoming Message:
WhatsApp → POST /webhook → Webhook Server

Outgoing Message:
Backend → POST /messages → WhatsApp API → User
```

**Key Considerations**:
- WhatsApp rate limit: 20 messages/second per phone number
- Message types: text, interactive (list, buttons), template
- Session window: 24 jam setelah last user message
- Pricing: per conversation (24-hour window)

### 2.2 Webhook Layer

**Responsibility**: Receive, validate, dan queue incoming messages.

```
POST /webhook/whatsapp
  |
  +--> Verify signature (X-Hub-Signature-256)
  +--> Parse message payload
  +--> Extract: sender, message, timestamp, message_type
  +--> Rate limit check (per sender)
  +--> Push to Redis queue (BullMQ)
  +--> Return 200 OK (immediately)
```

**Error Handling**:
- Invalid signature → 401 Unauthorized
- Rate limit exceeded → Queue for later
- Parse error → Log & discard
- Queue full → Circuit breaker

### 2.3 AI Layer — Claude SDK Integration

**Responsibility**: Memproses pesan user, mengklasifikasi intent, mengekstrak entity.

```
Input:  "Saya mau cek nilai semester kemarin"
Output: {
  intent: "info_akademik",
  entities: { action: "cek_nilai", semester: "kemarin" },
  confidence: 0.92,
  suggested_mcp: "mcp_akademik",
  response_template: "academic_grades_query"
}
```

**System Prompt Design**:
```
Kamu adalah asisten layanan kampus via WhatsApp.
Tugasmu:
1. Identifikasi intent user dari pesan yang masuk
2. Ekstrak entity yang relevan
3. Tentukan MCP yang tepat
4. Generate response yang helpful

Available intents:
- info_akademik: query data akademik (nilai, jadwal, KRS, KHS)
- buat_ticket: buat ticket/request baru
- cek_status: cek status ticket/request
- help: user butuh bantuan
- greeting: sapaan awal
- unknown: intent tidak dikenali

Response format: JSON sesuai schema
```

### 2.4 Backend Controller (Orchestrator)

**Responsibility**: Mengatur lifecycle setiap request dari masuk hingga response.

```
Request Lifecycle:
1. Receive message from queue
2. Load/create user session
3. Send to AI Layer for processing
4. Receive AI response (intent + entities)
5. Route to appropriate MCP
6. Execute MCP action
7. Build response message
8. Send response via WhatsApp
9. Update session state
10. Log everything
```

**State Machine**:
```
[NEW_MESSAGE]
    |
    v
[PROCESSING_AI] ----error----> [ERROR_HANDLER]
    |                              |
    v                              v
[ROUTING_MCP]                 [FALLBACK_RESPONSE]
    |
    v
[MCP_EXECUTING] ----error----> [ERROR_HANDLER]
    |
    v
[BUILDING_RESPONSE]
    |
    v
[SENDING_WHATSAPP]
    |
    v
[COMPLETED]
```

### 2.5 MCP Framework

**Responsibility**: Standardized interface untuk semua MCP modules.

Setiap MCP mengimplementasikan interface:
```typescript
interface IMCPModule {
  name: string;
  version: string;
  description: string;

  // Lifecycle
  initialize(config: MCPConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  shutdown(): Promise<void>;

  // Core operations
  execute(action: string, params: Record<string, any>): Promise<MCPResponse>;

  // Metadata
  getCapabilities(): MCPCapability[];
  getActions(): MCPAction[];
}

interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
}
```

## 3. Data Flow — End-to-End Sequence

```
User         WhatsApp    Webhook    Controller    AI Layer    MCP Akademik    SIAKAD
 |              |           |           |             |             |             |
 |---"Cek       |           |           |             |             |             |
 |   nilai"---->|           |           |             |             |             |
 |              |--POST---->|           |             |             |             |
 |              |           |--Queue---->|             |             |             |
 |              |           |  200 OK-->|             |             |             |
 |              |           |           |--Analyze---->|             |             |
 |              |           |           |             |--intent:     |             |
 |              |           |           |<--info_akd---|  info_akd   |             |
 |              |           |           |             |  conf: 0.95  |             |
 |              |           |           |--Route------>|             |             |
 |              |           |           |  to MCP------|             |             |
 |              |           |           |             |             |--GET grades-|
 |              |           |           |             |             |<--grades----|
 |              |           |           |<--response---|<--data------|             |
 |              |           |           |             |             |             |
 |              |<--"Nilai  |           |             |             |             |
 |<---"Nilai----|  Anda..." |           |             |             |             |
 |   Anda..."   |           |           |             |             |             |
```

## 4. Database Schema

### 4.1 Core Tables

```sql
-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    nim VARCHAR(20),
    role VARCHAR(20) DEFAULT 'student', -- student, staff, admin
    organization_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions (conversation state)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    phone_number VARCHAR(20) NOT NULL,
    state VARCHAR(50) DEFAULT 'active',
    context JSONB DEFAULT '{}',       -- conversation context
    last_intent VARCHAR(50),
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages log
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id),
    user_id UUID REFERENCES users(id),
    direction VARCHAR(10) NOT NULL,    -- 'inbound' or 'outbound'
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    intent VARCHAR(50),
    entities JSONB,
    mcp_used VARCHAR(50),
    response_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tickets
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(20) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    session_id UUID REFERENCES sessions(id),
    category VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, resolved, closed
    priority VARCHAR(10) DEFAULT 'medium',
    assigned_to VARCHAR(50),
    mcp_source VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- MCP Registry
CREATE TABLE mcp_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    endpoint_url VARCHAR(200) NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, inactive, maintenance
    health_status VARCHAR(20) DEFAULT 'unknown',
    last_health_check TIMESTAMP,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 ERD

```
+----------+       +----------+       +----------+
|  users   |       | sessions |       | messages |
+----------+       +----------+       +----------+
| id (PK)  |<----->| id (PK)  |<----->| id (PK)  |
| phone    |  1:N  | user_id  |  1:N  | session  |
| name     |       | state    |       | direction|
| nim      |       | context  |       | content  |
| role     |       | last_int |       | intent   |
+----------+       +----------+       | mcp_used |
     |                                  +----------+
     | 1:N
     v
+----------+                    +------------+
| tickets  |                    | mcp_reg    |
+----------+                    +------------+
| id (PK)  |                    | id (PK)    |
| ticket_no|                    | name       |
| user_id  |                    | endpoint   |
| category |                    | status     |
| status   |                    | health     |
| mcp_src  |                    | config     |
+----------+                    +------------+
```

## 5. API Design

### 5.1 External APIs (Webhook → Controller)

```
POST   /webhook/whatsapp       # Receive WhatsApp messages
GET    /webhook/whatsapp       # WhatsApp verification
```

### 5.2 Internal APIs (Controller → MCP)

```
Standard MCP Interface:

POST   /mcp/{mcp_name}/execute
  Body: { action: string, params: object }
  Response: { success: boolean, data: object, error?: string }

GET    /mcp/{mcp_name}/health
  Response: { status: string, uptime: number, lastCheck: timestamp }

GET    /mcp/{mcp_name}/capabilities
  Response: { actions: [], description: string }
```

### 5.3 Admin APIs

```
GET    /admin/sessions          # List active sessions
GET    /admin/messages          # Message log
GET    /admin/tickets           # Ticket list
GET    /admin/mcp/status        # MCP status dashboard
POST   /admin/mcp/{name}/toggle # Enable/disable MCP
```

## 6. Security Architecture

### 6.1 Authentication Flow
```
1. User sends first message via WhatsApp
2. System extracts phone number
3. Check if phone number is registered
4. If not → request NIM/Employee ID for verification
5. Link phone number to user profile
6. Create authenticated session
7. All subsequent messages auto-authenticated via session
```

### 6.2 Security Layers
```
Layer 1: WhatsApp encryption (E2E)
Layer 2: HTTPS/TLS for all API communication
Layer 3: Webhook signature verification
Layer 4: API key authentication (MCP ↔ External)
Layer 5: Input sanitization & validation
Layer 6: Rate limiting per user
Layer 7: Audit logging
```

## 7. Deployment Architecture

```
                    +-----------------------+
                    |    Load Balancer      |
                    |    (Nginx/Cloud)      |
                    +-----------+-----------+
                                |
                 +--------------+--------------+
                 |                             |
        +--------+--------+          +--------+--------+
        |  App Server #1  |          |  App Server #2  |
        |  - Webhook      |          |  - Webhook      |
        |  - Controller   |          |  - Controller   |
        |  - AI Layer     |          |  - AI Layer     |
        +--------+--------+          +--------+--------+
                 |                             |
        +--------+--------+          +--------+--------+
        |     Redis       |          |   PostgreSQL    |
        |  - Queue        |          |  - Users        |
        |  - Cache        |          |  - Sessions     |
        |  - Sessions     |          |  - Messages     |
        +-----------------+          +-----------------+
```

### Docker Compose Structure
```yaml
services:
  webhook:
    build: ./src/webhook
    ports: ["3000:3000"]
    depends_on: [redis, postgres]

  worker:
    build: ./src/controller
    depends_on: [redis, postgres]

  mcp-akademik:
    build: ./src/mcp/akademik
    ports: ["3001:3001"]

  redis:
    image: redis:7-alpine

  postgres:
    image: postgres:16-alpine
```

## 8. Logging & Monitoring

### 8.1 Log Format
```json
{
  "timestamp": "2026-04-22T10:00:00Z",
  "level": "info",
  "service": "webhook",
  "traceId": "abc-123",
  "userId": "user-uuid",
  "action": "message_received",
  "intent": "info_akademik",
  "mcp": "mcp_akademik",
  "responseTime": 1200,
  "message": "Processed successfully"
}
```

### 8.2 Metrics to Monitor
- Messages received/processed per minute
- Average response time
- Intent classification accuracy
- MCP health status
- Error rate by type
- Queue depth
- Active sessions
