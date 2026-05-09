# Orchestrator Design
## WhatsApp Service Gateway (WSG)

---

## 1. Orchestrator Architecture

Orchestrator adalah "otak" dari sistem WSG — mengkoordinasikan semua komponen dari pesan masuk hingga response terkirim.

### 1.1 Component Map

```
                    ┌─────────────────────┐
                    │    ORCHESTRATOR      │
                    │                      │
  Incoming    ────► │  1. Session Manager  │
  Message          │  2. AI Classifier     │ ────►  MCP Execution
  (from queue)     │  3. MCP Router       │
                    │  4. Response Builder  │ ────►  WhatsApp Reply
                    │  5. State Machine     │
                    │  6. Event Emitter     │
                    └─────────────────────┘
```

### 1.2 Request Lifecycle

```
Step 1: RECEIVE      Pull message from Redis queue
Step 2: SESSION      Load/create user session
Step 3: CLASSIFY     AI classifies intent + entities
Step 4: VALIDATE     Check confidence threshold
Step 5: ROUTE        Determine which MCP to call
Step 6: EXECUTE      Call MCP with structured request
Step 7: BUILD        Format response for WhatsApp
Step 8: SEND         Send reply via WhatsApp API
Step 9: UPDATE       Update session state + log
Step 10: EMIT        Emit event for analytics/monitoring
```

---

## 2. AI Agent Orchestration

### 2.1 Claude Integration Strategy

```
                    ┌──────────────────────────────┐
                    │      AI AGENT DESIGN          │
                    │                               │
                    │  System Prompt (fixed)         │
                    │  + Context (session history)   │
                    │  + User Message               │
                    │                               │
                    │  Output: Structured JSON       │
                    │  {                             │
                    │    intent,                     │
                    │    confidence,                 │
                    │    entities,                   │
                    │    suggested_mcp,              │
                    │    response_hint               │
                    │  }                             │
                    └──────────────────────────────┘
```

### 2.2 System Prompt Architecture

```
Layer 1: BASE IDENTITY
  "Kamu adalah asisten layanan kampus via WhatsApp bernama WSG Bot."

Layer 2: CAPABILITIES
  "Kamu bisa membantu dengan: info akademik, buat ticket, cek status"

Layer 3: AVAILABLE INTENTS + ENTITIES
  Detailed list of intents and entity types

Layer 4: RESPONSE RULES
  How to respond in different scenarios

Layer 5: CONTEXT INJECTION (dynamic)
  - User name, NIM, role
  - Previous conversation history (last 5 messages)
  - Active tickets (if any)
  - Current date/time
```

### 2.3 Multi-Turn Conversation Design

```
State: IDLE
  User: "Saya mau cek nilai"
  AI: { intent: info_akademik, entities: { action: cek_nilai }, needs_more: { semester: true } }
  Bot: "Mau cek nilai semester berapa? (contoh: semester 1, semester kemarin, semester genap)"

State: AWAITING_INFO
  User: "Semester kemarin"
  AI: { intent: info_akademik, entities: { action: cek_nilai, semester: "latest" } }
  → Route to MCP

State: IDLE (after response)
```

### 2.4 Conversation State Machine

```
┌───────┐    message     ┌────────────┐   classified    ┌───────────┐
│ IDLE  │──────────────► │ CLASSIFYING │────────────────►│ ROUTING   │
└───┬───┘               └────────────┘                  └─────┬─────┘
    ▲                      │ low confidence                     │
    │                      ▼                                    ▼
    │               ┌─────────────┐                     ┌───────────┐
    │               │ CLARIFYING   │                     │ EXECUTING │
    │               │ (ask user)   │                     │   MCP     │
    │               └──────┬──────┘                     └─────┬─────┘
    │                      │ user clarifies                    │
    │                      └──────────┬───────────────────────┘
    │                                 ▼
    │                          ┌───────────┐
    │                          │ BUILDING   │
    │                          │ RESPONSE   │
    │                          └─────┬─────┘
    │                                │
    └────────────────────────────────┘
             (back to IDLE)
```

---

## 3. MCP Orchestration Patterns

### 3.1 Pattern 1: Single MCP Execution

```
User: "Cek nilai saya"
AI: intent = info_akademik
Router: → MCP Akademik (get_grades)
Response: Formatted grades

Simple, direct. Most common pattern.
```

### 3.2 Pattern 2: Sequential MCP Chain

```
User: "Saya mau pindah jurusan"
AI: intent = complex_request
Step 1: MCP Akademik → check_current_status
Step 2: MCP Admisi → check_requirements
Step 3: MCP Akademik → check_gpa_eligibility

Response: Combined info from all MCPs
```

```
┌───────────┐     ┌───────────┐     ┌───────────┐
│ MCP       │────►│ MCP       │────►│ MCP       │
│ Akademik  │     │ Admisi    │     │ Akademik  │
│ (status)  │     │ (reqs)    │     │ (gpa)     │
└───────────┘     └───────────┘     └───────────┘
      ▼               ▼                 ▼
   Result 1 ──► Result 2 ──► Result 3 ──► Combined Response
```

### 3.3 Pattern 3: Parallel MCP Execution

```
User: "Info lengkap tentang saya"
AI: intent = comprehensive_info

Parallel:
┌──► MCP Akademik (profile + grades) ──┐
│                                       ├──► Merge Results
└──► MCP IT Support (active tickets) ──┘     │
                                              ▼
                                        Combined Response
```

```typescript
// Parallel MCP execution
async function executeParallel(
  calls: Array<{ mcp: string; action: string; params: any }>
): Promise<MCPResponse[]> {
  return Promise.allSettled(
    calls.map(call =>
      mcpClient.execute(call.mcp, {
        id: uuid(),
        action: call.action,
        params: call.params,
        context: currentContext,
        timestamp: new Date().toISOString(),
      })
    )
  ).then(results =>
    results.map(r => r.status === 'fulfilled' ? r.value : {
      success: false,
      error: { code: 'PARALLEL_FAILED', message: r.reason?.message, retryable: true },
    })
  );
}
```

### 3.4 Pattern 4: Conditional MCP Routing

```
User: "Ada update tentang request saya?"
AI: intent = cek_status

Decision:
├── entities.ticket_id exists?
│   ├── Yes → MCP IT Support (check_ticket)
│   └── No → Ask "Tiket ID berapa?"
│
├── entities.request_type == "academic"?
│   ├── Yes → MCP Akademik (check_request)
│   └── No → MCP IT Support (list_user_tickets)
```

### 3.5 Pattern 5: MCP Fallback Chain

```
Primary: MCP Akademik → get_grades
  │
  ├── Success → Return data
  │
  ├── Timeout (10s) → Try cache (Redis)
  │   ├── Cache hit → Return cached data
  │   └── Cache miss → Fallback response
  │
  └── Error → Fallback response
      "Maaf, sistem akademik sedang gangguan.
       Silakan coba lagi dalam 5 menit.
       Jika urgent, hubungi bagian akademik di ext. 1234."
```

---

## 4. Communication Protocol

### 4.1 Internal Message Format

```typescript
// Between Orchestrator components
interface InternalMessage {
  id: string;
  traceId: string;
  type: 'incoming' | 'outgoing' | 'internal';
  source: string;           // Component that created this
  destination: string;      // Target component
  payload: {
    userMessage?: string;
    intent?: ClassificationResult;
    mcpRequest?: MCPRequest;
    mcpResponse?: MCPResponse;
    replyText?: string;
  };
  metadata: {
    timestamp: string;
    durationMs?: number;
    sessionId: string;
    userId: string;
  };
}
```

### 4.2 Event-Driven Communication

```typescript
// Event types for loose coupling
type OrchestratorEvent =
  | { type: 'message.received'; phoneNumber: string; message: string }
  | { type: 'intent.classified'; intent: string; confidence: number }
  | { type: 'mcp.called'; mcpName: string; action: string }
  | { type: 'mcp.responded'; success: boolean; durationMs: number }
  | { type: 'response.sent'; phoneNumber: string; length: number }
  | { type: 'error.occurred'; code: string; message: string }
  | { type: 'session.created'; sessionId: string }
  | { type: 'session.expired'; sessionId: string };

// Event bus (simple EventEmitter or Redis Pub/Sub)
class OrchestratorEventBus {
  private emitter = new EventEmitter();

  emit(event: OrchestratorEvent) {
    this.emitter.emit(event.type, event);
  }

  on<T extends OrchestratorEvent['type']>(
    type: T,
    handler: (event: Extract<OrchestratorEvent, { type: T }>) => void
  ) {
    this.emitter.on(type, handler);
  }
}

// Usage: logging, monitoring, analytics subscribe to events
eventBus.on('mcp.responded', (event) => {
  metrics.recordMCPResponse(event.mcpName, event.durationMs);
});

eventBus.on('error.occurred', (event) => {
  alertService.notify(event.code, event.message);
});
```

---

## 5. State Machine Design

### 5.1 Conversation States

```typescript
type ConversationState =
  | 'IDLE'              // No active flow
  | 'AUTHENTICATING'    // Waiting for user verification
  | 'CLASSIFYING'       // AI is processing intent
  | 'AWAITING_CLARIFY'  // Asking user for more info
  | 'ROUTING'           // Determining MCP
  | 'EXECUTING'         // MCP is processing
  | 'BUILDING_RESPONSE' // Formatting response
  | 'ERROR';            // Something went wrong

interface ConversationContext {
  state: ConversationState;
  pendingIntent?: ClassificationResult;
  pendingClarification?: string;
  collectedEntities: Record<string, any>;
  messageHistory: Array<{ role: 'user' | 'bot'; content: string; timestamp: string }>;
  activeMCPs: string[];
  retryCount: number;
}
```

### 5.2 State Transitions

```typescript
function transition(current: ConversationState, event: string): ConversationState {
  const transitions: Record<string, Record<string, ConversationState>> = {
    IDLE: {
      message_received: 'CLASSIFYING',
    },
    CLASSIFYING: {
      high_confidence: 'ROUTING',
      low_confidence: 'AWAITING_CLARIFY',
      error: 'ERROR',
    },
    AWAITING_CLARIFY: {
      user_responded: 'CLASSIFYING',
      timeout: 'IDLE',
      cancel: 'IDLE',
    },
    ROUTING: {
      mcp_found: 'EXECUTING',
      no_mcp: 'ERROR',
    },
    EXECUTING: {
      success: 'BUILDING_RESPONSE',
      timeout: 'ERROR',
      error: 'ERROR',
    },
    BUILDING_RESPONSE: {
      sent: 'IDLE',
    },
    ERROR: {
      retry: 'CLASSIFYING',
      fallback_sent: 'IDLE',
    },
  };

  return transitions[current]?.[event] || current;
}
```

---

## 6. Queue & Async Processing

### 6.1 Queue Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Webhook    │────►│  Message Queue  │────►│   Worker     │
│   (fast,     │     │  (BullMQ/Redis) │     │   (process)  │
│    returns   │     │                 │     │              │
│    200 OK)   │     │ Priority:       │     │ Orchestrator │
└──────────────┘     │ high / normal   │     │ logic here   │
                     │                 │     └──────┬───────┘
                     │ Retry: 3x       │            │
                     │ Backoff: exp    │            ▼
                     │ DLQ: failed     │     ┌──────────────┐
                     └─────────────────┘     │   WhatsApp   │
                                             │   Send API   │
                                             └──────────────┘
```

### 6.2 Job Types

```typescript
// Queue job definitions
const QUEUES = {
  // Main message processing
  messages: {
    name: 'wsg-messages',
    concurrency: 10,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  },

  // WhatsApp send (separate queue for rate limiting)
  whatsappSend: {
    name: 'wsg-whatsapp-send',
    concurrency: 5,  // WhatsApp rate limit
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },

  // Notifications
  notifications: {
    name: 'wsg-notifications',
    concurrency: 5,
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
  },

  // MCP health checks
  healthChecks: {
    name: 'wsg-health-checks',
    concurrency: 1,
    repeat: { every: 30000 },  // Every 30 seconds
  },
};
```

### 6.3 Dead Letter Queue Handling

```typescript
// Failed message handler
queue.on('failed', (job, err) => {
  logger.error({
    event: 'job_failed',
    jobId: job.id,
    attempts: job.attemptsMade,
    error: err.message,
  });

  // After max retries, move to DLQ
  if (job.attemptsMade >= job.opts.attempts) {
    dlqQueue.add('dead-letter', {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    });

    // Notify user that something went wrong
    whatsappService.sendReply(
      job.data.phoneNumber,
      'Maaf, kami tidak bisa memproses permintaan Anda saat ini. ' +
      'Tim kami sudah diberitahu dan akan menindaklanjuti.'
    );
  }
});
```

---

## 7. Orchestrator Code (Full Implementation Sketch)

```typescript
// src/controller/orchestrator.ts (complete)

export class Orchestrator {
  private eventBus: OrchestratorEventBus;
  private mcpClient: MCPClient;
  private sessionMgr: SessionManager;
  private responseBuilder: ResponseBuilder;

  constructor(deps: OrchestratorDeps) {
    this.eventBus = deps.eventBus;
    this.mcpClient = deps.mcpClient;
    this.sessionMgr = deps.sessionMgr;
    this.responseBuilder = deps.responseBuilder;
  }

  async processMessage(msg: IncomingMessage): Promise<void> {
    const traceId = generateTraceId();
    const startTime = Date.now();

    try {
      // Step 1: Load session
      const session = await this.sessionMgr.getOrCreate(msg.phoneNumber);
      this.eventBus.emit({ type: 'session.created', sessionId: session.id });

      // Step 2: Classify intent
      const classification = await classifyIntent(
        msg.message,
        session.context?.messageHistory || []
      );
      this.eventBus.emit({
        type: 'intent.classified',
        intent: classification.intent,
        confidence: classification.confidence,
      });

      // Step 3: Check confidence
      if (classification.confidence < config.AI_CONFIDENCE_THRESHOLD) {
        const clarify = classification.clarificationQuestion
          || 'Maaf, saya kurang mengerti. Bisa dijelaskan lebih detail? '
            + 'Ketik "help" untuk melihat layanan yang tersedia.';

        await this.sendReply(msg.phoneNumber, clarify, session);
        await this.updateSession(session, classification, 'AWAITING_CLARIFY');
        return;
      }

      // Step 4: Route and execute MCP
      const mcpName = this.resolveMCP(classification);
      const action = this.resolveAction(classification);
      const params = this.buildParams(classification, session);

      this.eventBus.emit({ type: 'mcp.called', mcpName, action });

      const mcpResponse = await this.executeWithFallback(
        mcpName, action, params, session
      );

      this.eventBus.emit({
        type: 'mcp.responded',
        success: mcpResponse.success,
        durationMs: mcpResponse.metadata.executionTimeMs,
      });

      // Step 5: Build and send response
      const replyText = this.responseBuilder.build(mcpResponse, classification);
      await this.sendReply(msg.phoneNumber, replyText, session);

      // Step 6: Update session
      await this.updateSession(session, classification, 'IDLE');

      // Step 7: Log completion
      logger.info({
        traceId,
        event: 'orchestration_complete',
        totalMs: Date.now() - startTime,
        intent: classification.intent,
        mcp: mcpName,
        success: mcpResponse.success,
      });

    } catch (error) {
      logger.error({ traceId, event: 'orchestration_error', error });
      await this.handleOrchestrationError(msg.phoneNumber, error);
    }
  }

  private async executeWithFallback(
    mcpName: string, action: string, params: any, session: Session
  ): Promise<MCPResponse> {
    try {
      // Try primary MCP
      return await this.mcpClient.execute(mcpName, {
        id: uuid(),
        action,
        params,
        context: this.buildContext(session),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Try cache
      const cached = await this.tryCache(mcpName, action, params);
      if (cached) return cached;

      // Return error response
      return {
        id: uuid(),
        success: false,
        error: {
          code: 'MCP_EXECUTION_FAILED',
          message: 'Service sedang tidak tersedia',
          retryable: true,
        },
        metadata: {
          mcpName, action,
          executionTimeMs: 0,
          cacheHit: false,
          sourceSystem: 'fallback',
        },
      };
    }
  }

  private async sendReply(
    phoneNumber: string, text: string, session: Session
  ): Promise<void> {
    await whatsappSendQueue.add('send', { phoneNumber, text });
    this.eventBus.emit({ type: 'response.sent', phoneNumber, length: text.length });
  }
}
```

---

## 8. Testing the Orchestrator

### 8.1 Unit Test Strategy

```typescript
describe('Orchestrator', () => {
  // Mock all dependencies
  const mockClassifier = vi.fn();
  const mockMCPClient = vi.fn();
  const mockSession = vi.fn();
  const mockWhatsApp = vi.fn();

  it('should classify and route academic query', async () => {
    mockClassifier.mockResolvedValue({
      intent: 'info_akademik',
      confidence: 0.92,
      entities: { action: 'cek_nilai' },
      suggestedMCP: 'mcp_akademik',
    });

    mockMCPClient.execute.mockResolvedValue({
      success: true,
      data: { grades: [{ code: 'CS101', grade: 'A' }] },
    });

    await orchestrator.processMessage({
      phoneNumber: '+6281234567890',
      message: 'Cek nilai',
      profileName: 'Test User',
    });

    expect(mockMCPClient.execute).toHaveBeenCalledWith(
      'mcp_akademik',
      expect.objectContaining({ action: 'get_grades' })
    );
    expect(mockWhatsApp.send).toHaveBeenCalled();
  });

  it('should ask clarification for low confidence', async () => {
    mockClassifier.mockResolvedValue({
      intent: 'unknown',
      confidence: 0.3,
      needsClarification: true,
      clarificationQuestion: 'Bisa jelaskan lebih detail?',
    });

    await orchestrator.processMessage({
      phoneNumber: '+6281234567890',
      message: 'xyz',
      profileName: 'Test User',
    });

    expect(mockMCPClient.execute).not.toHaveBeenCalled();
    expect(mockWhatsApp.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('jelaskan')
    );
  });

  it('should handle MCP failure gracefully', async () => {
    mockClassifier.mockResolvedValue({
      intent: 'info_akademik',
      confidence: 0.9,
    });
    mockMCPClient.execute.mockRejectedValue(new Error('MCP down'));

    await orchestrator.processMessage({
      phoneNumber: '+6281234567890',
      message: 'Cek nilai',
      profileName: 'Test User',
    });

    expect(mockWhatsApp.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('tidak tersedia')
    );
  });
});
```

### 8.2 Integration Test Pattern

```typescript
describe('Orchestrator Integration', () => {
  beforeAll(async () => {
    // Start real services (with mock external systems)
    await startTestInfrastructure();
  });

  it('full flow: academic query', async () => {
    const response = await simulateIncomingMessage('Cek nilai semester kemarin');
    expect(response).toContain('Nilai');
    expect(response).toMatch(/IPS|IPK/);
  });

  it('full flow: create ticket', async () => {
    const response = await simulateIncomingMessage('Wifi gedung A mati');
    expect(response).toContain('TK-');
    expect(response).toContain('berhasil dibuat');
  });
});
```

---

## 9. Monitoring & Observability

### 9.1 Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `messages.processed` | Total messages processed | - |
| `messages.processing_time_ms` | End-to-end processing time | > 5000ms |
| `ai.classification.confidence` | Average confidence score | < 0.7 |
| `ai.classification.time_ms` | AI response time | > 3000ms |
| `mcp.{name}.response_time_ms` | MCP response time | > 2000ms |
| `mcp.{name}.error_rate` | MCP error percentage | > 5% |
| `mcp.{name}.availability` | MCP uptime | < 99% |
| `queue.depth` | Pending messages in queue | > 100 |
| `whatsapp.send.failures` | Failed WhatsApp sends | > 0 (alert) |

### 9.2 Health Check Endpoint

```
GET /health
{
  "status": "healthy",
  "components": {
    "webhook": "up",
    "redis": "up",
    "postgres": "up",
    "ai_layer": "up",
    "mcp_akademik": "up",
    "mcp_it_support": "degraded"
  },
  "metrics": {
    "messages_processed_today": 245,
    "avg_response_time_ms": 1200,
    "queue_depth": 3,
    "uptime_hours": 72.5
  }
}
```

---

*Dokumen ini detail desain orchestrator. Implementasi mengikuti pattern ini sebagai blueprint.*
