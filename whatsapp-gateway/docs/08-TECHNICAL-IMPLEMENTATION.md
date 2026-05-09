# Technical Implementation Guide
## WhatsApp Service Gateway (WSG)

---

## 1. Technology Stack Decision

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| **Runtime** | Node.js | 20 LTS | Stable, good async, large ecosystem |
| **Language** | TypeScript | 5.x | Type safety, better DX, fewer runtime bugs |
| **Framework** | Fastify | 5.x | Faster than Express, schema validation built-in |
| **AI SDK** | @anthropic-ai/sdk | latest | Official Claude SDK |
| **WhatsApp** | Twilio SDK | latest | Easiest WhatsApp integration, sandbox for testing |
| **Database** | PostgreSQL | 16 | ACID, JSONB support, proven reliability |
| **ORM** | Drizzle ORM | latest | Type-safe, lightweight, good DX |
| **Cache** | Redis | 7 | Session, queue, caching |
| **Queue** | BullMQ | latest | Redis-based, reliable job queue |
| **Testing** | Vitest | latest | Fast, TypeScript-native |
| **Linting** | ESLint + Prettier | latest | Code quality |
| **Deployment** | Docker + Compose | latest | Consistent environments |
| **CI/CD** | GitHub Actions | latest | Automation |

## 2. Project Structure

```
whatsapp-gateway/
├── src/
│   ├── index.ts                    # App entry point
│   ├── config/
│   │   ├── index.ts                # Config loader
│   │   └── schema.ts               # Config validation (zod)
│   ├── webhook/
│   │   ├── server.ts               # Fastify server setup
│   │   ├── routes.ts               # Webhook routes
│   │   ├── verify.ts               # Signature verification
│   │   └── dto.ts                  # Message data transfer objects
│   ├── ai/
│   │   ├── client.ts               # Claude SDK client
│   │   ├── classifier.ts           # Intent classification
│   │   ├── entity-extractor.ts     # Entity extraction
│   │   ├── prompts/
│   │   │   ├── system.ts           # System prompt
│   │   │   ├── intent.ts           # Intent classification prompt
│   │   │   └── response.ts         # Response generation prompt
│   │   └── types.ts                # AI types
│   ├── controller/
│   │   ├── orchestrator.ts         # Main orchestrator
│   │   ├── router.ts               # MCP router
│   │   ├── response-builder.ts     # Response formatting
│   │   ├── session-manager.ts      # Session management
│   │   └── state-machine.ts        # Request state machine
│   ├── mcp/
│   │   ├── core/
│   │   │   ├── interface.ts        # MCP interface definition
│   │   │   ├── registry.ts         # MCP registry
│   │   │   ├── client.ts           # MCP HTTP client
│   │   │   └── types.ts            # Shared types
│   │   ├── akademik/
│   │   │   ├── index.ts
│   │   │   ├── server.ts
│   │   │   ├── actions/
│   │   │   │   ├── get-profile.ts
│   │   │   │   ├── get-grades.ts
│   │   │   │   ├── get-schedule.ts
│   │   │   │   └── get-krs.ts
│   │   │   ├── adapters/
│   │   │   │   └── siakad-client.ts
│   │   │   └── transformers/
│   │   │       └── grade-transform.ts
│   │   ├── admisi/
│   │   │   └── ... (same structure)
│   │   ├── inventory/
│   │   │   └── ... (same structure)
│   │   └── it-support/
│   │       └── ... (same structure)
│   ├── db/
│   │   ├── index.ts                # DB connection
│   │   ├── schema.ts               # Drizzle schema
│   │   └── migrations/             # SQL migrations
│   ├── queue/
│   │   ├── index.ts                # BullMQ setup
│   │   ├── processor.ts            # Job processor
│   │   └── workers/
│   │       ├── message-processor.ts
│   │       └── notification-worker.ts
│   ├── services/
│   │   ├── whatsapp.ts             # WhatsApp send/receive service
│   │   ├── user-service.ts         # User management
│   │   └── ticket-service.ts       # Ticket management
│   └── utils/
│       ├── logger.ts               # Structured logging
│       ├── errors.ts               # Custom errors
│       └── helpers.ts              # Utility functions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.mcp
│   └── docker-compose.yml
├── docs/                           # Documentation
├── scripts/
│   ├── setup.sh                    # Setup script
│   └── seed.ts                     # DB seed script
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## 3. Core Implementation

### 3.1 Config & Environment

```typescript
// src/config/schema.ts
import { z } from 'zod';

export const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Twilio / WhatsApp
  TWILIO_ACCOUNT_SID: z.string().min(1),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().min(1),
  TWILIO_WEBHOOK_URL: z.string().url().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default('claude-haiku-4-5-20251001'),
  AI_MAX_TOKENS: z.coerce.number().default(500),
  AI_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),

  // Database
  DATABASE_URL: z.string().url().default('postgresql://localhost:5432/wsg'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // MCP
  MCP_AKADEMIK_URL: z.string().default('http://localhost:3001'),

  // Limits
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(30),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),
});

export type Config = z.infer<typeof configSchema>;
```

### 3.2 Webhook Server

```typescript
// src/webhook/server.ts
import Fastify from 'fastify';
import { webhookRoutes } from './routes';
import { config } from '../config';

const app = Fastify({ logger: true });

app.register(webhookRoutes);

export async function startWebhookServer() {
  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`Webhook server running on port ${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
```

```typescript
// src/webhook/routes.ts
import { FastifyInstance } from 'fastify';
import { verifyTwilioSignature } from './verify';
import { messageQueue } from '../queue';

export async function webhookRoutes(app: FastifyInstance) {
  // WhatsApp verification
  app.get('/webhook/whatsapp', async (req, reply) => {
    reply.send({ status: 'alive', timestamp: new Date().toISOString() });
  });

  // Incoming messages
  app.post('/webhook/whatsapp', {
    preHandler: [verifyTwilioSignature],
  }, async (req, reply) => {
    const { From, Body, ProfileName, MessageSid } = req.body as any;

    // Push to queue for async processing
    await messageQueue.add('process-message', {
      phoneNumber: From,
      message: Body,
      profileName: ProfileName,
      messageSid: MessageSid,
      receivedAt: new Date().toISOString(),
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });

    // Immediate 200 OK
    reply.type('text/xml').send('<Response></Response>');
  });
}
```

### 3.3 AI Layer

```typescript
// src/ai/classifier.ts
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { SYSTEM_PROMPT } from './prompts/system';
import { ClassificationResult } from './types';

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export async function classifyIntent(message: string): Promise<ClassificationResult> {
  const response = await client.messages.create({
    model: config.AI_MODEL,
    max_tokens: config.AI_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: message }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { intent: 'unknown', confidence: 0, entities: {}, needsClarification: true };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    intent: parsed.intent || 'unknown',
    confidence: parsed.confidence || 0,
    entities: parsed.entities || {},
    suggestedMCP: parsed.suggested_mcp,
    needsClarification: parsed.clarification_needed || false,
    clarificationQuestion: parsed.clarification_question,
  };
}
```

```typescript
// src/ai/prompts/system.ts
export const SYSTEM_PROMPT = `Kamu adalah asisten AI untuk layanan kampus via WhatsApp.

TUGAS: Analisis pesan user dan tentukan intent, entities, dan MCP yang tepat.

AVAILABLE INTENTS:
- info_akademik: Query data akademik (nilai, jadwal, KRS, KHS, profil mahasiswa)
- buat_ticket: Buat ticket/laporan masalah (IT, fasilitas, akademik)
- cek_status: Cek status ticket/request yang sudah dibuat
- help: User butuh bantuan atau info tentang layanan
- greeting: Sapaan, terima kasih, perpisahan
- unknown: Tidak dapat ditentukan

RESPONSE FORMAT (JSON strictly):
{
  "intent": "string",
  "confidence": 0.0-1.0,
  "entities": {
    "action": "string",
    "ticket_id": "string|null",
    "semester": "string|null",
    "category": "string|null",
    "description": "string|null"
  },
  "suggested_mcp": "string",
  "clarification_needed": boolean,
  "clarification_question": "string|null"
}

RULES:
- Jika confidence < 0.7, set clarification_needed = true
- Selalu extract entities sebanyak mungkin
- suggested_mcp: mcp_akademik, mcp_it_support, atau null
- Response HARUS valid JSON`;
```

### 3.4 Orchestrator (Controller)

```typescript
// src/controller/orchestrator.ts
import { classifyIntent } from '../ai/classifier';
import { mcpRouter } from './router';
import { responseBuilder } from './response-builder';
import { sessionManager } from './session-manager';
import { whatsappService } from '../services/whatsapp';
import { config } from '../config';
import { logger } from '../utils/logger';

interface IncomingMessage {
  phoneNumber: string;
  message: string;
  profileName: string;
  messageSid: string;
  receivedAt: string;
}

export async function processMessage(msg: IncomingMessage) {
  const startTime = Date.now();
  const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    logger.info({ traceId, event: 'message_received', from: msg.phoneNumber, text: msg.message });

    // 1. Load or create session
    const session = await sessionManager.getOrCreate(msg.phoneNumber);
    logger.info({ traceId, event: 'session_loaded', sessionId: session.id });

    // 2. Classify intent with AI
    const classification = await classifyIntent(msg.message);
    logger.info({ traceId, event: 'classified', intent: classification.intent, confidence: classification.confidence });

    // 3. Check if clarification needed
    if (classification.needsClarification || classification.confidence < config.AI_CONFIDENCE_THRESHOLD) {
      const reply = classification.clarificationQuestion ||
        'Maaf, saya kurang mengerti. Ketik "help" untuk melihat layanan yang tersedia.';
      await whatsappService.sendReply(msg.phoneNumber, reply);
      return;
    }

    // 4. Route to MCP
    const mcpResponse = await mcpRouter.route(classification, session);
    logger.info({ traceId, event: 'mcp_response', success: mcpResponse.success, mcp: classification.suggestedMCP });

    // 5. Build and send response
    const replyText = responseBuilder.build(mcpResponse, classification);
    await whatsappService.sendReply(msg.phoneNumber, replyText);

    // 6. Update session
    await sessionManager.update(session.id, {
      lastIntent: classification.intent,
      lastMessageAt: new Date(),
      context: { ...session.context, lastEntities: classification.entities },
    });

    logger.info({
      traceId,
      event: 'completed',
      totalTimeMs: Date.now() - startTime,
      intent: classification.intent,
    });

  } catch (error) {
    logger.error({ traceId, event: 'error', error: (error as Error).message });

    // Fallback: send error message
    try {
      await whatsappService.sendReply(
        msg.phoneNumber,
        'Maaf, sedang ada gangguan teknis. Tim kami sedang menanganinya. Silakan coba lagi dalam beberapa menit.'
      );
    } catch (sendError) {
      logger.error({ traceId, event: 'fallback_send_failed', error: (sendError as Error).message });
    }
  }
}
```

### 3.5 MCP Core Framework

```typescript
// src/mcp/core/interface.ts
export interface MCPRequest {
  id: string;
  action: string;
  params: Record<string, any>;
  context: {
    userId: string;
    phoneNumber: string;
    sessionId: string;
    role: string;
  };
  timestamp: string;
}

export interface MCPResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
    retryable: boolean;
  };
  metadata: {
    mcpName: string;
    action: string;
    executionTimeMs: number;
    cacheHit: boolean;
    sourceSystem: string;
  };
}

export interface MCPModule {
  name: string;
  version: string;
  initialize(): Promise<void>;
  execute(request: MCPRequest): Promise<MCPResponse>;
  healthCheck(): Promise<{ status: string; uptime: number }>;
  shutdown(): Promise<void>;
}
```

```typescript
// src/mcp/core/client.ts
import { MCPRequest, MCPResponse } from './interface';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class MCPClient {
  private endpoints: Map<string, string> = new Map();

  constructor() {
    this.endpoints.set('mcp_akademik', config.MCP_AKADEMIK_URL);
    // Add more MCPs as needed
  }

  registerEndpoint(mcpName: string, url: string) {
    this.endpoints.set(mcpName, url);
  }

  async execute(mcpName: string, request: MCPRequest): Promise<MCPResponse> {
    const url = this.endpoints.get(mcpName);
    if (!url) {
      return {
        id: request.id,
        success: false,
        error: { code: 'MCP_NOT_FOUND', message: `MCP "${mcpName}" not registered`, retryable: false },
        metadata: { mcpName, action: request.action, executionTimeMs: 0, cacheHit: false, sourceSystem: 'none' },
      };
    }

    const startTime = Date.now();
    try {
      const response = await fetch(`${url}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(config.REQUEST_TIMEOUT_MS),
      });

      const data = await response.json();
      return data as MCPResponse;
    } catch (error) {
      logger.error({ event: 'mcp_call_failed', mcpName, error: (error as Error).message });
      return {
        id: request.id,
        success: false,
        error: {
          code: 'MCP_UNAVAILABLE',
          message: `MCP "${mcpName}" is unavailable`,
          retryable: true,
        },
        metadata: { mcpName, action: request.action, executionTimeMs: Date.now() - startTime, cacheHit: false, sourceSystem: 'none' },
      };
    }
  }
}
```

### 3.6 MCP Router

```typescript
// src/controller/router.ts
import { MCPClient } from '../mcp/core/client';
import { ClassificationResult } from '../ai/types';
import { Session } from '../db/schema';
import { v4 as uuid } from 'uuid';

const mcpClient = new MCPClient();

const INTENT_MCP_MAP: Record<string, string> = {
  info_akademik: 'mcp_akademik',
  buat_ticket: 'mcp_it_support',
  cek_status: 'mcp_it_support',
};

export async function route(classification: ClassificationResult, session: Session) {
  const mcpName = classification.suggestedMCP || INTENT_MCP_MAP[classification.intent];

  if (!mcpName) {
    return {
      id: uuid(),
      success: false,
      error: { code: 'NO_MCP', message: 'No MCP available for this intent', retryable: false },
      metadata: { mcpName: 'none', action: 'none', executionTimeMs: 0, cacheHit: false, sourceSystem: 'none' },
    };
  }

  const action = mapIntentToAction(classification.intent, classification.entities);

  return mcpClient.execute(mcpName, {
    id: uuid(),
    action,
    params: classification.entities,
    context: {
      userId: session.userId,
      phoneNumber: session.phoneNumber,
      sessionId: session.id,
      role: session.role,
    },
    timestamp: new Date().toISOString(),
  });
}

function mapIntentToAction(intent: string, entities: Record<string, any>): string {
  switch (intent) {
    case 'info_akademik':
      if (entities.action?.includes('nilai')) return 'get_grades';
      if (entities.action?.includes('jadwal')) return 'get_schedule';
      if (entities.action?.includes('krs')) return 'get_krs';
      return 'get_profile';
    case 'buat_ticket':
      return 'create_ticket';
    case 'cek_status':
      return 'check_ticket';
    default:
      return 'unknown';
  }
}
```

## 4. Docker Setup

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  webhook:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    env_file: ../.env
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  worker:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    command: node dist/queue/processor.js
    env_file: ../.env
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  mcp-akademik:
    build:
      context: ..
      dockerfile: docker/Dockerfile.mcp
      args:
        MCP_NAME: akademik
    ports:
      - "3001:3001"
    env_file: ../.env
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: wsg
      POSTGRES_USER: wsg
      POSTGRES_PASSWORD: wsg_dev
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  redis-data:
  postgres-data:
```

```dockerfile
# docker/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## 5. Configuration Management

```bash
# .env.example
# Server
PORT=3000
NODE_ENV=development

# Twilio / WhatsApp
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+14155238886

# AI (Anthropic)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
AI_MODEL=claude-haiku-4-5-20251001
AI_MAX_TOKENS=500
AI_CONFIDENCE_THRESHOLD=0.7

# Database
DATABASE_URL=postgresql://wsg:wsg_dev@localhost:5432/wsg

# Redis
REDIS_URL=redis://localhost:6379

# MCP Endpoints
MCP_AKADEMIK_URL=http://localhost:3001
MCP_IT_SUPPORT_URL=http://localhost:3002

# Limits
RATE_LIMIT_PER_MINUTE=30
REQUEST_TIMEOUT_MS=10000
```

## 6. Setup Script

```bash
#!/bin/bash
# scripts/setup.sh
set -e

echo "=== WhatsApp Service Gateway Setup ==="

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker required"; exit 1; }

# Copy env file
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env file — please fill in your API keys"
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Start infrastructure
echo "Starting Redis and PostgreSQL..."
docker compose -f docker/docker-compose.yml up -d redis postgres

# Wait for services
sleep 3

# Run migrations
echo "Running database migrations..."
npm run db:migrate

# Build
echo "Building project..."
npm run build

echo ""
echo "=== Setup Complete ==="
echo "1. Edit .env with your API keys"
echo "2. Run 'npm run dev' to start development"
echo "3. Run 'npm run test:poc' to validate POC"
echo ""
