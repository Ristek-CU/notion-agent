// src/webhook/handler.ts
import { FastifyInstance } from "fastify";
import { handleMessage, handleChat, type MessageContext } from "../ai/agent.js";
import { replyToGroup, sendDirectMessage, fetchBotJid } from "../wa/sender.js";
import { env } from "../config.js";
import { appendImageBlock, invalidateCache } from "../notion/notion-api-core.js";
import { searchBacklog, resolveNickname } from "../notion/notion-org-service.js";
import { findContactByPushName, findPhoneByName } from "../services/contact-lookup.js";
import { resolveIdentity, type IdentityInput } from "../services/identity-resolver.js";
import { getAIStats } from "../ai/anthropic-client.js";
import * as fs from "fs";
import * as path from "path";

// ─── Types ──────────────────────────────────────────────────────────

interface WAKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

interface WAContextInfo {
  mentionedJid?: string[];
}

interface WAMessage {
  conversation?: string;
  extendedTextMessage?: { text: string; contextInfo?: WAContextInfo };
  imageMessage?: { caption?: string; contextInfo?: WAContextInfo; url?: string; mimetype?: string };
}

interface WAWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: WAKey;
    pushName: string;
    message: WAMessage;
    messageType: string;
    participant?: string;
  };
  sender?: string;
  destination?: string;
  date_time?: string;
  server_url?: string;
  apikey?: string;
}

// ─── Bot JID Cache ───────────────────────────────────────────────────

let botJid: string = "";

/**
 * Initialize the bot's own JID (called once at startup).
 */
export async function initBotJid(): Promise<void> {
  try {
    botJid = await fetchBotJid();
    console.log(`[Webhook] Bot JID initialized: ${botJid}`);
  } catch (error) {
    console.error("[Webhook] Failed to fetch bot JID, will retry on first message:", error);
  }
}

/**
 * Get bot JID, fetching if not yet cached.
 */
async function getBotJid(): Promise<string> {
  if (!botJid) {
    botJid = await fetchBotJid();
  }
  return botJid;
}

// ─── Rate Limiter ───────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 20; // max 20 messages per minute per user

function isRateLimited(jid: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(jid);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(jid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 300_000);

// ─── Message Deduplication ──────────────────────────────────────────
// Prevents duplicate processing when Evolution API sends the same
// webhook to both /webhook/:instance and /webhook/:instance/EVENT
const processedMsgIds = new Map<string, number>();

// ─── Out-of-Scope Guard ────────────────────────────────────────────
// Detects programming/out-of-scope requests BEFORE they reach the AI.
// This is a hard code-level guard that cannot be bypassed by prompt tricks.

const PROGRAMMING_PATTERNS: RegExp[] = [
  // Programming languages
  /\b(python|javascript|js|typescript|ts|java\b|php|ruby|go\b|rust|swift|kotlin|c\+\+|c#|perl|r\b|scala|dart)\b/i,
  // Code-related keywords
  /\b(kode|code|coding|script|function|class|variable|array|loop|syntax|compile|runtime|library|framework|module|import|export|npm|pip|git\b|github)\b/i,
  // Programming tools & concepts
  /\b(algoritma|algorithm|debug|deploy|docker|kubernetes|aws|gcp|azure|devops|rest api|api endpoint|sql|database|mongodb|postgres|redis|express|react|vue|angular|node\b|nodejs|nextjs)\b/i,
  // Programming request patterns
  /\b(bikin\s*(app|website|bot|script|program|aplikasi)|cara\s*(deploy|coding|program|buat\s*app)|tulisin?\s*(kode|code)|ajarin?\s*(coding|kode|program)|bantu\s*(coding|debug|kode)|pseudocode)\b/i,
];

// Separate out-of-scope patterns — these are non-programming topics the bot should not help with
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  // Food & recipes
  /\b(resep|masak(an)?|masakan|memasak|makanan|cook)\b/i,
  // Stories & entertainment
  /\b(cerita|story|stories|horor|horror|serem|joke|lelucon|humor|lucu|komedi|dongeng)\b/i,
  // Personal / emotional
  /\b(curhat|curhatan|keluh|kesah|stres|stress|depresi|sedih|galau|patah\s*hati|pacar|mantan|Approch|crush|naksir|sayang|cinta)\b/i,
  // Academic homework
  /\b(pr\b|makalah|tugas\s*kuliah|essay|karya\s*tulis|skripsi|thesis|disertasi|ujian)\b/i,
  // Science & math
  /\b(fisika|kimia|matematika|integral|kalkulus|algebra|biologi|sains)\b/i,
  // Entertainment recommendations
  /\b(rekomendasi\s*(film|lagu|buku|musik|movie)|translate|terjemah|lagu|film|movie|musik|game|main)\b/i,
  // Asking about bot internals / security
  /\b(api\s*key|token|password|secret|credential|konfigurasi\s*server|server\s*setup)\b/i,
];

// Whitelist: words that look like programming but are valid SGA context
const SGA_WHITELIST_PATTERNS: RegExp[] = [
  /\b(bikin|buat)\s*(tiket|backlog|tugas|task|database)\b/i,
  /\b(assign|update|status|deploy\s*tiket)\b/i,
  /\b(project|deadline|prioritas|divisi)\b/i,
  /\b(cek|lihat|tampilkan)\s*(backlog|tiket|status|progress|tugas)\b/i,
  /\b(notification|webhook)\b/i,
  // "error" in context of SGA tickets (not code errors)
  /\b(ada\s*eror|fix\s*bug|bug\s*di)\b/i,
  // "tugas" in SGA context (backlog/task, not homework)
  /\b(tugas\s*(iqbal|raihan|fazril|thoriq|iqbal|dian|sharon|azka|sevilla|diva|mika))\b/i,
  /\b(ada\s*tugas|tugas\s*(apa|siapa|berapa|yang|belum|sudah|open|done))\b/i,
];

/**
 * Check if a message is out of scope (programming, recipes, etc.)
 * Returns a rejection message if blocked, or null if allowed.
 */
function checkOutOfScope(text: string, pushName: string): string | null {
  const normalized = text.toLowerCase().trim();

  // Skip very short messages (greetings, commands)
  if (normalized.length < 5) return null;

  // Check whitelist first — if it matches SGA context, allow it
  for (const pattern of SGA_WHITELIST_PATTERNS) {
    if (pattern.test(normalized)) return null;
  }

  // Count programming pattern matches
  let programmingMatches = 0;
  for (const pattern of PROGRAMMING_PATTERNS) {
    if (pattern.test(normalized)) programmingMatches++;
  }

  // Count out-of-scope pattern matches
  let oosMatches = 0;
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(normalized)) oosMatches++;
  }

  // Detect if user is asking/requesting something (question/request signals)
  const isAskingForSomething = /\b(bisa|bantuin|ajarin|tolong|cara|gimana|how|teach|explain|bantu|dong|gak|donk|deh|ya|khan|kah|please|kasih|beri|punya|ada\s*gak|ada\s*gk|mau|pengen|pingin|pengin|butuh|perlu)\b/i.test(normalized);

  // DECISION LOGIC:
  // 1. Programming: block if 2+ patterns, OR 1+ pattern + asking
  // 2. Out-of-scope: block if 1+ pattern + asking (lower threshold because OOS patterns are very specific)
  // 3. Strong OOS match: block if 2+ OOS patterns even without question words
  const shouldBlock =
    programmingMatches >= 2 ||
    (programmingMatches >= 1 && isAskingForSomething) ||
    oosMatches >= 2 ||
    (oosMatches >= 1 && isAskingForSomething);

  if (shouldBlock) {
    console.log(`[Guard] BLOCKED out-of-scope message (prog: ${programmingMatches}, oos: ${oosMatches}, asking: ${isAskingForSomething}): "${text.slice(0, 80)}"`);
    const name = pushName || "";
    return `Waduh${name ? ` ${name}` : ""}, aku cuma bisa bantu urusan tiket dan backlog SGA nih. Yang lain di luar jatah aku ya! Mau bikin tiket atau cek backlog aja? 😄`;
  }

  return null;
}

// ─── Webhook Routes ─────────────────────────────────────────────────

/**
 * Register all webhook routes with the Fastify instance
 */
export async function registerWebhookRoutes(app: FastifyInstance) {
  /**
   * POST /webhook/:instanceName
   * Receives incoming message webhooks from Evolution API
   */
  app.post("/webhook/:instanceName", async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    const payload = request.body as WAWebhookPayload;

    // Validate instance name
    if (instanceName !== env.EVOLUTION_INSTANCE_NAME) {
      return reply.code(403).send({ error: "Invalid instance" });
    }

    // Only process MESSAGES_UPSERT events
    const evt = (payload?.event || "").toLowerCase();
    console.log(`[Webhook] Received event: "${evt}" from ${instanceName}, keys: ${Object.keys(payload || {}).join(",")}`);
    if (evt !== "messages.upsert") {
      return reply.code(200).send({ status: "ignored", reason: "wrong_event", event: evt });
    }

    // Only process incoming messages (not from bot itself)
    const fromMe = payload.data?.key?.fromMe;
    if (fromMe) {
      return reply.code(200).send({ status: "ignored", reason: "from_me" });
    }

    // Deduplicate: prevent processing the same message twice
    const msgId = payload.data?.key?.id;
    if (msgId) {
      if (processedMsgIds.has(msgId)) {
        return reply.code(200).send({ status: "ignored", reason: "duplicate" });
      }
      processedMsgIds.set(msgId, Date.now());
      // Cleanup old entries (older than 60s)
      const now = Date.now();
      for (const [id, ts] of processedMsgIds) {
        if (now - ts > 60000) processedMsgIds.delete(id);
      }
    }

    // Extract message text (including image captions)
    const messageText = extractMessageText(payload.data?.message);
    const hasImage = !!(payload.data?.message?.imageMessage);
    const imageUrl = payload.data?.message?.imageMessage?.url;

    if (!messageText.trim() && !hasImage) {
      return reply.code(200).send({ status: "ignored", reason: "empty" });
    }

    // If image message, try to attach to a matching ticket
    if (hasImage && imageUrl) {
      const caption = messageText.trim();
      const pushNameEarly = payload.data?.pushName || "Unknown";
      if (caption) {
        setImmediate(async () => {
          try {
            await handleImageAttachment(caption, imageUrl, pushNameEarly);
          } catch (error) {
            console.error("[Webhook] Image attachment error:", error);
          }
        });
      }
    }

    const rawJid = payload.data?.key?.remoteJid || "";
    const pushName = payload.data?.pushName || "Unknown";
    const isGroup = rawJid.includes("@g.us");

    // Debug: Log raw payload for group messages to diagnose mention detection
    if (isGroup) {
      console.log(`[Webhook] GROUP raw payload: ${JSON.stringify(payload).slice(0, 500)}`);
      console.log(`[Webhook] GROUP message object: ${JSON.stringify(payload.data?.message).slice(0, 500)}`);
    }

    // Rate limit check (per user JID)
    const userKey = isGroup ? `${rawJid}:${payload.data?.participant || pushName}` : rawJid;
    if (isRateLimited(userKey)) {
      console.log(`[Webhook] Rate limited: ${pushName}`);
      return reply.code(200).send({ status: "rate_limited" });
    }

    // For groups: check if bot is mentioned
    let isBotMentioned = false;
    if (isGroup) {
      const mentions = extractMentions(payload.data?.message);
      const currentBotJid = await getBotJid();
      console.log(`[Webhook] GROUP mentions found: ${JSON.stringify(mentions)}, botJid: ${currentBotJid}`);
      isBotMentioned = mentions.includes(currentBotJid);

      // In groups, only respond if bot is mentioned
      if (!isBotMentioned) {
        console.log(`[Webhook] GROUP ignored - bot not mentioned`);
        return reply.code(200).send({ status: "ignored", reason: "not_mentioned" });
      }
    }

    // Strip @mention text from message (e.g. "@6285180619766 cek backlog" → "cek backlog")
    let cleanText = messageText;
    if (isGroup && isBotMentioned) {
      cleanText = stripMentionFromText(messageText, await getBotJid());
    }

    // Ensure botJid is initialized before resolving reply target
    // (initBotJid may have failed at startup if Evolution API wasn't ready yet)
    try {
      if (!botJid) botJid = await getBotJid();
    } catch {
      console.error("[Webhook] Failed to fetch bot JID — reply target resolution may be incorrect!");
    }

    // Resolve sender identity using all available signals (phone, pushName, LID)
    const identityInput: IdentityInput = {
      rawJid,
      pushName,
      sender: payload.sender,
      participant: payload.data?.participant,
      botJid,
    };
    const resolvedIdentity = resolveIdentity(identityInput);
    console.log(`[Webhook] Identity: ${resolvedIdentity.name} (phone: ${resolvedIdentity.phone || "unknown"}, method: ${resolvedIdentity.resolutionMethod})`);

    // Extract reply target
    let replyTarget = resolveReplyTarget(rawJid, isGroup, payload);
    // Fast override: if identity resolver found the phone for @lid, use it directly
    if (rawJid.includes("@lid") && resolvedIdentity.phone && !isGroup) {
      replyTarget = resolvedIdentity.phone;
      console.log(`[Webhook] Reply target overridden by identity resolver: ${replyTarget}`);
    }

    // Use resolved identity for sender info
    const senderPhone = resolvedIdentity.phone;
    const displayName = resolvedIdentity.name;

    console.log(
      `[Webhook] ${isGroup ? "GROUP" : "DM"} from ${displayName}${isBotMentioned ? " (mentioned)" : ""}: ${cleanText.slice(0, 100)}`
    );

    // ─── Out-of-Scope Guard ─────────────────────────────────────────
    // Block programming/out-of-scope requests BEFORE they reach AI
    const guardResponse = checkOutOfScope(cleanText, displayName);
    if (guardResponse) {
      console.log(`[Webhook] Guard blocked message, sending rejection`);
      setImmediate(async () => {
        try {
          if (isGroup) {
            await replyToGroup(instanceName, replyTarget, guardResponse, pushName);
          } else {
            await sendDirectMessage(instanceName, replyTarget, guardResponse, pushName);
          }
          console.log(`[Webhook] Guard rejection sent to ${pushName}`);
        } catch (error) {
          console.error("[Webhook] Guard rejection send error:", error);
        }
      });
      return reply.code(200).send({ status: "blocked_by_guard" });
    }

    // Process message asynchronously (don't block the webhook response)
    setImmediate(async () => {
      try {
        const context: MessageContext = {
          phoneNumber: replyTarget.includes("@g.us") ? rawJid : replyTarget,
          pushName: displayName,
          senderPhone: senderPhone ?? undefined,
          resolvedIdentity,
          isGroup,
          isBotMentioned,
        };

        // Try command handler first (tickets, status, etc.)
        let response = await handleMessage(cleanText, context);

        // If not a command and (DM or mentioned in group), try AI chat
        if (!response) {
          response = await handleChat(cleanText, context);
        }

        // Send response back
        if (response) {
          if (isGroup) {
            await replyToGroup(instanceName, replyTarget, response, pushName);
          } else {
            await sendDirectMessage(instanceName, replyTarget, response, pushName);
          }
          console.log(`[Webhook] Replied to ${pushName}`);
        }
      } catch (error) {
        console.error("[Webhook] Processing error:", error);
      }
    });

    return reply.code(200).send({ status: "received" });
  });

  // Wildcard route for event-based webhooks (v2.x compatibility)
  // Evolution API v2.x sends to /webhook/:instanceName/MESSAGES_UPSERT
  // Just redirect to the main handler by re-processing the same payload
  app.post("/webhook/:instanceName/*", async (request, reply) => {
    const { instanceName } = request.params as { instanceName: string };
    const payload = request.body as WAWebhookPayload;

    if (instanceName !== env.EVOLUTION_INSTANCE_NAME) {
      return reply.code(403).send({ error: "Invalid instance" });
    }

    const evt = (payload?.event || "").toLowerCase();
    if (evt !== "messages.upsert") {
      return reply.code(200).send({ status: "ignored" });
    }

    // Deduplicate: check if this message was already processed by the main route
    // Use message key ID as dedup key
    const msgId = payload.data?.key?.id;
    if (msgId) {
      if (processedMsgIds.has(msgId)) {
        return reply.code(200).send({ status: "ignored", reason: "duplicate" });
      }
      processedMsgIds.set(msgId, Date.now());
      // Cleanup old entries (older than 60s)
      const now = Date.now();
      for (const [id, ts] of processedMsgIds) {
        if (now - ts > 60000) processedMsgIds.delete(id);
      }
    }

    // Forward to the same processing logic as main route
    // But we need to call the handler directly since we can't internally redirect
    const fromMe = payload.data?.key?.fromMe;
    if (fromMe) return reply.code(200).send({ status: "ignored" });

    const messageText = extractMessageText(payload.data?.message);
    if (!messageText.trim()) return reply.code(200).send({ status: "ignored" });

    const rawJid = payload.data?.key?.remoteJid || "";
    const pushName = payload.data?.pushName || "Unknown";
    const isGroup = rawJid.includes("@g.us");

    // Rate limit check
    const userKey = isGroup ? `${rawJid}:${payload.data?.participant || pushName}` : rawJid;
    if (isRateLimited(userKey)) {
      return reply.code(200).send({ status: "rate_limited" });
    }

    // For groups: check if bot is mentioned
    let isBotMentioned = false;
    if (isGroup) {
      const mentions = extractMentions(payload.data?.message);
      const currentBotJid = await getBotJid();
      isBotMentioned = mentions.includes(currentBotJid);
      if (!isBotMentioned) {
        return reply.code(200).send({ status: "ignored" });
      }
    }

    let cleanText = messageText;
    if (isGroup && isBotMentioned) {
      cleanText = stripMentionFromText(messageText, await getBotJid());
    }

    // Ensure botJid is initialized before resolving reply target
    try {
      if (!botJid) botJid = await getBotJid();
    } catch {
      console.error("[Webhook] Wildcard — Failed to fetch bot JID!");
    }

    // Resolve sender identity using all available signals
    const resolvedIdentity = resolveIdentity({
      rawJid,
      pushName,
      sender: payload.sender,
      participant: payload.data?.participant,
      botJid,
    });
    console.log(`[Webhook] Wildcard Identity: ${resolvedIdentity.name} (phone: ${resolvedIdentity.phone || "unknown"}, method: ${resolvedIdentity.resolutionMethod})`);

    let replyTarget = resolveReplyTarget(rawJid, isGroup, payload);
    // Fast override: if identity resolver found the phone for @lid, use it directly
    if (rawJid.includes("@lid") && resolvedIdentity.phone && !isGroup) {
      replyTarget = resolvedIdentity.phone;
    }
    const senderPhone = resolvedIdentity.phone;
    const displayName = resolvedIdentity.name;

    console.log(`[Webhook] Wildcard - ${isGroup ? "GROUP" : "DM"} from ${displayName}${isBotMentioned ? " (mentioned)" : ""}`);

    // ─── Out-of-Scope Guard (wildcard route) ────────────────────────
    const guardResponse = checkOutOfScope(cleanText, displayName);
    if (guardResponse) {
      console.log(`[Webhook] Wildcard guard blocked message`);
      setImmediate(async () => {
        try {
          if (isGroup) {
            await replyToGroup(instanceName, replyTarget, guardResponse, pushName);
          } else {
            await sendDirectMessage(instanceName, replyTarget, guardResponse, pushName);
          }
          console.log(`[Webhook] Wildcard guard rejection sent to ${pushName}`);
        } catch (error) {
          console.error("[Webhook] Wildcard guard rejection send error:", error);
        }
      });
      return reply.code(200).send({ status: "blocked_by_guard" });
    }

    setImmediate(async () => {
      try {
        const context: MessageContext = {
          phoneNumber: replyTarget.includes("@g.us") ? rawJid : replyTarget,
          pushName: displayName,
          senderPhone: senderPhone ?? undefined,
          resolvedIdentity,
          isGroup,
          isBotMentioned,
        };
        const response = await handleMessage(cleanText, context);
        if (response) {
          if (isGroup) {
            await replyToGroup(instanceName, replyTarget, response, pushName);
          } else {
            await sendDirectMessage(instanceName, replyTarget, response, pushName);
          }
        }
      } catch (error) {
        console.error("[Webhook] Processing error:", error);
      }
    });

    return reply.code(200).send({ status: "received" });
  });

  /**
   * GET /health
   */
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      instance: env.EVOLUTION_INSTANCE_NAME,
    };
  });

  /**
   * GET /ai-stats — AI call statistics & recent logs
   */
  app.get("/ai-stats", async () => {
    const stats = getAIStats();
    let recentLogs: string[] = [];

    try {
      const logFile = path.resolve(process.cwd(), "logs", "ai-calls.csv");
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, "utf-8");
        const lines = content.trim().split("\n");
        // Return last 50 entries (skip header)
        recentLogs = lines.slice(Math.max(1, lines.length - 50));
      }
    } catch { /* ignore */ }

    return {
      stats: {
        totalCalls: stats.totalCalls,
        totalInputTokens: stats.totalInputTokens,
        totalOutputTokens: stats.totalOutputTokens,
        totalTokens: stats.totalInputTokens + stats.totalOutputTokens,
        avgInferenceMs: stats.avgInferenceMs,
        totalInferenceMs: stats.totalInferenceMs,
      },
      recentLogs,
    };
  });

  /**
   * GET /
   */
  app.get("/", async () => {
    return {
      name: "WA Notion Bot + AI Chat",
      version: "2.0.0",
      status: "running",
    };
  });

  /**
   * POST /notion/webhook
   * Receives webhook events from Notion when pages are updated.
   * Covers feature: #9 (real-time notification from Notion)
   */
  app.post("/notion/webhook", async (request, reply) => {
    const payload = request.body as Record<string, unknown>;

    console.log(`[Notion Webhook] Received event: ${JSON.stringify(payload).slice(0, 200)}`);

    // Notion webhook events contain: type, page_id, database_id, etc.
    const eventType = String(payload.type || "unknown");
    const pageData = (payload.page || payload.data || {}) as { id?: string };
    const pageId = pageData.id || "";

    if (pageId) {
      // Invalidate cache for the affected page
      invalidateCache(`page:detail:${pageId}`);
      invalidateCache("backlog");
      console.log(`[Notion Webhook] Cache invalidated for page: ${pageId}`);
    }

    // Log the event type for monitoring
    console.log(`[Notion Webhook] Event type: ${eventType}, page: ${pageId}`);

    return reply.code(200).send({ status: "received" });
  });

  /**
   * GET /notion/webhook — verification endpoint for Notion webhooks
   */
  app.get("/notion/webhook", async (request, reply) => {
    const query = request.query as Record<string, string>;
    // Notion webhook verification sends a challenge
    if (query.challenge) {
      return reply.code(200).send({ challenge: query.challenge });
    }
    return reply.code(200).send({ status: "ok" });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Fast LID resolution via pushName from contacts.json.
 * Tries: exact pushName match → nickname resolution → fuzzy match.
 * Returns real phone number or null if not found.
 */
function resolveLidViaPushName(pushName: string, _lidJid: string): string | null {
  // 1. Direct pushName match in contacts.json
  const contact = findContactByPushName(pushName);
  if (contact) {
    console.log(`[Webhook] Resolved @lid via pushName contacts match: "${pushName}" → ${contact.phone} (${contact.name})`);
    return contact.phone;
  }

  // 2. Try nickname resolution (e.g. "ojan" → "Andi Fauzan H")
  const resolvedName = resolveNickname(pushName);
  if (resolvedName) {
    const contactByName = findPhoneByName(resolvedName);
    if (contactByName) {
      console.log(`[Webhook] Resolved @lid via nickname match: "${pushName}" → "${resolvedName}" → ${contactByName.phone}`);
      return contactByName.phone;
    }
  }

  return null;
}

function resolveReplyTarget(
  rawJid: string,
  isGroup: boolean,
  payload: WAWebhookPayload
): string {
  if (isGroup) return rawJid;

  // For @lid: the sender field often contains the BOT's own JID (not the real sender).
  // Only use payload.sender if it's NOT the bot. Otherwise, try to resolve via
  // pushName from contacts.json first (fast), then fall back to LID resolver.
  if (rawJid.includes("@lid")) {
    if (payload.sender && payload.sender.includes("@s.whatsapp.net")) {
      const senderNumber = payload.sender.split("@")[0];
      const botNumber = botJid ? botJid.split("@")[0] : "";
      if (senderNumber !== botNumber) {
        console.log(`[Webhook] Resolved reply target from sender field: ${rawJid} → ${senderNumber}`);
        return senderNumber;
      }
      // payload.sender is the bot itself — try to resolve via pushName from contacts.json
      console.log(`[Webhook] payload.sender is bot's own JID, attempting pushName resolution`);
    }
    // Try to resolve @lid via pushName lookup in contacts.json (fast path)
    const pushName = payload.data?.pushName || "";
    if (pushName) {
      const resolved = resolveLidViaPushName(pushName, rawJid);
      if (resolved) return resolved;
    }
    // Keep as-is — sender.ts will resolve it to real phone number via resolveLidToPhone()
    return rawJid;
  }

  if (rawJid.includes("@s.whatsapp.net")) {
    const remoteNumber = rawJid.split("@")[0];

    // Check if remoteJid is the bot's own number — if so, the real sender
    // is in payload.sender or payload.data.participant.
    // Some Evolution API versions set remoteJid = bot's own JID for incoming DMs.
    if (botJid && rawJid === botJid) {
      // Try payload.sender first (Evolution API v2.x)
      if (payload.sender && payload.sender.includes("@s.whatsapp.net")) {
        const senderNumber = payload.sender.split("@")[0];
        console.log(`[Webhook] remoteJid is bot's own JID, resolved sender from payload.sender: ${senderNumber}`);
        return senderNumber;
      }
      // Try participant field
      if (payload.data?.participant?.includes("@s.whatsapp.net")) {
        const participantNumber = payload.data.participant.split("@")[0];
        console.log(`[Webhook] remoteJid is bot's own JID, resolved sender from participant: ${participantNumber}`);
        return participantNumber;
      }
      // Compare by number — if remoteJid number matches bot number, it's the bot
      const botNumber = botJid.split("@")[0];
      if (remoteNumber === botNumber) {
        console.warn(`[Webhook] remoteJid matches bot number but no sender/participant field found. Cannot determine real sender.`);
      }
    }

    return remoteNumber;
  }

  // participant fallback
  if (payload.data?.participant?.includes("@s.whatsapp.net")) {
    return payload.data.participant.split("@")[0];
  }

  return rawJid;
}

function extractMessageText(message?: WAMessage): string {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  return "";
}

/**
 * Extract mentioned JIDs from message contextInfo.
 * Evolution API sends mentions in contextInfo.mentionedJid array.
 */
function extractMentions(message?: WAMessage): string[] {
  if (!message) return [];

  // Check extendedTextMessage for mentions
  if (message.extendedTextMessage?.contextInfo?.mentionedJid) {
    return message.extendedTextMessage.contextInfo.mentionedJid;
  }

  // Check imageMessage caption for mentions
  if (message.imageMessage?.contextInfo?.mentionedJid) {
    return message.imageMessage.contextInfo.mentionedJid;
  }

  return [];
}

/**
 * Handle image attachment: find matching ticket and attach image.
 * Covers feature: #7 (image/file attachment)
 */
async function handleImageAttachment(
  caption: string,
  imageUrl: string,
  pushName: string
): Promise<void> {
  // Try to find a matching ticket by caption text
  const items = await searchBacklog(caption);
  if (items.length === 0) {
    console.log(`[Webhook] No matching ticket found for image with caption: ${caption.slice(0, 50)}`);
    return;
  }

  const ticket = items[0];
  try {
    await appendImageBlock(ticket.id, imageUrl, `Image from ${pushName}: ${caption.slice(0, 100)}`);
    console.log(`[Webhook] Image attached to ticket: ${ticket.name}`);
  } catch (error) {
    console.error(`[Webhook] Failed to attach image to ticket ${ticket.name}:`, error);
  }
}

/**
 * Strip @mention text from message.
 * WhatsApp mentions appear as "@6285180619766" in the text.
 * Removes all occurrences of the bot's number mention.
 */
function stripMentionFromText(text: string, botJid: string): string {
  // Extract the phone number part from JID (e.g. "6285180619766" from "6285180619766@s.whatsapp.net")
  const botNumber = botJid.split("@")[0];

  // Remove @<botNumber> from text (WhatsApp puts it as @number)
  let cleaned = text.replace(new RegExp(`@${botNumber}\\b`, "g"), "");

  // Also try removing by the full JID pattern just in case
  cleaned = cleaned.replace(new RegExp(`@${botJid}`, "g"), "");

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}
