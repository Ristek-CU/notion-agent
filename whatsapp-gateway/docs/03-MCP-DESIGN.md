# MCP (Middleware Control Platform) Design
## WhatsApp Service Gateway (WSG)

---

## 1. MCP Architecture Pattern

### 1.1 Design Philosophy
Setiap MCP mengikuti prinsip:
- **Independent**: Bisa berjalan sendiri, tidak bergantung MCP lain
- **Standardized**: Interface yang sama untuk semua MCP
- **Replaceable**: Bisa diganti tanpa impact ke sistem lain
- **Testable**: Bisa ditest secara terisolasi (mock external system)
- **Observable**: Health check, metrics, logging terstandardisasi

### 1.2 MCP Component Structure

```
mcp-akademik/
├── src/
│   ├── index.ts              # Entry point, export MCP class
│   ├── config.ts             # Configuration loader
│   ├── routes.ts             # API routes
│   ├── actions/              # Action handlers
│   │   ├── get-grades.ts     # Action: get student grades
│   │   ├── get-schedule.ts   # Action: get class schedule
│   │   ├── get-krs.ts        # Action: get KRS
│   │   └── get-profile.ts    # Action: get student profile
│   ├── adapters/             # External system connectors
│   │   └── siakad-client.ts  # SIAKAD API client
│   ├── transformers/         # Data transformation
│   │   ├── grade-transform.ts
│   │   └── schedule-transform.ts
│   └── utils/                # Helpers
├── tests/
│   ├── actions/
│   └── adapters/
├── Dockerfile
├── package.json
└── README.md
```

## 2. MCP Interface Specification

### 2.1 Base Interface (TypeScript)

```typescript
// Core MCP Interface - semua MCP harus implement
interface IMCPModule {
  // Identity
  readonly name: string;
  readonly version: string;
  readonly description: string;

  // Lifecycle
  initialize(config: MCPConfig): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  shutdown(): Promise<void>;

  // Core
  execute(request: MCPRequest): Promise<MCPResponse>;

  // Metadata
  getCapabilities(): MCPCapability[];
  getActions(): MCPActionDefinition[];
}

// Standard Request Format
interface MCPRequest {
  id: string;                    // Unique request ID
  action: string;                // Action name (e.g., "get_grades")
  params: Record<string, any>;   // Action parameters
  context: RequestContext;       // User context
  timestamp: string;             // ISO 8601
}

// Standard Response Format
interface MCPResponse {
  id: string;                    // Same as request ID
  success: boolean;
  data?: any;                    // Response payload
  error?: MCPError;
  metadata: ResponseMetadata;
}

// Context passed with every request
interface RequestContext {
  userId: string;
  phoneNumber: string;
  sessionId: string;
  role: 'student' | 'staff' | 'admin';
  organizationId?: string;
}

// Error format
interface MCPError {
  code: string;                  // e.g., "MCP_AKADEMIK_001"
  message: string;               // Human readable
  details?: any;                 // Additional context
  retryable: boolean;            // Can this be retried?
}

// Metadata
interface ResponseMetadata {
  mcpName: string;
  action: string;
  executionTimeMs: number;
  cacheHit: boolean;
  sourceSystem: string;
}

// Health check response
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastChecked: string;
  dependencies: {
    name: string;
    status: 'up' | 'down';
    responseTimeMs: number;
  }[];
}

// Capability definition
interface MCPCapability {
  name: string;
  description: string;
  category: string;
}

// Action definition
interface MCPActionDefinition {
  name: string;
  description: string;
  params: ActionParam[];
  requiredParams: string[];
  responseSchema: object;
}
```

### 2.2 Standard REST Endpoints

Setiap MCP harus expose endpoints berikut:

```
POST   /execute          # Execute an action
GET    /health           # Health check
GET    /capabilities     # List capabilities
GET    /actions          # List available actions
GET    /actions/:name    # Get action detail
```

### 2.3 Standard Error Codes

| Code Pattern | Meaning | Example |
|-------------|---------|---------|
| `MCP_{NAME}_001` | Invalid parameters | `MCP_AKADEMIK_001` - NIM not provided |
| `MCP_{NAME}_002` | External system unavailable | `MCP_AKADEMIK_002` - SIAKAD down |
| `MCP_{NAME}_003` | Data not found | `MCP_AKADEMIK_003` - Student not found |
| `MCP_{NAME}_004` | Permission denied | `MCP_AKADEMIK_004` - No access to grades |
| `MCP_{NAME}_005` | Rate limited | `MCP_AKADEMIK_005` - Too many requests |
| `MCP_{NAME}_099` | Internal error | `MCP_AKADEMIK_099` - Unexpected error |

## 3. MCP Registry & Discovery

### 3.1 Registry Design

```typescript
interface MCPRegistry {
  // Registration
  register(mcp: MCPRegistration): Promise<void>;
  deregister(name: string): Promise<void>;

  // Discovery
  getMCP(name: string): MCPRegistration | null;
  getMCPsByCapability(capability: string): MCPRegistration[];
  getAllMCPs(): MCPRegistration[];

  // Health
  checkHealth(name: string): Promise<HealthStatus>;
  checkAllHealth(): Promise<Record<string, HealthStatus>>;
}

interface MCPRegistration {
  name: string;
  version: string;
  endpoint: string;           // e.g., "http://mcp-akademik:3001"
  description: string;
  capabilities: string[];
  status: 'active' | 'inactive' | 'maintenance';
  registeredAt: string;
  lastHealthCheck: string;
}
```

### 3.2 Discovery Flow

```
Controller needs to route request:
1. AI Layer returns intent: "info_akademik"
2. Controller queries Registry: getMCPByCapability("academic_info")
3. Registry returns: { name: "mcp_akademik", endpoint: "http://..." }
4. Controller routes request to mcp_akademik endpoint
```

### 3.3 Health Monitoring

```typescript
// Background job runs every 30 seconds
async function monitorMCPHealth() {
  const mcps = registry.getAllMCPs();
  for (const mcp of mcps) {
    const health = await fetch(`${mcp.endpoint}/health`);
    registry.updateHealth(mcp.name, health);
    if (health.status === 'unhealthy') {
      alertAdmin(`MCP ${mcp.name} is unhealthy`);
    }
  }
}
```

## 4. Detailed MCP Specifications

### 4.1 MCP Akademik

**Purpose**: Menyediakan akses ke data akademik mahasiswa.

| Action | Description | Required Params | Response |
|--------|-------------|----------------|----------|
| `get_profile` | Profil mahasiswa | `nim` | Nama, jurusan, semester, status |
| `get_grades` | Nilai per semester | `nim`, `semester?` | List mata kuliah + nilai |
| `get_schedule` | Jadwal kuliah | `nim`, `semester?` | List jadwal hari/jam |
| `get_krs` | Data KRS | `nim`, `semester?` | List mata kuliah diambil |
| `get_khs` | KHS | `nim`, `semester?` | IPS, IPK, detail nilai |

**Example Request/Response**:

```json
// POST /execute
{
  "id": "req-001",
  "action": "get_grades",
  "params": {
    "nim": "2024001001",
    "semester": "2025-2"
  },
  "context": {
    "userId": "user-uuid",
    "phoneNumber": "+6281234567890",
    "sessionId": "session-uuid",
    "role": "student"
  },
  "timestamp": "2026-04-22T10:00:00Z"
}

// Response
{
  "id": "req-001",
  "success": true,
  "data": {
    "nim": "2024001001",
    "semester": "2025-2",
    "grades": [
      { "code": "CS101", "name": "Algoritma", "grade": "A", "sks": 3 },
      { "code": "CS102", "name": "Basis Data", "grade": "B+", "sks": 3 }
    ],
    "ips": 3.67,
    "ipk": 3.54
  },
  "metadata": {
    "mcpName": "mcp-akademik",
    "action": "get_grades",
    "executionTimeMs": 450,
    "cacheHit": false,
    "sourceSystem": "SIAKAD"
  }
}
```

**WhatsApp Response Format**:
```
*Nilai Semester 2025-2*

CS101 - Algoritma: A (3 SKS)
CS102 - Basis Data: B+ (3 SKS)

IPS: 3.67
IPK Kumulatif: 3.54
```

### 4.2 MCP Admisi

**Purpose**: Akses data pendaftaran dan admisi.

| Action | Description | Required Params |
|--------|-------------|----------------|
| `get_registration_status` | Status pendaftaran | `registration_id` |
| `get_requirements` | Persyaratan masuk | `program?`, `year?` |
| `get_timeline` | Timeline seleksi | `program?`, `year?` |
| `get_programs` | Daftar program studi | - |

### 4.3 MCP Inventory

**Purpose**: Akses data inventori dan pengadaan.

| Action | Description | Required Params |
|--------|-------------|----------------|
| `check_stock` | Cek ketersediaan barang | `item_name` atau `item_code` |
| `request_item` | Ajukan permintaan barang | `item`, `quantity`, `reason` |
| `get_request_status` | Status permintaan | `request_id` |
| `list_categories` | Daftar kategori barang | - |

### 4.4 MCP IT Support

**Purpose**: Manajemen ticket dan troubleshooting.

| Action | Description | Required Params |
|--------|-------------|----------------|
| `create_ticket` | Buat ticket baru | `title`, `description`, `category?` |
| `get_ticket` | Detail ticket | `ticket_id` |
| `list_tickets` | Daftar ticket user | `status?` |
| `update_ticket` | Update ticket | `ticket_id`, `update_data` |
| `search_faq` | Cari di knowledge base | `query` |

## 5. MCP Communication Protocol

### 5.1 Synchronous (HTTP REST)

```
Controller → MCP: POST /execute (request body)
MCP → Controller: Response body
Timeout: 10 seconds default, configurable per MCP
```

### 5.2 Asynchronous (Queue-based, untuk long operations)

```
Controller → Queue: Push job { mcp, action, params, callback_url }
MCP Worker: Pull job from queue
MCP Worker: Execute action
MCP Worker → Queue: Push result
Controller: Pull result / receive callback
```

### 5.3 Inter-MCP Communication (Future)

```
MCP A → Controller → MCP B
(Controller acts as mediator, MCPs don't call each other directly)
```

## 6. MCP Testing Strategy

### 6.1 Unit Testing (per MCP)

```typescript
// Test each action independently
describe('MCP Akademik - get_grades', () => {
  it('should return grades for valid NIM', async () => {
    const response = await mcp.execute({
      id: 'test-001',
      action: 'get_grades',
      params: { nim: '2024001001', semester: '2025-2' },
      context: mockContext,
      timestamp: new Date().toISOString()
    });
    expect(response.success).toBe(true);
    expect(response.data.grades).toBeDefined();
  });

  it('should return error for invalid NIM', async () => {
    const response = await mcp.execute({
      id: 'test-002',
      action: 'get_grades',
      params: { nim: 'INVALID' },
      context: mockContext,
      timestamp: new Date().toISOString()
    });
    expect(response.success).toBe(false);
    expect(response.error.code).toBe('MCP_AKADEMIK_003');
  });
});
```

### 6.2 Mock External System

```typescript
// Mock SIAKAD client for testing
class MockSiakadClient {
  async getGrades(nim: string, semester: string) {
    return {
      nim,
      semester,
      grades: [
        { code: 'CS101', name: 'Algoritma', grade: 'A', sks: 3 }
      ],
      ips: 4.0,
      ipk: 3.8
    };
  }
}

// Inject mock via dependency injection
const mcp = new MCPAkademik(new MockSiakadClient());
```

### 6.3 Integration Testing

```
1. Start MCP server with mock external system
2. Send real HTTP requests to /execute
3. Verify response format and data
4. Test error scenarios
5. Test health endpoint
```

## 7. Adding a New MCP — Step by Step

### Checklist:
1. [ ] Buat directory `src/mcp/{nama-mcp}/`
2. [ ] Implement `IMCPModule` interface
3. [ ] Define actions dan capabilities
4. [ ] Implement external system adapter
5. [ ] Add data transformers
6. [ ] Write unit tests (mock external)
7. [ ] Write integration tests
8. [ ] Add Dockerfile
9. [ ] Register di MCP Registry
10. [ ] Add AI prompt for new intents
11. [ ] Test end-to-end via WhatsApp

### Template:
```typescript
import { IMCPModule, MCPRequest, MCPResponse } from '@wsg/mcp-core';

export class MCPNewService implements IMCPModule {
  readonly name = 'mcp-new-service';
  readonly version = '1.0.0';
  readonly description = 'Deskripsi layanan baru';

  async initialize(config) { /* setup */ }
  async healthCheck() { /* check */ }
  async shutdown() { /* cleanup */ }

  async execute(request: MCPRequest): Promise<MCPResponse> {
    switch (request.action) {
      case 'action_1': return this.handleAction1(request);
      default: return { success: false, error: { code: 'UNKNOWN_ACTION' } };
    }
  }

  getCapabilities() { return []; }
  getActions() { return []; }
}
```

---

*MCP Design ini modular dan extensible. Setiap MCP baru mengikuti pola yang sama.*
