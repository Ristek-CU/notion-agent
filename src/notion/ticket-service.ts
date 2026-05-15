// src/notion/ticket-service.ts
// Direct Notion API calls for ticket/backlog operations
// Now uses notion-api-core for: retry, rate limiting, caching, pagination

import { env } from "../config.js";
import {
  notionRequest,
  queryDatabaseAll,
  createPage,
  updatePage,
  archivePage,
  restorePage,
  getBlockChildren,
  appendBlocks,
  getComments,
  createComment,
  searchNotion,
  type NotionPage,
  type NotionBlock,
  type NotionComment,
} from "./notion-api-core.js";

// ─── Types ──────────────────────────────────────────────────────────

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
  picPageIds: string[]; // Array of member page IDs for multi-PIC support
  picNames: string[];   // Array of PIC names for description text
  reviewedByPageIds?: string[]; // Array of reviewer member page IDs
  reviewedByNames?: string[];   // Array of reviewer names for description text
}

interface NotionPageResult {
  pageId: string;
  url: string;
  ticketId: string;
}

interface TicketDetail {
  pageId: string;
  url: string;
  name: string;
  status: string;
  priority: string;
  properties: Record<string, unknown>;
  content: string;
  blocks: NotionBlock[];
  comments: NotionComment[];
}

// ─── Create Ticket (Master Backlog) ─────────────────────────────────

/**
 * Create a backlog item in Master Backlog via Notion API.
 * Now uses core module with retry and rate limiting.
 */
export async function createTicketDirect(
  params: TicketParams
): Promise<NotionPageResult> {
  // Map priority to Master Backlog values
  const priorityMap: Record<string, string> = {
    Urgent: "High",
    High: "High",
    Medium: "Medium",
    Low: "Low",
  };
  const priority = priorityMap[params.prioritas || "Medium"] || "Medium";

  // Build properties — use judul (short title) for Name, not deskripsi
  const titleText = params.judul || params.deskripsi.slice(0, 80);

  // Map status to valid Notion status values
  const statusMap: Record<string, string> = {
    "not started": "Not started",
    "in progress": "In progress",
    "need to review": "Need to review",
    "need review": "Need to review",
    "need to fix": "Need to fix",
    "need fix": "Need to fix",
    "done": "Done",
    "complete": "Done",
    "completed": "Done",
    "blocking": "Blocking",
  };
  const statusInput = (params.status || "Not started").toLowerCase().trim();
  const status = statusMap[statusInput] || params.status || "Not started";

  const properties: Record<string, unknown> = {
    Name: {
      title: [{ text: { content: titleText.slice(0, 100) } }],
    },
    Status: { status: { name: status } },
    "Priority Level": { select: { name: priority } },
    Active: { checkbox: true },
  };

  // Add PIC relation — supports multiple PICs as array
  if (params.picPageIds.length > 0) {
    properties["PIC"] = {
      relation: params.picPageIds.map((id: string) => ({ id })),
    };
  }

  // Add Divisions relation if provided
  if (params.divisionPageId) {
    properties["\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions"] = {
      relation: [{ id: params.divisionPageId }],
    };
  }

  // Add Projects relation if provided
  if (params.projectPageId) {
    properties["\u{1F4D5} Projects"] = {
      relation: [{ id: params.projectPageId }],
    };
  }

  // Add Reviewed By relation if provided
  if (params.reviewedByPageIds && params.reviewedByPageIds.length > 0) {
    properties["Reviewed By"] = {
      relation: params.reviewedByPageIds.map((id: string) => ({ id })),
    };
  }

  if (params.dueDate) {
    properties["Due Date"] = { date: { start: params.dueDate } };
  }

  // Build professional description for page content
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

  let detailText = `${params.deskripsi}\n\n`;
  detailText += `\u2500\u2500\u2500 Detail \u2500\u2500\u2500\n`;
  if (params.picNames.length > 0) detailText += `PIC: ${params.picNames.join(", ")}\n`;
  if (params.divisi && params.divisi !== "-") detailText += `Divisi: ${params.divisi}\n`;
  if (params.project && params.project !== "-") detailText += `Project: ${params.project}\n`;
  detailText += `Prioritas: ${priority}\n`;
  detailText += `Status: ${status}\n`;
  if (params.dueDate) detailText += `Deadline: ${params.dueDate}\n`;
  if (params.reviewedByNames && params.reviewedByNames.length > 0) detailText += `Reviewed By: ${params.reviewedByNames.join(", ")}\n`;
  detailText += `Reporter: ${params.reporter}\n`;
  detailText += `Dibuat: ${dateStr} ${timeStr} WIB\n`;
  detailText += `Sumber: WhatsApp Bot`;

  const data = await createPage({
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties,
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: { content: detailText },
            },
          ],
        },
      },
    ],
  });

  return {
    pageId: data.id,
    url: data.url,
    ticketId: params.ticketId,
  };
}

// ─── Query ──────────────────────────────────────────────────────────

/**
 * Query Master Backlog database with full pagination.
 * Covers: #4 (pagination)
 */
export async function queryTicketsDirect(
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, string>>
) {
  const results = await queryDatabaseAll(env.NOTION_DATABASE_ID, filter, sorts);
  return { results, has_more: false, next_cursor: null };
}

/**
 * Search pages by title via Notion API.
 */
export async function searchPagesDirect(query: string) {
  return searchNotion(query, { property: "object", value: "page" });
}

/**
 * Update a page's properties directly via Notion API.
 * Now uses core module with retry and rate limiting.
 */
export async function updatePageDirect(
  pageId: string,
  properties: Record<string, unknown>
) {
  return updatePage(pageId, properties);
}

/**
 * Generic query any Notion database with full pagination.
 * Covers: #4 (pagination)
 */
export async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, string>>
) {
  const results = await queryDatabaseAll(databaseId, filter, sorts);
  return { results, has_more: false, next_cursor: null };
}

/**
 * Get database schema.
 */
export async function getDatabaseSchema(databaseId: string) {
  const { getDatabase } = await import("./notion-api-core.js");
  return getDatabase(databaseId);
}

// ─── Delete / Archive ───────────────────────────────────────────────

/**
 * Archive (soft delete) a ticket page.
 * Covers: #1 (delete page)
 */
export async function archiveTicketDirect(pageId: string): Promise<NotionPage> {
  return archivePage(pageId);
}

/**
 * Restore an archived ticket page.
 */
export async function restoreTicketDirect(pageId: string): Promise<NotionPage> {
  return restorePage(pageId);
}

// ─── Ticket Detail ──────────────────────────────────────────────────

/**
 * Get full ticket detail including content blocks and comments.
 * Covers: #3 (read page blocks), #8 (read comments)
 */
export async function getTicketDetail(pageId: string): Promise<TicketDetail> {
  const page = await notionRequest<NotionPage>({
    method: "GET",
    path: `/pages/${pageId}`,
  });

  const blocks = await getBlockChildren(pageId);
  const contentText = blocksToPlainText(blocks);

  let comments: NotionComment[] = [];
  try {
    const commentResult = await getComments(pageId);
    comments = commentResult.results;
  } catch {
    // Comments might not be enabled
  }

  const props = page.properties;
  const name = extractTitleFromProps(props);
  const status = extractStatusFromProps(props);
  const priority = extractPriorityFromProps(props);

  return {
    pageId: page.id,
    url: page.url,
    name,
    status,
    priority,
    properties: props,
    content: contentText,
    blocks,
    comments,
  };
}

// ─── Content Editing ────────────────────────────────────────────────

/**
 * Add content/note to a ticket.
 * Covers: #2 (edit page content - append)
 */
export async function addTicketNote(
  pageId: string,
  note: string,
  author: string
): Promise<void> {
  const now = new Date();
  const timestamp = now.toLocaleString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  await appendBlocks(pageId, [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { type: "text", text: { content: `[${timestamp}] ${author}: ` } },
        ],
      },
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          { type: "text", text: { content: note } },
        ],
      },
    },
  ]);
}

/**
 * Add a comment to a ticket.
 * Covers: #8 (add comments)
 */
export async function addTicketComment(
  pageId: string,
  text: string
): Promise<NotionComment> {
  return createComment(pageId, [
    { type: "text", text: { content: text } },
  ]);
}

// ─── Helpers ────────────────────────────────────────────────────────

function extractTitleFromProps(props: Record<string, unknown>): string {
  const name = props["Name"] as { title?: Array<{ plain_text?: string }> };
  return name?.title?.map((t) => t.plain_text ?? "").join("") ?? "(untitled)";
}

function extractStatusFromProps(props: Record<string, unknown>): string {
  const status = props["Status"] as { status?: { name?: string } };
  return status?.status?.name ?? "Unknown";
}

function extractPriorityFromProps(props: Record<string, unknown>): string {
  const priority = props["Priority Level"] as { select?: { name?: string } };
  return priority?.select?.name ?? "None";
}

function blocksToPlainText(blocks: NotionBlock[]): string {
  const texts: string[] = [];
  for (const block of blocks) {
    const blockData = block as Record<string, unknown>;
    const blockType = block.type;
    const content = blockData[blockType] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
    if (content?.rich_text) {
      texts.push(content.rich_text.map((rt) => rt.plain_text ?? "").join(""));
    }
  }
  return texts.join("\n");
}
