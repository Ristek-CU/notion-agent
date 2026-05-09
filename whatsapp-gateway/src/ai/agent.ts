// src/ai/agent.ts
import { createMessage } from "./anthropic-client.js";
import { EXTRACTION_PROMPT, CHAT_PROMPT, CASUAL_WRAP_PROMPT } from "./prompts.js";
import { notifyPIC } from "../services/notification.js";
import { getFullName } from "../services/contact-lookup.js";
import {
  getOrCreateSession,
  saveUserMessage,
  saveAssistantResponse,
  detectFollowUp,
  getContextSummary,
  type FollowUpType,
} from "../services/session-manager.js";
import {
  createTicketDirect,
  searchPagesDirect,
  archiveTicketDirect,
  getTicketDetail,
  addTicketNote,
  addTicketComment,
} from "../notion/ticket-service.js";
import {
  listBacklog,
  searchBacklog,
  getProjectDetails,
  listProjects,
  updateBacklogStatus,
  updateBacklogPriority,
  getBacklogStats,
  getBacklogByDivision,
  getBacklogByStatusSummary,
  deleteBacklogItem,
  restoreBacklogItem,
  bulkUpdateBacklogStatus,
  listDivisions,
  listMembers,
  getMembersByDivision,
  getBacklogByMemberName,
  assignPicToBacklog,
  removePicFromBacklog,
  refreshAllCaches,
  resolveDivisionAlias,
  detectDivisionFromMessage,
  resolveNickname,
  DIVISION_ALIASES,
} from "../notion/notion-org-service.js";
import {
  generateTicketId,
  normalizeDepartment,
  extractJSON,
} from "../utils/helpers.js";
import {
  createDatabase,
  createSubPage,
  appendImageBlock,
} from "../notion/notion-api-core.js";

// ─── Division Alias Map (imported from notion-org-service) ─────────
// DIVISION_ALIASES, resolveDivisionAlias, detectDivisionFromMessage are imported from notion-org-service

// ─── Member Nickname Map (imported from notion-org-service) ──────────
// MEMBER_NICKNAMES, resolveNickname are imported from notion-org-service

// ─── Conversation State (pending ticket creation) ──────────────────

interface PendingTicket {
  ticketData: Record<string, unknown>;
  context: MessageContext;
  unresolvedPics: string[];  // PIC names that couldn't be resolved
  createdAt: number;
}

const pendingTickets = new Map<string, PendingTicket>(); // phone -> pending ticket
const PENDING_TICKET_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up expired pending tickets every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingTickets.entries()) {
    if (now - val.createdAt > PENDING_TICKET_TTL) {
      pendingTickets.delete(key);
    }
  }
}, 60_000);

// ─── Notion API Helpers for resolving relations ────────────────────

async function resolveDivisionPageId(divisiName: string): Promise<string | undefined> {
  if (!divisiName || divisiName === "-") return undefined;

  // First try alias resolution
  const resolved = resolveDivisionAlias(divisiName);
  const searchName = resolved || divisiName;

  const divisions = await listDivisions();
  const lower = searchName.toLowerCase();

  // Exact match first
  const exact = divisions.find((d) => d.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // Contains match
  const contains = divisions.find((d) =>
    d.name.toLowerCase().includes(lower) || lower.includes(d.name.toLowerCase())
  );
  if (contains) return contains.id;

  // Alias keywords match against division names
  for (const div of divisions) {
    const aliases = DIVISION_ALIASES[div.name];
    if (aliases?.some(a => lower.includes(a) || a.includes(lower))) {
      return div.id;
    }
  }

  return undefined;
}

async function resolveProjectPageId(projectName: string): Promise<string | undefined> {
  if (!projectName || projectName === "-") return undefined;
  const project = await (await import("../notion/notion-org-service.js")).searchProject(projectName);
  return project?.id;
}

async function resolveMemberPageId(memberName: string): Promise<{ id: string; fullName: string } | undefined> {
  if (!memberName || memberName === "-") return undefined;

  // First try nickname resolution
  const nickResolved = resolveNickname(memberName);
  const searchName = nickResolved || memberName;

  const members = await listMembers();
  const lower = searchName.toLowerCase();

  // Exact match
  const exact = members.find((m) => m.name.toLowerCase() === lower);
  if (exact) return { id: exact.id, fullName: exact.name };

  // Full name contains
  const contains = members.find((m) => m.name.toLowerCase().includes(lower));
  if (contains) return { id: contains.id, fullName: contains.name };

  // Partial word match
  const parts = lower.split(" ");
  for (const part of parts) {
    if (part.length < 2) continue;
    const match = members.find((m) => m.name.toLowerCase().includes(part));
    if (match) return { id: match.id, fullName: match.name };
  }

  return undefined;
}

// ─── Casual Response Wrapper ────────────────────────────────────────

/**
 * Wrap a plain command response with casual Oro personality.
 * Adds a friendly opening and closing remark via AI.
 * Falls back to original message if AI fails (so nothing breaks).
 */
async function addCasualTouch(
  message: string,
  context: MessageContext
): Promise<string> {
  // Skip wrapping for very short messages (likely already casual)
  if (message.length < 30) return message;

  // Skip wrapping for help text (already formatted)
  if (message.includes("Oro Bot")) return message;

  try {
    const prompt = CASUAL_WRAP_PROMPT
      .replace(/{pushName}/g, context.pushName)
      .replace("{message}", message);

    const result = await createMessage(
      [{ role: "user", content: prompt }],
      { maxTokens: 1000 }
    );

    const textBlock = result.content[0];
    if (textBlock && textBlock.type === "text" && textBlock.text.trim()) {
      return textBlock.text;
    }
  } catch (error) {
    console.warn("[Agent] Casual wrap failed, using original:", error);
  }

  // Fallback: just add a simple opening
  return `Sip, nih ${context.pushName}!\n\n${message}`;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface MessageContext {
  phoneNumber: string;
  pushName: string;
  senderPhone?: string;  // Nomor HP asli pengirim untuk contact lookup
  groupName?: string;
  isGroup: boolean;
  isBotMentioned?: boolean;
}

interface ParsedCommand {
  command: string;
  args: string;
}

// ─── Command Parser ─────────────────────────────────────────────────

function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();

  // !projects or !project list
  if (/^!(projects?(\s+list)?)$/i.test(trimmed)) {
    return { command: "project_list", args: "" };
  }

  // !project <name> — get project details
  const projectMatch = trimmed.match(/^!(project|projek)\s+(.+)/i);
  if (projectMatch) {
    return { command: "project_info", args: projectMatch[2].trim() };
  }

  // !backlog search <query>
  const backlogSearchMatch = trimmed.match(/^!backlog\s+(search|cari)\s+(.+)/i);
  if (backlogSearchMatch) {
    return { command: "backlog_search", args: backlogSearchMatch[2].trim() };
  }

  // !backlog division <name> — get backlog by division
  const backlogDivMatch = trimmed.match(/^!backlog\s+(divisi|division|dept)\s+(.+)/i);
  if (backlogDivMatch) {
    return { command: "backlog_division", args: backlogDivMatch[2].trim() };
  }

  // !backlog status <value> — get backlog by status
  const backlogStatusMatch = trimmed.match(/^!backlog\s+status\s+(.+)/i);
  if (backlogStatusMatch) {
    return { command: "backlog_status", args: backlogStatusMatch[1].trim() };
  }

  // !backlog update <name> status <value>
  const backlogUpdateMatch = trimmed.match(/^!backlog\s+(update|ubah)\s+(.+?)\s+(status|prioritas|priority)\s+(.+)/i);
  if (backlogUpdateMatch) {
    return {
      command: "backlog_update",
      args: `${backlogUpdateMatch[2].trim()}|${backlogUpdateMatch[3].trim()}|${backlogUpdateMatch[4].trim()}`,
    };
  }

  // !backlog delete <name> — delete/archive a backlog item
  const backlogDeleteMatch = trimmed.match(/^!backlog\s+(delete|hapus|archive)\s+(.+)/i);
  if (backlogDeleteMatch) {
    return { command: "backlog_delete", args: backlogDeleteMatch[2].trim() };
  }

  // !backlog restore <name> — restore archived item
  const backlogRestoreMatch = trimmed.match(/^!backlog\s+(restore|pulihkan)\s+(.+)/i);
  if (backlogRestoreMatch) {
    return { command: "backlog_restore", args: backlogRestoreMatch[2].trim() };
  }

  // !backlog bulk <status_from> to <status_to> [division]
  const bulkMatch = trimmed.match(/^!backlog\s+(bulk|masal)\s+(.+?)\s+(to|ke)\s+(.+?)(?:\s+(.+))?$/i);
  if (bulkMatch) {
    return { command: "backlog_bulk", args: `${bulkMatch[2].trim()}|${bulkMatch[4].trim()}|${bulkMatch[5]?.trim() || ""}` };
  }

  // !detail <ticket name or ID> — get full page detail
  const detailMatch = trimmed.match(/^!(detail|detailtiket)\s+(.+)/i);
  if (detailMatch) {
    return { command: "ticket_detail", args: detailMatch[2].trim() };
  }

  // !note <ticket name> <note text> — add note to ticket
  const noteMatch = trimmed.match(/^!(note|catatan)\s+(.+?)\s+(.+)/i);
  if (noteMatch) {
    return { command: "ticket_note", args: `${noteMatch[2].trim()}|${noteMatch[3].trim()}` };
  }

  // !comment <ticket name> <comment text> — add comment
  const commentMatch = trimmed.match(/^!(comment|komentar)\s+(.+?)\s+(.+)/i);
  if (commentMatch) {
    return { command: "ticket_comment", args: `${commentMatch[2].trim()}|${commentMatch[3].trim()}` };
  }

  // !members [division] — list members or members by division
  const membersMatch = trimmed.match(/^!(members|anggota)(?:\s+(.+))?$/i);
  if (membersMatch) {
    return { command: "members_list", args: membersMatch[2]?.trim() || "" };
  }

  // !divisions — list all divisions
  if (/^!(divisions?|divisi)$/i.test(trimmed)) {
    return { command: "divisions_list", args: "" };
  }

  // !tugas <member name> — get backlog assigned to member
  const tugasMatch = trimmed.match(/^!(tugas|tasks?)\s+(.+)/i);
  if (tugasMatch) {
    return { command: "member_tasks", args: tugasMatch[2].trim() };
  }

  // !assign <ticket name> <member name> — assign PIC
  const assignBacklogMatch = trimmed.match(/^!(assignpic|pic)\s+(.+?)\s+(.+)/i);
  if (assignBacklogMatch) {
    return { command: "assign_pic", args: `${assignBacklogMatch[2].trim()}|${assignBacklogMatch[3].trim()}` };
  }

  // !unassign <ticket name> <member name> — remove PIC
  const unassignMatch = trimmed.match(/^!(unassignpic|removepic)\s+(.+?)\s+(.+)/i);
  if (unassignMatch) {
    return { command: "unassign_pic", args: `${unassignMatch[2].trim()}|${unassignMatch[3].trim()}` };
  }

  // !refresh — force refresh all caches
  if (/^!(refresh|sync)$/i.test(trimmed)) {
    return { command: "cache_refresh", args: "" };
  }

  // !list [departemen]
  if (/^!list/i.test(trimmed)) {
    const dept = trimmed.replace(/^!list\s*/i, "").trim();
    return {
      command: dept ? "list_dept" : "list_all",
      args: dept,
    };
  }

  // !help or !bantuan
  if (/^!(help|bantuan)/i.test(trimmed)) {
    return { command: "show_help", args: "" };
  }

  // !stats or !statistik
  if (/^!(stats|statistik)/i.test(trimmed)) {
    return { command: "show_stats", args: "" };
  }

  // !close TK-XXXXXXXX-XXX
  const closeMatch = trimmed.match(
    /^!(close|selesai|done)\s+(TK-\d{8}-\d{3})/i
  );
  if (closeMatch) {
    return { command: "close_ticket", args: closeMatch[2] };
  }

  // !delete TK-XXXXXXXX-XXX — archive ticket by ID
  const deleteMatch = trimmed.match(
    /^!(delete|hapus)\s+(TK-\d{8}-\d{3})/i
  );
  if (deleteMatch) {
    return { command: "delete_ticket", args: deleteMatch[2] };
  }

  // !assign TK-XXXXXXXX-XXX @nama
  const assignMatch = trimmed.match(
    /^!(assign|pasang)\s+(TK-\d{8}-\d{3})\s+(.+)/i
  );
  if (assignMatch) {
    return { command: "assign_ticket", args: `${assignMatch[2]}|${assignMatch[3].trim()}` };
  }

  // !update TK-XXXXXXXX-XXX [status|prioritas] [value]
  const updateMatch = trimmed.match(
    /^!(update|ubah)\s+(TK-\d{8}-\d{3})\s+(.+)/i
  );
  if (updateMatch) {
    return { command: "update_ticket", args: `${updateMatch[2]}|${updateMatch[3].trim()}` };
  }

  // !db create <name> in <parent_page_id> — create a new database
  const dbCreateMatch = trimmed.match(/^!(db|database)\s+(create|buat)\s+(.+?)\s+in\s+(.+)/i);
  if (dbCreateMatch) {
    return { command: "db_create", args: `${dbCreateMatch[3].trim()}|${dbCreateMatch[4].trim()}` };
  }

  // !db schema <database_id> — get database schema
  const dbSchemaMatch = trimmed.match(/^!(db|database)\s+(schema|info)\s+(.+)/i);
  if (dbSchemaMatch) {
    return { command: "db_schema", args: dbSchemaMatch[3].trim() };
  }

  // !subpage <parent_ticket> <title> — create a sub-page
  const subPageMatch = trimmed.match(/^!(subpage|subhalaman)\s+(.+?)\s+(.+)/i);
  if (subPageMatch) {
    return { command: "subpage_create", args: `${subPageMatch[2].trim()}|${subPageMatch[3].trim()}` };
  }

  // !image <ticket> <url> — attach image to ticket
  const imageMatch = trimmed.match(/^!(image|gambar)\s+(.+?)\s+(.+)/i);
  if (imageMatch) {
    return { command: "ticket_image", args: `${imageMatch[2].trim()}|${imageMatch[3].trim()}` };
  }

  // status TK-XXXXXXXX-XXX | cek TK-... | info TK-...
  const statusMatch = trimmed.match(
    /(?:status|cek|info)\s+(TK-\d{8}-\d{3})/i
  );
  if (statusMatch) {
    return { command: "check_status", args: statusMatch[1] };
  }

  return null;
}

// ─── Main Handler ───────────────────────────────────────────────────

export async function handleMessage(
  message: string,
  context: MessageContext
): Promise<string> {
  // ─── Load or create user session ───
  const userPhone = context.senderPhone || context.phoneNumber;
  const session = getOrCreateSession(userPhone, context.pushName);
  saveUserMessage(userPhone, message);

  // Step 1: Check for management commands first
  const cmd = parseCommand(message);
  if (cmd) {
    try {
      const result = await addCasualTouch(await handleCommand(cmd.command, cmd.args, context), context);
      saveAssistantResponse(userPhone, result, { intent: `command_${cmd.command}` });
      return result;
    } catch (error) {
      console.error("[Agent] Error processing command:", error);
      return "\u274C *Waduh, terjadi error nih...*\n\nAku gagal memproses permintaan kamu. Coba lagi ya! Ketik *!help* untuk lihat daftar command yang bisa aku bantu.";
    }
  }

  // Step 2: For groups, respond if bot is mentioned
  if (context.isGroup && context.isBotMentioned) {
    const result = await handleSmartMessage(message, context, session);
    saveAssistantResponse(userPhone, result, { intent: "smart_message" });
    return result;
  }

  // Step 3: For groups without mention, ignore
  if (context.isGroup) {
    return "";
  }

  // Step 4: For DMs, use AI to analyze message
  const result = await handleSmartMessage(message, context, session);
  saveAssistantResponse(userPhone, result, { intent: "smart_message" });
  return result;
}

// ─── Command Router ─────────────────────────────────────────────────

async function handleCommand(
  command: string,
  args: string,
  context: MessageContext
): Promise<string> {
  switch (command) {
    case "check_status":
      return await handleCheckStatus(args);
    case "list_dept":
      return await handleListByDept(args);
    case "list_all":
      return await handleListAll();
    case "update_ticket":
      return await handleUpdateTicket(args, context);
    case "close_ticket":
      return await handleCloseTicket(args, context);
    case "delete_ticket":
      return await handleDeleteTicket(args, context);
    case "assign_ticket":
      return await handleAssignTicket(args, context);
    case "show_stats":
      return await handleStats();
    case "show_help":
      return handleHelp();
    case "project_list":
      return await handleProjectList();
    case "project_info":
      return await handleProjectInfo(args);
    case "backlog_search":
      return await handleBacklogSearch(args);
    case "backlog_update":
      return await handleBacklogUpdate(args, context);
    case "backlog_division":
      return await handleBacklogDivision(args);
    case "backlog_status":
      return await handleBacklogByStatus(args);
    case "backlog_delete":
      return await handleBacklogDelete(args, context);
    case "backlog_restore":
      return await handleBacklogRestore(args);
    case "backlog_bulk":
      return await handleBacklogBulk(args, context);
    case "ticket_detail":
      return await handleTicketDetail(args);
    case "ticket_note":
      return await handleTicketNote(args, context);
    case "ticket_comment":
      return await handleTicketComment(args, context);
    case "members_list":
      return await handleMembersList(args);
    case "divisions_list":
      return await handleDivisionsList();
    case "member_tasks":
      return await handleMemberTasks(args);
    case "assign_pic":
      return await handleAssignPic(args, context);
    case "unassign_pic":
      return await handleUnassignPic(args, context);
    case "cache_refresh":
      return handleCacheRefresh();
    case "db_create":
      return await handleDbCreate(args, context);
    case "db_schema":
      return await handleDbSchema(args);
    case "subpage_create":
      return await handleSubPageCreate(args, context);
    case "ticket_image":
      return await handleTicketImage(args, context);
    default:
      return "";
  }
}

// ─── Follow-up Question Handler ─────────────────────────────────────

async function handleFollowUpQuestion(
  message: string,
  session: ReturnType<typeof getOrCreateSession>,
  context: MessageContext,
  followUpType: FollowUpType
): Promise<string | null> {
  const lower = message.toLowerCase().trim();

  // ─── Confirmation responses (ya, tidak, ok, etc.) ───
  if (followUpType === "confirmation") {
    if (/^(ya|betul|iy|ok|oke|siap|gas|lanjut)\s*$/i.test(lower)) {
      if (session.lastIntent === "member_tasks" || session.lastIntent === "smart_message") {
        return `Oke ${context.pushName}! Kalau ada yang lain yang mau ditanyakan, tinggal bilang aja ya.`;
      }
    }
    if (/^(tidak|gak|nggak|bukan|skip|skip aja)\s*$/i.test(lower)) {
      return `Oke sip! Kalau butuh apa-apa lagi, aku selalu di sini ya.`;
    }
    // Short "bisa" / "bisa gak" questions
    if (/^bisa/i.test(lower)) {
      return `Bisa banget! Mau aku bantu apa nih?`;
    }
  }

  // ─── Continuation (terus gimana, lalu gimana) ───
  if (followUpType === "continuation") {
    if (session.lastTopic) {
      return `Maksudnya soal *${session.lastTopic}* yang tadi kita bahas? Mau detail lebih lanjut atau ada yang mau diubah?`;
    }
    return `Maksudnya lanjut apa nih ${context.pushName}? Aku kurang paham konteksnya. Bisa jelasin lebih spesifik?`;
  }

  // ─── Detail questions about previous context ───
  if (followUpType === "question_detail" || followUpType === "reference_previous") {
    // "di akun apa gw bisa akses" — about Notion access
    if (/akun apa|cara akses|gimana.*akses|akses.*apa/i.test(lower)) {
      return `Kamu bisa akses Notion SGA pakai akun email yang sudah di-invite ke workspace. Kalau belum punya akses, hubungi admin SGA buat di-invite ke workspace Notion ya!`;
    }

    // "deadline kapan" / "tenggat"
    if (/deadline|tenggat|kapan selesai/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        const itemsWithDeadline = session.lastNotionResults.filter(item => item.status && !item.status.toLowerCase().includes("done"));
        if (itemsWithDeadline.length > 0) {
          let msg = `Ini deadline dari tiket yang tadi kita bahas:\n\n`;
          for (const item of itemsWithDeadline.slice(0, 5)) {
            msg += `\u2022 ${item.name} — Status: ${item.status || "Unknown"}\n`;
          }
          return msg;
        }
      }
      return `Maksudnya deadline yang mana nih? Coba sebutin tiket/projectnya biar aku bisa cek.`;
    }

    // "siapa pic" / "pic siapa"
    if (/siapa pic|pic siapa|assign ke siapa/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        const itemsWithPics = session.lastNotionResults.filter(item => item.pics && item.pics.length > 0);
        if (itemsWithPics.length > 0) {
          let msg = `Ini PIC dari tiket yang tadi kita bahas:\n\n`;
          for (const item of itemsWithPics.slice(0, 5)) {
            msg += `\u2022 ${item.name} — PIC: ${item.pics?.join(", ") || "Belum ada"}\n`;
          }
          return msg;
        }
      }
      return `Maksudnya PIC yang mana nih? Coba sebutin tiketnya biar aku bisa cek.`;
    }

    // "statusnya" / "progressnya"
    if (/statusnya|progressnya|udah selesai|sudah selesai|belum selesai/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        let msg = `Ini status terkait dari yang tadi kita bahas:\n\n`;
        for (const item of session.lastNotionResults.slice(0, 5)) {
          msg += `${item.status === "Done" ? "\u2705" : "\uD83D\uDCCB"} ${item.name} — ${item.status || "Unknown"}\n`;
        }
        return msg;
      }
    }

    // "linknya" / "urlnya" / "notion"
    if (/linknya|urlnya|link.*notion|notion.*link/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        const itemsWithUrl = session.lastNotionResults.filter(item => item.url);
        if (itemsWithUrl.length > 0) {
          let msg = `Ini link Notion dari yang tadi kita bahas:\n\n`;
          for (const item of itemsWithUrl.slice(0, 5)) {
            msg += `\u2022 ${item.name}\n  ${item.url}\n`;
          }
          return msg;
        }
      }
    }

    // "projectnya" / "project apa"
    if (/projectnya|project apa|projeknya/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        const projects = new Set<string>();
        for (const item of session.lastNotionResults) {
          if (item.projects) item.projects.forEach(p => projects.add(p));
        }
        if (projects.size > 0) {
          return `Project yang terkait: ${Array.from(projects).join(", ")}`;
        }
      }
      if (session.lastProject) {
        return `Project yang tadi kita bahas: *${session.lastProject}*`;
      }
    }

    // "divisinya" / "divisi apa"
    if (/divisinya|divisi apa|departemen/i.test(lower)) {
      if (session.lastDivision) {
        return `Divisi yang tadi kita bahas: *${session.lastDivision}*`;
      }
    }

    // "prioritasnya"
    if (/prioritasnya|prioritas apa/i.test(lower)) {
      if (session.lastNotionResults.length > 0) {
        let msg = `Prioritas dari yang tadi kita bahas:\n\n`;
        for (const item of session.lastNotionResults.slice(0, 5)) {
          msg += `\u2022 ${item.name} — Priority: ${item.priority || "None"}\n`;
        }
        return msg;
      }
    }

    // Generic "yang tadi" / "itu" — reference previous topic
    if (/yang tadi|yang itu|yang barusan|yg tadi|yg itu|itu|tadi|barusan/i.test(lower)) {
      if (session.lastTopic) {
        return `Oh, yang tadi bahas soal *${session.lastTopic}* ya? Mau ditanyakan apa tentang itu?`;
      }
      if (session.lastNotionResults.length > 0) {
        const names = session.lastNotionResults.slice(0, 3).map(i => i.name);
        return `Oh, maksudnya yang tadi ya? Ini yang terakhir kita bahas:\n\n${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nMau detail yang mana?`;
      }
    }

    // "detailnya" / "info lengkap"
    if (/detailnya|info lengkap|detail/i.test(lower)) {
      if (session.lastTicketName) {
        return await addCasualTouch(await handleTicketDetail(session.lastTicketName), context);
      }
    }
  }

  // ─── Update request (ubah statusnya, ganti pic) ───
  if (followUpType === "update_request") {
    if (session.activeTicketNames.length > 0) {
      return `Mau ubah yang mana nih? Ini tiket yang tadi kita bahas:\n\n${session.activeTicketNames.slice(0, 5).map((n, i) => `${i + 1}. ${n}`).join("\n")}\n\nKasih tau tiket dan perubahan yang mau dilakuin ya!`;
    }
  }

  // If we couldn't handle the follow-up, return null to fall through to normal detection
  return null;
}

// ─── Smart Message Handler (AI auto-detect ticket vs chat) ──────────

async function handleSmartMessage(
  message: string,
  context: MessageContext,
  session: ReturnType<typeof getOrCreateSession>
): Promise<string> {
  console.log(`[Agent] Analyzing DM from ${context.pushName}: "${message.slice(0, 80)}..."`);

  const userPhone = context.senderPhone || context.phoneNumber;

  // ─── Check for follow-up question (before any other detection) ───
  const followUp = detectFollowUp(message, userPhone);
  if (followUp) {
    console.log(`[Agent] Follow-up detected (${followUp}) from ${context.pushName}: "${message}"`);
    const followUpResponse = await handleFollowUpQuestion(message, session, context, followUp);
    if (followUpResponse) {
      return followUpResponse;
    }
    // If follow-up handler couldn't answer, fall through to normal detection
  }

  // ─── Check for simple greetings (hai, halo, hi, hey, etc.) ───
  const greetingPattern = /^(hai|halo|hello|hi|hey|hola|pagi|siang|sore|malam|assalam|selamat)\b/i;
  const trimmedMsg = message.trim().toLowerCase();
  // Only treat as greeting if it's short (<= 25 chars) and matches pattern
  if (trimmedMsg.length <= 25 && greetingPattern.test(trimmedMsg)) {
    console.log(`[Agent] Greeting from ${context.pushName}: "${message}"`);
    const hour = new Date().getHours();
    let timeGreeting = "Hai";
    if (hour >= 5 && hour < 11) timeGreeting = "Selamat pagi";
    else if (hour >= 11 && hour < 15) timeGreeting = "Selamat siang";
    else if (hour >= 15 && hour < 18) timeGreeting = "Selamat sore";
    else if (hour >= 18 || hour < 5) timeGreeting = "Selamat malam";

    return `${timeGreeting} ${context.pushName}! \u{1F44B}\n\nAku Roro, bot asisten SGA. Aku bisa bantu:\n\u2022 Bikin tiket/backlog baru\n\u2022 Cek progress project\n\u2022 Lihat daftar tugas per divisi\n\n*Tip:* Ketik *!help* buat lihat semua command. Pakai command (!) lebih hemat token ya!`;
  }

  // ─── Check for pending ticket (conversation state) ───
  const pending = pendingTickets.get(context.phoneNumber);
  if (pending) {
    const now = Date.now();
    if (now - pending.createdAt > PENDING_TICKET_TTL) {
      pendingTickets.delete(context.phoneNumber);
    } else {
      // User is replying to resolve an unresolved PIC name
      // Treat the message as the full name for the unresolved PIC
      const resolvedPic = await resolveMemberPageId(message.trim());
      if (resolvedPic) {
        // Replace the first unresolved PIC with the resolved one
        const unresolvedName = pending.unresolvedPics.shift()!;
        // Update ticketData.pics: replace the unresolved name with the resolved full name
        const pics = pending.ticketData.pics;
        if (Array.isArray(pics)) {
          const idx = pics.findIndex((p: string) =>
            p.toLowerCase() === unresolvedName.toLowerCase()
          );
          if (idx >= 0) pics[idx] = resolvedPic.fullName;
        }
        if (pending.unresolvedPics.length === 0) {
          // All PICs resolved, create the ticket now
          pendingTickets.delete(context.phoneNumber);
          return await addCasualTouch(
            await handleCreateTicket(pending.ticketData, pending.context),
            context
          );
        } else {
          // Still more unresolved PICs
          return `Oke, ${resolvedPic.fullName} sudah aku temukan!\n\nMasih ada yang belum aku kenali nih: *${pending.unresolvedPics[0]}*. Nama lengkapnya siapa ya?`;
        }
      } else {
        // Still can't resolve — ask again with hint
        return `Hmm, tetap gak nemu nih untuk "${message.trim()}". Coba kasih nama lengkapnya ya, atau ketik *batal* kalau mau skip.`;
      }
    }
  }

  // Check for cancel command
  const lowerTrimmed = message.toLowerCase().trim();
  if (lowerTrimmed === "batal" || lowerTrimmed === "cancel") {
    if (pendingTickets.has(context.phoneNumber)) {
      pendingTickets.delete(context.phoneNumber);
      return "Oke, pembuatan tiket dibatalkan. Kalau mau bikin lagi tinggal bilang ya!";
    }
  }

  // ─── Prepare lowercase message for all detection logic ───
  const lowerMsg = message.toLowerCase();

  // ─── BROADCAST INTENT: mass task distribution (must be FIRST before any other detection) ───
  // "kirim semua notifikasi ke semua anggota sga sesuai tasknya masing masing"
  // "broadcast task ke semua member"
  // "notifikasi semua anggota tentang tugasnya"
  const broadcastPatterns = [
    /\b(?:kirim|broadcast|sebar|spam)\s+(?:semua|semuanya|seluruh)?\s*(?:notifikasi|notif|pesan|info|reminder|ingetin)?\s*(?:ke|untuk|kepada)?\s*(?:semua|seluruh)\s*(?:anggota|member|orang|pic)/i,
    /\b(?:kirim|broadcast|sebar)\s+(?:semua|semuanya|seluruh)?\s*(?:notifikasi|notif|pesan|info|reminder)\s+(?:ke|untuk|kepada)?\s*(?:semua|seluruh)/i,
    /\b(?:semua|seluruh)\s*(?:anggota|member)\s*(?:tentang|soal| tentang)\s*(?:tugas|tiket|task|backlog)/i,
    /\b(?:notifikasi|notify|ingetin)\s+(?:semua|seluruh)\s*(?:anggota|member|pic|orang)/i,
    /(?:masing\s*masing|sesuai\s*tugasnya|sesuai\s*tiketnya|sesuai\s*tasknya)/i,
    /\b(?:kirim|broadcast)\s+(?:semua|semuanya|seluruh)?\s*(?:tugas|tiket|task|backlog)\s+(?:ke|untuk)\s+(?:semua|seluruh)/i,
  ];

  const isBroadcastIntent = broadcastPatterns.some(p => p.test(lowerMsg));
  if (isBroadcastIntent) {
    console.log(`[Agent] BROADCAST intent detected from ${context.pushName}: "${message.slice(0, 80)}"`);
    return await handleBroadcastTaskNotifications(context);
  }

  // ─── Extract member name from message (before self-reference check) ───
  // If user mentions a specific person's name, that takes priority over self-reference.
  // E.g. "tugas farhan" → show Farhan's tasks, NOT the sender's tasks

  // Pronouns yang menunjukkan user bicara tentang dirinya sendiri
  const selfPronouns = /\b(gw|gua|gue|saya|aku|aq|aing|me|my|gue)\b/i;
  // Task keywords (dengan typo tolerance: baglock, baclog, tiket, etc.)
  const taskKeyword = /\b(backlog|baglock|baclog|backlok|tugas|tiket|ticket|task|tasks)\b/i;

  // --- Try to extract a SPECIFIC member name from the message ---
  // Patterns that indicate user is asking about someone else's tasks:
  // IMPORTANT: Order matters — more specific patterns first
  const memberNamePatterns = [
    // "kirim pesan ke faza", "kirim ke farhan", "kasih tau faza", "ingetin iqbal"
    // This must come FIRST because "kirim pesan ke X" clearly identifies X as the target
    /(?:kirim(?:kan)?\s+(?:pesan\s+)?(?:ke|untuk)\s+|kasih\s+(?:tau|tahu|info|pesan)\s+(?:(?:ke|untuk)\s+)?|notify\s+|ingetin\s+(?:(?:ke|untuk)\s+)?)(\w+)/i,
    // "tugas yg dipunyai farhan", "tugas yang dimiliki satrio", "tugas dipunyai farhan"
    /\b(?:tugas|tiket|backlog|task)\s+(?:ya?n?g?\s+)?(?:di(?:punyai|miliki)|punya)\s+(\w+(?:\s+\w+)?)/i,
    // "tugas dari farhan", "tiket milik satrio", "backlog punya iqbal"
    // NOTE: "nya" removed from this pattern because "tugas nya buatin" incorrectly captures "buatin" as a name
    /\b(?:tugas|tiket|backlog|task)\s+(?:dari|milik|punya|punyai|yang\s+di(?:punyai|miliki)?)\s+(\w+(?:\s+\w+)?)/i,
    // "farhan punya tugas apa", "satrio memiliki tugas"
    /(\w+(?:\s+\w+)?)\s+(?:punya|miliki)\s+(?:tugas|tiket|backlog|task)/i,
  ];

  let extractedMemberName: string | null = null;
  // IMPORTANT: Skip member name extraction if the message is a ticket creation intent.
  // "buatin tiket untuk ivan" should create a ticket FOR ivan, not show ivan's tasks.
  const isCreationIntent = /\b(buat(?:kan|in)?|bikin(?:kan|in)?|tambah(?:kan|in)?|create|new)\s+(tiket|ticket|backlog|tugas|task)/i.test(lowerMsg);
  if (!isCreationIntent) {
    for (const pattern of memberNamePatterns) {
      const m = lowerMsg.match(pattern);
      if (m) {
        const candidate = m[1].trim();
        // Make sure it's not a pronoun or common word
        const skipWords = new Set(["saya", "aku", "gw", "gua", "gue", "dong", "semua", "apa", "berapa", "gimana", "yang", "dia", "kamu", "kita", "mereka", "ini", "itu", "orang", "user", "member", "admin", "buat", "bikin", "buatkan", "bikinkan", "buatkan", "bikinin"]);
        if (candidate.length >= 2 && !skipWords.has(candidate) && !selfPronouns.test(candidate)) {
          extractedMemberName = candidate;
          console.log(`[Agent] Extracted member name "${extractedMemberName}" from pattern match`);
          break;
        }
      }
    }
  }

  // Also try: simple "tugas <name>" at end of message (existing patterns, enhanced)
  if (!extractedMemberName) {
    const simplePatterns = [
      /\b(?:tugas|tiket|backlog|task)\s+(\w+(?:\s+\w+)?)\s*$/i,
      /\b(?:cek|lihat|tampilkan|baca|info|detail)\s+(?:tugas|tiket|backlog|task)\s+(\w+(?:\s+\w+)?)\s*$/i,
    ];
    for (const pattern of simplePatterns) {
      const m = lowerMsg.match(pattern);
      if (m) {
        const candidate = m[1].trim();
        const skipWords = new Set(["saya", "aku", "gw", "gua", "gue", "dong", "baru", "semua", "apa", "berapa", "gimana", "yang",
                           "backlog", "tugas", "tiket", "task", "status", "project", "divisi", "member", "anggota"]);
        if (candidate.length >= 2 && !skipWords.has(candidate) && !selfPronouns.test(candidate)) {
          // Verify this is actually a name by trying to resolve it
          const resolved = resolveNickname(candidate);
          if (resolved) {
            extractedMemberName = candidate;
            console.log(`[Agent] Extracted member name "${extractedMemberName}" from simple pattern (resolved to "${resolved}")`);
            break;
          }
        }
      }
    }
  }

  // If a specific member name was found, show THEIR tasks (not self-reference)
  if (extractedMemberName) {
    console.log(`[Agent] Member tasks for "${extractedMemberName}" (takes priority over self-ref) from "${message.slice(0, 60)}"`);
    try {
      const resolvedNick = resolveNickname(extractedMemberName);
      const searchName = resolvedNick || extractedMemberName;
      const items = await getBacklogByMemberName(searchName);
      const displayName = resolvedNick
        ? resolvedNick.split(" ")[0]
        : extractedMemberName.charAt(0).toUpperCase() + extractedMemberName.slice(1);

      // Check if this is a "kirim pesan ke X" intent — send notification to that person
      const isNotifyIntent = /(?:kirim(?:kan)?\s+(?:pesan\s+)?(?:ke|untuk)|kasih\s+(?:tau|tahu|info)\s+(?:ke|untuk)?|notify|ingetin\s+(?:ke|untuk)?)/i.test(lowerMsg);

      if (items.length === 0) {
        if (isNotifyIntent) {
          return await addCasualTouch(`Hmm, ${displayName} belum punya tugas yang di-assign nih di backlog. Jadi gak ada yang perlu aku ingetin. Mau assign tugas baru buat dia?`, context);
        }
        return await addCasualTouch(`Wah, saat ini belum ada tugas yang di-assign ke *${displayName}* nih di backlog. Bersantai dulu atau mau ambil tugas baru?`, context);
      }

      let msg = `*Tugas ${displayName}* (${items.length} item)\n\n`;
      for (const item of items.slice(0, 20)) {
        const emoji = getStatusEmoji(item.status);
        msg += `${emoji} ${item.name}\n`;
        msg += `   Status: ${item.status} | Priority: ${item.priority}`;
        if (item.projects.length > 0) {
          msg += ` | Project: ${item.projects.join(", ")}`;
        }
        msg += `\n   ${item.url}\n`;
      }
      if (items.length > 20) {
        msg += `\n...dan ${items.length - 20} item lainnya.`;
      }

      // If "kirim pesan ke X" intent, also send WA notification to that person
      if (isNotifyIntent) {
        try {
          const { findPhoneByName, getFullName: getFullNameLookup } = await import("../services/contact-lookup.js");
          const { sendDirectMessage } = await import("../wa/sender.js");
          const { env } = await import("../config.js");
          const picContact = findPhoneByName(extractedMemberName);
          if (picContact) {
            const senderName = context.senderPhone ? getFullNameLookup(context.senderPhone) || context.pushName : context.pushName;
            const notifyMsg = `Hai ${displayName}! 👋\n\n${senderName} minta aku buat ngasih info tugas kamu di backlog SGA:\n\n` +
              items.slice(0, 10).map((item, i) => `${i + 1}. ${getStatusEmoji(item.status)} ${item.name} (${item.status})`).join("\n") +
              `\n\nTotal: ${items.length} tugas. Cek detailnya di Notion ya!`;
            await sendDirectMessage(env.EVOLUTION_INSTANCE_NAME, picContact.phone, notifyMsg);
            msg += `\n\nPesan sudah aku kirim ke ${displayName} via WA!`;
            console.log(`[Agent] Notification sent to ${displayName} (${picContact.phone})`);
          } else {
            msg += `\n\nHmm, nomor WA ${displayName} belum ada di database aku, jadi aku gak bisa kirim pesan ke dia. Tapi ini datanya ya!`;
          }
        } catch (notifyError) {
          console.error("[Agent] Failed to send notification:", notifyError);
          msg += `\n\nGagal kirim pesan ke ${displayName}, tapi ini datanya ya!`;
        }
      }

      return await addCasualTouch(msg, context);
    } catch (error) {
      console.error("[Agent] Member tasks intent error:", error);
    }
  }

  // ─── Detect self-reference ("backlog gw", "tugas saya", "cek tugas aku", dll) ───
  // Only triggers if NO specific member name was extracted above
  // Short query with dong/yah/sih (implies self: "cek backlog dong" = "cek backlog gw dong")
  const shortQueryDong = /\b(cek|lihat|tampilkan)\b.*\b(backlog|baglock|baclog|backlok|tugas|tiket|ticket|task)\b.*\b(dong|yah|sih|donk|donk)\s*$/i;

  const isSelfRef = (taskKeyword.test(lowerMsg) && selfPronouns.test(lowerMsg)) || shortQueryDong.test(lowerMsg);

  if (isSelfRef && context.senderPhone) {
    const fullName = getFullName(context.senderPhone);
    if (fullName) {
      console.log(`[Agent] Self-reference detected from ${context.pushName} (phone: ${context.senderPhone}), resolved to: "${fullName}", querying backlog`);
      try {
        const items = await getBacklogByMemberName(fullName);
        if (items.length === 0) {
          return await addCasualTouch(`Wah, saat ini belum ada tugas yang di-assign ke *${context.pushName}* nih di backlog. Bersantai dulu atau mau ambil tugas baru?`, context);
        }

        let msg = `*Tugas ${context.pushName}* (${items.length} item)\n\n`;
        for (const item of items.slice(0, 20)) {
          const emoji = getStatusEmoji(item.status);
          msg += `${emoji} ${item.name}\n`;
          msg += `   Status: ${item.status} | Priority: ${item.priority}`;
          if (item.projects.length > 0) {
            msg += ` | Project: ${item.projects.join(", ")}`;
          }
          msg += `\n   ${item.url}\n`;
        }
        if (items.length > 20) {
          msg += `\n...dan ${items.length - 20} item lainnya.`;
        }
        return await addCasualTouch(msg, context);
      } catch (error) {
        console.error("[Agent] Self-reference backlog query error:", error);
        return "Waduh, gagal ambil data tugas kamu nih. Coba lagi nanti ya!";
      }
    } else {
      console.log(`[Agent] Self-reference detected but phone ${context.senderPhone} not found in contacts`);
      return `Hmm, nomor kamu belum terdaftar di database aku nih ${context.pushName}. Jadi aku belum bisa cek tugas kamu. Hubungi admin buat daftarin nomor kamu ya!`;
    }
  }

  // ─── Detect specific intents (stats, project, list, help) BEFORE generic query ───
  // These need special routing that handleQuery() can't do

  // --- Intent: Stats ("statistik backlog", "stats backlog", "ringkasan backlog") ---
  if (/\b(?:statistik|stats|ringkasan|summary)\b.*\b(?:backlog|tiket|tugas)\b/i.test(lowerMsg) ||
      /\b(?:backlog|tiket|tugas)\b.*\b(?:statistik|stats|ringkasan|summary)\b/i.test(lowerMsg) ||
      /^\s*(stats|statistik)\s*$/i.test(lowerMsg.trim())) {
    console.log(`[Agent] Stats intent detected from ${context.pushName}: "${message.slice(0, 60)}"`);
    return await addCasualTouch(await handleStats(), context);
  }

  // --- Intent: Project detail ("detail project X", "project landing page", "progress project X") ---
  const projectIntentMatch = lowerMsg.match(
    /(?:detail|info|progress|cek|lihat|tampilkan)\s+(?:project|projek)\s+(.+)/
  ) || lowerMsg.match(
    /(?:project|projek)\s+(.+?)\s+(?:gimana|bagaimana|apa|detail|info|progress)/
  ) || lowerMsg.match(
    /(?:project|projek)\s+(.+?)\s*$/
  );
  if (projectIntentMatch) {
    const projectName = projectIntentMatch[1].replace(/[?.!,;]+$/, "").trim();
    // Make sure it's not a creation intent
    const isNotCreatingProject = !/\b(?:buat|bikin|tambah|create|new|baru)\b/.test(lowerMsg);
    if (projectName.length >= 2 && isNotCreatingProject) {
      console.log(`[Agent] Project intent detected: "${projectName}" from "${message.slice(0, 60)}"`);
      return await addCasualTouch(await handleProjectInfo(projectName), context);
    }
  }
  // --- Intent: List all backlog ("list backlog", "semua backlog", "daftar backlog", "list semua") ---
  if (/\b(?:list|daftar|semua|tampilkan\s+semua)\b.*\b(?:backlog|tiket|tugas)\b/.test(lowerMsg) ||
      /\b(?:backlog|tiket|tugas)\b.*\b(?:semua|list|daftar)\b/.test(lowerMsg) ||
      /\b(?:list|daftar)\s+(?:backlog|tiket|tugas|semua)\b/.test(lowerMsg) ||
      /^(?:list|daftar)\s*$/.test(lowerMsg.trim()) ||
      /^semua\s*(?:backlog|tiket|tugas)?\s*$/i.test(lowerMsg.trim())) {
    console.log(`[Agent] List-all intent detected from ${context.pushName}: "${message.slice(0, 60)}"`);
    return await addCasualTouch(await handleListAll(), context);
  }

  // --- Intent: Help/panduan ("panduan", "bantuan", "cara pakai", "help", "command", "perintah") ---
  if (/\b(?:panduan|bantuan|cara\s+(?:pakai|gunakan|pake)|command|perintah|menu)\b/.test(lowerMsg) || 
      /^\s*help\s*$/i.test(lowerMsg.trim()) ||
      /(?:cara|gimana|bagaimana)\s+(?:pakai|gunakan|pake|make|gunakan\s+oro)/i.test(lowerMsg)) {
    console.log(`[Agent] Help intent detected from ${context.pushName}: "${message.slice(0, 60)}"`);
    return handleHelp();
  }

  // --- Intent: Members list ("daftar anggota", "anggota ristek") ---
  if (/\b(?:anggota|member)\b/.test(lowerMsg) && /\b(?:daftar|list|semua|tampilkan|cek|lihat)\b/.test(lowerMsg)) {
    const memberDivMatch = lowerMsg.match(/(?:anggota|member)\s+(\w+(?:\s+\w+)?)/);
    const rawDivName = memberDivMatch ? memberDivMatch[1].trim() : "";
    // Guard: don't parse common words as division names
    const skipDivWords = new Set(["sga", "dengan", "yang", "dari", "untuk", "adalah", "itu", "ini", "ada", "semua", "tidak", "belum", "sudah"]);
    const divName = skipDivWords.has(rawDivName) ? "" : rawDivName;
    console.log(`[Agent] Members list intent detected: div="${divName}"`);
    return await addCasualTouch(await handleMembersList(divName), context);
  }

  // --- Intent: Divisions list ("daftar divisi", "divisi apa saja") ---
  if (/\bdivisi\b/.test(lowerMsg) && /\b(?:daftar|list|semua|apa\s+saja|apa\s+aja|tampilkan|cek|lihat)\b/.test(lowerMsg)) {
    console.log(`[Agent] Divisions list intent detected from ${context.pushName}`);
    return await addCasualTouch(await handleDivisionsList(), context);
  }

  // ─── Detect creation intent — always route to AI extraction ───
  const isCreatingIntent = /\b(bikin(?:kan|in)?|buat(?:kan|in)?|tambah(?:kan|in)?|create|new|baru)\b/.test(lowerMsg) &&
    /\b(tiket|ticket|backlog|tugas|task)\b/.test(lowerMsg);

  if (isCreatingIntent) {
    console.log(`[Agent] Creation intent detected from ${context.pushName}: "${message.slice(0, 60)}" — routing to AI extraction`);
    // Fall through to AI extraction below
  } else {
    // ─── Keyword-based query detection (BEFORE AI extraction) ───
    const queryKeywords = [
      "cek status", "cek tiket", "cek backlog", "cek tugas", "cek project",
      "lihat tiket", "lihat backlog", "lihat tugas", "lihat project",
      "tampilkan tiket", "tampilkan backlog", "tampilkan tugas", "tampilkan project",
      "apa aja", "apa saja", "daftar tiket", "daftar tugas", "daftar backlog",
      "yang open", "yang in progress", "yang done", "yang selesai", "yang belum",
      "berapa tiket", "berapa tugas", "berapa project",
      "summary", "ringkasan", "statistik", "stats",
      "update status", "ubah status", "ganti status", "pindahin", "pindahkan",
      "progress", "progres", "sudah sampai", "udah sampai",
      "udah selesai", "sudah selesai", "belum mulai",
      "baca tiket", "baca backlog", "baca tugas",
      "info tiket", "info backlog", "info tugas", "info project",
      "detail tiket", "detail backlog", "detail tugas", "detail project",
      "hapus tiket", "delete tiket", "archive tiket",
      "tambah catatan", "tambah note", "komentar",
      "siapa aja", "anggota", "member",
      // Generic keywords (match partial words too) — do NOT include "tiket" or "tugas" here
      // because those are also used in creation intent and would cause false query detection
      "backlog",
    ];
    const isQueryByKeyword = queryKeywords.some(kw => lowerMsg.includes(kw));

    // Also detect division in message — if a division alias is present + any reading intent, treat as query
    const detectedDivision = detectDivisionFromMessage(lowerMsg);
    const hasDivisionIntent = !!detectedDivision && (
      lowerMsg.includes("backlog") ||
      lowerMsg.includes("cek") || lowerMsg.includes("lihat") || lowerMsg.includes("bisa") ||
      lowerMsg.includes("tampilkan") || lowerMsg.includes("info") || lowerMsg.includes("detail") ||
      lowerMsg.includes("ada") || lowerMsg.includes("apa")
    );

    const isReadingIntent = /^(cek|lihat|tampilkan|baca|info|detail|berapa|daftar|list|show|get|apa|siapa)\b/.test(lowerMsg);
    const isNotCreating = !lowerMsg.includes("bikin") && !lowerMsg.includes("buat") && !lowerMsg.includes("tambah") && !lowerMsg.includes("create");

    if (isQueryByKeyword || hasDivisionIntent || (isReadingIntent && isNotCreating)) {
      console.log(`[Agent] Keyword-based query detected from ${context.pushName}: "${message.slice(0, 60)}"`);
      const queryData: Record<string, unknown> = { is_query: true, query_type: "general" };
      // Use already-detected division from above
      if (detectedDivision) queryData.division = detectedDivision;
      // Detect status
      if (lowerMsg.includes("open") || lowerMsg.includes("belum")) queryData.status = "Not started";
      else if (lowerMsg.includes("in progress") || lowerMsg.includes("progress") || lowerMsg.includes("progres")) queryData.status = "In progress";
      else if (lowerMsg.includes("done") || lowerMsg.includes("selesai")) queryData.status = "Done";
      else if (lowerMsg.includes("review")) queryData.status = "Need to review";
      // Detect query type
      if (lowerMsg.includes("update") || lowerMsg.includes("ubah") || lowerMsg.includes("ganti") || lowerMsg.includes("pindah")) {
        queryData.query_type = "update";
      } else if (lowerMsg.includes("statistik") || lowerMsg.includes("stats") || lowerMsg.includes("ringkasan") || lowerMsg.includes("summary")) {
        queryData.query_type = "stats";
      } else if (queryData.division) {
        queryData.query_type = "division";
      } else if (queryData.status) {
        queryData.query_type = "status";
      } else {
        queryData.query_type = "keyword";
        queryData.keyword = message;
      }
      return await addCasualTouch(await handleQuery(queryData, context), context);
    }
  }

  try {
    // Inject conversation context into the extraction prompt
    const contextSummary = getContextSummary(userPhone);
    const extractionPromptWithContext = contextSummary
      ? EXTRACTION_PROMPT.replace("{message}", message) +
        `\n\n--- CONVERSATION CONTEXT ---\n${contextSummary}\n--- END CONTEXT ---\n` +
        `IMPORTANT: If the message is a follow-up question referencing previous context (like "di akun apa", "yang tadi", "itu", "deadline kapan"), set is_ticket=false and is_query=false. Don't create tickets for follow-up questions.`
      : EXTRACTION_PROMPT.replace("{message}", message);

    const extraction = await createMessage([
      {
        role: "user",
        content: extractionPromptWithContext,
      },
    ]);

    const textBlock = extraction.content[0];
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    const parsed = extractJSON(textBlock.text);
    if (!parsed) {
      throw new Error("Failed to parse AI response");
    }

    console.log(`[Agent] AI extraction result: is_ticket=${parsed.is_ticket}, is_query=${parsed.is_query}, query_type=${parsed.query_type || "none"}`);

    if (parsed.is_query === true) {
      console.log(`[Agent] Query request from ${context.pushName}: ${String(parsed.query_type || "general")}`);
      return await addCasualTouch(await handleQuery(parsed, context), context);
    }

    if (parsed.is_ticket === true) {
      // FAST EXECUTION: langsung create ticket tanpa konfirmasi
      // AI extraction sudah validate data, langsung execute
      console.log(`[Agent] Direct ticket creation from ${context.pushName}: "${message.slice(0, 60)}"`);
      return await handleCreateTicket(parsed, context);
    }

    // Non-scope request — redirect to AI chat instead of hard reject
    // "iya", "ya", "ok" etc are confirmations that should go to AI chat, not be rejected
    if (parsed.is_ticket === false && parsed.is_query !== true) {
      console.log(`[Agent] Non-ticket/non-query from ${context.pushName}, routing to AI chat`);
      return await handleChat(message, context);
    }

    return await handleChat(message, context);
  } catch (error) {
    console.error("[Agent] Smart message error:", error);
    return await handleChat(message, context);
  }
}

// ─── Query Handler (read/query backlog data) ────────────────────────

async function handleQuery(
  queryData: Record<string, unknown>,
  _context: MessageContext
): Promise<string> {
  const queryType = String(queryData.query_type || "general").toLowerCase();
  const division = String(queryData.division || queryData.departemen || "");
  const status = String(queryData.status || "");
  const keyword = String(queryData.keyword || queryData.search || "");

  console.log(`[Agent] handleQuery: type=${queryType}, division=${division}, status=${status}, keyword=${keyword}`);

  try {
    if (division && division !== "-" && division !== "null") {
      return await getBacklogByDivision(division);
    }

    if (status && status !== "-" && status !== "null") {
      return await getBacklogByStatusSummary(status);
    }

    if (keyword && keyword !== "-" && keyword !== "null") {
      const items = await searchBacklog(keyword);
      if (items.length === 0) {
        return `Hmm, aku gak nemu backlog item yang cocok dengan "${keyword}" nih.\n\nCoba kata kunci lain, atau ketik *!list* buat lihat semua backlog!`;
      }

      let msg = `*Hasil Pencarian* (${items.length} item)\n\n`;
      for (const item of items.slice(0, 15)) {
        const emoji = getStatusEmoji(item.status);
        msg += `${emoji} ${item.name}\n`;
        msg += `   Status: ${item.status} | Priority: ${item.priority}`;
        if (item.projects.length > 0) {
          msg += ` | Project: ${item.projects.join(", ")}`;
        }
        msg += `\n   ${item.url}`;
        msg += "\n";
      }
      if (items.length > 15) {
        msg += `\n...dan ${items.length - 15} item lainnya.`;
      }
      msg += `\n\nKlik link di atas buat detail lengkap di Notion!`;
      return msg;
    }

    const stats = await getBacklogStats();
    let msg = `*Ringkasan Backlog SGA*\n\n`;
    msg += `Total: ${stats.total} item\n`;
    msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    msg += `Not started: ${stats.todo}\n`;
    msg += `In Progress: ${stats.inProgress}\n`;
    msg += `Complete: ${stats.complete}\n`;
    msg += `Blocking: ${stats.blocking}\n\n`;
    msg += `Mau detail yang mana? Bilang aja:\n`;
    msg += `\u2022 "tampilkan backlog ristek"\n`;
    msg += `\u2022 "yang statusnya in progress"\n`;
    msg += `\u2022 "cari [keyword]"`;
    return msg;
  } catch (error) {
    console.error("[Agent] handleQuery error:", error);
    return "Waduh, gagal ambil data nih... Coba lagi nanti ya!";
  }
}

// ─── Ticket Creation ────────────────────────────────────────────────

async function handleCreateTicket(
  ticketData: Record<string, unknown>,
  context: MessageContext
): Promise<string> {
  const judul = String(ticketData.judul || "Tiket Baru").slice(0, 60);
  const deskripsi = String(ticketData.deskripsi || "");
  const divisi = String(ticketData.departemen || ticketData.divisi || "-");
  const project = String(ticketData.project || "-");
  const prioritas = String(ticketData.prioritas || "Medium");
  const picsRaw = ticketData.pics;
  let pics: string[] = [];
  if (Array.isArray(picsRaw)) {
    pics = picsRaw.map(String).filter((p) => p && p !== "null");
  } else if (typeof picsRaw === "string" && picsRaw !== "null" && picsRaw.trim() !== "") {
    pics = picsRaw.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  }
  const dueDate = ticketData.deadline
    ? String(ticketData.deadline)
    : ticketData.dueDate
      ? String(ticketData.dueDate)
      : undefined;
  const status = ticketData.status ? String(ticketData.status) : undefined;

  // Extract reviewedBy
  const reviewedByRaw = ticketData.reviewedBy;
  let reviewedBy: string[] = [];
  if (Array.isArray(reviewedByRaw)) {
    reviewedBy = reviewedByRaw.map(String).filter((r: string) => r && r !== "null");
  } else if (typeof reviewedByRaw === "string" && reviewedByRaw !== "null" && reviewedByRaw.trim() !== "") {
    reviewedBy = reviewedByRaw.split(",").map((r: string) => r.trim()).filter((r: string) => r.length > 0);
  }

  const ticketId = generateTicketId();
  const reporter = context.pushName;

  console.log(
    `[Agent] Creating ticket ${ticketId}: divisi=${divisi}, project=${project}, priority=${prioritas}, status=${status || "default"}, pics=[${pics.join(", ")}], reviewedBy=[${reviewedBy.join(", ")}], dueDate=${dueDate || "none"}`
  );

  const resolvePromises: Promise<unknown>[] = [
    resolveDivisionPageId(divisi !== "-" ? divisi : ""),
    resolveProjectPageId(project !== "-" ? project : ""),
  ];

  const picResolvePromises = pics.map((picName) => resolveMemberPageId(picName));
  const reviewedByResolvePromises = reviewedBy.map((reviewerName) => resolveMemberPageId(reviewerName));

  const [resolved, resolvedPics, resolvedReviewers] = await Promise.all([
    Promise.all(resolvePromises),
    Promise.all(picResolvePromises),
    Promise.all(reviewedByResolvePromises),
  ]);

  const divisionPageId = resolved[0] as string | undefined;
  const projectPageId = resolved[1] as string | undefined;

  const picPageIds: string[] = [];
  const picNames: string[] = [];
  const unresolvedPics: string[] = [];

  for (let i = 0; i < resolvedPics.length; i++) {
    const memberInfo = resolvedPics[i];
    if (memberInfo) {
      picPageIds.push((memberInfo as { id: string; fullName: string }).id);
      picNames.push((memberInfo as { id: string; fullName: string }).fullName);
    } else {
      // This PIC couldn't be resolved
      unresolvedPics.push(pics[i]);
    }
  }

  // Resolve reviewedBy members
  const reviewedByPageIds: string[] = [];
  const reviewedByNames: string[] = [];

  for (const reviewerInfo of resolvedReviewers) {
    if (reviewerInfo) {
      reviewedByPageIds.push((reviewerInfo as { id: string; fullName: string }).id);
      reviewedByNames.push((reviewerInfo as { id: string; fullName: string }).fullName);
    }
  }

  // If there are unresolved PICs, save conversation state and ask user
  if (unresolvedPics.length > 0) {
    console.log(`[Agent] Unresolved PICs: [${unresolvedPics.join(", ")}], saving conversation state`);

    // If we resolved at least some PICs, update ticketData with resolved names
    const updatedPics = pics.map((p) => {
      const idx = pics.indexOf(p);
      if (resolvedPics[idx]) {
        return (resolvedPics[idx] as { id: string; fullName: string }).fullName;
      }
      return p;
    });
    ticketData.pics = updatedPics;

    pendingTickets.set(context.phoneNumber, {
      ticketData,
      context,
      unresolvedPics,
      createdAt: Date.now(),
    });

    return `Oke ${context.pushName}, aku mau buatin tiketnya nih, tapi ada nama yang belum aku kenali:\n\n*${unresolvedPics[0]}* — nama lengkapnya siapa ya?\n\nKasih nama lengkapnya biar aku bisa assign ke orang yang bener!`;
  }

  console.log(
    `[Agent] Resolved IDs: division=${divisionPageId || "not found"}, project=${projectPageId || "not found"}, pics=[${picPageIds.join(", ")}]`
  );

  let notionUrl = "";
  try {
    const directResult = await createTicketDirect({
      ticketId,
      judul,
      divisi: divisi !== "-" ? divisi : undefined,
      project: project !== "-" ? project : undefined,
      deskripsi,
      reporter,
      prioritas,
      status,
      divisionPageId,
      projectPageId,
      picPageIds,
      picNames,
      reviewedByPageIds: reviewedByPageIds.length > 0 ? reviewedByPageIds : undefined,
      reviewedByNames: reviewedByNames.length > 0 ? reviewedByNames : undefined,
      dueDate,
    });
    notionUrl = directResult.url;
    console.log(`[Agent] Ticket created via direct Notion API: ${directResult.pageId}`);
  } catch (error) {
    console.error("[Agent] Failed to create ticket:", error);
    return "\u274C *Waduh, gagal bikin tiket di Notion nih...*\n\nCoba lagi nanti ya, atau hubungi admin!";
  }

  console.log(`[Agent] Ticket ${ticketId} created successfully`);

  // ── Outbound hook: Notifikasi ke PIC via WhatsApp ──
  if (picNames.length > 0) {
    // Kirim notifikasi ke setiap PIC secara async (tidak blocking)
    for (const picName of picNames) {
      setImmediate(async () => {
        try {
          const notified = await notifyPIC({
            senderPhone: context.senderPhone || "",
            ticketTitle: judul,
            picName,
            ticketId,
            division: divisi !== "-" ? divisi : undefined,
            createdAt: new Date().toLocaleDateString("id-ID"),
          });
          if (notified) {
            console.log(`[Agent] PIC ${picName} berhasil dinotifikasi via WA`);
          } else {
            console.log(`[Agent] PIC ${picName} tidak bisa dinotifikasi (mungkin tidak ada di contacts)`);
          }
        } catch (error) {
          console.warn(`[Agent] Gagal notifikasi PIC ${picName}:`, error);
        }
      });
    }
  }

  let response = `Tiket berhasil dibuat ✅\n\n`;
  response += `*${judul}*\n`;
  if (picNames.length > 0) response += `PIC: ${picNames.join(", ")}\n`;
  if (divisi !== "-") response += `Divisi: ${divisi}\n`;
  response += `Prioritas: ${prioritas}\n`;
  if (status) response += `Status: ${status}\n`;
  if (project !== "-") response += `Project: ${project}\n`;
  if (reviewedByNames.length > 0) response += `Reviewed By: ${reviewedByNames.join(", ")}\n`;
  if (dueDate) response += `Deadline: ${dueDate}\n`;
  response += `Ticket ID: ${ticketId}\n`;
  if (notionUrl) {
    response += `Notion: ${notionUrl}\n`;
  }
  if (picNames.length > 0) {
    response += `\nNotifikasi sudah dikirim ke ${picNames.join(", ")}.`;
  }

  return response;
}

// ─── Status Check ───────────────────────────────────────────────────

async function handleCheckStatus(ticketId: string): Promise<string> {
  console.log(`[Agent] Checking status for: ${ticketId}`);

  const searchResult = await searchPagesDirect(ticketId) as {
    results: Array<{ id: string; properties: Record<string, unknown>; url: string }>;
  };

  if (searchResult.results.length === 0) {
    return `Tiket ${ticketId} tidak ditemukan.\n\nPastikan ID tiket benar. Format: TK-XXXXXXXX-XXX`;
  }

  const page = searchResult.results[0];
  const props = page.properties;
  const name = extractTitleFromProps(props);
  const status = extractStatusFromProps(props);
  const priority = extractPriorityFromProps(props);

  return `*Status Tiket: ${ticketId}*\n\n${name}\nStatus: ${status}\nPrioritas: ${priority}\n${page.url}`;
}

// ─── List Tickets ───────────────────────────────────────────────────

async function handleListByDept(departement: string): Promise<string> {
  const dept = normalizeDepartment(departement);
  console.log(`[Agent] Listing backlog for: ${dept}`);

  try {
    const items = await searchBacklog(dept);
    if (items.length === 0) {
      return `Tidak ada backlog item ditemukan untuk "${dept}".`;
    }

    let msg = `*Backlog: ${dept}* (${items.length} item)\n\n`;
    for (const item of items.slice(0, 20)) {
      const emoji = getStatusEmoji(item.status);
      msg += `${emoji} ${item.name}\n`;
      msg += `   Status: ${item.status} | Priority: ${item.priority}\n`;
    }

    if (items.length > 20) {
      msg += `\n...dan ${items.length - 20} item lainnya.`;
    }

    return msg;
  } catch (error) {
    console.error("[Agent] List by dept error:", error);
    return "Gagal mengambil data backlog. Coba lagi nanti.";
  }
}

async function handleListAll(): Promise<string> {
  console.log("[Agent] Listing all backlog items");

  try {
    const items = await listBacklog(undefined, [
      { property: "Status", direction: "ascending" },
    ]);

    if (items.length === 0) {
      return "Master Backlog kosong.";
    }

    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      const s = item.status || "Unknown";
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(item);
    }

    let msg = `*Master Backlog* (${items.length} item)\n\n`;
    for (const [status, group] of Object.entries(grouped)) {
      const emoji = getStatusEmoji(status);
      msg += `${emoji} *${status}* (${group.length}):\n`;
      for (const item of group.slice(0, 10)) {
        msg += `  \u2022 ${item.name} [${item.priority}]\n`;
      }
      if (group.length > 10) {
        msg += `  ...dan ${group.length - 10} lainnya\n`;
      }
      msg += "\n";
    }

    msg += `Mau lihat detail? Ketik *!backlog search <nama>* atau cek langsung di Notion!`;
    return msg;
  } catch (error) {
    console.error("[Agent] List all error:", error);
    return "Gagal mengambil data backlog. Coba lagi nanti.";
  }
}

// ─── Update Ticket ──────────────────────────────────────────────────

async function handleUpdateTicket(
  args: string,
  context: MessageContext
): Promise<string> {
  const [ticketId, ...rest] = args.split("|");
  const updateText = rest.join("|").trim();

  if (!ticketId || !updateText) {
    return "Format: *!update TK-XXXXXXXX-XXX [field] [value]*\n\nContoh:\n!update TK-20260426-001 status In progress\n!update TK-20260426-001 prioritas High";
  }

  console.log(`[Agent] Updating ticket ${ticketId}: ${updateText}`);

  const extraction = await createMessage([
    {
      role: "user",
      content: `Parse this ticket update request. Return JSON only, no markdown.

Ticket ID: ${ticketId}
Update request: "${updateText}"

Return format:
{
  "field": "status" or "prioritas",
  "value": "the new value"
}

Valid status values: Not started, In progress, Need to review, Need to fix, Done
Valid prioritas values: Low, Medium, High`,
    },
  ]);

  const textBlock = extraction.content[0];
  if (!textBlock || textBlock.type !== "text") {
    return "Gagal parse request update. Coba format: *!update TK-xxx status In progress*";
  }

  const updateData = extractJSON(textBlock.text);
  if (!updateData?.field || !updateData?.value) {
    return "Gagal parse request update. Coba format: *!update TK-xxx status In progress*";
  }

  const field = String(updateData.field).toLowerCase();
  const value = String(updateData.value);

  const searchResult = await searchPagesDirect(ticketId) as {
    results: Array<{ id: string; properties: Record<string, unknown>; url: string }>;
  };

  if (searchResult.results.length === 0) {
    return `Tiket ${ticketId} tidak ditemukan.`;
  }

  const page = searchResult.results[0];

  if (field === "status") {
    await updateBacklogStatus(page.id, value);
  } else if (field === "prioritas" || field === "priority") {
    await updateBacklogPriority(page.id, value);
  } else {
    return "Field harus *status* atau *prioritas*.\n\nContoh:\n!update TK-xxx status Complete\n!update TK-xxx prioritas High";
  }

  console.log(`[Agent] Ticket ${ticketId} updated: ${field} = ${value}`);

  return `*Tiket Diperbarui!*

ID: ${ticketId}
${field}: ${value}
Diubah oleh: ${context.pushName}

Lihat detail: ${page.url}`;
}

// ─── Close Ticket ───────────────────────────────────────────────────

async function handleCloseTicket(
  ticketId: string,
  context: MessageContext
): Promise<string> {
  console.log(`[Agent] Closing ticket: ${ticketId}`);

  const searchResult = await searchPagesDirect(ticketId) as {
    results: Array<{ id: string; properties: Record<string, unknown>; url: string }>;
  };

  if (searchResult.results.length === 0) {
    return `Tiket ${ticketId} tidak ditemukan.`;
  }

  const page = searchResult.results[0];
  await updateBacklogStatus(page.id, "Done");

  console.log(`[Agent] Ticket ${ticketId} closed by ${context.pushName}`);

  return `*Tiket Selesai!*

ID: ${ticketId}
Status: Done
Ditutup oleh: ${context.pushName}

Lihat detail: ${page.url}`;
}

// ─── Delete Ticket (Archive) ────────────────────────────────────────

async function handleDeleteTicket(
  ticketId: string,
  context: MessageContext
): Promise<string> {
  console.log(`[Agent] Deleting (archiving) ticket: ${ticketId}`);

  const searchResult = await searchPagesDirect(ticketId) as {
    results: Array<{ id: string; properties: Record<string, unknown>; url: string }>;
  };

  if (searchResult.results.length === 0) {
    return `Tiket ${ticketId} tidak ditemukan.`;
  }

  const page = searchResult.results[0];
  await archiveTicketDirect(page.id);

  console.log(`[Agent] Ticket ${ticketId} archived by ${context.pushName}`);

  return `*Tiket Dihapus (Archived)!*

ID: ${ticketId}
Dihapus oleh: ${context.pushName}

Tiket bisa di-restore kembali kalau dibutuhkan.`;
}

// ─── Assign Ticket ──────────────────────────────────────────────────

async function handleAssignTicket(
  args: string,
  context: MessageContext
): Promise<string> {
  const [ticketId, assignee] = args.split("|");

  if (!ticketId || !assignee) {
    return "Format: *!assign TK-XXXXXXXX-XXX @nama*\n\nContoh: !assign TK-20260426-001 @Budi";
  }

  console.log(`[Agent] Assigning ticket ${ticketId} to ${assignee}`);

  const searchResult = await searchPagesDirect(ticketId) as {
    results: Array<{ id: string; properties: Record<string, unknown>; url: string }>;
  };

  if (searchResult.results.length === 0) {
    return `Tiket ${ticketId} tidak ditemukan.`;
  }

  const page = searchResult.results[0];
  const name = extractTitleFromProps(page.properties);

  // Try to resolve member and use proper PIC relation
  const memberInfo = await resolveMemberPageId(assignee);
  if (memberInfo) {
    await assignPicToBacklog(page.id, memberInfo.id);
  }

  // Also add as comment/note
  await addTicketComment(page.id, `Assigned to: ${memberInfo?.fullName || assignee} (by ${context.pushName})`);

  // Kirim notifikasi ke PIC via WhatsApp
  if (memberInfo) {
    setImmediate(async () => {
      try {
        const notified = await notifyPIC({
          senderPhone: context.senderPhone || "",
          ticketTitle: name,
          picName: memberInfo.fullName,
          ticketId,
          division: undefined,
          createdAt: new Date().toLocaleDateString("id-ID"),
        });
        if (notified) {
          console.log(`[Agent] PIC ${memberInfo.fullName} dinotifikasi via WA setelah assign ticket`);
        } else {
          console.log(`[Agent] PIC ${memberInfo.fullName} tidak bisa dinotifikasi (mungkin tidak ada di contacts)`);
        }
      } catch (error) {
        console.warn(`[Agent] Gagal notifikasi PIC ${memberInfo.fullName} setelah assign ticket:`, error);
      }
    });
  }

  console.log(`[Agent] Ticket ${ticketId} assigned to ${assignee}`);

  return `*Tiket Di-assign!*

${name}
ID: ${ticketId}
Assignee: ${memberInfo?.fullName || assignee}
Di-assign oleh: ${context.pushName}

Lihat detail: ${page.url}`;
}

// ─── Project Commands ───────────────────────────────────────────────

async function handleProjectList(): Promise<string> {
  console.log("[Agent] Listing all projects");

  try {
    const projects = await listProjects();
    if (projects.length === 0) {
      return "Tidak ada project ditemukan.";
    }

    let msg = `*Master Projects* (${projects.length})\n\n`;
    for (const p of projects) {
      msg += `${p.name}\n`;
      if (p.divisions.length > 0) {
        msg += `   Divisi: ${p.divisions.join(", ")}\n`;
      }
      if (p.headOfProject.length > 0) {
        msg += `   HOP: ${p.headOfProject.join(", ")}\n`;
      }
      msg += `   Backlog: ${p.backlogCount} item\n\n`;
    }

    msg += `Ketik *!project <nama>* untuk detail + backlog item.`;
    return msg;
  } catch (error) {
    console.error("[Agent] Project list error:", error);
    return "Gagal mengambil data project. Coba lagi nanti.";
  }
}

async function handleProjectInfo(projectName: string): Promise<string> {
  console.log(`[Agent] Getting project info: ${projectName}`);

  try {
    const details = await getProjectDetails(projectName);
    if (!details) {
      return `Project "${projectName}" tidak ditemukan.\n\nKetik *!projects* untuk lihat semua project.`;
    }

    const { project, backlog } = details;

    let msg = `*${project.name}*\n\n`;

    if (project.divisions.length > 0) {
      msg += `Divisi: ${project.divisions.join(", ")}\n`;
    }
    if (project.headOfProject.length > 0) {
      msg += `Head of Project: ${project.headOfProject.join(", ")}\n`;
    }
    msg += `Total Backlog: ${backlog.length} item\n`;
    msg += `${project.url}\n\n`;

    if (backlog.length > 0) {
      const grouped: Record<string, typeof backlog> = {};
      for (const item of backlog) {
        const s = item.status || "Unknown";
        if (!grouped[s]) grouped[s] = [];
        grouped[s].push(item);
      }

      for (const [status, items] of Object.entries(grouped)) {
        const emoji = getStatusEmoji(status);
        msg += `${emoji} *${status}* (${items.length}):\n`;
        for (const item of items.slice(0, 8)) {
          msg += `  \u2022 ${item.name} [${item.priority}]\n`;
        }
        if (items.length > 8) {
          msg += `  ...dan ${items.length - 8} lainnya\n`;
        }
        msg += "\n";
      }
    } else {
      msg += "Belum ada backlog item untuk project ini.";
    }

    return msg;
  } catch (error) {
    console.error("[Agent] Project info error:", error);
    return "Gagal mengambil data project. Coba lagi nanti.";
  }
}

// ─── Backlog Commands ───────────────────────────────────────────────

async function handleBacklogSearch(query: string): Promise<string> {
  console.log(`[Agent] Searching backlog: ${query}`);

  try {
    const items = await searchBacklog(query);
    if (items.length === 0) {
      return `Tidak ada backlog item yang cocok dengan "${query}".`;
    }

    let msg = `*Hasil Pencarian Backlog* (${items.length} item)\n\n`;
    for (const item of items.slice(0, 15)) {
      const emoji = getStatusEmoji(item.status);
      msg += `${emoji} ${item.name}\n`;
      msg += `   Status: ${item.status} | Priority: ${item.priority}`;
      if (item.projects.length > 0) {
        msg += ` | Project: ${item.projects.join(", ")}`;
      }
      msg += `\n   ${item.url}`;
      msg += "\n";
    }

    if (items.length > 15) {
      msg += `\n...dan ${items.length - 15} item lainnya.`;
    }

    msg += `\n\nKlik link di atas buat detail lengkap di Notion!`;
    return msg;
  } catch (error) {
    console.error("[Agent] Backlog search error:", error);
    return "Gagal mencari backlog. Coba lagi nanti.";
  }
}

async function handleBacklogUpdate(
  args: string,
  context: MessageContext
): Promise<string> {
  const [name, field, value] = args.split("|");

  if (!name || !field || !value) {
    return "Format: *!backlog update <nama> <field> <value>*\n\nContoh:\n!backlog update redesign status In progress\n!backlog update redesign prioritas High";
  }

  console.log(`[Agent] Updating backlog: ${name}, ${field} = ${value}`);

  try {
    const items = await searchBacklog(name);
    if (items.length === 0) {
      return `Backlog item "${name}" tidak ditemukan.`;
    }

    const item = items[0];
    const normalizedField = field.toLowerCase();

    if (normalizedField === "status") {
      await updateBacklogStatus(item.id, value);
    } else if (normalizedField === "prioritas" || normalizedField === "priority") {
      await updateBacklogPriority(item.id, value);
    } else {
      return "Field harus *status* atau *prioritas*.\n\nStatus: Not started, In progress, Need to review, Need to fix, Done, Blocking\nPriority: Low, Medium, High";
    }

    console.log(`[Agent] Backlog "${item.name}" updated: ${field} = ${value}`);

    return `*Backlog Diperbarui!*

${item.name}
${field}: ${value}
Diubah oleh: ${context.pushName}

${item.url}`;
  } catch (error) {
    console.error("[Agent] Backlog update error:", error);
    return "Gagal update backlog. Coba lagi nanti.";
  }
}

// ─── Delete/Restore Backlog ─────────────────────────────────────────

async function handleBacklogDelete(
  name: string,
  context: MessageContext
): Promise<string> {
  console.log(`[Agent] Deleting backlog: ${name}`);

  try {
    const items = await searchBacklog(name);
    if (items.length === 0) {
      return `Backlog item "${name}" tidak ditemukan.`;
    }

    const item = items[0];
    await deleteBacklogItem(item.id);

    return `*Backlog Dihapus!*

${item.name}
Status: Archived
Dihapus oleh: ${context.pushName}

Bisa di-restore dengan: *!backlog restore ${name}*`;
  } catch (error) {
    console.error("[Agent] Backlog delete error:", error);
    return "Gagal menghapus backlog. Coba lagi nanti.";
  }
}

async function handleBacklogRestore(name: string): Promise<string> {
  console.log(`[Agent] Restoring backlog: ${name}`);

  try {
    const items = await searchBacklog(name);
    if (items.length === 0) {
      return `Backlog item "${name}" tidak ditemukan.`;
    }

    const item = items[0];
    await restoreBacklogItem(item.id);

    return `*Backlog Di-restore!*

${item.name}
Status: Restored
${item.url}`;
  } catch (error) {
    console.error("[Agent] Backlog restore error:", error);
    return "Gagal me-restore backlog. Coba lagi nanti.";
  }
}

// ─── Bulk Update ────────────────────────────────────────────────────

async function handleBacklogBulk(
  args: string,
  context: MessageContext
): Promise<string> {
  const [fromStatus, toStatus, division] = args.split("|");

  if (!fromStatus || !toStatus) {
    return "Format: *!backlog bulk <status_lama> ke <status_baru> [divisi]*\n\nContoh:\n!backlog bulk \"Not started\" ke \"In progress\"\n!backlog bulk \"In progress\" ke \"Done\" ristek";
  }

  console.log(`[Agent] Bulk update: ${fromStatus} -> ${toStatus} (division: ${division || "all"})`);

  try {
    const filter: Record<string, unknown> = {
      property: "Status",
      status: { equals: fromStatus },
    };

    const result = await bulkUpdateBacklogStatus(filter, toStatus);

    let msg = `*Bulk Update Selesai!*\n\n`;
    msg += `${fromStatus} -> ${toStatus}\n`;
    if (division) msg += `Divisi: ${division}\n`;
    msg += `Updated: ${result.updated} item\n`;
    if (result.errors.length > 0) {
      msg += `Errors: ${result.errors.length}\n`;
    }
    msg += `\nDieksekusi oleh: ${context.pushName}`;

    return msg;
  } catch (error) {
    console.error("[Agent] Bulk update error:", error);
    return "Gagal bulk update. Coba lagi nanti.";
  }
}

// ─── Ticket Detail ──────────────────────────────────────────────────

async function handleTicketDetail(query: string): Promise<string> {
  console.log(`[Agent] Getting ticket detail: ${query}`);

  try {
    // Try as ticket ID first
    let pageId: string | undefined;
    const ticketIdMatch = query.match(/TK-\d{8}-\d{3}/);
    if (ticketIdMatch) {
      const searchResult = await searchPagesDirect(ticketIdMatch[0]) as {
        results: Array<{ id: string }>;
      };
      if (searchResult.results.length > 0) {
        pageId = searchResult.results[0].id;
      }
    }

    // If not found by ID, search by name
    if (!pageId) {
      const items = await searchBacklog(query);
      if (items.length === 0) {
        return `Tiket "${query}" tidak ditemukan.`;
      }
      pageId = items[0].id;
    }

    const detail = await getTicketDetail(pageId);

    let msg = `*Detail: ${detail.name}*\n\n`;
    msg += `Status: ${detail.status}\n`;
    msg += `Prioritas: ${detail.priority}\n`;

    if (detail.content) {
      msg += `\n*Isi:*\n${detail.content.slice(0, 500)}\n`;
      if (detail.content.length > 500) {
        msg += `... (${detail.content.length - 500} karakter lagi)`;
      }
    }

    if (detail.comments.length > 0) {
      msg += `\n*Komentar* (${detail.comments.length}):\n`;
      for (const comment of detail.comments.slice(0, 5)) {
        const text = comment.rich_text.map((rt) => rt.plain_text).join("");
        msg += `\u2022 ${text.slice(0, 100)}\n`;
      }
    }

    msg += `\n${detail.url}`;
    return msg;
  } catch (error) {
    console.error("[Agent] Ticket detail error:", error);
    return "Gagal mengambil detail tiket. Coba lagi nanti.";
  }
}

// ─── Ticket Notes & Comments ────────────────────────────────────────

async function handleTicketNote(
  args: string,
  context: MessageContext
): Promise<string> {
  const [name, note] = args.split("|");

  if (!name || !note) {
    return "Format: *!note <nama tiket> <catatan>*\n\nContoh: !note redesign Sudah selesai bagian header";
  }

  try {
    const items = await searchBacklog(name);
    if (items.length === 0) {
      return `Tiket "${name}" tidak ditemukan.`;
    }

    await addTicketNote(items[0].id, note, context.pushName);

    return `*Catatan Ditambahkan!*

${items[0].name}
Catatan: ${note}
Oleh: ${context.pushName}

${items[0].url}`;
  } catch (error) {
    console.error("[Agent] Add note error:", error);
    return "Gagal menambahkan catatan. Coba lagi nanti.";
  }
}

async function handleTicketComment(
  args: string,
  context: MessageContext
): Promise<string> {
  const [name, text] = args.split("|");

  if (!name || !text) {
    return "Format: *!comment <nama tiket> <komentar>*\n\nContoh: !comment redesign Progress bagus, lanjut!";
  }

  try {
    const items = await searchBacklog(name);
    if (items.length === 0) {
      return `Tiket "${name}" tidak ditemukan.`;
    }

    await addTicketComment(items[0].id, `[${context.pushName}] ${text}`);

    return `*Komentar Ditambahkan!*

${items[0].name}
Komentar: ${text}
Oleh: ${context.pushName}

${items[0].url}`;
  } catch (error) {
    console.error("[Agent] Add comment error:", error);
    return "Gagal menambahkan komentar. Coba lagi nanti.";
  }
}

// ─── Members & Divisions ────────────────────────────────────────────

async function handleMembersList(divisionName: string): Promise<string> {
  try {
    if (divisionName) {
      const members = await getMembersByDivision(divisionName);
      if (members.length === 0) {
        return `Tidak ada member ditemukan untuk divisi "${divisionName}".`;
      }
      let msg = `*Anggota ${divisionName}* (${members.length})\n\n`;
      for (const m of members) {
        msg += `\u2022 ${m.name}\n`;
      }
      return msg;
    }

    const members = await listMembers();
    if (members.length === 0) {
      return "Tidak ada member ditemukan.";
    }

    let msg = `*Semua Anggota* (${members.length})\n\n`;
    for (const m of members.slice(0, 30)) {
      msg += `\u2022 ${m.name}\n`;
    }
    if (members.length > 30) {
      msg += `\n...dan ${members.length - 30} lainnya.`;
    }
    msg += `\n\nKetik *!members <divisi>* untuk filter per divisi.`;
    return msg;
  } catch (error) {
    console.error("[Agent] Members list error:", error);
    return "Gagal mengambil data member. Coba lagi nanti.";
  }
}

async function handleDivisionsList(): Promise<string> {
  try {
    const divisions = await listDivisions();
    if (divisions.length === 0) {
      return "Tidak ada divisi ditemukan.";
    }

    let msg = `*Divisi* (${divisions.length})\n\n`;
    for (const d of divisions) {
      msg += `\u2022 ${d.name}\n`;
    }
    return msg;
  } catch (error) {
    console.error("[Agent] Divisions list error:", error);
    return "Gagal mengambil data divisi. Coba lagi nanti.";
  }
}

// ─── Broadcast Task Notifications (mass distribution) ────────────────

/**
 * Broadcast task notifications to ALL members who have active tasks.
 * Each member receives ONLY their own tasks — no global template.
 *
 * Flow:
 * 1. Get all members from contacts.json
 * 2. For each member: query Notion by member name → get their tasks
 * 3. If tasks exist and are active → send personal WA notification
 * 4. If no tasks → skip (don't send empty messages)
 * 5. Return summary to sender
 */
async function handleBroadcastTaskNotifications(_context: MessageContext): Promise<string> {
  console.log("[Agent] Starting broadcast task notifications...");

  const { getAllContacts } = await import("../services/contact-lookup.js");
  const { sendDirectMessage } = await import("../wa/sender.js");
  const { env } = await import("../config.js");

  const contacts = getAllContacts();
  console.log(`[Agent] Broadcasting to ${contacts.length} contacts`);

  let notified = 0;
  let skipped = 0;
  let failed = 0;
  let noTasks = 0;

  // Filter only active task statuses
  const activeStatuses = ["Not started", "In progress", "Need to review", "Need to fix", "Blocking"];

  for (const contact of contacts) {
    const memberName = contact.name; // Full name for Notion query
    const nickname = contact.nickname || contact.name.split(" ")[0];
    const phone = contact.phone;

    try {
      // Step 1: Query Notion for THIS member's tasks (fresh query each loop)
      const allItems = await getBacklogByMemberName(memberName);

      // Step 2: Filter only active (not Done) tasks
      const activeItems = allItems.filter(item =>
        activeStatuses.some(s => item.status.toLowerCase().includes(s.toLowerCase()))
      );

      // Step 3: Skip if no active tasks
      if (activeItems.length === 0) {
        noTasks++;
        console.log(`[Agent] Broadcast: skip ${nickname} — no active tasks`);
        continue;
      }

      // Step 4: Validate phone number
      if (!phone || phone.length < 10) {
        skipped++;
        console.log(`[Agent] Broadcast: skip ${nickname} — invalid phone`);
        continue;
      }

      // Step 5: Generate PERSONAL message for this member
      const displayName = nickname.charAt(0).toUpperCase() + nickname.slice(1);
      let personalMsg = `Halo ${displayName}! 👋\n\n`;
      personalMsg += `Berikut daftar task/tiket kamu yang masih aktif di backlog SGA:\n\n`;

      for (const item of activeItems.slice(0, 10)) {
        const emoji = getStatusEmoji(item.status);
        personalMsg += `${emoji} ${item.name}\n`;
        personalMsg += `   Status: ${item.status} | Priority: ${item.priority}`;
        if (item.projects.length > 0) {
          personalMsg += ` | Project: ${item.projects.join(", ")}`;
        }
        personalMsg += `\n   ${item.url}\n`;
      }

      if (activeItems.length > 10) {
        personalMsg += `\n...dan ${activeItems.length - 10} task lainnya.\n`;
      }

      personalMsg += `\nTotal: ${activeItems.length} task aktif. Cek detailnya di Notion ya! Semangat!`;

      // Step 6: Send WA notification to this member
      try {
        await sendDirectMessage(env.EVOLUTION_INSTANCE_NAME, phone, personalMsg);
        notified++;
        console.log(`[Agent] Broadcast: sent to ${displayName} (${phone}) — ${activeItems.length} tasks`);
      } catch (sendError) {
        failed++;
        console.error(`[Agent] Broadcast: FAILED to send to ${displayName} (${phone}):`, sendError);
      }

      // Rate limit: wait 1 second between sends to avoid WhatsApp spam detection
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      failed++;
      console.error(`[Agent] Broadcast: error processing ${nickname}:`, error);
    }
  }

  // Step 7: Return summary to the requester
  const summary = `*Broadcast Task Notification Selesai!*\n\n` +
    `Total anggota: ${contacts.length}\n` +
    `Notifikasi terkirim: ${notified} anggota\n` +
    `Tidak ada task aktif: ${noTasks} anggota (di-skip)\n` +
    `Gagal kirim: ${failed}\n` +
    `Di-skip (nomor tidak valid): ${skipped}`;

  console.log(`[Agent] Broadcast complete: ${notified} sent, ${noTasks} no tasks, ${failed} failed, ${skipped} skipped`);

  return summary;
}

async function handleMemberTasks(memberName: string): Promise<string> {
  try {
    const items = await getBacklogByMemberName(memberName);
    if (items.length === 0) {
      return `Tidak ada tugas ditemukan untuk "${memberName}".`;
    }

    let msg = `*Tugas ${memberName}* (${items.length})\n\n`;
    for (const item of items.slice(0, 20)) {
      const emoji = getStatusEmoji(item.status);
      msg += `${emoji} ${item.name}\n`;
      msg += `   Status: ${item.status} | Priority: ${item.priority}\n`;
    }
    if (items.length > 20) {
      msg += `\n...dan ${items.length - 20} lainnya.`;
    }
    return msg;
  } catch (error) {
    console.error("[Agent] Member tasks error:", error);
    return "Gagal mengambil data tugas. Coba lagi nanti.";
  }
}

// ─── PIC Assignment ─────────────────────────────────────────────────

async function handleAssignPic(
  args: string,
  context: MessageContext
): Promise<string> {
  const [ticketName, memberName] = args.split("|");

  if (!ticketName || !memberName) {
    return "Format: *!pic <nama tiket> <nama member>*\n\nContoh: !pic redesign iqbal";
  }

  try {
    const items = await searchBacklog(ticketName);
    if (items.length === 0) {
      return `Tiket "${ticketName}" tidak ditemukan.`;
    }

    const memberInfo = await resolveMemberPageId(memberName);
    if (!memberInfo) {
      return `Member "${memberName}" tidak ditemukan di database.`;
    }

    await assignPicToBacklog(items[0].id, memberInfo.id);

    // Kirim notifikasi ke PIC via WhatsApp
    setImmediate(async () => {
      try {
        const notified = await notifyPIC({
          senderPhone: context.senderPhone || "",
          ticketTitle: items[0].name,
          picName: memberInfo.fullName,
          ticketId: items[0].name, // Use ticket name since we don't have TK-ID here
          division: undefined,
          createdAt: new Date().toLocaleDateString("id-ID"),
        });
        if (notified) {
          console.log(`[Agent] PIC ${memberInfo.fullName} dinotifikasi via WA setelah assign`);
        } else {
          console.log(`[Agent] PIC ${memberInfo.fullName} tidak bisa dinotifikasi (mungkin tidak ada di contacts)`);
        }
      } catch (error) {
        console.warn(`[Agent] Gagal notifikasi PIC ${memberInfo.fullName} setelah assign:`, error);
      }
    });

    return `*PIC Ditambahkan!*

${items[0].name}
PIC baru: ${memberInfo.fullName}
Oleh: ${context.pushName}

${items[0].url}`;
  } catch (error) {
    console.error("[Agent] Assign PIC error:", error);
    return "Gagal assign PIC. Coba lagi nanti.";
  }
}

async function handleUnassignPic(
  args: string,
  context: MessageContext
): Promise<string> {
  const [ticketName, memberName] = args.split("|");

  if (!ticketName || !memberName) {
    return "Format: *!removepic <nama tiket> <nama member>*\n\nContoh: !removepic redesign iqbal";
  }

  try {
    const items = await searchBacklog(ticketName);
    if (items.length === 0) {
      return `Tiket "${ticketName}" tidak ditemukan.`;
    }

    const memberInfo = await resolveMemberPageId(memberName);
    if (!memberInfo) {
      return `Member "${memberName}" tidak ditemukan di database.`;
    }

    await removePicFromBacklog(items[0].id, memberInfo.id);

    return `*PIC Dihapus!*

${items[0].name}
PIC dihapus: ${memberInfo.fullName}
Oleh: ${context.pushName}

${items[0].url}`;
  } catch (error) {
    console.error("[Agent] Unassign PIC error:", error);
    return "Gagal menghapus PIC. Coba lagi nanti.";
  }
}

// ─── Cache Refresh ──────────────────────────────────────────────────

function handleCacheRefresh(): string {
  refreshAllCaches();
  return "*Cache Di-refresh!* Semua data akan diambil ulang dari Notion pada request berikutnya.";
}

// ─── Database Commands ───────────────────────────────────────────────

async function handleDbCreate(
  args: string,
  context: MessageContext
): Promise<string> {
  const [name, parentId] = args.split("|");
  if (!name || !parentId) {
    return "Format: *!db create <nama> in <parent_page_id>*\n\nContoh: !db create \"Sprint Backlog\" in abc123def456";
  }

  try {
    const db = await createDatabase({
      parent: { page_id: parentId },
      title: [{ type: "text", text: { content: name } }],
      properties: {
        Name: { title: {} },
        Status: {
          status: {
            options: [
              { name: "Not started", color: "default" },
              { name: "In progress", color: "blue" },
              { name: "Done", color: "green" },
            ],
          },
        },
        Priority: {
          select: {
            options: [
              { name: "High", color: "red" },
              { name: "Medium", color: "yellow" },
              { name: "Low", color: "gray" },
            ],
          },
        },
      },
    });

    const dbId = (db as Record<string, unknown>).id as string;
    const dbUrl = (db as Record<string, unknown>).url as string;

    console.log(`[Agent] Database created: ${name} (${dbId})`);

    return `*Database Dibuat!*\n\nNama: ${name}\nID: ${dbId}\nURL: ${dbUrl}\nDibuat oleh: ${context.pushName}`;
  } catch (error) {
    console.error("[Agent] DB create error:", error);
    return "Gagal membuat database. Pastikan parent page ID valid dan bot punya akses.";
  }
}

async function handleDbSchema(databaseId: string): Promise<string> {
  try {
    const { getDatabaseSchema } = await import("../notion/ticket-service.js");
    const schema = await getDatabaseSchema(databaseId);

    const title = (schema as Record<string, unknown>).title as Array<{ plain_text?: string }>;
    const titleText = title?.map((t) => t.plain_text ?? "").join("") ?? "Untitled";
    const props = (schema as Record<string, unknown>).properties as Record<string, unknown>;

    let msg = `*Database Schema: ${titleText}*\n\n`;
    msg += `ID: ${databaseId}\n`;
    msg += `Properties:\n`;

    for (const [propName, propData] of Object.entries(props)) {
      const prop = propData as { type: string };
      msg += `  \u2022 ${propName} (${prop.type})\n`;
    }

    return msg;
  } catch (error) {
    console.error("[Agent] DB schema error:", error);
    return "Gagal mengambil schema database. Pastikan ID valid dan bot punya akses.";
  }
}

// ─── Sub-page Creation ───────────────────────────────────────────────

async function handleSubPageCreate(
  args: string,
  context: MessageContext
): Promise<string> {
  const [parentName, title] = args.split("|");
  if (!parentName || !title) {
    return "Format: *!subpage <nama tiket parent> <judul sub-page>*\n\nContoh: !subpage redesign Subtask: Header Component";
  }

  try {
    const items = await searchBacklog(parentName);
    if (items.length === 0) {
      return `Tiket "${parentName}" tidak ditemukan.`;
    }

    const parent = items[0];
    const subPage = await createSubPage({
      parentPageId: parent.id,
      title,
      content: `Sub-page dari: ${parent.name}\nDibuat oleh: ${context.pushName}`,
    });

    return `*Sub-page Dibuat!*\n\nParent: ${parent.name}\nSub-page: ${title}\nURL: ${subPage.url}\nDibuat oleh: ${context.pushName}`;
  } catch (error) {
    console.error("[Agent] Sub-page create error:", error);
    return "Gagal membuat sub-page. Coba lagi nanti.";
  }
}

// ─── Image Attachment ────────────────────────────────────────────────

async function handleTicketImage(
  args: string,
  context: MessageContext
): Promise<string> {
  const [ticketName, imageUrl] = args.split("|");
  if (!ticketName || !imageUrl) {
    return "Format: *!image <nama tiket> <url gambar>*\n\nContoh: !image redesign https://example.com/screenshot.png";
  }

  try {
    const items = await searchBacklog(ticketName);
    if (items.length === 0) {
      return `Tiket "${ticketName}" tidak ditemukan.`;
    }

    await appendImageBlock(items[0].id, imageUrl, `Attached by ${context.pushName}`);

    return `*Gambar Dilampirkan!*\n\n${items[0].name}\nURL: ${imageUrl}\nOleh: ${context.pushName}\n\n${items[0].url}`;
  } catch (error) {
    console.error("[Agent] Image attach error:", error);
    return "Gagal melampirkan gambar. Pastikan URL gambar valid dan bisa diakses.";
  }
}

// ─── Backlog by Division / Status ────────────────────────────────────

async function handleBacklogDivision(divisionName: string): Promise<string> {
  console.log(`[Agent] Getting backlog by division: ${divisionName}`);
  try {
    return await getBacklogByDivision(divisionName);
  } catch (error) {
    console.error("[Agent] Backlog by division error:", error);
    return "Gagal mengambil backlog per divisi. Coba lagi nanti ya!";
  }
}

async function handleBacklogByStatus(status: string): Promise<string> {
  console.log(`[Agent] Getting backlog by status: ${status}`);
  try {
    return await getBacklogByStatusSummary(status);
  } catch (error) {
    console.error("[Agent] Backlog by status error:", error);
    return "Gagal mengambil backlog per status. Coba lagi nanti ya!";
  }
}

// ─── Statistics ─────────────────────────────────────────────────────

async function handleStats(): Promise<string> {
  console.log("[Agent] Generating backlog statistics");

  try {
    const stats = await getBacklogStats();

    let msg = `*Statistik Backlog*\n\n`;
    msg += `Total: ${stats.total} item\n`;
    msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    msg += `Not started: ${stats.todo}\n`;
    msg += `In Progress: ${stats.inProgress}\n`;
    msg += `Complete: ${stats.complete}\n`;
    msg += `Blocking: ${stats.blocking}\n\n`;

    msg += `*Per Priority:*\n`;
    for (const [priority, count] of Object.entries(stats.byPriority).sort()) {
      msg += `  ${priority}: ${count}\n`;
    }

    if (Object.keys(stats.byDivision).length > 0) {
      msg += `\n*Per Divisi:*\n`;
      for (const [div, count] of Object.entries(stats.byDivision).sort(([, a], [, b]) => b - a)) {
        msg += `  ${div}: ${count}\n`;
      }
    }

    msg += `\nKetik *!list* untuk lihat semua backlog.`;
    return msg;
  } catch (error) {
    console.error("[Agent] Stats error:", error);
    return "Gagal mengambil statistik. Coba lagi nanti.";
  }
}

// ─── Help ───────────────────────────────────────────────────────────

function handleHelp(): string {
  return `*Oro Bot — Panduan Singkat* 👋

*Penting:* Pakai seperlunya aja ya, biar token AI aku gak cepet habis! Kalau bisa pakai command (!) daripada chat natural.

*Paling Sering Dipakai:*
!list — semua backlog
!stats — statistik backlog
!tugas <nama> — lihat tugas seseorang
!projects — daftar project

*Buat Tiket Otomatis:*
Tinggal chat aja, contoh:
"buat tiket untuk ristek, fix bug navbar, assign ke iqbal, deadline 15 mei"

*Command Lainnya:*
!backlog search <keyword>
!backlog divisi <nama>
!backlog status <value>
!detail <nama/ID>
!note <tiket> <catatan>
!comment <tiket> <komentar>
!pic <tiket> <nama>
!removepic <tiket> <nama>
!members / !members <divisi>
!divisions
!update TK-xxx status <value>
!close TK-xxx
!refresh

*Chat Natural (pakai AI):*
"cek backlog gw dong" — lihat tugas kamu
"tugas satrio" — lihat tugas orang lain
"detail project landing page"
"statistik backlog"

*System:*
!refresh — refresh data dari Notion

*Tip:* Command (!) lebih hemat token dan lebih cepat. Chat natural dipakai kalau command gak cukup ya!`;
}

// ─── AI Chat ────────────────────────────────────────────────────────

export async function handleChat(
  message: string,
  context: MessageContext
): Promise<string> {
  if (context.isGroup && !context.isBotMentioned) {
    return "";
  }

  console.log(`[Agent] AI Chat from ${context.pushName}: ${message.slice(0, 80)}...`);

  try {
    // Inject conversation context
    const userPhone = context.senderPhone || context.phoneNumber;
    const contextSummary = getContextSummary(userPhone);

    let prompt = CHAT_PROMPT
      .replace("{pushName}", context.pushName)
      .replace("{phoneNumber}", context.phoneNumber)
      .replace("{message}", message);

    if (contextSummary) {
      prompt += `\n\n--- CONVERSATION CONTEXT ---\n${contextSummary}\n--- END CONTEXT ---\n` +
        `Use this context to understand follow-up questions. If the user is asking about something discussed earlier, reference it naturally.`;
    }

    const result = await createMessage([
      { role: "user", content: prompt },
    ]);

    const textBlock = result.content[0];
    if (textBlock && textBlock.type === "text") {
      return textBlock.text;
    }

    return "Maaf, saya tidak bisa memproses pesan itu. Coba lagi ya!";
  } catch (error) {
    console.error("[Agent] AI Chat error:", error);
    return "Maaf, sedang ada gangguan. Coba lagi dalam beberapa saat.";
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

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

function getStatusEmoji(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("not started") || s.includes("to-do") || s.includes("backlog") || s.includes("blocking")) return "\uD83D\uDCCB";
  if (s.includes("in progress") || s.includes("progress")) return "\uD83D\uDD04";
  if (s.includes("review") || s.includes("need to fix")) return "\uD83D\uDD27";
  if (s.includes("complete") || s.includes("done")) return "\u2705";
  return "\uD83D\uDCCD";
}
