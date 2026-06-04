// src/notion/notion-org-service.ts
// Service for reading/writing Master Projects, Master Backlog, Divisions, Members
// Now uses notion-api-core for: retry, rate limiting, caching, auto-pagination

import { env } from "../config.js";
import {
  notionRequest,
  queryDatabaseAll,
  getCached,
  invalidateCache,
  updatePage,
  archivePage,
  restorePage,
  getBlockChildren,
  appendBlocks,
  deleteBlock,
  getComments,
  createComment,
  type NotionPage,
  type NotionBlock,
  type NotionComment,
} from "./notion-api-core.js";

// ─── Division Alias Map ────────────────────────────────────────────

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

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve a division name/alias to the full division name.
 */
export function resolveDivisionAlias(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (!lower) return null; // guard empty string
  // Direct match against full names
  for (const full of Object.keys(DIVISION_ALIASES)) {
    if (lower === full.toLowerCase()) return full;
  }
  // Match against aliases — use word boundary matching for short aliases
  for (const [full, aliases] of Object.entries(DIVISION_ALIASES)) {
    for (const alias of aliases) {
      if (alias.length <= 3) {
        // Short alias: require exact match or word boundary
        if (lower === alias || new RegExp(`\\b${escapeRegex(alias)}\\b`).test(lower)) return full;
      } else {
        // Longer alias: substring match is OK
        if (lower === alias || lower.includes(alias)) return full;
      }
    }
  }
  return null;
}

/**
 * Detect division name from a message string using alias map.
 * Prioritizes longer/more specific aliases first to avoid false matches.
 * Skips very short/generic aliases (under 3 chars) unless the message is specifically about a division.
 */
export function detectDivisionFromMessage(message: string): string | null {
  const lower = message.toLowerCase();

  // Collect all matching (alias, division) pairs, sort by alias length descending (most specific first)
  const matches: Array<{ alias: string; division: string }> = [];

  for (const [full, aliases] of Object.entries(DIVISION_ALIASES)) {
    for (const alias of aliases) {
      let matched = false;
      if (alias.length <= 3) {
        // Short alias: require word boundary to avoid false matches (e.g. "it" in "audit")
        matched = new RegExp(`\\b${escapeRegex(alias)}\\b`).test(lower);
      } else {
        matched = lower.includes(alias);
      }
      if (matched) {
        matches.push({ alias, division: full });
      }
    }
  }

  if (matches.length === 0) return null;

  // Sort by alias length descending — longer aliases are more specific
  matches.sort((a, b) => b.alias.length - a.alias.length);

  // Check if the message has division-related context (not just a passing mention)
  const hasDivisionContext = lower.includes("backlog") || lower.includes("tiket") ||
    lower.includes("tugas") || lower.includes("divisi") || lower.includes("division") ||
    lower.includes("project") || lower.includes("anggota") || lower.includes("member") ||
    lower.includes("tim") || lower.includes("team") || lower.includes("departemen") ||
    lower.includes("pic") || lower.includes("kerja") || lower.includes("kerjaan");

  // If there's division context, use the best (longest) match
  if (hasDivisionContext) {
    return matches[0].division;
  }

  // Without division context, only accept aliases that are at least 4 chars long
  // to avoid false positives like "it", "pr", "hr"
  const specificMatch = matches.find(m => m.alias.length >= 4);
  if (specificMatch) return specificMatch.division;

  // For very short aliases (like "it", "pr", "bnp"), require the message to be short and focused
  if (matches[0].alias.length < 4 && lower.split(/\s+/).length <= 4) {
    return matches[0].division;
  }

  return null;
}

// ─── Member Nickname Map ─────────────────────────────────────────────

export const MEMBER_NICKNAMES: Record<string, string> = {
  // ── Generated from contacts.json (101 members) + extra aliases ──
  // ── 120 unique nickname → full name mappings, sorted alphabetically ──
  "adelaide": "Adelaide Dione Griselda Kean",
  "adib": "Abubakar Adib",
  "adinda": "Adinda Azka. F",
  "afiq": "Muhammad Afiq Aqhdaq",
  "aguini": "Aguini Providensia Tjandra",
  "ahzam": "Abdullah Ahzam",
  "aileen": "Aileen Alvina Fahrudin",
  "ainun": "Ainun Kholishah",
  "aisha": "Aisha Omar Hussen Alamodi",
  "ajeng": "Aulia Ajeng Ramadhani",
  "alfhie": "Alfhie Marsya Ayudannie",
  "almadea": "Diva Almadea Vasya",
  "alya": "Alya Mutiara Lattifa",
  "andaru": "Firaas Andaru Athaa Ramadhan",
  "andhika": "Andhika Putri Lestari",
  "andi": "Andi Fauzan H",
  "andi fauzan": "Andi Fauzan H",
  "anisa": "Anisa Ayu Listiani",
  "anthony": "Vincensius Anthony",
  "aris": "Aris Irhamni A. P",
  "askia": "Askia Fazila Pasha",
  "atikah": "Atikah Nurfatkiyah",
  "aulia": "Aulia Barokah Khaerani",
  "aurel": "Muhammad Aurel Luneto",
  "ayesha": "Katharina Ayesha Lintang Marchariyalya",
  "azka": "Azka Abdillah",
  "bhima": "Thoriq Bhima Filiandro",
  "defa": "Defa Luna",
  "dian": "Dian Monik Rosita",
  "dione": "Adelaide Dione Griselda Kean",
  "dita": "Dita Wilia Wardah",
  "diva": "Diva Almadea Vasya",
  "diva nabilla": "Diva Nabilla",
  "estrella": "Estrella Illda Meisya",
  "farhan": "Farhan Athalla Azis",
  "farlencia": "Farlencia Kayla Anggraeni",
  "farrel": "Farrel Abda Aghazka",
  "fatimah": "Fatimah Tri Lestari",
  "fauzan": "Andi Fauzan H",
  "faza": "Faza Qinthoro",
  "fazril": "M. Fazril",
  "firaas": "Firaas Andaru Athaa Ramadhan",
  "fityah": "Fityah Najwa S.",
  "gina": "Jauzaa Gina Nabilla",
  "hedy": "Hedy",
  "herlangga": "Herlangga Sapoetra",
  "iqbal": "Iqbal Azhari Pasaribu",
  "ivan": "Ivander Daniel Napitupulu",
  "ivander": "Ivander Daniel Napitupulu",
  "jauzaa": "Jauzaa Gina Nabilla",
  "kanaya": "Kanaya Anantani Syafikri",
  "katharina": "Katharina Ayesha Lintang Marchariyalya",
  "kayla": "Kayla Azwa Nasifa",
  "laudya": "Laudya Pricilla Putri",
  "lehandika": "Satrio Lehandika Putra",
  "leroy": "Leroy Christopher Gerson",
  "linggar": "Linggar Fahlevi",
  "luthfie": "Muhammad Luthfie Alfathin",
  "marshel": "Marshelinda Rukmana",
  "marshelinda": "Marshelinda Rukmana",
  "marsya": "Alfhie Marsya Ayudannie",
  "melsiano": "Melsiano Rafi Anggara",
  "mika": "Aldridge Mika Gunawan",
  "murni": "Murni Agustina Andini",
  "nabila": "Nabila Aprilia",
  "nadhif": "Nadhif Ravi Prathama",
  "nadia": "Nadia Katerina",
  "naeko": "Sevilla Naeko Lathiifah",
  "nailendra": "Nailendra Noeza Sahira",
  "najwa": "Fityah Najwa S.",
  "nasywa": "Nasywa Najiyah",
  "nayla": "Nayla Affiyah Syafini",
  "novendy": "Novendy Farhanudin",
  "nyssa": "Nyssa Mutiara Syakieb",
  "ojan": "Andi Fauzan H",
  "orentscia": "Orentscia Januiver Sitanggang",
  "pricilla": "Laudya Pricilla Putri",
  "qonita": "Qonita Putri Amalia Firdausah",
  "radja": "Muhammad Radja Fadhlurrohman",
  "rafli": "Mohamad Rafli Ramadhan",
  "rahmad": "Rahmadsyah Firdaus",
  "rahmadsyah": "Rahmadsyah Firdaus",
  "raihan": "Raihan Firdaus Hadi Saputra",
  "rakah": "Muhammad Rakah Yansyah",
  "rakha": "Rakha Ariya Pratama",
  "rama": "Moh. Rama Saputra",
  "refa": "Refa Maharani Imaniar",
  "rifqi": "Rifqi Khairan Kamal",
  "rizki": "Muhamad Rizki",
  "robby": "Robby Fabian",
  "rohim": "Muhammad Saiful Rohim",
  "royhan": "Royhan Sidqi Almutta Ali",
  "sachiko": "Sachiko Alexandra Zaida Kendra",
  "sahrul": "Sahrul",
  "saiful": "Muhammad Saiful Rohim",
  "salman": "Muhammad Salman Firdaus",
  "satrio": "Satrio Lehandika Putra",
  "sevilla": "Sevilla Naeko Lathiifah",
  "sharon": "Sharon Rizkia Gagola",
  "steo": "Stepanus Teo",
  "syafi": "Muhammad Syafi'i",
  "syafii": "Muhammad Syafi'i",
  "tasyel": "Tasyel Triajanisya",
  "teo": "Stepanus Teo",
  "thalita": "Thalita Nurul Fauzan",
  "thareq": "Mohammad Thareq Ziyad",
  "thoriq": "Thoriq Bhima Filiandro",
  "tiara": "Tiara Putri Ramadhani",
  "ursulla": "Ursulla Ningtyas Kirey",
  "uswatun": "Uswatun Hasanah",
  "vanesa": "Vanesa Delova",
  "vania": "Vania",
  "vincens": "Vincensius Anthony",
  "vincensius": "Vincensius Anthony",
  "wanda": "Wandasari Tunggul Hadi Kusumo Astuti",
  "wandasari": "Wandasari Tunggul Hadi Kusumo Astuti",
  "xaverius": "Xaverius Pinontoan",
  "yaa": "Yaa Siin",
  "yolanda": "Yolanda Viviani",
  "yuda": "Yuda Sandika",
  "yusuf": "Yusuf Nugroho",
  "zahir": "Zahir Ali Izzaturrahman",
  "zahra": "Az Zahra Nabila",
  "zaskia": "Zaskia Claudya Yasmin",
};

/**
 * Compute Levenshtein distance between two strings.
 * Used for fuzzy nickname matching (typo tolerance).
 */
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

/**
 * Resolve a member name/nickname to the full name.
 * Supports: exact match → partial match → fuzzy match (typo tolerance).
 */
export function resolveNickname(name: string): string | null {
  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  // 1. Direct nickname lookup (O(1))
  if (MEMBER_NICKNAMES[lower]) return MEMBER_NICKNAMES[lower];

  // Multi-word input: try first word as nickname, or return null
  if (lower.split(" ").length > 1) {
    // Try first word as nickname
    const firstWord = lower.split(" ")[0];
    if (MEMBER_NICKNAMES[firstWord]) return MEMBER_NICKNAMES[firstWord];
    return null;
  }

  // 2. Partial match: input is prefix/suffix of a known nickname
  for (const [nick, fullName] of Object.entries(MEMBER_NICKNAMES)) {
    if (nick.startsWith(lower) || nick.endsWith(lower) || lower.startsWith(nick) || lower.endsWith(nick)) {
      return fullName;
    }
  }

  // 3. Fuzzy match (Levenshtein distance) — only for inputs > 4 chars
  // Skip fuzzy for very short inputs (≤ 4 chars) to avoid false positives
  // e.g. "luna" should NOT match "gina" (dist 2)
  if (lower.length > 4 && lower.length <= 10) {
    const maxDist = lower.length <= 5 ? 2 : 3;
    let bestMatch: string | null = null;
    let bestDist = maxDist + 1;

    for (const [nick, fullName] of Object.entries(MEMBER_NICKNAMES)) {
      // Only compare against short nicknames (skip very long ones)
      if (nick.length > lower.length + maxDist || nick.length < lower.length - maxDist) continue;
      const dist = levenshtein(lower, nick);
      if (dist < bestDist && dist <= maxDist) {
        bestDist = dist;
        bestMatch = fullName;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

// ─── Types ──────────────────────────────────────────────────────────

interface BacklogItem {
  id: string;
  name: string;
  status: string;
  priority: string;
  active: boolean;
  dueDate: string;
  divisions: string[];
  projects: string[];
  pics: string[];
  url: string;
  archived: boolean;
  content: string; // page body text
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

interface PageDetail {
  id: string;
  name: string;
  url: string;
  properties: Record<string, unknown>;
  blocks: NotionBlock[];
  comments: NotionComment[];
  contentText: string;
}

// ─── Helper: Extract fields from page properties ────────────────────

function extractTitle(props: Record<string, unknown>, fieldName = "Name"): string {
  const field = props[fieldName] as { title?: Array<{ plain_text?: string }> };
  return field?.title?.map((t) => t.plain_text ?? "").join("") ?? "(untitled)";
}

function extractStatus(props: Record<string, unknown>): string {
  const status = props["Status"] as { status?: { name?: string } };
  return status?.status?.name ?? "Unknown";
}

function extractSelect(props: Record<string, unknown>, fieldName: string): string {
  const field = props[fieldName] as { select?: { name?: string } };
  return field?.select?.name ?? "";
}

function extractCheckbox(props: Record<string, unknown>, fieldName: string): boolean {
  const field = props[fieldName] as { checkbox?: boolean };
  return field?.checkbox ?? false;
}

function extractDate(props: Record<string, unknown>, fieldName: string): string {
  const field = props[fieldName] as { date?: { start?: string } };
  return field?.date?.start ?? "";
}

function extractRelationIds(props: Record<string, unknown>, fieldName: string): string[] {
  const field = props[fieldName] as { relation?: Array<{ id?: string }> };
  return field?.relation?.map((r) => r.id ?? "") ?? [];
}

function extractArchived(page: NotionPage): boolean {
  return page.archived ?? false;
}

// ─── Auto-detect title field ────────────────────────────────────────

function extractTitleAuto(props: Record<string, unknown>): string {
  for (const [, value] of Object.entries(props)) {
    const field = value as { type?: string; title?: Array<{ plain_text?: string }> };
    if (field?.type === "title" && Array.isArray(field.title)) {
      return field.title.map((t) => t.plain_text ?? "").join("") || "(untitled)";
    }
  }
  return "(untitled)";
}

// ─── Cache for resolved relations ───────────────────────────────────

const relationCache = new Map<string, string>();

async function resolvePageTitle(pageId: string): Promise<string> {
  const cacheKey = `relation:${pageId}`;
  return getCached(
    cacheKey,
    async () => {
      if (relationCache.has(pageId)) {
        return relationCache.get(pageId)!;
      }
      try {
        const page = await notionRequest<NotionPage>({
          method: "GET",
          path: `/pages/${pageId}`,
        });
        const title = extractTitleAuto(page.properties);
        relationCache.set(pageId, title);
        return title;
      } catch {
        return "(unknown)";
      }
    },
    10 * 60 * 1000 // 10 min cache for relation names
  );
}

async function resolveRelationNames(
  props: Record<string, unknown>,
  fieldName: string
): Promise<string[]> {
  const ids = extractRelationIds(props, fieldName);
  const names: string[] = [];
  for (const id of ids) {
    names.push(await resolvePageTitle(id));
  }
  return names;
}

// ─── Extract plain text from blocks ─────────────────────────────────

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

// ─── Master Backlog ─────────────────────────────────────────────────

/**
 * List ALL backlog items with auto-pagination.
 * Covers: #4 (pagination), #16 (caching)
 */
export async function listBacklog(
  filter?: Record<string, unknown>,
  sorts?: Array<Record<string, string>>
): Promise<BacklogItem[]> {
  const dbId = env.NOTION_MASTER_BACKLOG_ID;
  if (!dbId) throw new Error("NOTION_MASTER_BACKLOG_ID not configured");

  const cacheKey = `backlog:list:${JSON.stringify(filter)}:${JSON.stringify(sorts)}`;
  return getCached(
    cacheKey,
    async () => {
      const results = await queryDatabaseAll(dbId, filter, sorts);

      const items: BacklogItem[] = [];
      for (const page of results) {
        const props = page.properties;
        const picIds = extractRelationIds(props, "PIC");
        const picNames: string[] = [];
        for (const picId of picIds) {
          picNames.push(await resolvePageTitle(picId));
        }
        items.push({
          id: page.id,
          name: extractTitle(props),
          status: extractStatus(props),
          priority: extractSelect(props, "Priority Level"),
          active: extractCheckbox(props, "Active"),
          dueDate: extractDate(props, "Due Date"),
          divisions: await resolveRelationNames(props, "\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions"),
          projects: await resolveRelationNames(props, "\u{1F4D5} Projects"),
          pics: picNames,
          url: page.url,
          archived: extractArchived(page),
          content: "", // loaded on demand via getPageDetail
        });
      }
      return items;
    },
    2 * 60 * 1000 // 2 min cache for backlog lists
  );
}

/**
 * Search backlog by name (partial match) with full pagination.
 */
export async function searchBacklog(query: string): Promise<BacklogItem[]> {
  return listBacklog({
    property: "Name",
    title: { contains: query },
  });
}

/**
 * Get backlog items by status.
 */
export async function getBacklogByStatus(status: string): Promise<BacklogItem[]> {
  return listBacklog({
    property: "Status",
    status: { equals: status },
  });
}

/**
 * Get backlog items for a specific project (by project page ID).
 */
export async function getBacklogByProject(projectId: string): Promise<BacklogItem[]> {
  return listBacklog({
    property: "\u{1F4D5} Projects",
    relation: { contains: projectId },
  });
}

/**
 * Get backlog items assigned to a specific member (by member page ID).
 * Covers: #12 (query member by division/project)
 */
export async function getBacklogByMember(memberPageId: string): Promise<BacklogItem[]> {
  return listBacklog({
    property: "PIC",
    relation: { contains: memberPageId },
  });
}

/**
 * Update backlog item status.
 */
export async function updateBacklogStatus(
  pageId: string,
  newStatus: string
): Promise<NotionPage> {
  return updatePage(pageId, {
    Status: { status: { name: newStatus } },
  });
}

/**
 * Update backlog item priority.
 */
export async function updateBacklogPriority(
  pageId: string,
  priority: string
): Promise<NotionPage> {
  return updatePage(pageId, {
    "Priority Level": { select: { name: priority } },
  });
}

/**
 * Archive (soft delete) a backlog item.
 * Covers: #1 (delete page)
 */
export async function deleteBacklogItem(pageId: string): Promise<NotionPage> {
  return archivePage(pageId);
}

/**
 * Restore an archived backlog item.
 */
export async function restoreBacklogItem(pageId: string): Promise<NotionPage> {
  return restorePage(pageId);
}

/**
 * Bulk update status for backlog items matching a filter.
 * Covers: #11 (batch operations)
 */
export async function bulkUpdateBacklogStatus(
  filter: Record<string, unknown>,
  newStatus: string,
  onProgress?: (completed: number, total: number) => void
): Promise<{ updated: number; errors: string[] }> {
  const items = await listBacklog(filter);
  const updates = items.map((item) => ({
    pageId: item.id,
    properties: { Status: { status: { name: newStatus } } },
  }));

  const errors: string[] = [];
  let completed = 0;

  for (const upd of updates) {
    try {
      await updatePage(upd.pageId, upd.properties);
      completed++;
      onProgress?.(completed, updates.length);
    } catch (error) {
      errors.push(`${upd.pageId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { updated: completed, errors };
}

// ─── Master Projects ────────────────────────────────────────────────

/**
 * List all projects with caching.
 * Covers: #16 (caching)
 */
export async function listProjects(): Promise<ProjectItem[]> {
  const dbId = env.NOTION_MASTER_PROJECTS_ID;
  if (!dbId) throw new Error("NOTION_MASTER_PROJECTS_ID not configured");

  return getCached(
    "projects:list",
    async () => {
      const results = await queryDatabaseAll(dbId);

      const items: ProjectItem[] = [];
      for (const page of results) {
        const props = page.properties;
        items.push({
          id: page.id,
          name: extractTitle(props),
          divisions: await resolveRelationNames(props, "\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions"),
          headOfProject: await resolveRelationNames(props, "Head Of Project"),
          backlogCount: extractRelationIds(props, "\u{1F4BE} Master Backlog").length,
          url: page.url,
        });
      }
      return items;
    },
    5 * 60 * 1000 // 5 min cache
  );
}

/**
 * Search project by name (partial match).
 */
export async function searchProject(query: string): Promise<ProjectItem | null> {
  const dbId = env.NOTION_MASTER_PROJECTS_ID;
  if (!dbId) throw new Error("NOTION_MASTER_PROJECTS_ID not configured");

  const data = await queryDatabaseAll(dbId, {
    property: "Name",
    title: { contains: query },
  });

  if (data.length === 0) return null;

  const page = data[0];
  const props = page.properties;
  return {
    id: page.id,
    name: extractTitle(props),
    divisions: await resolveRelationNames(props, "\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions"),
    headOfProject: await resolveRelationNames(props, "Head Of Project"),
    backlogCount: extractRelationIds(props, "\u{1F4BE} Master Backlog").length,
    url: page.url,
  };
}

/**
 * Get project details with related backlog items.
 */
export async function getProjectDetails(projectName: string): Promise<{
  project: ProjectItem;
  backlog: BacklogItem[];
} | null> {
  const project = await searchProject(projectName);
  if (!project) return null;

  const backlog = await getBacklogByProject(project.id);
  return { project, backlog };
}

// ─── Divisions ──────────────────────────────────────────────────────

/**
 * List all divisions with caching.
 * Covers: #16 (caching)
 */
export async function listDivisions(): Promise<DivisionItem[]> {
  const dbId = env.NOTION_DIVISIONS_ID;
  if (!dbId) return [];

  return getCached(
    "divisions:list",
    async () => {
      const results = await queryDatabaseAll(dbId);
      return results.map((page) => ({
        id: page.id,
        name: extractTitle(page.properties),
      }));
    },
    10 * 60 * 1000 // 10 min cache
  );
}

// ─── Members ────────────────────────────────────────────────────────

/**
 * List all members with caching.
 * Covers: #16 (caching)
 */
export async function listMembers(): Promise<MemberItem[]> {
  const dbId = env.NOTION_MEMBERS_ID;
  if (!dbId) return [];

  return getCached(
    "members:list",
    async () => {
      const results = await queryDatabaseAll(dbId);
      return results.map((page) => ({
        id: page.id,
        name: extractTitle(page.properties, "Member Name"),
        divisionIds: extractRelationIds(page.properties, "\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions"),
      }));
    },
    10 * 60 * 1000 // 10 min cache
  );
}

/**
 * Get members by division.
 * Now resolves aliases (ristek -> Research and Technology, etc).
 * Covers: #12 (query member by division)
 */
export async function getMembersByDivision(divisionName: string): Promise<MemberItem[]> {
  const allMembers = await listMembers();
  const divisions = await listDivisions();

  // Resolve alias first
  const resolvedName = resolveDivisionAlias(divisionName) || divisionName;
  const lower = resolvedName.toLowerCase();

  // Try exact match, then contains, then alias match
  let division = divisions.find(d => d.name.toLowerCase() === lower);
  if (!division) {
    division = divisions.find(d =>
      d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase())
    );
  }
  if (!division) {
    for (const div of divisions) {
      const aliases = DIVISION_ALIASES[div.name];
      if (aliases?.some(a => lower.includes(a) || a.includes(lower))) {
        division = div;
        break;
      }
    }
  }

  if (!division) return [];
  return allMembers.filter((m) => m.divisionIds.includes(division!.id));
}

/**
 * Get backlog items for a specific member by name.
 * Now resolves nicknames (ojan -> Andi Fauzan H, etc).
 * Covers: #12 (query member backlog)
 */
export async function getBacklogByMemberName(memberName: string): Promise<BacklogItem[]> {
  const dbId = env.NOTION_MEMBERS_ID;
  if (!dbId) return [];

  // Resolve nickname first
  const resolvedName = resolveNickname(memberName) || memberName;

  // Strategy 1: Try exact match on full name first (most reliable)
  const exactData = await queryDatabaseAll(dbId, {
    property: "Member Name",
    title: { equals: resolvedName },
  });
  if (exactData.length > 0) {
    console.log(`[Notion] getBacklogByMemberName: exact match for "${resolvedName}" → ${exactData[0].id}`);
    return getBacklogByMember(exactData[0].id);
  }

  // Strategy 2: Try exact match on original input name (in case resolveNickname changed it)
  if (memberName !== resolvedName) {
    const origData = await queryDatabaseAll(dbId, {
      property: "Member Name",
      title: { equals: memberName },
    });
    if (origData.length > 0) {
      console.log(`[Notion] getBacklogByMemberName: exact match for original "${memberName}" → ${origData[0].id}`);
      return getBacklogByMember(origData[0].id);
    }
  }

  // Strategy 3: Contains search with FILTERING — find the best match, not just data[0]
  // This handles cases where the name in Notion doesn't exactly match our contacts
  const nameParts = resolvedName.toLowerCase().split(" ").filter(p => p.length >= 2);

  for (const part of nameParts) {
    const data = await queryDatabaseAll(dbId, {
      property: "Member Name",
      title: { contains: part },
    });
    if (data.length > 0) {
      // Filter: find the result whose name best matches the input
      // Priority: exact match > starts with > contains most name parts
      const bestMatch = findBestMemberMatch(data, resolvedName);
      if (bestMatch) {
        const matchedName = extractTitleAuto(bestMatch.properties);
        console.log(`[Notion] getBacklogByMemberName: filtered match for "${resolvedName}" → "${matchedName}" (${bestMatch.id})`);
        return getBacklogByMember(bestMatch.id);
      }
    }
  }

  // Strategy 4: Fallback — try the original name with contains
  const fallbackData = await queryDatabaseAll(dbId, {
    property: "Member Name",
    title: { contains: memberName },
  });
  if (fallbackData.length > 0) {
    const bestMatch = findBestMemberMatch(fallbackData, memberName);
    if (bestMatch) {
      const matchedName = extractTitleAuto(bestMatch.properties);
      console.log(`[Notion] getBacklogByMemberName: fallback match for "${memberName}" → "${matchedName}" (${bestMatch.id})`);
      return getBacklogByMember(bestMatch.id);
    }
  }

  console.log(`[Notion] getBacklogByMemberName: no match found for "${memberName}" (resolved: "${resolvedName}")`);
  return [];
}

/**
 * Find the best matching member page from a list of Notion results.
 * Prioritizes: exact match > name starts with > most name parts matching.
 */
function findBestMemberMatch(
  pages: NotionPage[],
  targetName: string
): NotionPage | null {
  if (pages.length === 0) return null;
  if (pages.length === 1) return pages[0];

  const targetLower = targetName.toLowerCase();
  const targetParts = targetLower.split(" ").filter(p => p.length >= 2);

  let bestPage: NotionPage | null = null;
  let bestScore = -1;

  for (const page of pages) {
    const pageName = extractTitleAuto(page.properties).toLowerCase();

    // Exact match (highest priority)
    if (pageName === targetLower) return page;

    let score = 0;

    // Starts with target name
    if (pageName.startsWith(targetLower) || targetLower.startsWith(pageName)) {
      score += 100;
    }

    // Count how many name parts match
    for (const part of targetParts) {
      if (pageName.includes(part)) {
        score += 10;
        // Bonus: exact word match (not just substring like "andi" in "lehandika")
        const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(part)}\\b`, "i");
        if (wordBoundaryRegex.test(pageName)) {
          score += 50; // Significant bonus for word boundary match
        }
      }
    }

    // Prefer shorter names (less chance of false positive)
    score -= pageName.length * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestPage = page;
    }
  }

  return bestPage;
}

// ─── Page Detail (with blocks + comments) ───────────────────────────

/**
 * Get full page detail including blocks and comments.
 * Covers: #3 (read page blocks), #8 (read comments)
 */
export async function getPageDetail(pageId: string): Promise<PageDetail> {
  const cacheKey = `page:detail:${pageId}`;
  return getCached(
    cacheKey,
    async () => {
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
        // Comments might not be enabled for this page
      }

      return {
        id: page.id,
        name: extractTitleAuto(page.properties),
        url: page.url,
        properties: page.properties,
        blocks,
        comments,
        contentText,
      };
    },
    1 * 60 * 1000 // 1 min cache for page details
  );
}

/**
 * Add content blocks to a page.
 * Covers: #2 (edit page content - append)
 */
export async function addPageContent(
  pageId: string,
  content: string
): Promise<void> {
  await appendBlocks(pageId, [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content } }],
      },
    },
  ]);
  invalidateCache(`page:detail:${pageId}`);
  invalidateCache("backlog");
}

/**
 * Add a comment to a page.
 * Covers: #8 (add comments)
 */
export async function addComment(
  pageId: string,
  text: string
): Promise<NotionComment> {
  const result = await createComment(pageId, [
    { type: "text", text: { content: text } },
  ]);
  invalidateCache(`page:detail:${pageId}`);
  return result;
}

/**
 * Delete a specific block from a page.
 * Covers: #1 (delete block), #2 (edit content - remove)
 */
export async function removeBlock(blockId: string): Promise<void> {
  await deleteBlock(blockId);
}

/**
 * Update a specific block's content.
 * Covers: #2 (edit page content - update block)
 */
export async function updateBlockContent(
  blockId: string,
  newContent: string,
  blockType: string = "paragraph"
): Promise<void> {
  await notionRequest({
    method: "PATCH",
    path: `/blocks/${blockId}`,
    body: {
      type: blockType,
      [blockType]: {
        rich_text: [{ type: "text", text: { content: newContent } }],
      },
    },
  });
}

// ─── Backlog by Division / Status (formatted summaries) ──────────────

/**
 * Get backlog items filtered by division name.
 * Now resolves aliases (ristek -> Research and Technology, icd -> Intellectual & Career Development, etc).
 */
export async function getBacklogByDivision(divisionName: string): Promise<string> {
  const dbId = env.NOTION_MASTER_BACKLOG_ID;
  if (!dbId) throw new Error("NOTION_MASTER_BACKLOG_ID not configured");

  const divisionsDbId = env.NOTION_DIVISIONS_ID;
  if (!divisionsDbId) throw new Error("NOTION_DIVISIONS_ID not configured");

  // Resolve alias first (e.g. "ristek" -> "Research and Technology")
  const resolvedName = resolveDivisionAlias(divisionName) || divisionName;

  // Try to find the division page in the Divisions database
  const allDivisions = await listDivisions();
  const lower = resolvedName.toLowerCase();

  let divisionPageId: string | undefined;
  let matchedName = resolvedName;

  // Exact match
  const exact = allDivisions.find(d => d.name.toLowerCase() === lower);
  if (exact) {
    divisionPageId = exact.id;
    matchedName = exact.name;
  } else {
    // Contains match
    const contains = allDivisions.find(d =>
      d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase())
    );
    if (contains) {
      divisionPageId = contains.id;
      matchedName = contains.name;
    } else {
      // Alias keyword match
      for (const div of allDivisions) {
        const aliases = DIVISION_ALIASES[div.name];
        if (aliases?.some(a => lower.includes(a) || a.includes(lower))) {
          divisionPageId = div.id;
          matchedName = div.name;
          break;
        }
      }
    }
  }

  if (!divisionPageId) {
    return `Divisi "${divisionName}" tidak ditemukan.\n\nDivisi yang tersedia:\n${allDivisions.map(d => "\u2022 " + d.name).join("\n")}`;
  }

  const data = await queryDatabaseAll(dbId, {
    property: "🧏‍♀️ Divisions",
    relation: { contains: divisionPageId },
  });

  if (data.length === 0) {
    return `Tidak ada backlog item untuk divisi "${matchedName}".`;
  }

  const items: Array<{
    name: string;
    status: string;
    priority: string;
    pics: string[];
    url: string;
  }> = [];

  for (const page of data) {
    const props = page.properties;
    const picIds = extractRelationIds(props, "PIC");
    const picNames: string[] = [];
    for (const picId of picIds) {
      picNames.push(await resolvePageTitle(picId));
    }
    items.push({
      name: extractTitle(props),
      status: extractStatus(props),
      priority: extractSelect(props, "Priority Level"),
      pics: picNames,
      url: page.url,
    });
  }

  let msg = `*Backlog Divisi: ${matchedName}* (${items.length} item)\n\n`;
  for (const item of items.slice(0, 20)) {
    const emoji = item.status === "Done" ? "\u2705"
      : item.status === "In progress" ? "\uD83D\uDD04"
      : item.status === "Blocking" ? "\uD83D\uDEAB"
      : item.status.includes("review") || item.status.includes("fix") ? "\uD83D\uDD27"
      : "\uD83D\uDCCB";
    msg += `${emoji} ${item.name}\n`;
    msg += `   Status: ${item.status} | Prioritas: ${item.priority}`;
    if (item.pics.length > 0) {
      msg += ` | PIC: ${item.pics.join(", ")}`;
    }
    msg += `\n   \uD83D\uDD17 Buka: ${item.url}`;
    msg += "\n";
  }

  if (items.length > 20) {
    msg += `\n...dan ${items.length - 20} item lainnya.`;
  }

  msg += `\n\nKlik link di atas buat lihat detail lengkap di Notion!`;
  return msg;
}
/**
 * Get backlog items filtered by status — formatted summary.
 */
export async function getBacklogByStatusSummary(status: string): Promise<string> {
  const dbId = env.NOTION_MASTER_BACKLOG_ID;
  if (!dbId) throw new Error("NOTION_MASTER_BACKLOG_ID not configured");

  const data = await queryDatabaseAll(dbId, {
    property: "Status",
    status: { equals: status },
  });

  if (data.length === 0) {
    return `Tidak ada backlog item dengan status "${status}".`;
  }

  const items: Array<{
    name: string;
    priority: string;
    pics: string[];
    divisions: string[];
    url: string;
  }> = [];

  for (const page of data) {
    const props = page.properties;
    const picIds = extractRelationIds(props, "PIC");
    const picNames: string[] = [];
    for (const picId of picIds) {
      picNames.push(await resolvePageTitle(picId));
    }
    const divNames = await resolveRelationNames(props, "\u{1F9CF}\u{200D}\u{2640}\u{FE0F} Divisions");
    items.push({
      name: extractTitle(props),
      priority: extractSelect(props, "Priority Level"),
      pics: picNames,
      divisions: divNames,
      url: page.url,
    });
  }

  let msg = `*Backlog Status: ${status}* (${items.length} item)\n\n`;
  for (const item of items.slice(0, 25)) {
    msg += `\u2022 ${item.name} [${item.priority}]`;
    if (item.pics.length > 0) {
      msg += ` \u2014 PIC: ${item.pics.join(", ")}`;
    }
    if (item.divisions.length > 0) {
      msg += ` (${item.divisions.join(", ")})`;
    }
    msg += `\n  \uD83D\uDD17 ${item.url}`;
    msg += "\n";
  }

  if (items.length > 25) {
    msg += `\n...dan ${items.length - 25} item lainnya.`;
  }

  msg += `\n\nKlik link di atas buat lihat detail lengkap di Notion!`;
  return msg;
}

// ─── Statistics ─────────────────────────────────────────────────────

/**
 * Get backlog statistics with full pagination.
 */
export async function getBacklogStats(): Promise<{
  total: number;
  todo: number;
  inProgress: number;
  complete: number;
  blocking: number;
  byPriority: Record<string, number>;
  byDivision: Record<string, number>;
}> {
  const all = await listBacklog();
  const stats = {
    total: all.length,
    todo: 0,
    inProgress: 0,
    complete: 0,
    blocking: 0,
    byPriority: {} as Record<string, number>,
    byDivision: {} as Record<string, number>,
  };

  for (const item of all) {
    if (item.status === "Not started") stats.todo++;
    else if (["In progress", "Need to review", "Need to fix"].includes(item.status)) stats.inProgress++;
    else if (item.status === "Done") stats.complete++;
    else if (item.status === "Blocking") stats.blocking++;

    const p = item.priority || "None";
    stats.byPriority[p] = (stats.byPriority[p] || 0) + 1;

    for (const div of item.divisions) {
      stats.byDivision[div] = (stats.byDivision[div] || 0) + 1;
    }
  }

  return stats;
}

// ─── Relation Management ────────────────────────────────────────────

/**
 * Add a relation to a page property.
 * Covers: #10 (manage relations)
 */
export async function addRelation(
  pageId: string,
  propertyName: string,
  relatedPageId: string
): Promise<NotionPage> {
  // First get current relations
  const page = await notionRequest<NotionPage>({
    method: "GET",
    path: `/pages/${pageId}`,
  });
  const currentIds = extractRelationIds(page.properties, propertyName);

  // Add new relation (avoid duplicates)
  const newIds = [...new Set([...currentIds, relatedPageId])];

  return updatePage(pageId, {
    [propertyName]: {
      relation: newIds.map((id) => ({ id })),
    },
  });
}

/**
 * Remove a relation from a page property.
 * Covers: #10 (manage relations)
 */
export async function removeRelation(
  pageId: string,
  propertyName: string,
  relatedPageId: string
): Promise<NotionPage> {
  const page = await notionRequest<NotionPage>({
    method: "GET",
    path: `/pages/${pageId}`,
  });
  const currentIds = extractRelationIds(page.properties, propertyName);
  const newIds = currentIds.filter((id) => id !== relatedPageId);

  return updatePage(pageId, {
    [propertyName]: {
      relation: newIds.map((id) => ({ id })),
    },
  });
}

/**
 * Re-assign PIC on a backlog item.
 * Covers: #10 (manage relations - assign/unassign)
 */
export async function assignPicToBacklog(
  pageId: string,
  memberPageId: string
): Promise<NotionPage> {
  return addRelation(pageId, "PIC", memberPageId);
}

/**
 * Remove PIC from a backlog item.
 */
export async function removePicFromBacklog(
  pageId: string,
  memberPageId: string
): Promise<NotionPage> {
  return removeRelation(pageId, "PIC", memberPageId);
}

// ─── Cache Control ──────────────────────────────────────────────────

/**
 * Force refresh all caches.
 */
export function refreshAllCaches(): void {
  invalidateCache("backlog");
  invalidateCache("projects");
  invalidateCache("divisions");
  invalidateCache("members");
  invalidateCache("page");
  relationCache.clear();
}
