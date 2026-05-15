# Notion Integration & MCP Design

## WhatsApp Service Gateway (WSG)

---

## 1. Integration Architecture Overview

The system uses a **dual-path integration** with Notion:

1. **Direct Notion API** (primary path) -- all production operations go through `notion-api-core.ts` which provides retry logic, rate limiting, caching, and auto-pagination.
2. **MCP Client** (secondary/fallback path) -- `notion-client.ts` connects to an external Notion MCP Server via `@modelcontextprotocol/sdk` stdio transport. Kept for compatibility but not used for core operations.

```
┌──────────────────────────────────────────────────────┐
│                     agent.ts                         │
│         (AI agent, command router, intent detection)  │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
            ▼                      ▼
┌───────────────────────┐  ┌──────────────────────┐
│   ticket-service.ts   │  │ notion-org-service.ts│
│   (Ticket CRUD)       │  │ (Backlog, Projects,  │
│                       │  │  Divisions, Members)  │
└───────────┬───────────┘  └──────────┬───────────┘
            │                         │
            ▼                         ▼
┌──────────────────────────────────────────────────────┐
│              notion-api-core.ts                      │
│    retry · rate limiter · cache · auto-pagination    │
└───────────┬──────────────────────┬───────────────────┘
            │                      │
            ▼                      ▼
┌───────────────────────┐  ┌──────────────────────┐
│   Notion REST API     │  │  notion-client.ts    │
│   (primary path)      │  │  (MCP via stdio,     │
│                       │  │   kept for compat)   │
└───────────────────────┘  └──────────────────────┘
```

### Why Direct API is Primary

The MCP client (`src/mcp/notion-client.ts`) was the original integration path but was superseded by direct API calls because:

- **Consistency**: All operations share the same retry, rate limiting, and caching layer.
- **Reliability**: No dependency on an external MCP Server process (`/opt/notion-mcp-server/build/index.js`).
- **Performance**: Eliminates the stdio transport overhead and child process spawning.
- **Feature coverage**: The direct API layer supports operations that MCP tools don't expose (e.g., batch updates, relation management, block editing).

---

## 2. Notion API Core (`src/notion/notion-api-core.ts`)

The foundational module that wraps every Notion REST API call. Provides four cross-cutting concerns:

### 2.1 Configuration

```typescript
const NOTION_BASE_URL = "https://api.notion.com/v1";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 6000]; // ms — exponential backoff
const RATE_LIMIT_WINDOW_MS = 1000;       // 1 second sliding window
const MAX_REQUESTS_PER_WINDOW = 3;       // Notion limit: 3 req/sec
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

Environment overrides from `src/config.ts`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NOTION_RATE_LIMIT_RPS` | 3 | Requests per second |
| `NOTION_MAX_RETRIES` | 3 | Max retry attempts |
| `CACHE_TTL_BACKLOG_MS` | 2 min | Backlog list cache TTL |
| `CACHE_TTL_PROJECTS_MS` | 5 min | Projects list cache TTL |
| `CACHE_TTL_MEMBERS_MS` | 10 min | Members list cache TTL |
| `CACHE_TTL_RELATIONS_MS` | 10 min | Relation name cache TTL |

### 2.2 Retry Logic

All API calls go through `notionRequest<T>()` which implements a retry loop:

```typescript
export async function notionRequest<T>(options: NotionRequestOptions): Promise<T> {
  // Up to MAX_RETRIES attempts
  for (let attempt = 0; attempt <= retries; attempt++) {
    await enforceRateLimit(); // before each attempt

    // On success (2xx): return parsed response
    // On 429 (rate limited): read Retry-After header, wait, retry
    // On 4xx (client error): throw immediately (no retry)
    // On 5xx (server error): retry with exponential backoff
    // On network error: retry with exponential backoff
  }
}
```

Backoff delays: `1000ms → 3000ms → 6000ms` (exponential).

### 2.3 Rate Limiter

Sliding-window rate limiter tracking request timestamps:

```typescript
const requestTimestamps: number[] = [];

function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS; // 1 second window

  // Remove timestamps outside the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    // Calculate wait time until oldest request exits the window
    const waitMs = requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - now + 10;
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(now);
  return Promise.resolve();
}
```

### 2.4 Cache Layer

TTL-based in-memory cache for GET requests:

```typescript
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T>;
export function invalidateCache(prefixOrKey: string): void; // prefix or exact key
export function clearCache(): void;
```

Cache invalidation happens automatically on write operations (`createPage`, `updatePage`, `archivePage`, `restorePage`, `appendBlocks`).

### 2.5 Auto-Pagination

```typescript
// Fetch ALL pages from a database query (handles Notion's 100-item page limit)
export async function queryDatabaseAll(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, string>>,
  maxPages?: number  // Safety limit: default 50 pages = 5000 results
): Promise<NotionPage[]>;

// Fetch a single page of results (for manual pagination)
export async function queryDatabasePage(
  databaseId: string,
  options?: { filter?, sorts?, pageSize?, startCursor? }
): Promise<QueryResult>;
```

### 2.6 Exported Operations

| Category | Functions |
|----------|-----------|
| **Database** | `getDatabase`, `createDatabase`, `updateDatabase` |
| **Pages** | `getPage`, `createPage`, `updatePage`, `archivePage`, `restorePage`, `createSubPage` |
| **Blocks** | `getBlockChildren`, `appendBlocks`, `updateBlock`, `deleteBlock` |
| **Comments** | `getComments`, `createComment` |
| **Search** | `searchNotion` |
| **Batch** | `batchUpdatePages` |
| **Media** | `appendImageBlock`, `appendEmbedBlock` |
| **Formula/Rollup** | `extractFormulaValue`, `extractRollupValue` |
| **Cache** | `getCached`, `invalidateCache`, `clearCache` |

---

## 3. MCP Client (`src/mcp/notion-client.ts`)

Lazy MCP client that connects to a Notion MCP Server via stdio transport. Falls back gracefully if unavailable.

### 3.1 Connection Lifecycle

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpClient: Client | null = null;
let mcpConnected = false;
```

The client uses **lazy initialization** -- it only spawns the MCP Server process when `getMcpClient()` is first called:

```typescript
async function getMcpClient(): Promise<Client | null> {
  if (mcpClient && mcpConnected) return mcpClient;

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
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  mcpConnected = true;
  return mcpClient;
}
```

### 3.2 Fallback Strategy

If the MCP Server is unavailable (process not found, startup failure, connection error), the client returns `null` and callers fall back to the direct Notion API:

```typescript
export async function callNotionMCP(toolName: string, args: Record<string, unknown>): Promise<unknown | null> {
  const client = await getMcpClient();
  if (!client) {
    console.warn(`[MCP] Cannot call ${toolName} — MCP server unavailable`);
    return null;  // Caller falls back to direct API
  }
  return await client.callTool({ name: toolName, arguments: args });
}
```

### 3.3 Exported Functions

| Function | Description |
|----------|-------------|
| `callNotionMCP(toolName, args)` | Call an MCP tool; returns `null` if unavailable |
| `listMCPTools()` | List available MCP server tools |
| `closeMcpClient()` | Gracefully close the MCP connection |

---

## 4. Organization Service (`src/notion/notion-org-service.ts`)

High-level service for reading/writing organizational data: Master Backlog, Master Projects, Divisions, and Members. All operations go through `notion-api-core.ts`.

### 4.1 Backlog Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `listBacklog` | `(filter?, sorts?) => Promise<BacklogItem[]>` | List all backlog items with auto-pagination and caching (2 min TTL) |
| `searchBacklog` | `(query: string) => Promise<BacklogItem[]>` | Search by name (partial match, uses `listBacklog` with title filter) |
| `getBacklogByStatus` | `(status: string) => Promise<BacklogItem[]>` | Filter by status |
| `getBacklogByProject` | `(projectId: string) => Promise<BacklogItem[]>` | Filter by project page ID |
| `getBacklogByMember` | `(memberPageId: string) => Promise<BacklogItem[]>` | Filter by member page ID |
| `getBacklogByMemberName` | `(memberName: string) => Promise<BacklogItem[]>` | Resolve nickname, then 4-strategy member lookup |
| `getBacklogByDivision` | `(divisionName: string) => Promise<string>` | Resolve alias, query by division relation, return formatted WhatsApp message |
| `getBacklogByStatusSummary` | `(status: string) => Promise<string>` | Query by status, return formatted WhatsApp message |
| `getBacklogStats` | `() => Promise<Stats>` | Aggregate stats: total, by status, by priority, by division |
| `updateBacklogStatus` | `(pageId, newStatus) => Promise<NotionPage>` | Update Status property |
| `updateBacklogPriority` | `(pageId, priority) => Promise<NotionPage>` | Update Priority Level property |
| `deleteBacklogItem` | `(pageId) => Promise<NotionPage>` | Archive (soft delete) |
| `restoreBacklogItem` | `(pageId) => Promise<NotionPage>` | Unarchive |
| `bulkUpdateBacklogStatus` | `(filter, newStatus, onProgress?) => Promise<{updated, errors}>` | Batch status update with progress callback |

### 4.2 Project Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `listProjects` | `() => Promise<ProjectItem[]>` | All projects with caching (5 min TTL) |
| `searchProject` | `(query: string) => Promise<ProjectItem \| null>` | Search by name (partial match) |
| `getProjectDetails` | `(projectName: string) => Promise<{project, backlog} \| null>` | Project info + related backlog items |

### 4.3 Division Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `listDivisions` | `() => Promise<DivisionItem[]>` | All divisions with caching (10 min TTL) |

### 4.4 Member Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `listMembers` | `() => Promise<MemberItem[]>` | All members with caching (10 min TTL) |
| `getMembersByDivision` | `(divisionName: string) => Promise<MemberItem[]>` | Resolve alias, find division, filter members |

### 4.5 Page Detail & Content Operations

| Function | Signature | Description |
|----------|-----------|-------------|
| `getPageDetail` | `(pageId) => Promise<PageDetail>` | Full page with blocks, comments, content text (1 min TTL) |
| `addPageContent` | `(pageId, content) => Promise<void>` | Append paragraph block |
| `addComment` | `(pageId, text) => Promise<NotionComment>` | Add a comment |
| `removeBlock` | `(blockId) => Promise<void>` | Delete a block |
| `updateBlockContent` | `(blockId, newContent, blockType?) => Promise<void>` | Update block content |

### 4.6 Relation Management

| Function | Signature | Description |
|----------|-----------|-------------|
| `addRelation` | `(pageId, propertyName, relatedPageId) => Promise<NotionPage>` | Add a relation (deduped) |
| `removeRelation` | `(pageId, propertyName, relatedPageId) => Promise<NotionPage>` | Remove a relation |
| `assignPicToBacklog` | `(pageId, memberPageId) => Promise<NotionPage>` | Add PIC relation |
| `removePicFromBacklog` | `(pageId, memberPageId) => Promise<NotionPage>` | Remove PIC relation |

### 4.7 Cache Control

```typescript
export function refreshAllCaches(): void {
  invalidateCache("backlog");
  invalidateCache("projects");
  invalidateCache("divisions");
  invalidateCache("members");
  invalidateCache("page");
  relationCache.clear();
}
```

Triggered by the `!refresh` command.

### 4.8 Data Types

```typescript
interface BacklogItem {
  id: string;
  name: string;
  status: string;       // "Not started", "In progress", "Need to review", "Need to fix", "Done", "Blocking"
  priority: string;     // "High", "Medium", "Low"
  active: boolean;
  dueDate: string;
  divisions: string[];  // resolved relation names
  projects: string[];   // resolved relation names
  pics: string[];       // resolved PIC names
  url: string;
  archived: boolean;
  content: string;      // loaded on demand via getPageDetail
}

interface ProjectItem {
  id: string;
  name: string;
  divisions: string[];
  headOfProject: string[];
  backlogCount: number;
  url: string;
}

interface DivisionItem {
  id: string;
  name: string;
}

interface MemberItem {
  id: string;
  name: string;
  divisionIds: string[];
}
```

---

## 5. Ticket Service (`src/notion/ticket-service.ts`)

Direct Notion API calls for ticket/backlog CRUD operations. Wraps `notion-api-core.ts` functions with ticket-specific logic.

### 5.1 Ticket Creation

```typescript
export async function createTicketDirect(params: TicketParams): Promise<NotionPageResult>
```

Creates a page in the Master Backlog database with:

- **Title**: `judul` or first 80 chars of `deskripsi`
- **Status**: mapped via status map (e.g., `"not started"` → `"Not started"`)
- **Priority**: mapped via priority map (e.g., `"Urgent"` → `"High"`)
- **Relations**: PIC (multi-PIC support), Divisions, Projects, Reviewed By
- **Page content**: Professional description block with metadata (PIC, division, project, priority, reporter, timestamp, source)

```typescript
interface TicketParams {
  ticketId: string;
  judul?: string;
  divisi?: string;
  project?: string;
  deskripsi: string;
  reporter: string;
  prioritas?: string;
  status?: string;
  dueDate?: string;
  divisionPageId?: string;
  projectPageId?: string;
  picPageIds: string[];         // Multi-PIC support
  picNames: string[];
  reviewedByPageIds?: string[];
  reviewedByNames?: string[];
}
```

### 5.2 Query Operations

| Function | Description |
|----------|-------------|
| `queryTicketsDirect(filter?, sorts?)` | Query Master Backlog with full pagination |
| `searchPagesDirect(query)` | Search Notion pages by title |
| `updatePageDirect(pageId, properties)` | Update page properties |
| `queryDatabase(databaseId, filter?, sorts?)` | Generic database query with pagination |
| `getDatabaseSchema(databaseId)` | Get database metadata/schema |

### 5.3 Delete / Archive

| Function | Description |
|----------|-------------|
| `archiveTicketDirect(pageId)` | Soft delete (archive) a ticket |
| `restoreTicketDirect(pageId)` | Restore an archived ticket |

### 5.4 Ticket Detail

```typescript
export async function getTicketDetail(pageId: string): Promise<TicketDetail>
```

Returns full ticket with page properties, content blocks (as text), and comments.

### 5.5 Content Editing

| Function | Description |
|----------|-------------|
| `addTicketNote(pageId, note, author)` | Append timestamped note block with author attribution |
| `addTicketComment(pageId, text)` | Add a Notion comment to the page |

---

## 6. Data Model

The system integrates with **4 Notion databases**:

### 6.1 Master Backlog (`NOTION_DATABASE_ID` / `NOTION_MASTER_BACKLOG_ID`)

| Property | Type | Description |
|----------|------|-------------|
| `Name` | Title | Ticket/backlog item title |
| `Status` | Status | `Not started`, `In progress`, `Need to review`, `Need to fix`, `Done`, `Blocking` |
| `Priority Level` | Select | `High`, `Medium`, `Low` |
| `Active` | Checkbox | Whether the item is active |
| `Due Date` | Date | Deadline |
| `PIC` | Relation → Members | Assigned people (multi-select) |
| `🧏‍♀️ Divisions` | Relation → Divisions | Associated divisions |
| `📖 Projects` | Relation → Projects | Associated projects |
| `Reviewed By` | Relation → Members | Reviewers |

### 6.2 Master Projects (`NOTION_MASTER_PROJECTS_ID`)

| Property | Type | Description |
|----------|------|-------------|
| `Name` | Title | Project name |
| `🧏‍♀️ Divisions` | Relation → Divisions | Participating divisions |
| `Head Of Project` | Relation → Members | Project leads |
| `💾 Master Backlog` | Relation → Backlog | Backward relation (count used for `backlogCount`) |

### 6.3 Divisions (`NOTION_DIVISIONS_ID`)

| Property | Type | Description |
|----------|------|-------------|
| `Name` | Title | Division name |

### 6.4 Members (`NOTION_MEMBERS_ID`)

| Property | Type | Description |
|----------|------|-------------|
| `Member Name` | Title | Full name of the member |
| `🧏‍♀️ Divisions` | Relation → Divisions | Division membership |

### Entity Relations

```
Master Backlog ──PIC──→ Members
Master Backlog ──Divisions──→ Divisions
Master Backlog ──Projects──→ Master Projects
Master Backlog ──Reviewed By──→ Members
Master Projects ──Divisions──→ Divisions
Master Projects ──Head Of Project──→ Members
Members ──Divisions──→ Divisions
```

---

## 7. Division Alias System

### 7.1 Alias Map

12 divisions with multiple aliases each for flexible user input matching:

```typescript
export const DIVISION_ALIASES: Record<string, string[]> = {
  "Research and Technology": ["ristek", "tech", "teknologi", "it", "technology", "research", "rnd", "r&d", "dev", "development"],
  "Media and Information": ["media", "informasi", "minfo", "info", "konten", "content", "medinfo"],
  "Public and Community Relations": ["pcr", "pubcom", "pr", "public", "community", "komunitas", "hubungan masyarakat", "external relations", "eksternal", "external", "humas", "publik", "public relation"],
  "Business And Partnership": ["bnp", "bisnis", "business", "partnership", "partner", "sponsor", "kerjasama", "b&p", "bisnis dan partnership", "business and partner"],
  "Intellectual & Career Development": ["icd", "intellectual", "career", "karir", "pelatihan", "training", "skill", "career development", "intelektual", "intellectual and career"],
  "Student Advocacy and Welfare": ["advo", "advocacy", "advokasi", "welfare", "kesejahteraan", "student advocacy", "saw", "student advocacy & welfare", "advokasi mahasiswa"],
  "UKM Development": ["ukm", "unit kegiatan", "ukm dev"],
  "Treasurer": ["treasurer", "keuangan", "finance", "uang", "budget", "bendahara"],
  "Controller": ["controller", "kontrol", "audit", "monitoring", "controker"],
  "Secretary": ["secretary", "sekretaris", "admin", "administrasi", "surat", "dokumentasi", "sec"],
  "Executive": ["executive", "eksekutif", "strategi", "keputusan"],
  "BPH": ["bph", "badan pengurus harian", "pengurus harian", "board"],
};
```

### 7.2 Resolution Logic

**`resolveDivisionAlias(input: string): string | null`**

Two-phase matching:
1. **Direct full-name match** -- case-insensitive comparison against division names.
2. **Alias match** -- for short aliases (≤3 chars), requires exact match or word boundary match (`\b`). For longer aliases, substring match is accepted.

```typescript
// Short alias (≤3 chars): word boundary required to avoid false matches
if (alias.length <= 3) {
  if (lower === alias || new RegExp(`\\b${escapeRegex(alias)}\\b`).test(lower)) return full;
}
// Longer alias: substring match
else {
  if (lower === alias || lower.includes(alias)) return full;
}
```

**`detectDivisionFromMessage(message: string): string | null`**

Extracts division from a natural language message:
1. Collects all matching (alias, division) pairs.
2. Sorts by alias length descending (longest/most specific first).
3. Checks for division-related context keywords (`backlog`, `tiket`, `tugas`, `divisi`, `project`, `anggota`, `pic`, etc.).
4. With context: returns the best match.
5. Without context: only accepts aliases ≥4 chars to avoid false positives (e.g., "it" in "audit", "pr" in "progress").

---

## 8. Member Nickname System

### 8.1 Nickname Map

120+ nickname-to-full-name mappings covering all organization members:

```typescript
export const MEMBER_NICKNAMES: Record<string, string> = {
  "adelaide": "Adelaide Dione Griselda Kean",
  "adib": "Abubakar Adib",
  "adinda": "Adinda Azka. F",
  "afiq": "Muhammad Afiq Aqhdaq",
  // ... 120+ entries
  "ojan": "Andi Fauzan H",
  "teo": "Stepanus Teo",
  "zahra": "Az Zahra Nabila",
  "zaskia": "Zaskia Claudya Yasmin",
};
```

Multiple nicknames can map to the same person (e.g., `"ojan"` and `"fauzan"` both resolve to `"Andi Fauzan H"`).

### 8.2 Fuzzy Matching Algorithm

**`resolveNickname(name: string): string | null`**

Three-phase resolution:

```
Phase 1: Exact lookup (O(1))
  └─ "ojan" → "Andi Fauzan H"

Phase 2: Partial match (prefix/suffix)
  └─ "mars" matches prefix of "marshelinda" → "Marshelinda Rukmana"

Phase 3: Fuzzy match (Levenshtein distance)
  └─ For inputs ≤10 chars only
  └─ Max edits: 2 for words ≤5 chars, 3 for words ≤10 chars
  └─ "ojax" → Levenshtein("ojan", "ojax") = 1 → "Andi Fauzan H"
```

### 8.3 Levenshtein Distance Implementation

```typescript
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
```

### 8.4 Member Name Resolution in Backlog Queries

`getBacklogByMemberName(memberName)` uses a 4-strategy lookup:

1. **Exact match** on resolved full name against `Member Name` title property.
2. **Exact match** on original input name (in case nickname resolution changed it incorrectly).
3. **Contains search** with filtering -- splits resolved name into parts, searches each part, then uses `findBestMemberMatch()` to score results.
4. **Fallback contains** on the original input name.

`findBestMemberMatch()` scores candidates by:
- Exact match: immediate return
- Starts-with match: +100 points
- Word boundary match per name part: +50 points each
- Substring match per name part: +10 points each
- Name length penalty: -0.1 per character

---

## 9. Cache Strategy

### 9.1 TTL Per Data Type

| Data Type | Cache Key Pattern | TTL | Rationale |
|-----------|-------------------|-----|-----------|
| Backlog lists | `backlog:list:{filter}:{sorts}` | 2 min | Changes frequently, needs fresh data |
| Projects list | `projects:list` | 5 min | Moderate change frequency |
| Divisions list | `divisions:list` | 10 min | Rarely changes |
| Members list | `members:list` | 10 min | Rarely changes |
| Database schema | `db-schema:{databaseId}` | 10 min | Schema changes are very rare |
| Relation names | `relation:{pageId}` | 10 min | Page titles rarely change |
| Page details | `page:detail:{pageId}` | 1 min | Content changes should be visible quickly |

### 9.2 Invalidation Strategy

Write operations automatically invalidate related caches:

```typescript
// createPage invalidates backlog and projects caches
invalidateCache("backlog");
invalidateCache("projects");

// updatePage invalidates backlog and specific page cache
invalidateCache("backlog");
invalidateCache("page:" + pageId);

// appendBlocks invalidates block cache for that page
invalidateCache("blocks:" + parentId);
```

The `invalidateCache()` function supports **prefix matching** -- calling `invalidateCache("backlog")` removes all keys starting with `backlog:`.

### 9.3 Manual Refresh

The `!refresh` command triggers `refreshAllCaches()` which clears all cache prefixes and the relation cache.

---

## 10. Rate Limiting Strategy

### 10.1 Notion API Limits

Notion enforces **3 requests per second** per integration. The system respects this with a sliding-window rate limiter in `notion-api-core.ts`.

### 10.2 Token Bucket Implementation

The rate limiter uses a **sliding window counter** (not a classic token bucket, but achieves the same effect):

```
Timeline:  |----1s window----|
           t1  t2  t3        ← 3 requests in window
                              t4 must wait until t1 exits the window
```

- Maintains an array of request timestamps.
- Before each request, removes timestamps older than 1 second.
- If 3+ timestamps remain, calculates wait time and sleeps.
- Adds a 10ms buffer to avoid edge cases.

### 10.3 Rate Limit Handling on 429

When Notion returns HTTP 429 (Too Many Requests):

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  const waitMs = retryAfter
    ? parseInt(retryAfter, 10) * 1000
    : RETRY_DELAYS[attempt] ?? 6000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  continue; // retry
}
```

### 10.4 Batch Operation Rate Limiting

Bulk operations (`bulkUpdateBacklogStatus`, `batchUpdatePages`) process updates **sequentially** with rate limiting between each:

```typescript
for (const upd of updates) {
  await updatePage(upd.pageId, upd.properties); // rate limited internally
  completed++;
  onProgress?.(completed, updates.length);
}
```

This ensures compliance with the 3 req/s limit even when updating dozens of items.

### 10.5 Skip Rate Limit Option

Internal operations that are already rate-limited at a higher level can skip per-request rate limiting:

```typescript
export interface NotionRequestOptions {
  skipRateLimit?: boolean; // Override rate limiting for this request
}
```
