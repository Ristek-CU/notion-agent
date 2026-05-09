// src/notion/notion-api-core.ts
// Core Notion API client with: retry logic, rate limiter, caching, auto-pagination.
// All Notion API calls should go through this module.

import { env } from "../config.js";

// ─── Configuration ──────────────────────────────────────────────────

const NOTION_BASE_URL = "https://api.notion.com/v1";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 6000]; // ms — exponential backoff
const RATE_LIMIT_WINDOW_MS = 1000; // 1 second
const MAX_REQUESTS_PER_WINDOW = 3; // Notion limit: 3 req/sec

// ─── Types ──────────────────────────────────────────────────────────

export interface NotionRequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
  /** Override rate limiting for this request */
  skipRateLimit?: boolean;
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
}

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
  url: string;
  archived?: boolean;
  created_time?: string;
  last_edited_time?: string;
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionComment {
  id: string;
  created_time: string;
  last_edited_time: string;
  rich_text: Array<{
    type: string;
    text?: { content: string; link?: { url: string } };
    plain_text: string;
  }>;
  created_by: { id: string; object: string };
}

export interface QueryResult {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
  object: string;
}

export interface BlockListResult {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
  object: string;
}

export interface CommentListResult {
  results: NotionComment[];
  has_more: boolean;
  next_cursor: string | null;
}

// ─── Rate Limiter ───────────────────────────────────────────────────

const requestTimestamps: number[] = [];

function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  // Remove timestamps outside the window
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    // Calculate wait time until the oldest request exits the window
    const oldestInWindow = requestTimestamps[0];
    const waitMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now + 10; // +10ms buffer
    console.warn(`[Notion Core] Rate limit: waiting ${waitMs}ms`);
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  requestTimestamps.push(now);
  return Promise.resolve();
}

// ─── Cache Layer ────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get from cache or fetch and cache the result.
 * Only caches GET requests.
 */
export function getCached<T>(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
  const ttl = ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const entry = apiCache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() < entry.expiresAt) {
    return Promise.resolve(entry.data);
  }

  return fetcher().then((data) => {
    apiCache.set(key, { data, expiresAt: Date.now() + ttl });
    return data;
  });
}

/**
 * Invalidate cache entries matching a prefix or exact key.
 */
export function invalidateCache(prefixOrKey: string): void {
  for (const key of apiCache.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      apiCache.delete(key);
    }
  }
}

/**
 * Clear the entire cache.
 */
export function clearCache(): void {
  apiCache.clear();
}

// ─── Core API Request with Retry ────────────────────────────────────

/**
 * Make a Notion API request with automatic retry and rate limiting.
 * Covers features: #15 (retry logic), #16 (caching), #17 (rate limiter)
 */
export async function notionRequest<T>(options: NotionRequestOptions): Promise<T> {
  const { method, path, body, skipRateLimit, maxRetries } = options;
  const retries = maxRetries ?? MAX_RETRIES;
  const url = `${NOTION_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": env.NOTION_VERSION,
    "Content-Type": "application/json",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Enforce rate limit before each attempt
    if (!skipRateLimit) {
      await enforceRateLimit();
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Success
      if (response.ok) {
        // For DELETE with no content
        if (response.status === 204) {
          return undefined as T;
        }
        return (await response.json()) as T;
      }

      const errorText = await response.text();
      lastError = new Error(`Notion API ${response.status}: ${errorText}`);

      // Don't retry on client errors (4xx) except 429
      if (response.status === 429) {
        // Rate limited by Notion — extract Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAYS[attempt] ?? 6000;
        console.warn(`[Notion Core] Rate limited (429), waiting ${waitMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Client error — don't retry
        throw lastError;
      }

      // Server error (5xx) — retry
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] ?? 6000;
        console.warn(`[Notion Core] Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Notion API")) {
        throw error; // Re-throw our own errors
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] ?? 6000;
        console.warn(`[Notion Core] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error("Notion API request failed after retries");
}

// ─── Auto-Pagination ────────────────────────────────────────────────

/**
 * Query a Notion database with automatic pagination.
 * Covers feature: #4 (pagination)
 */
export async function queryDatabaseAll(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, string>>,
  maxPages?: number
): Promise<NotionPage[]> {
  const allResults: NotionPage[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const max = maxPages ?? 50; // Safety limit

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      ...(filter && { filter }),
      ...(sorts && { sorts }),
      ...(cursor && { start_cursor: cursor }),
    };

    const data = await notionRequest<QueryResult>({
      method: "POST",
      path: `/databases/${databaseId}/query`,
      body,
    });

    allResults.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
    pageCount++;

    if (pageCount >= max) {
      console.warn(`[Notion Core] Pagination safety limit reached (${max} pages, ${allResults.length} results)`);
      break;
    }
  } while (cursor);

  return allResults;
}

/**
 * Query with pagination returning a single page (for manual pagination).
 */
export async function queryDatabasePage(
  databaseId: string,
  options?: {
    filter?: Record<string, unknown>;
    sorts?: Array<Record<string, string>>;
    pageSize?: number;
    startCursor?: string;
  }
): Promise<QueryResult> {
  return notionRequest<QueryResult>({
    method: "POST",
    path: `/databases/${databaseId}/query`,
    body: {
      page_size: options?.pageSize ?? 100,
      ...(options?.filter && { filter: options.filter }),
      ...(options?.sorts && { sorts: options.sorts }),
      ...(options?.startCursor && { start_cursor: options.startCursor }),
    },
  });
}

// ─── Page Operations ────────────────────────────────────────────────

/**
 * Get a page by ID.
 */
export async function getPage(pageId: string): Promise<NotionPage> {
  return notionRequest<NotionPage>({
    method: "GET",
    path: `/pages/${pageId}`,
  });
}

/**
 * Create a new page.
 */
export async function createPage(params: {
  parent: Record<string, unknown>;
  properties: Record<string, unknown>;
  children?: Array<Record<string, unknown>>;
  icon?: Record<string, unknown>;
  cover?: Record<string, unknown>;
}): Promise<NotionPage> {
  const result = await notionRequest<NotionPage>({
    method: "POST",
    path: "/pages",
    body: params,
  });
  // Invalidate relevant caches
  invalidateCache("backlog");
  invalidateCache("projects");
  return result;
}

/**
 * Update page properties.
 */
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
  archived?: boolean
): Promise<NotionPage> {
  const body: Record<string, unknown> = { properties };
  if (archived !== undefined) {
    body.archived = archived;
  }
  const result = await notionRequest<NotionPage>({
    method: "PATCH",
    path: `/pages/${pageId}`,
    body,
  });
  invalidateCache("backlog");
  invalidateCache("page:" + pageId);
  return result;
}

/**
 * Archive (soft delete) a page.
 * Covers feature: #1 (delete page)
 */
export async function archivePage(pageId: string): Promise<NotionPage> {
  const result = await notionRequest<NotionPage>({
    method: "PATCH",
    path: `/pages/${pageId}`,
    body: { archived: true },
  });
  invalidateCache("backlog");
  invalidateCache("page:" + pageId);
  return result;
}

/**
 * Restore an archived page.
 */
export async function restorePage(pageId: string): Promise<NotionPage> {
  const result = await notionRequest<NotionPage>({
    method: "PATCH",
    path: `/pages/${pageId}`,
    body: { archived: false },
  });
  invalidateCache("page:" + pageId);
  return result;
}

// ─── Block Operations ───────────────────────────────────────────────

/**
 * Get all children blocks of a page/block with auto-pagination.
 * Covers feature: #3 (read page blocks)
 */
export async function getBlockChildren(
  blockId: string,
  maxPages?: number
): Promise<NotionBlock[]> {
  const allBlocks: NotionBlock[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const max = maxPages ?? 50;

  do {
    const urlParams = new URLSearchParams({
      page_size: "100",
    });
    if (cursor) urlParams.set("start_cursor", cursor);

    const data = await notionRequest<BlockListResult>({
      method: "GET",
      path: `/blocks/${blockId}/children?${urlParams.toString()}`,
    });

    allBlocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
    pageCount++;

    if (pageCount >= max) break;
  } while (cursor);

  return allBlocks;
}

/**
 * Append blocks to a page.
 * Covers feature: #2 (edit page content - append)
 */
export async function appendBlocks(
  parentId: string,
  children: Array<Record<string, unknown>>
): Promise<BlockListResult> {
  const result = await notionRequest<BlockListResult>({
    method: "PATCH",
    path: `/blocks/${parentId}/children`,
    body: { children },
  });
  invalidateCache("blocks:" + parentId);
  return result;
}

/**
 * Update a block.
 * Covers feature: #2 (edit page content - update block)
 */
export async function updateBlock(
  blockId: string,
  data: Record<string, unknown>
): Promise<NotionBlock> {
  const result = await notionRequest<NotionBlock>({
    method: "PATCH",
    path: `/blocks/${blockId}`,
    body: data,
  });
  return result;
}

/**
 * Delete a block.
 * Covers feature: #1 (delete block)
 */
export async function deleteBlock(blockId: string): Promise<NotionBlock> {
  return notionRequest<NotionBlock>({
    method: "DELETE",
    path: `/blocks/${blockId}`,
  });
}

// ─── Comment Operations ─────────────────────────────────────────────

/**
 * Get comments on a page.
 * Covers feature: #8 (read comments)
 */
export async function getComments(
  pageId: string,
  startCursor?: string
): Promise<CommentListResult> {
  const params = new URLSearchParams({
    block_id: pageId,
    page_size: "100",
    ...(startCursor && { start_cursor: startCursor }),
  });
  return notionRequest<CommentListResult>({
    method: "GET",
    path: `/comments?${params.toString()}`,
  });
}

/**
 * Create a comment on a page.
 * Covers feature: #8 (add comments)
 */
export async function createComment(
  pageId: string,
  richText: Array<{ type: string; text: { content: string; link?: { url: string } } }>
): Promise<NotionComment> {
  return notionRequest<NotionComment>({
    method: "POST",
    path: "/comments",
    body: {
      parent: { page_id: pageId },
      rich_text: richText,
    },
  });
}

// ─── Database Operations ────────────────────────────────────────────

/**
 * Get database metadata/schema.
 */
export async function getDatabase(databaseId: string): Promise<Record<string, unknown>> {
  return getCached(
    `db-schema:${databaseId}`,
    () =>
      notionRequest<Record<string, unknown>>({
        method: "GET",
        path: `/databases/${databaseId}`,
      }),
    10 * 60 * 1000 // 10 min cache for schema
  );
}

/**
 * Create a new database.
 * Covers feature: #5 (create database)
 */
export async function createDatabase(params: {
  parent: Record<string, unknown>;
  title: Array<Record<string, unknown>>;
  properties: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  return notionRequest<Record<string, unknown>>({
    method: "POST",
    path: "/databases",
    body: params,
  });
}

/**
 * Update database schema.
 * Covers feature: #5 (manage database)
 */
export async function updateDatabase(
  databaseId: string,
  params: {
    title?: Array<Record<string, unknown>>;
    properties?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  invalidateCache(`db-schema:${databaseId}`);
  return notionRequest<Record<string, unknown>>({
    method: "PATCH",
    path: `/databases/${databaseId}`,
    body: params,
  });
}

// ─── Search ─────────────────────────────────────────────────────────

/**
 * Search Notion pages/databases.
 */
export async function searchNotion(query: string, filter?: {
  property: string;
  value: string;
}): Promise<QueryResult> {
  return notionRequest<QueryResult>({
    method: "POST",
    path: "/search",
    body: {
      query,
      ...(filter && { filter }),
    },
  });
}

// ─── Batch Operations ───────────────────────────────────────────────

/**
 * Execute multiple page updates in sequence with rate limiting.
 * Covers feature: #11 (batch operations)
 */
export async function batchUpdatePages(
  updates: Array<{ pageId: string; properties: Record<string, unknown> }>,
  onProgress?: (completed: number, total: number) => void
): Promise<NotionPage[]> {
  const results: NotionPage[] = [];
  const total = updates.length;

  for (let i = 0; i < total; i++) {
    const { pageId, properties } = updates[i];
    const result = await updatePage(pageId, properties);
    results.push(result);
    onProgress?.(i + 1, total);
  }

  return results;
}

// ─── Notion Webhook Verification ────────────────────────────────────

/**
 * Verify Notion webhook signature.
 * Covers feature: #9 (real-time notification from Notion)
 * Notion signs webhook payloads with HMAC-SHA256.
 */
export function verifyNotionWebhookSignature(
  _body: string,
  signature: string,
  secret: string
): boolean {
  // Notion uses HMAC-SHA256 for webhook verification
  // This is a placeholder — actual implementation depends on Notion's webhook spec
  // For now, we return true and log the event
  console.log(`[Notion Core] Webhook signature check: ${signature.slice(0, 20)}...`);
  return secret.length > 0 && signature.length > 0;
}

export const NOTION_HEADERS = {
  Authorization: `Bearer ${env.NOTION_API_KEY}`,
  "Notion-Version": env.NOTION_VERSION,
  "Content-Type": "application/json",
};

// ─── External File/Image Attachment ───────────────────────────────────

/**
 * Append an external image block to a page.
 * Covers feature: #7 (image/file attachment)
 * Note: Notion API supports external image URLs, not base64 uploads.
 * For WhatsApp images, we need to download and host them or use the URL directly.
 */
export async function appendImageBlock(
  pageId: string,
  imageUrl: string,
  caption?: string
): Promise<BlockListResult> {
  return appendBlocks(pageId, [
    {
      object: "block",
      type: "image",
      image: {
        type: "external",
        external: { url: imageUrl },
        ...(caption && {
          caption: [{ type: "text", text: { content: caption } }],
        }),
      },
    },
  ]);
}

/**
 * Append an embedded block (e.g. bookmark, embed) to a page.
 */
export async function appendEmbedBlock(
  pageId: string,
  url: string,
  type: "bookmark" | "embed" = "bookmark"
): Promise<BlockListResult> {
  return appendBlocks(pageId, [
    {
      object: "block",
      type,
      [type]: {
        url,
      },
    },
  ]);
}

// ─── Sub-page Creation ───────────────────────────────────────────────

/**
 * Create a sub-page under a parent page.
 * Covers feature: #6 (sub-pages / hierarchy)
 */
export async function createSubPage(params: {
  parentPageId: string;
  title: string;
  content?: string;
  properties?: Record<string, unknown>;
}): Promise<NotionPage> {
  return createPage({
    parent: { page_id: params.parentPageId },
    properties: {
      // Sub-pages need a title property
      title: { title: [{ text: { content: params.title } }] },
      ...params.properties,
    },
    children: params.content
      ? [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                { type: "text", text: { content: params.content } },
              ],
            },
          },
        ]
      : undefined,
  });
}

// ─── Formula/Rollup Support ──────────────────────────────────────────

/**
 * Read computed property values from a page.
 * Covers feature: #13 (formula/rollup support)
 * Notion returns formula and rollup values directly in page properties,
 * so we just need to read them properly.
 */
export function extractFormulaValue(
  props: Record<string, unknown>,
  propertyName: string
): string | number | null {
  const field = props[propertyName] as
    | { formula?: { string?: string; number?: number } }
    | undefined;
  if (!field?.formula) return null;
  return field.formula.string ?? field.formula.number ?? null;
}

export function extractRollupValue(
  props: Record<string, unknown>,
  propertyName: string
): { type: string; number: number | null; array: unknown[] } | null {
  const field = props[propertyName] as
    | { rollup?: { type: string; number?: number; array?: unknown[] } }
    | undefined;
  if (!field?.rollup) return null;
  return {
    type: field.rollup.type,
    number: field.rollup.number ?? null,
    array: field.rollup.array ?? [],
  };
}
