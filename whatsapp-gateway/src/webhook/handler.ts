// src/webhook/handler.ts
import { FastifyInstance } from "fastify";
import { handleMessage, handleChat, type MessageContext } from "../ai/agent.js";
import { replyToGroup, sendDirectMessage, fetchBotJid, lookupLidCache } from "../wa/sender.js";
import { env } from "../config.js";
import { appendImageBlock, invalidateCache } from "../notion/notion-api-core.js";
import { searchBacklog } from "../notion/notion-org-service.js";
import { resolveDisplayName } from "../services/contact-lookup.js";
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

    // Extract reply target
    const replyTarget = resolveReplyTarget(rawJid, isGroup, payload);

    // Extract sender phone number for contact lookup
    // For @lid: try to extract from sender field first (contains real JID)
    let senderPhone = extractPhoneNumber(rawJid, payload);
    if (!senderPhone && rawJid.includes("@lid") && payload.sender) {
      const senderJid = payload.sender;
      if (senderJid.includes("@s.whatsapp.net")) {
        senderPhone = senderJid.split("@")[0];
        console.log(`[Webhook] Resolved sender phone from payload.sender: ${senderPhone}`);
      }
    }
    // Resolve display name: prioritas kontak DB (by phone/by pushName) > WhatsApp pushName
    const displayName = resolveDisplayName(senderPhone, pushName);

    console.log(
      `[Webhook] ${isGroup ? "GROUP" : "DM"} from ${displayName}${isBotMentioned ? " (mentioned)" : ""}: ${cleanText.slice(0, 100)}`
    );

    // Process message asynchronously (don't block the webhook response)
    setImmediate(async () => {
      try {
        const context: MessageContext = {
          phoneNumber: replyTarget.includes("@g.us") ? rawJid : replyTarget,
          pushName: displayName,
          senderPhone: senderPhone ?? undefined,
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

    const replyTarget = resolveReplyTarget(rawJid, isGroup, payload);
    // For @lid: try to extract from sender field first (contains real JID)
    let senderPhone = extractPhoneNumber(rawJid, payload);
    if (!senderPhone && rawJid.includes("@lid") && payload.sender) {
      const senderJid = payload.sender;
      if (senderJid.includes("@s.whatsapp.net")) {
        senderPhone = senderJid.split("@")[0];
        console.log(`[Webhook] Wildcard - Resolved sender phone from payload.sender: ${senderPhone}`);
      }
    }
    // Resolve display name: prioritas kontak DB (by phone/by pushName) > WhatsApp pushName
    const displayName = resolveDisplayName(senderPhone, pushName);

    console.log(`[Webhook] Wildcard - ${isGroup ? "GROUP" : "DM"} from ${displayName}${isBotMentioned ? " (mentioned)" : ""}`);

    setImmediate(async () => {
      try {
        const context: MessageContext = {
          phoneNumber: replyTarget.includes("@g.us") ? rawJid : replyTarget,
          pushName: displayName,
          senderPhone: senderPhone ?? undefined,
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

function resolveReplyTarget(
  rawJid: string,
  isGroup: boolean,
  payload: WAWebhookPayload
): string {
  if (isGroup) return rawJid;

  // For @lid: try to use sender field (contains real @s.whatsapp.net JID)
  if (rawJid.includes("@lid")) {
    if (payload.sender && payload.sender.includes("@s.whatsapp.net")) {
      const realNumber = payload.sender.split("@")[0];
      console.log(`[Webhook] Resolved reply target from sender field: ${rawJid} → ${realNumber}`);
      return realNumber;
    }
    // Keep as-is — sender.ts will resolve it to real phone number
    return rawJid;
  }

  if (rawJid.includes("@s.whatsapp.net")) {
    return rawJid.split("@")[0];
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
 * Extract phone number from JID or payload for contact lookup.
 * Returns normalized phone number (digits only) or null.
 */
function extractPhoneNumber(rawJid: string, payload: WAWebhookPayload): string | null {
  // Direct @s.whatsapp.net — extract phone number
  if (rawJid.includes("@s.whatsapp.net")) {
    return rawJid.split("@")[0];
  }

  // Participant fallback (group messages)
  if (payload.data?.participant?.includes("@s.whatsapp.net")) {
    return payload.data.participant.split("@")[0];
  }

  // For @lid — resolve via LID cache (maps LID → real phone number)
  if (rawJid.includes("@lid")) {
    const resolved = lookupLidCache(rawJid);
    if (resolved) return resolved;
  }

  return null;
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
