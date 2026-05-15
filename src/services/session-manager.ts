// src/services/session-manager.ts
// Per-user conversation memory and context tracking for AI Agent Roro

// ─── Types ──────────────────────────────────────────────────────────

export interface SessionData {
  // User identity
  userName: string;
  userPhone: string;

  // Conversation context
  lastIntent: string | null;           // "ticket_created", "member_tasks", "stats", "project_detail", etc.
  lastTopic: string | null;            // What was the last conversation about
  lastTicketId: string | null;         // Last ticket ID mentioned
  lastTicketName: string | null;       // Last ticket name mentioned
  lastProject: string | null;          // Last project mentioned
  lastDivision: string | null;         // Last division mentioned
  lastMemberName: string | null;       // Last member name mentioned

  // Recent conversation history (last N exchanges)
  recentMessages: ConversationTurn[];

  // Active entities from last response
  activeTicketIds: string[];           // Ticket IDs shown in last response
  activeTicketNames: string[];         // Ticket names shown in last response
  activeProject: string | null;        // Project context
  activeMemberName: string | null;     // Member whose tasks were shown

  // Last Notion results (for follow-up questions)
  lastNotionResults: NotionResultItem[];

  // Metadata
  createdAt: number;
  lastActivityAt: number;
  messageCount: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  intent?: string | null;
}

export interface NotionResultItem {
  name: string;
  id?: string;
  url?: string;
  status?: string;
  priority?: string;
  pics?: string[];
  projects?: string[];
}

// ─── Session Manager ────────────────────────────────────────────────

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY = 10;              // Keep last 10 conversation turns
const MAX_NOTION_RESULTS = 20;       // Keep last 20 Notion results

const sessions = new Map<string, SessionData>();

// Clean up expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (now - session.lastActivityAt > SESSION_TTL) {
      sessions.delete(key);
    }
  }
}, 5 * 60_000);

/**
 * Get or create a session for a user identified by phone number.
 */
export function getOrCreateSession(phone: string, userName: string): SessionData {
  const existing = sessions.get(phone);
  if (existing) {
    existing.lastActivityAt = Date.now();
    existing.userName = userName; // Update name in case it changed
    return existing;
  }

  const now = Date.now();
  const session: SessionData = {
    userName,
    userPhone: phone,

    lastIntent: null,
    lastTopic: null,
    lastTicketId: null,
    lastTicketName: null,
    lastProject: null,
    lastDivision: null,
    lastMemberName: null,

    recentMessages: [],
    activeTicketIds: [],
    activeTicketNames: [],
    activeProject: null,
    activeMemberName: null,
    lastNotionResults: [],

    createdAt: now,
    lastActivityAt: now,
    messageCount: 0,
  };

  sessions.set(phone, session);
  return session;
}

/**
 * Save a user message to the session history.
 */
export function saveUserMessage(phone: string, message: string): void {
  const session = sessions.get(phone);
  if (!session) return;

  session.recentMessages.push({
    role: "user",
    content: message,
    timestamp: Date.now(),
  });

  // Trim to max history
  if (session.recentMessages.length > MAX_HISTORY) {
    session.recentMessages = session.recentMessages.slice(-MAX_HISTORY);
  }

  session.messageCount++;
  session.lastActivityAt = Date.now();
}

/**
 * Save an assistant response to the session history and update context.
 */
export function saveAssistantResponse(
  phone: string,
  response: string,
  context: ResponseContext = {}
): void {
  const session = sessions.get(phone);
  if (!session) return;

  session.recentMessages.push({
    role: "assistant",
    content: response.slice(0, 500), // Truncate long responses
    timestamp: Date.now(),
    intent: context.intent || null,
  });

  // Trim to max history
  if (session.recentMessages.length > MAX_HISTORY) {
    session.recentMessages = session.recentMessages.slice(-MAX_HISTORY);
  }

  // Update context fields
  if (context.intent) session.lastIntent = context.intent;
  if (context.topic) session.lastTopic = context.topic;
  if (context.ticketId) session.lastTicketId = context.ticketId;
  if (context.ticketName) session.lastTicketName = context.ticketName;
  if (context.project) {
    session.lastProject = context.project;
    session.activeProject = context.project;
  }
  if (context.division) session.lastDivision = context.division;
  if (context.memberName) {
    session.lastMemberName = context.memberName;
    session.activeMemberName = context.memberName;
  }
  if (context.ticketIds) session.activeTicketIds = context.ticketIds;
  if (context.ticketNames) session.activeTicketNames = context.ticketNames;
  if (context.notionResults) {
    session.lastNotionResults = context.notionResults.slice(0, MAX_NOTION_RESULTS);
  }

  session.lastActivityAt = Date.now();
}

/**
 * Get the conversation context summary for AI prompt injection.
 * This gives the AI awareness of what was discussed previously.
 */
export function getContextSummary(phone: string): string {
  const session = sessions.get(phone);
  if (!session || session.recentMessages.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Active context
  if (session.lastIntent) parts.push(`Last intent: ${session.lastIntent}`);
  if (session.lastTopic) parts.push(`Topic: ${session.lastTopic}`);
  if (session.lastTicketName) parts.push(`Last ticket: ${session.lastTicketName}`);
  if (session.lastProject) parts.push(`Last project: ${session.lastProject}`);
  if (session.lastDivision) parts.push(`Last division: ${session.lastDivision}`);
  if (session.lastMemberName) parts.push(`Last member: ${session.lastMemberName}`);

  // Active entities
  if (session.activeTicketNames.length > 0) {
    parts.push(`Active tickets: ${session.activeTicketNames.slice(0, 5).join(", ")}`);
  }
  if (session.activeProject) {
    parts.push(`Active project: ${session.activeProject}`);
  }

  // Recent conversation (last 4 turns)
  const recent = session.recentMessages.slice(-4);
  if (recent.length > 0) {
    parts.push("Recent conversation:");
    for (const turn of recent) {
      const prefix = turn.role === "user" ? "User" : "Roro";
      parts.push(`  ${prefix}: ${turn.content.slice(0, 150)}`);
    }
  }

  return parts.join("\n");
}

/**
 * Check if a message is a follow-up question that references previous context.
 * Returns the type of reference found, or null if it's a new topic.
 */
export function detectFollowUp(message: string, phone: string): FollowUpType | null {
  const session = sessions.get(phone);
  if (!session || session.recentMessages.length === 0) {
    return null;
  }

  const lower = message.toLowerCase().trim();

  // IMPORTANT: If the message contains ticket creation intent, it's NOT a follow-up.
  // "buatin tiket", "buat tiket", "bikin tiket", etc. should never be treated as follow-up.
  const creationIntent = /\b(buat(?:kan|in)?|bikin(?:kan|in)?|tambah(?:kan|in)?|create|new)\s+(tiket|ticket|backlog|tugas|task)/i.test(lower);
  if (creationIntent) {
    return null;
  }

  // Patterns that indicate a follow-up question
  const followUpPatterns: Array<{ pattern: RegExp; type: FollowUpType }> = [
    // References to "it", "that", "the one earlier"
    { pattern: /\b(yang tadi|yang itu|yang barusan|yg tadi|yg itu|itu|tadi|barusan)\b/i, type: "reference_previous" },

    // Questions about details of the last topic
    { pattern: /\b(di akun apa|akun apa|cara akses|gimana cara|bagaimana cara)\b/i, type: "question_detail" },
    { pattern: /\b(deadline|tenggat|kapan selesai|kapan deadline)\b/i, type: "question_detail" },
    { pattern: /\b(siapa pic|pic siapa|siapa yang|assign ke siapa)\b/i, type: "question_detail" },
    { pattern: /\b(statusnya|progressnya|udah selesai|sudah selesai|belum selesai)\b/i, type: "question_detail" },

    // Short questions that likely reference previous context
    { pattern: /^(ya|tidak|gak|bukan|betul|iy|nggak|ok|oke|siap|gas|lanjut|skip|skip aja)\s*$/i, type: "confirmation" },
    { pattern: /^(terus|lalu|terus gimana|lalu gimana|trus|trus gmna)\s*$/i, type: "continuation" },
    { pattern: /^(bisa|bisa gak|bisa nggak|bsi|bsi gak)\s*$/i, type: "confirmation" },

    // Questions about specific entity from context
    { pattern: /\b(projectnya|projeknya|project apa)\b/i, type: "question_detail" },
    { pattern: /\b(divisinya|divisi apa|departemen)\b/i, type: "question_detail" },
    { pattern: /\b(prioritasnya|prioritas apa)\b/i, type: "question_detail" },
    { pattern: /\b(linknya|urlnya|link|notion)\b/i, type: "question_detail" },
    { pattern: /\b(deskripsinya|detailnya|detail|info lengkap)\b/i, type: "question_detail" },

    // "yang mana" / "mana yang"
    { pattern: /\b(yang mana|mana yang|pilih mana|ambil mana)\b/i, type: "question_detail" },

    // References to a person's tasks/items ("semuanya yg dia punya", "punya dia", "milik dia")
    { pattern: /\b(yg|yang)\s+(dia|dia punya|dia punyai|dimiliki|dipunyai)\b/i, type: "reference_previous" },
    { pattern: /\b(semuanya|semua)\s+(yg|yang|punya|punyai)\b/i, type: "reference_previous" },
    { pattern: /\bpunya\s+dia\b/i, type: "reference_previous" },

    // Request to update/change something from previous context
    { pattern: /\b(ubah|ganti|update|rubah|edit)\s+(status|prioritas|pic|deadline|assign)/i, type: "update_request" },
    { pattern: /\b(update|ubah|ganti)\s+(nya|itunya|tiket|task|backlog)?\s*$/i, type: "update_request" },
  ];

  // Very short messages (< 30 chars) are more likely to be follow-ups
  const isShortMessage = lower.length < 30;
  // Messages that start with question words
  const startsWithQuestion = /^(apa|siapa|kapan|dimana|kenapa|bagaimana|gimana|berapa|kok|mengapa)\b/i.test(lower);

  for (const { pattern, type } of followUpPatterns) {
    if (pattern.test(lower)) {
      return type;
    }
  }

  // Short question-like messages after a recent response are likely follow-ups
  if (isShortMessage && startsWithQuestion && session.lastIntent) {
    return "question_detail";
  }

  return null;
}

/**
 * Check if a message is likely a ticket creation request vs a follow-up question.
 * Returns true if it looks like a NEW request (not a follow-up).
 */
export function isNewTicketRequest(message: string, phone: string): boolean {
  const lower = message.toLowerCase();

  // Explicit ticket creation keywords (must match detectFollowUp's creationIntent pattern)
  const createKeywords = [
    /\b(buat(?:kan|in)?|bikin(?:kan|in)?|create|add|tambah(?:kan|in)?)\s+(tiket|ticket|backlog|task|tugas)/i,
    /\b(tiket|ticket|backlog|task)\s+(baru|new)/i,
    /\b(tolong\s+)?(buat(?:kan|in)?|bikin(?:kan|in)?)\s+/i,
  ];

  // Check if it's a follow-up first
  const followUp = detectFollowUp(message, phone);
  if (followUp) {
    return false; // It's a follow-up, not a new ticket request
  }

  // Check for question patterns (these should NOT trigger ticket creation)
  const questionPatterns = [
    /^(apa|siapa|kapan|dimana|kenapa|bagaimana|gimana|berapa|kok)\b/i,
    /\?$/,  // Ends with question mark
    /\b(apakah|kayaknya|mungkin|kira-kira)\b/i,
  ];

  for (const p of questionPatterns) {
    if (p.test(lower)) {
      return false;
    }
  }

  // Check for explicit create keywords
  for (const p of createKeywords) {
    if (p.test(lower)) {
      return true;
    }
  }

  return false; // Default: don't create ticket
}

/**
 * Get session stats (for debugging).
 */
export function getSessionStats(): { totalSessions: number; sessionDetails: Array<{ phone: string; name: string; messageCount: number; lastActivity: string }> } {
  const details = Array.from(sessions.entries()).map(([phone, s]) => ({
    phone,
    name: s.userName,
    messageCount: s.messageCount,
    lastActivity: new Date(s.lastActivityAt).toISOString(),
  }));

  return { totalSessions: sessions.size, sessionDetails: details };
}

// ─── Types ──────────────────────────────────────────────────────────

export type FollowUpType =
  | "reference_previous"   // "yang tadi", "itu", "barusan"
  | "question_detail"      // "di akun apa", "deadline kapan"
  | "confirmation"         // "ya", "tidak", "ok"
  | "continuation"         // "terus gimana"
  | "update_request";      // "ubah statusnya"

export interface ResponseContext {
  intent?: string | null;
  topic?: string | null;
  ticketId?: string | null;
  ticketName?: string | null;
  project?: string | null;
  division?: string | null;
  memberName?: string | null;
  ticketIds?: string[];
  ticketNames?: string[];
  notionResults?: NotionResultItem[];
}
