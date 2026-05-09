// src/wa/sender.ts
import { env } from "../config.js";

interface SendOptions {
  instanceName: string;
  number: string;
  text: string;
  isGroup?: boolean;
  pushName?: string; // Used for LID resolution fallback
}

// ─── LID Resolution Cache ─────────────────────────────────────────────
// WhatsApp uses @lid (Linked ID) for privacy — it cannot be used to send messages.
// We resolve @lid → real phone number via Evolution API contact store.
// Cache is persisted to disk so it survives container restarts.
import { readFileSync, writeFileSync, existsSync } from "fs";

const CACHE_FILE = "/app/cache/lid-cache.json";
const lidResolutionCache = new Map<string, string>();

// Load persisted cache on startup
try {
  if (existsSync(CACHE_FILE)) {
    const saved = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Record<string, string>;
    for (const [k, v] of Object.entries(saved)) {
      lidResolutionCache.set(k, v);
    }
    console.log(`[WA Sender] Loaded ${lidResolutionCache.size} LID mappings from cache`);
  }
} catch {
  // Ignore cache load errors
}

function saveLidCache() {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of lidResolutionCache) obj[k] = v;
    writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2));
  } catch {
    // Ignore cache save errors
  }
}

/**
 * Lookup nomor HP asli dari LID cache (synchronous).
 * Return null kalau tidak ada di cache.
 */
export function lookupLidCache(lidJid: string): string | null {
  return lidResolutionCache.get(lidJid) ?? null;
}

/**
 * Resolve a @lid JID to the real phone number using Evolution API findContacts.
 * Evolution API stores contacts with both @lid and @s.whatsapp.net IDs.
 * We match them via profilePictureUrl (same person = same profile pic).
 */
async function resolveLidToPhone(lidJid: string, pushName?: string): Promise<string> {
  // Check cache first
  const cached = lidResolutionCache.get(lidJid);
  if (cached) return cached;

  try {
    // Step 1: Get the LID contact to find their profile picture URL
    const endpoint = `${env.EVOLUTION_API_URL}/chat/findContacts/${env.EVOLUTION_INSTANCE_NAME}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({ where: { id: lidJid } }),
    });

    if (!response.ok) {
      console.warn(`[WA Sender] findContacts failed for ${lidJid}: ${response.status}`);
      return lidJid;
    }

    const lidContacts = (await response.json()) as Array<{
      id: string;
      pushName?: string;
      profilePictureUrl?: string;
    }>;

    if (!lidContacts.length) {
      console.warn(`[WA Sender] No contact found for LID ${lidJid}`);
      return lidJid;
    }

    const lidContact = lidContacts[0];
    const lidProfilePic = lidContact.profilePictureUrl || "";
    const effectivePushName = lidContact.pushName || pushName;

    // Step 2: Get ALL contacts and find the @s.whatsapp.net entry
    const allResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({}),
    });

    if (!allResponse.ok) {
      console.warn(`[WA Sender] findContacts all failed: ${allResponse.status}`);
      return lidJid;
    }

    const allContacts = (await allResponse.json()) as Array<{
      id: string;
      pushName?: string;
      profilePictureUrl?: string;
    }>;

    const waContacts = allContacts.filter((c) => c.id.includes("@s.whatsapp.net"));

    // Strategy 1: Match by profile picture URL (most reliable)
    if (lidProfilePic) {
      // First check contacts that already have profilePic in store
      let match = waContacts.find(
        (c) => c.profilePictureUrl === lidProfilePic
      );
      if (match) {
        const realNumber = match.id.split("@")[0];
        console.log(`[WA Sender] Resolved LID ${lidJid} → ${realNumber} (via store profilePic match)`);
        lidResolutionCache.set(lidJid, realNumber);
        saveLidCache();
        return realNumber;
      }

      // If not found in store, fetch profile pics for contacts with matching pushName
      const candidates = effectivePushName
        ? waContacts.filter((c) => c.pushName === effectivePushName)
        : waContacts;

      for (const candidate of candidates) {
        try {
          const picEndpoint = `${env.EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${env.EVOLUTION_INSTANCE_NAME}`;
          const picResponse = await fetch(picEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: env.EVOLUTION_API_KEY,
            },
            body: JSON.stringify({ number: candidate.id }),
          });
          if (picResponse.ok) {
            const picData = (await picResponse.json()) as { profilePictureUrl?: string };
            if (picData.profilePictureUrl === lidProfilePic) {
              const realNumber = candidate.id.split("@")[0];
              console.log(`[WA Sender] Resolved LID ${lidJid} → ${realNumber} (via live profilePic match)`);
              lidResolutionCache.set(lidJid, realNumber);
              saveLidCache();
              return realNumber;
            }
          }
        } catch {
          // Skip this candidate
        }
      }
    }

    // Strategy 2: Match by pushName (fallback)
    if (effectivePushName) {
      const match = waContacts.find(
        (c) => c.pushName === effectivePushName
      );
      if (match) {
        const realNumber = match.id.split("@")[0];
        console.log(`[WA Sender] Resolved LID ${lidJid} → ${realNumber} (via pushName match: ${effectivePushName})`);
        lidResolutionCache.set(lidJid, realNumber);
        saveLidCache();
        return realNumber;
      }
    }

    // Strategy 3: If LID number starts with country code, try it directly
    const lidNumber = lidJid.split("@")[0];
    if (lidNumber.startsWith("62")) {
      console.log(`[WA Sender] Trying LID number directly: ${lidNumber}`);
      const check = await checkNumberStatus(env.EVOLUTION_INSTANCE_NAME, lidNumber);
      const results = Array.isArray(check) ? check : [check];
      if (results[0]?.exists) {
        lidResolutionCache.set(lidJid, lidNumber);
        saveLidCache();
        return lidNumber;
      }
    }

    // Strategy 4: Brute-force — fetch profilePic for ALL @s.whatsapp.net contacts
    // This is expensive but reliable when other strategies fail
    if (lidProfilePic && waContacts.length > 0) {
      console.log(`[WA Sender] Strategy 4: Checking profile pics for ${waContacts.length} WA contacts...`);
      for (const candidate of waContacts) {
        try {
          const picEndpoint = `${env.EVOLUTION_API_URL}/chat/fetchProfilePictureUrl/${env.EVOLUTION_INSTANCE_NAME}`;
          const picResponse = await fetch(picEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: env.EVOLUTION_API_KEY },
            body: JSON.stringify({ number: candidate.id }),
          });
          if (picResponse.ok) {
            const picData = (await picResponse.json()) as { profilePictureUrl?: string };
            if (picData.profilePictureUrl === lidProfilePic) {
              const realNumber = candidate.id.split("@")[0];
              console.log(`[WA Sender] Resolved LID ${lidJid} → ${realNumber} (via brute-force profilePic match on ${candidate.id})`);
              lidResolutionCache.set(lidJid, realNumber);
              saveLidCache();
              return realNumber;
            }
          }
        } catch {
          // Skip
        }
      }
    }

    // Strategy 5: Last resort — use the bot's own recent messages to find the real number
    // The bot sends messages and Evolution API records the actual JID used
    // We can check the "from me" messages to find what number was actually used
    console.warn(`[WA Sender] Could not resolve LID ${lidJid} to real phone number`);
    return lidJid;
  } catch (error) {
    console.error(`[WA Sender] LID resolution error for ${lidJid}:`, error);
    return lidJid;
  }
}

/**
 * Normalize a number for Evolution API v1.8.6
 * - Groups: keep full JID (e.g. 120363xxx@g.us)
 * - DMs with @lid: resolve to real phone number first
 * - DMs with @s.whatsapp.net: strip suffix, send as plain phone number
 * - DMs with plain number: send as-is
 */
async function normalizeNumber(number: string, isGroup?: boolean, pushName?: string): Promise<string> {
  if (isGroup) return number;
  // Resolve @lid to real phone number — Evolution API cannot send to @lid
  if (number.includes("@lid")) {
    return await resolveLidToPhone(number, pushName);
  }
  // Keep @g.us for groups
  if (number.includes("@g.us")) return number;
  // Strip @s.whatsapp.net — send as plain phone number
  if (number.includes("@s.whatsapp.net")) {
    return number.split("@")[0];
  }
  return number;
}

/**
 * Send a text message via Evolution API
 */
export async function sendWhatsAppMessage(options: SendOptions) {
  const { instanceName, number, text, isGroup } = options;

  const targetNumber = await normalizeNumber(number, isGroup, options.pushName);
  const endpoint = `${env.EVOLUTION_API_URL}/message/sendText/${instanceName}`;

  // WhatsApp message limit ~4096 chars. Split if needed.
  const MAX_MSG_LEN = 3800; // leave buffer for encoding
  const chunks = splitMessageIntoChunks(text, MAX_MSG_LEN);

  let lastResult: unknown = null;

  for (let i = 0; i < chunks.length; i++) {
    const body = {
      number: targetNumber,
      textMessage: {
        text: chunks[i],
      },
      options: {
        delay: i === 0 ? 500 : 1500, // longer delay between chunks
        presence: "composing",
        ...(isGroup && { linkPreview: false }),
      },
    };

    console.log(
      `[WA Sender] Sending to ${isGroup ? "group" : "DM"}: ${targetNumber.slice(0, 30)}... (chunk ${i + 1}/${chunks.length}, ${chunks[i].length} chars)`
    );

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

    lastResult = await response.json();
  }

  console.log("[WA Sender] Message sent successfully");
  return lastResult;
}

/**
 * Split a long message into chunks, respecting line boundaries.
 * Tries to split at newline characters to avoid cutting mid-line.
 */
function splitMessageIntoChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (newline) within the limit
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt <= maxLen * 0.5) {
      // No good newline found, try space
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt <= maxLen * 0.5) {
      // No good break point, hard split
      splitAt = maxLen;
    }

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();

    // Add continuation header for chunks after the first
    if (chunks.length > 0 && remaining.length > 0) {
      remaining = `(lanjutan ${chunks.length + 1}/${Math.ceil(text.length / maxLen)})\n` + remaining;
    }
  }

  return chunks;
}

/**
 * Reply to a group chat (convenience wrapper)
 */
export async function replyToGroup(
  instanceName: string,
  groupJid: string,
  text: string,
  pushName?: string
) {
  return sendWhatsAppMessage({
    instanceName,
    number: groupJid,
    text,
    isGroup: true,
    pushName,
  });
}

/**
 * Send a direct message to a phone number or JID
 */
export async function sendDirectMessage(
  instanceName: string,
  phoneNumber: string,
  text: string,
  pushName?: string
) {
  return sendWhatsAppMessage({
    instanceName,
    number: phoneNumber,
    text,
    isGroup: false,
    pushName,
  });
}

/**
 * Check if a phone number is registered on WhatsApp
 */
export async function checkNumberStatus(
  instanceName: string,
  phoneNumber: string
) {
  const endpoint = `${env.EVOLUTION_API_URL}/chat/whatsappNumbers/${instanceName}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY,
    },
    body: JSON.stringify({
      numbers: [phoneNumber],
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to check number status: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch the bot's own JID from Evolution API.
 * Used to detect when the bot is mentioned in group chats.
 * Returns the owner JID (e.g. "6285180619766@s.whatsapp.net").
 */
let cachedBotJid: string | null = null;

export async function fetchBotJid(): Promise<string> {
  if (cachedBotJid) return cachedBotJid;

  const endpoint = `${env.EVOLUTION_API_URL}/instance/fetchInstances`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: env.EVOLUTION_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch bot JID: ${response.status}`);
  }

  const instances = (await response.json()) as Array<{
    instance: { owner: string; instanceName: string };
  }>;

  const match = instances.find(
    (i) => i.instance.instanceName === env.EVOLUTION_INSTANCE_NAME
  );

  if (!match) {
    throw new Error(`Instance ${env.EVOLUTION_INSTANCE_NAME} not found`);
  }

  cachedBotJid = match.instance.owner;
  console.log(`[WA Sender] Bot JID resolved: ${cachedBotJid}`);
  return cachedBotJid;
}

/**
 * Download media (image/document) from WhatsApp via Evolution API.
 * Returns the media buffer and mimetype.
 * Covers feature: #7 (image/file attachment)
 */
export async function downloadMedia(
  instanceName: string,
  messageKey: string
): Promise<{ buffer: Buffer; mimetype: string } | null> {
  try {
    const endpoint = `${env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        message: { key: messageKey },
      }),
    });

    if (!response.ok) {
      console.error(`[WA Sender] Failed to download media: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as {
      base64: string;
      mimetype: string;
    };

    return {
      buffer: Buffer.from(result.base64, "base64"),
      mimetype: result.mimetype,
    };
  } catch (error) {
    console.error("[WA Sender] Media download error:", error);
    return null;
  }
}
