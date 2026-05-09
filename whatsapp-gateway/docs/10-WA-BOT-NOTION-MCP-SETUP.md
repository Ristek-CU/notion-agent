# WhatsApp Bot + Notion MCP — Setup Guide Lengkap (Docker)

**Tanggal**: April 2026
**Tujuan**: Bot WhatsApp yang bisa bikin tiket Notion lewat WA grup, menggunakan MCP Notion + Claude AI + Docker
**Repo MCP Notion**: https://github.com/makenotion/notion-mcp-server

---

# GAMBARAN BESAR

```
Lo di WA Grup, ketik:
  "!ticket Buatkan fitur login untuk app mobile di bagian ristek"

Bot otomatis:
  1. Detect intent "buat tiket"
  2. Extract: departemen=Ristek, task=fitur login, platform=mobile
  3. Call MCP Notion → bikin page di database Notion
  4. Reply: "Tiket #TK-001 created! [link Notion]"
```

---

# ARSITEKTUR

```
┌─────────────────────────────────────────────────────────────────┐
│                        DOCKER COMPOSE                           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    EVOLUTION API                          │  │
│  │                    (WhatsApp Web API)                     │  │
│  │                    Port: 8080                             │  │
│  │                    Connect ke WA Web via QR               │  │
│  └───────────────────────┬───────────────────────────────────┘  │
│                          │ webhook                             │
│                          v                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    ORCHESTRATOR (Bot)                      │  │
│  │                    Port: 3000                              │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │  │
│  │  │ Webhook     │  │ AI Agent     │  │ MCP Client      │ │  │
│  │  │ Handler     │→ │ (Claude API) │→ │ (Notion MCP)    │ │  │
│  │  └─────────────┘  └──────────────┘  └────────┬────────┘ │  │
│  │        ↑                                      │          │  │
│  │        │         Reply ke WA group            │          │  │
│  │        └──────────────────────────────────────┘          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │ stdio (child process)                │
│                          v                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    NOTION MCP SERVER                       │  │
│  │                    (notion-mcp-server)                     │  │
│  │                    Runs as subprocess di orchestrator      │  │
│  │                    Connects ke Notion API                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────┐                                               │
│  │ REDIS        │                                               │
│  │ Port: 6379   │  Queue + session storage                      │
│  └──────────────┘                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │                    │
         v                    v
  ┌──────────────┐   ┌──────────────┐
  │ Notion API   │   │ Claude API   │
  │ (tiket DB)   │   │ (AI agent)   │
  └──────────────┘   └──────────────┘
```

---

# STEP 1 — PRASYARAT

Yang perlu di-install di laptop/server:

| # | Tool | Versi | Fungsi |
|---|------|-------|--------|
| 1 | Docker + Docker Compose | 24+ | Runtime semua service |
| 2 | Node.js | 20 LTS | Build orchestrator |
| 3 | Git | latest | Clone repo |
| 4 | ngrok (opsional POC) | latest | Expose webhook ke internet |

Yang perlu daftar:

| # | Service | Dapat Apa |
|---|---------|-----------|
| 1 | Notion (notion.so) | Integration token + Database ID |
| 2 | Anthropic (console.anthropic.com) | Claude API key |
| 3 | ngrok (opsional) | Tunnel URL |

```bash
# Cek docker sudah terinstall
docker --version
docker compose version

# Cek node
node --version   # harus v20+
```

---

# STEP 2 — SETUP NOTION

## 2.1 Buat Notion Integration

```
1. Buka https://www.notion.so/my-integrations
2. Klik "+ New integration"
3. Isi:
   - Name: "WA Bot Ticket"
   - Workspace: pilih workspace lo
   - Capabilities:
     * Read content: ON
     * Update content: ON
     * Insert content: ON
4. Klik "Submit"
5. COPY "Internal Integration Secret" (dimulai "ntn_...")
   → Simpan, ini jadi NOTION_API_KEY
```

## 2.2 Buat Database Tiket di Notion

```
1. Buka Notion workspace
2. Buat page baru → kasih nama "Tickets"
3. Di dalam page → ketik "/database" → pilih "Table view"
4. Buat database dengan nama "Ticket Database"
5. Tambahkan kolom-kolom berikut:
```

| Nama Kolom | Type | Options / Contoh |
|------------|------|-----------------|
| **Ticket ID** | Title | TK-20260425-001 |
| **Status** | Select | Backlog, To Do, In Progress, Review, Done |
| **Departemen** | Select | Ristek, Design, Product, Marketing, HR, Finance |
| **Prioritas** | Select | Low, Medium, High, Urgent |
| **Deskripsi** | Text | "Buat fitur login untuk app mobile" |
| **Reporter** | Text | "Budi (WA: +62812xxx)" |
| **Assignee** | Person | (tag orang) |
| **Tanggal Dibuat** | Date | 2026-04-25 |
| **Due Date** | Date | 2026-05-01 |
| **Tags** | Multi-select | bug, feature, improvement, task |
| **Source** | Select | WhatsApp, Manual |

## 2.3 Share Database ke Integration

```
1. Di halaman database, klik "..." (more options)
2. Pilih "Connections" → "Connect to"
3. Cari dan pilih "WA Bot Ticket" (integration yang tadi dibuat)
4. Confirm
```

## 2.4 Copy Database ID

```
1. Buka database di browser
2. URL format: https://www.notion.so/workspace/DATABASE_ID?v=xxx
3. Copy bagian DATABASE_ID (32 karakter hex)
4. Simpan, ini jadi NOTION_DATABASE_ID
```

---

# STEP 3 — SETUP PROJECT DIRECTORY

```bash
# Buat folder project
mkdir wa-notion-bot && cd wa-notion-bot

# Init project
npm init -y

# Install dependencies
npm install fastify @anthropic-ai/sdk @modelcontextprotocol/sdk @notionhq/client bullmq ioredis dotenv zod

# Install dev dependencies
npm install -D typescript @types/node tsx vitest

# Init TypeScript
npx tsc --init
```

## 3.1 Project Structure

```
wa-notion-bot/
├── docker-compose.yml          # Semua service dalam 1 file
├── Dockerfile                  # Build orchestrator
├── .env                        # Semua API keys (JANGAN COMMIT)
├── .env.example                # Template .env
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                # Entry point
│   ├── config.ts               # Load & validate env
│   ├── webhook/
│   │   └── handler.ts          # Handle webhook dari Evolution API
│   ├── ai/
│   │   ├── agent.ts            # Claude agent + MCP integration
│   │   └── prompts.ts          # System prompt + tool definitions
│   ├── mcp/
│   │   └── notion-client.ts    # MCP client (spawn notion-mcp-server)
│   ├── notion/
│   │   └── ticket-service.ts   # Notion API direct calls (backup)
│   ├── wa/
│   │   └── sender.ts           # Send message ke WA via Evolution API
│   └── utils/
│       └── helpers.ts          # Helper functions
├── scripts/
│   └── setup-mcp.sh            # Script setup MCP
└── tests/
    └── agent.test.ts
```

---

# STEP 4 — DOCKER COMPOSE + DOCKERFILE

## 4.1 docker-compose.yml

```yaml
version: "3.9"

services:
  # ============================================================
  # EVOLUTION API — WhatsApp Web API (gratiss, tanpa Twilio)
  # ============================================================
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: wa-evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      - SERVER_URL=http://localhost:8080
      # Database untuk Evolution API (SQLite)
      - DATABASE_PROVIDER=sqlite
      - DATABASE_SAVE_DATA_INSTANCE=true
      # Authentication
      - AUTHENTICATION_API_KEY=evolution-api-key-change-this
      # Provider settings
      - PROVIDER_ENABLED=true
      - PROVIDER_HOST=http://orchestrator:3000
      - PROVIDER_WEBSOCKET_ENABLED=false
      # Logs
      - LOG_LEVEL=INFO
    volumes:
      - evolution_data:/evolution/store
    networks:
      - wa-bot-network

  # ============================================================
  # ORCHESTRATOR — Bot + AI Agent + MCP Client
  # ============================================================
  orchestrator:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: wa-orchestrator
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      # Anthropic
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - AI_MODEL=claude-sonnet-4-6
      # Notion
      - NOTION_API_KEY=${NOTION_API_KEY}
      - NOTION_DATABASE_ID=${NOTION_DATABASE_ID}
      - NOTION_VERSION=2022-06-28
      # Evolution API
      - EVOLUTION_API_URL=http://evolution-api:8080
      - EVOLUTION_API_KEY=evolution-api-key-change-this
      - EVOLUTION_INSTANCE_NAME=wa-bot
      # Redis
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./src:/app/src
    networks:
      - wa-bot-network

  # ============================================================
  # REDIS — Queue + Session
  # ============================================================
  redis:
    image: redis:7-alpine
    container_name: wa-redis
    restart: always
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    volumes:
      - redis_data:/data
    networks:
      - wa-bot-network

volumes:
  evolution_data:
  redis_data:

networks:
  wa-bot-network:
    driver: bridge
```

## 4.2 Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Install dependencies untuk MCP (notion-mcp-server butuh build tools)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Clone dan build notion-mcp-server
RUN git clone https://github.com/makenotion/notion-mcp-server.git /opt/notion-mcp-server
RUN cd /opt/notion-mcp-server && npm install && npm run build

# Build app
RUN npx tsc

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

## 4.3 .env.example

```bash
# ============================================================
# COPY file ini jadi .env, lalu isi value-nya
# cp .env.example .env
# ============================================================

# Anthropic (Claude AI)
ANTHROPIC_API_KEY=sk-ant-xxxxx-isikan-dengan-key-lo

# Notion
NOTION_API_KEY=ntn_xxxxx_isikan_dengan_integration_token
NOTION_DATABASE_ID=isikan_dengan_database_id_32_karakter_hex
NOTION_VERSION=2022-06-28

# WA Bot Config
EVOLUTION_INSTANCE_NAME=wa-bot
```

---

# STEP 5 — SOURCE CODE ORCHESTRATOR

## 5.1 config.ts — Environment Config

```typescript
// src/config.ts
import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  AI_MODEL: z.string().default("claude-sonnet-4-6"),

  // Notion
  NOTION_API_KEY: z.string().startsWith("ntn_"),
  NOTION_DATABASE_ID: z.string().min(1),
  NOTION_VERSION: z.string().default("2022-06-28"),

  // Evolution API
  EVOLUTION_API_URL: z.string().default("http://evolution-api:8080"),
  EVOLUTION_API_KEY: z.string().default("evolution-api-key-change-this"),
  EVOLUTION_INSTANCE_NAME: z.string().default("wa-bot"),

  // Redis
  REDIS_URL: z.string().default("redis://redis:6379"),
});

export const env = envSchema.parse(process.env);
```

## 5.2 mcp/notion-client.ts — MCP Client (Connect ke Notion MCP Server)

```typescript
// src/mcp/notion-client.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { env } from "../config.js";

let mcpClient: Client | null = null;

async function getMcpClient(): Promise<Client> {
  if (mcpClient) return mcpClient;

  const transport = new StdioClientTransport({
    command: "node",
    args: ["/opt/notion-mcp-server/build/index.js"],
    env: {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${env.NOTION_API_KEY}`,
        "Notion-Version": env.NOTION_VERSION,
      }),
    },
  });

  mcpClient = new Client(
    { name: "wa-bot-orchestrator", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  await mcpClient.connect(transport);
  console.log("[MCP] Connected to Notion MCP Server");
  return mcpClient;
}

export async function callNotionMCP(
  toolName: string,
  args: Record<string, unknown>
) {
  const client = await getMcpClient();
  const result = await client.callTool({ name: toolName, arguments: args });
  return result;
}

// Convenience functions untuk operasi tiket
export async function createNotionTicket(params: {
  ticketId: string;
  departemen: string;
  deskripsi: string;
  reporter: string;
  prioritas?: string;
  tags?: string[];
  dueDate?: string;
}) {
  return callNotionMCP("create-page", {
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties: {
      "Ticket ID": {
        title: [{ text: { content: params.ticketId } }],
      },
      Status: {
        select: { name: "To Do" },
      },
      Departemen: {
        select: { name: params.departemen },
      },
      Prioritas: {
        select: { name: params.prioritas || "Medium" },
      },
      Deskripsi: {
        rich_text: [{ text: { content: params.deskripsi } }],
      },
      Reporter: {
        rich_text: [{ text: { content: params.reporter } }],
      },
      "Tanggal Dibuat": {
        date: { start: new Date().toISOString().split("T")[0] },
      },
      ...(params.dueDate && {
        "Due Date": { date: { start: params.dueDate } },
      }),
      ...(params.tags && {
        Tags: {
          multi_select: params.tags.map((t) => ({ name: t })),
        },
      }),
      Source: {
        select: { name: "WhatsApp" },
      },
    },
  });
}

export async function searchTicket(ticketId: string) {
  return callNotionMCP("search", {
    query: ticketId,
    filter: {
      property: "object",
      value: "page",
    },
  });
}

export async function updateTicketStatus(
  pageId: string,
  status: string,
  notes?: string
) {
  return callNotionMCP("update-page", {
    page_id: pageId,
    properties: {
      Status: { select: { name: status } },
      ...(notes && {
        "Deskripsi": {
          rich_text: [{ text: { content: notes } }],
        },
      }),
    },
  });
}

export async function queryTicketsByDepartment(departement: string) {
  return callNotionMCP("query-database", {
    database_id: env.NOTION_DATABASE_ID,
    filter: {
      property: "Departemen",
      select: { equals: departement },
    },
    sorts: [
      {
        property: "Tanggal Dibuat",
        direction: "descending",
      },
    ],
  });
}

export async function listOpenTickets() {
  return callNotionMCP("query-database", {
    database_id: env.NOTION_DATABASE_ID,
    filter: {
      property: "Status",
      select: { does_not_equal: "Done" },
    },
    sorts: [
      {
        property: "Tanggal Dibuat",
        direction: "descending",
      },
    ],
  });
}
```

## 5.3 ai/prompts.ts — System Prompt

```typescript
// src/ai/prompts.ts

export const SYSTEM_PROMPT = `Kamu adalah bot ticketing untuk WhatsApp grup.
Tugas kamu: menerima permintaan tiket dari user dan membuat tiket di Notion.

ATURAN:
1. Selalu respons dalam Bahasa Indonesia yang singkat dan jelas
2. Gunakan format pesan yang rapi (bisa pakai *bold* dan line break)
3. Jangan pernah expose API key atau data internal

DEPARTEMEN yang tersedia:
- Ristek (teknologi, development, app, website, API, server, database)
- Design (UI/UX, mockup, wireframe, branding, visual)
- Product (fitur baru, roadmap, requirement, spesifikasi)
- Marketing (promosi, konten, sosmed, campaign)
- HR (rekrutmen, onboarding, kepegawaian)
- Finance (pembayaran, invoice, budget, laporan keuangan)

PRIORITAS:
- Urgent: production down, data hilang, keamanan
- High: bug besar, fitur blocker
- Medium: fitur biasa, improvement
- Low: minor fix, cosmetic, nice-to-have

FORMAT TIKET YANG HARUS DIKIRIM KE USER:
*Tiket Dibuat!*
ID: TK-XXXXXXXX-XXX
Departemen: [Nama]
Prioritas: [Level]
Status: To Do

Lihat detail: [Notion URL]

CONTOH PERCAKAPAN:

User: "!ticket bikin fitur login buat app mobile, assign ke ristek"
Bot: Buat tiket dengan detail:
  - Deskripsi: Fitur login untuk app mobile
  - Departemen: Ristek
  - Prioritas: Medium

User: "!ticket urgent! server production down, gak bisa akses sama sekali"
Bot: Buat tiket dengan detail:
  - Deskripsi: Server production down, tidak bisa diakses
  - Departemen: Ristek
  - Prioritas: Urgent

User: "status TK-20260425-001"
Bot: Cek tiket dan berikan info status terkini

User: "!tiket ristek" atau "!list ristek"
Bot: Tampilkan daftar tiket yang masih open untuk departemen Ristek

User: "!list ticket" atau "!list"
Bot: Tampilkan daftar semua tiket yang masih open`;
```

## 5.4 ai/agent.ts — AI Agent (Claude + MCP)

```typescript
// src/ai/agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import {
  createNotionTicket,
  searchTicket,
  queryTicketsByDepartment,
  listOpenTickets,
  updateTicketStatus,
} from "../mcp/notion-client.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

interface MessageContext {
  phoneNumber: string;
  pushName: string;
  groupName?: string;
  isGroup: boolean;
}

// Generate ticket ID
function generateTicketId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const seq = String(Date.now()).slice(-3);
  return `TK-${date}-${seq}`;
}

// Parse command dari pesan WA
function parseCommand(message: string): {
  command: string;
  args: string;
} | null {
  const trimmed = message.trim();

  // !ticket <deskripsi>
  if (/^!ticket\s+/i.test(trimmed)) {
    return {
      command: "create_ticket",
      args: trimmed.replace(/^!ticket\s+/i, ""),
    };
  }

  // !tiket <departemen> → list tiket by dept
  if (/^!tiket\s+/i.test(trimmed)) {
    return {
      command: "list_dept",
      args: trimmed.replace(/^!tiket\s+/i, ""),
    };
  }

  // !list [departemen]
  if (/^!list/i.test(trimmed)) {
    const dept = trimmed.replace(/^!list\s*/i, "").trim();
    return {
      command: dept ? "list_dept" : "list_all",
      args: dept,
    };
  }

  // status TK-XXXXXXXX-XXX
  const statusMatch = trimmed.match(
    /(?:status|cek|info)\s+(TK-\d{8}-\d{3})/i
  );
  if (statusMatch) {
    return { command: "check_status", args: statusMatch[1] };
  }

  return null;
}

// Main handler
export async function handleMessage(
  message: string,
  context: MessageContext
): Promise<string> {
  const cmd = parseCommand(message);

  // Kalau bukan command, skip (jangan respons ke semua pesan)
  if (!cmd) return "";

  try {
    switch (cmd.command) {
      case "create_ticket": {
        return await handleCreateTicket(cmd.args, context);
      }
      case "check_status": {
        return await handleCheckStatus(cmd.args);
      }
      case "list_dept": {
        return await handleListByDept(cmd.args);
      }
      case "list_all": {
        return await handleListAll();
      }
      default:
        return "";
    }
  } catch (error) {
    console.error("[Agent] Error:", error);
    return "Maaf, ada error saat memproses. Coba lagi ya.";
  }
}

// Buat tiket baru menggunakan Claude untuk extract entities, lalu MCP Notion
async function handleCreateTicket(
  description: string,
  context: MessageContext
): Promise<string> {
  // Step 1: Claude extract structured data dari natural language
  const extraction = await anthropic.messages.create({
    model: env.AI_MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Extract ticket info dari pesan ini. Return JSON only, no markdown.

Pesan: "${description}"

Format:
{
  "judul": "judul singkat max 60 char",
  "deskripsi": "deskripsi lengkap dari pesan user",
  "departemen": "Ristek|Design|Product|Marketing|HR|Finance",
  "prioritas": "Urgent|High|Medium|Low",
  "tags": ["tag1", "tag2"]
}`,
      },
    ],
  });

  const textBlock = extraction.content[0];
  if (textBlock.type !== "text") throw new Error("Unexpected response type");

  // Parse JSON dari response Claude
  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse extraction");
  const ticketData = JSON.parse(jsonMatch[0]);

  // Step 2: Buat tiket via MCP Notion
  const ticketId = generateTicketId();
  const reporter = `${context.pushName} (${context.phoneNumber})`;

  const result = await createNotionTicket({
    ticketId,
    departemen: ticketData.departemen || "Product",
    deskripsi: ticketData.deskripsi || description,
    reporter,
    prioritas: ticketData.prioritas || "Medium",
    tags: ticketData.tags || [],
  });

  // Extract URL dari result
  let notionUrl = "";
  if (result.content) {
    const content =
      typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content);
    const urlMatch = content.match(/https:\/\/www\.notion\.so\/[^\s"<>]+/);
    if (urlMatch) notionUrl = urlMatch[0];
  }

  // Step 3: Format response
  return `*Tiket Dibuat!*

ID: ${ticketId}
Judul: ${ticketData.judul}
Departemen: ${ticketData.departemen}
Prioritas: ${ticketData.prioritas}
Status: To Do
Reporter: ${context.pushName}
${ticketData.tags?.length ? `Tags: ${ticketData.tags.join(", ")}` : ""}
${notionUrl ? `\nLihat detail: ${notionUrl}` : ""}

Ketik *status ${ticketId}* untuk cek progress.`;
}

// Cek status tiket
async function handleCheckStatus(ticketId: string): Promise<string> {
  const result = await searchTicket(ticketId);

  if (!result.content || (typeof result.content === "string" && result.content.includes("No results"))) {
    return `Tiket ${ticketId} tidak ditemukan.`;
  }

  // Parse result
  const content =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  return `*Status Tiket: ${ticketId}*

${content}

Ketik *!list* untuk lihat semua tiket.`;
}

// List tiket by departemen
async function handleListByDept(departement: string): Promise<string> {
  // Normalize departemen name
  const deptMap: Record<string, string> = {
    ristek: "Ristek",
    tech: "Ristek",
    it: "Ristek",
    design: "Design",
    ui: "Design",
    ux: "Design",
    product: "Product",
    pm: "Product",
    marketing: "Marketing",
    promo: "Marketing",
    hr: "HR",
    finance: "Finance",
    keuangan: "Finance",
  };

  const dept = deptMap[departement.toLowerCase()] || departement;

  const result = await queryTicketsByDepartment(dept);
  const content =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  return `*Tiket Departemen ${dept}*

${content}

Ketik *!list* untuk semua departemen.`;
}

// List semua tiket open
async function handleListAll(): Promise<string> {
  const result = await listOpenTickets();
  const content =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);

  return `*Semua Tiket Open*

${content}`;
}
```

## 5.5 wa/sender.ts — Kirim Pesan ke WA

```typescript
// src/wa/sender.ts
import { env } from "../config.js";

interface SendOptions {
  instanceName: string;
  number: string;
  text: string;
  isGroup?: boolean;
}

export async function sendWhatsAppMessage(options: SendOptions) {
  const { instanceName, number, text, isGroup } = options;

  const endpoint = isGroup
    ? `${env.EVOLUTION_API_URL}/message/sendText/${instanceName}`
    : `${env.EVOLUTION_API_URL}/message/sendText/${instanceName}`;

  const body = isGroup
    ? {
        number,
        text,
        options: {
          delay: 500,
          presence: "composing",
        },
      }
    : {
        number,
        text,
        options: {
          delay: 500,
          presence: "composing",
        },
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("[WA Sender] Error:", error);
    throw new Error(`Failed to send WA message: ${response.status}`);
  }

  return response.json();
}

// Reply ke grup yang sama (dari webhook data)
export async function replyToGroup(
  instanceName: string,
  groupJid: string,
  text: string
) {
  return sendWhatsAppMessage({
    instanceName,
    number: groupJid,
    text,
    isGroup: true,
  });
}
```

## 5.6 webhook/handler.ts — Webhook Handler

```typescript
// src/webhook/handler.ts
import { FastifyInstance } from "fastify";
import { handleMessage } from "../ai/agent.js";
import { replyToGroup } from "../wa/sender.js";
import { env } from "../config.js";

interface WAWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName: string;
    message: {
      conversation?: string;
      extendedTextMessage?: { text: string };
    };
    messageType: string;
  };
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  // Webhook dari Evolution API
  app.post("/webhook/:instanceName", async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    const payload = request.body as WAWebhookPayload;

    // Validasi instance name
    if (instanceName !== env.EVOLUTION_INSTANCE_NAME) {
      return reply.code(403).send({ error: "Invalid instance" });
    }

    // Hanya proses pesan masuk (bukan dari bot sendiri)
    if (payload.data?.key?.fromMe) {
      return reply.code(200).send({ status: "ignored" });
    }

    // Extract message text
    const messageText =
      payload.data?.message?.conversation ||
      payload.data?.message?.extendedTextMessage?.text ||
      "";

    if (!messageText.trim()) {
      return reply.code(200).send({ status: "ignored" });
    }

    const remoteJid = payload.data?.key?.remoteJid || "";
    const pushName = payload.data?.pushName || "Unknown";
    const isGroup = remoteJid.includes("@g.us");

    console.log(
      `[Webhook] ${isGroup ? "GROUP" : "DM"} from ${pushName}: ${messageText.slice(0, 100)}`
    );

    // Process message (async, jangan block webhook response)
    setImmediate(async () => {
      try {
        const response = await handleMessage(messageText, {
          phoneNumber: remoteJid,
          pushName,
          isGroup,
        });

        // Kalau ada response, kirim balik
        if (response) {
          await replyToGroup(instanceName, remoteJid, response);
        }
      } catch (error) {
        console.error("[Webhook] Processing error:", error);
      }
    });

    // Response cepat ke Evolution API
    return reply.code(200).send({ status: "received" });
  });

  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
```

## 5.7 index.ts — Entry Point

```typescript
// src/index.ts
import Fastify from "fastify";
import { env } from "./config.js";
import { registerWebhookRoutes } from "./webhook/handler.js";

async function main() {
  console.log("[Bot] Starting WA Notion Bot...");
  console.log(`[Bot] Environment: ${env.NODE_ENV}`);
  console.log(`[Bot] Port: ${env.PORT}`);

  const app = Fastify({ logger: true });

  // Register routes
  await registerWebhookRoutes(app);

  // Start server
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`[Bot] Server running on port ${env.PORT}`);
    console.log("[Bot] Ready to receive WhatsApp messages!");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

---

# STEP 6 — SETUP EVOLUTION API (WhatsApp)

Evolution API dipakai karena gratis dan support WA groups (tanpa perlu Twilio/WhatsApp Business API).

## 6.1 Start Docker Compose

```bash
# Pastikan .env sudah diisi
cp .env.example .env
# Edit .env dengan API keys lo

# Start semua service
docker compose up -d

# Cek semua container jalan
docker compose ps
```

## 6.2 Connect WhatsApp

```bash
# Buat instance baru di Evolution API
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: evolution-api-key-change-this" \
  -d '{
    "instanceName": "wa-bot",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'

# Ambil QR Code untuk scan
curl -X GET http://localhost:8080/instance/connect/wa-bot \
  -H "apikey: evolution-api-key-change-this"

# Response akan berisi QR code → scan pakai WA lo
# Setelah scan, bot akan join ke akun WA lo
```

## 6.3 Setup Webhook

```bash
# Set webhook URL agar Evolution API kirim pesan ke orchestrator
curl -X POST http://localhost:8080/webhook/set/wa-bot \
  -H "Content-Type: application/json" \
  -H "apikey: evolution-api-key-change-this" \
  -d '{
    "enabled": true,
    "url": "http://orchestrator:3000/webhook/wa-bot",
    "webhookByEvents": false,
    "events": [
      "MESSAGES_UPSERT"
    ]
  }'
```

## 6.4 Bot Join WA Group

```
1. Dari WA lo, buat group atau gunakan group yang sudah ada
2. Add kontak bot (nomor WA yang tadi di-scan QR) ke group
3. Atau kalau pakai nomor sendiri sebagai bot, sudah otomatis ada di group
```

---

# STEP 7 — TESTING STEP-BY-STEP

## 7.1 Test MCP Notion Connection

```bash
# Masuk ke container orchestrator
docker compose exec orchestrator sh

# Test MCP connection (manual)
node -e "
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function test() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['/opt/notion-mcp-server/build/index.js'],
    env: {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: 'Bearer ' + process.env.NOTION_API_KEY,
        'Notion-Version': process.env.NOTION_VERSION
      })
    }
  });

  const client = new Client(
    { name: 'test', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  await client.connect(transport);
  const tools = await client.listTools();
  console.log('MCP Tools available:', JSON.stringify(tools, null, 2));
  process.exit(0);
}

test().catch(console.error);
"
```

## 7.2 Test Buat Tiket Manual

Di WA group, kirim:

```
!ticket Bikin fitur login untuk app mobile, assign ke ristek, prioritas high
```

Expected response dari bot:

```
*Tiket Dibuat!*

ID: TK-20260425-001
Judul: Fitur login app mobile
Departemen: Ristek
Prioritas: High
Status: To Do
Reporter: Nama Lo (+62812xxx)
Tags: feature, mobile

Ketik *status TK-20260425-001* untuk cek progress.
```

## 7.3 Test Cek Status

```
status TK-20260425-001
```

## 7.4 Test List Tiket

```
!list ristek
```

```
!list
```

---

# STEP 8 — COMMANDS CHEAT SHEET

| Command | Contoh | Fungsi |
|---------|--------|--------|
| `!ticket <deskripsi>` | `!ticket fix bug login, ristek` | Buat tiket baru |
| `status <ticket_id>` | `status TK-20260425-001` | Cek status tiket |
| `!list <dept>` | `!list ristek` | List tiket per departemen |
| `!list` | `!list` | List semua tiket open |
| `!tiket <dept>` | `!tiket design` | Alias list by dept |

---

# STEP 9 — ALTERNATIF: PAKAI NOTION API LANGSUNG (TANPA MCP)

Kalau MCP client bermasalah, lo bisa pakai Notion API langsung tanpa MCP. Ini backup plan.

```typescript
// src/notion/ticket-service.ts
import { env } from "../config.js";

const NOTION_HEADERS = {
  Authorization: `Bearer ${env.NOTION_API_KEY}`,
  "Notion-Version": env.NOTION_VERSION,
  "Content-Type": "application/json",
};

export async function createTicketDirect(params: {
  ticketId: string;
  departemen: string;
  deskripsi: string;
  reporter: string;
  prioritas?: string;
  tags?: string[];
}) {
  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: NOTION_HEADERS,
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties: {
        "Ticket ID": {
          title: [{ text: { content: params.ticketId } }],
        },
        Status: { select: { name: "To Do" } },
        Departemen: { select: { name: params.departemen } },
        Prioritas: { select: { name: params.prioritas || "Medium" } },
        Deskripsi: {
          rich_text: [{ text: { content: params.deskripsi } }],
        },
        Reporter: {
          rich_text: [{ text: { content: params.reporter } }],
        },
        "Tanggal Dibuat": {
          date: { start: new Date().toISOString().split("T")[0] },
        },
        Source: { select: { name: "WhatsApp" } },
        ...(params.tags?.length && {
          Tags: {
            multi_select: params.tags.map((t) => ({ name: t })),
          },
        }),
      },
    }),
  });

  const data = await response.json();
  return {
    pageId: data.id,
    url: data.url,
    ticketId: params.ticketId,
  };
}
```

Untuk menggunakan ini, ganti import di `ai/agent.ts`:

```typescript
// Ganti dari:
import { createNotionTicket } from "../mcp/notion-client.js";
// Menjadi:
import { createTicketDirect } from "../notion/ticket-service.js";

// Lalu di handleCreateTicket(), ganti:
// const result = await createNotionTicket({...});
// Menjadi:
// const result = await createTicketDirect({...});
```

---

# STEP 10 — TROUBLESHOOTING

## Bot tidak merespon

```bash
# Cek logs
docker compose logs orchestrator
docker compose logs evolution-api

# Cek container jalan
docker compose ps

# Restart
docker compose restart orchestrator
```

## MCP Notion connection error

```bash
# Cek notion-mcp-server sudah terbuild
docker compose exec orchestrator ls /opt/notion-mcp-server/build/

# Kalau belum ada, build manual
docker compose exec orchestrator sh -c \
  "cd /opt/notion-mcp-server && npm install && npm run build"
```

## Evolution API QR tidak muncul

```bash
# Delete instance, buat ulang
curl -X DELETE http://localhost:8080/instance/delete/wa-bot \
  -H "apikey: evolution-api-key-change-this"

# Buat ulang
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: evolution-api-key-change-this" \
  -d '{
    "instanceName": "wa-bot",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

## Notion API 401 Unauthorized

```
- Cek NOTION_API_KEY di .env (harus mulai dari "ntn_")
- Cek integration sudah di-share ke database
- Cek database ID benar (32 karakter hex)
```

---

# STEP 11 — DEPLOY KE SERVER (Production)

## 11.1 Pakai VPS (DigitalOcean / Vultr / Hetzner)

```bash
# Di server
git clone <repo-lo>
cd wa-notion-bot

# Setup .env
cp .env.example .env
nano .env  # isi semua API key

# Start
docker compose up -d

# Cek
docker compose logs -f orchestrator
```

## 11.2 Setup Reverse Proxy (opsional)

```nginx
# /etc/nginx/sites-available/wa-bot
server {
    listen 80;
    server_name wa-bot.lo-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 11.3 Monitoring

```bash
# Watch logs real-time
docker compose logs -f --tail=100

# Resource usage
docker stats

# Health check
curl http://localhost:3000/health
```

---

# STEP 12 — NEXT STEPS (Pengembangan Lanjutan)

Setelah basic ticketing jalan, bisa ditambah:

1. **Multi-group support** — Bot bisa di multiple WA groups
2. **Notification** — Auto-notify grup kalau tiket di-update
3. **Assignee mention** — Tag orang di WA kalau di-assign tiket
4. **Weekly summary** — Auto-send ringkasan tiket per minggu
5. **Approval flow** — Tiket butuh approval dari manager sebelum jalan
6. **More MCP modules** — Tambah Google Sheets, Slack, GitHub MCP

---

# RINGKASAN URUTAN KERJA

```
STEP 1 — Install Docker, Node.js, Git
     ↓
STEP 2 — Buat Notion Integration + Database Tiket
     ↓
STEP 3 — Buat project folder + install dependencies
     ↓
STEP 4 — Copy semua code dari Step 5 (source code)
     ↓
STEP 5 — Buat .env dari .env.example, isi API keys
     ↓
STEP 6 — docker compose up -d
     ↓
STEP 7 — Setup Evolution API (scan QR, set webhook)
     ↓
STEP 8 — Test: kirim !ticket di WA group
     ↓
STEP 9 — Kalau jalan, lanjut deploy ke server
     ↓
STEP 10 — Tambah fitur sesuai kebutuhan
```

---

*Dibuat untuk WA Bot + Notion MCP Ticketing System — Docker Compose Setup*
