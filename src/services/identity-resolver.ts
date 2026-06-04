// src/services/identity-resolver.ts
// Unified identity resolution: resolves WHO is messaging from phone/pushName/LID
// All strategies are synchronous (no API calls) for fast response.

import {
  findNameByPhone,
  findContactByPushName,
  findPhoneByName,
} from "./contact-lookup.js";
import { resolveNickname } from "../notion/notion-org-service.js";
import { lookupLidCache } from "../wa/sender.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface ResolvedIdentity {
  /** Best available full name (e.g. "Ivander Daniel Napitupulu") */
  name: string;
  /** Real phone number (e.g. "6281290679370") or null if unknown */
  phone: string | null;
  /** Known nickname (e.g. "ivander") or null */
  nickname: string | null;
  /** Division from contacts.json (e.g. "Research and Technology") */
  division: string | null;
  /** Role from contacts.json (e.g. "Staff") */
  role: string | null;
  /** WhatsApp pushName from payload (always available) */
  pushName: string;
  /** How identity was resolved (for logging) */
  resolutionMethod: string;
}

export interface IdentityInput {
  rawJid: string;
  pushName: string;
  sender?: string;
  participant?: string;
  botJid: string;
}

// ─── In-Memory Cache ────────────────────────────────────────────────

const identityCache = new Map<string, { identity: ResolvedIdentity; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Clean up expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of identityCache) {
    if (now > entry.expiresAt) identityCache.delete(key);
  }
}, 10 * 60 * 1000);

// ─── Main Resolver ──────────────────────────────────────────────────

/**
 * Resolve sender identity from any combination of phone/pushName/LID.
 * Purely synchronous — no API calls, only in-memory lookups.
 * Always returns a ResolvedIdentity (never null).
 */
export function resolveIdentity(input: IdentityInput): ResolvedIdentity {
  const { rawJid, pushName, sender, participant, botJid } = input;
  const botNumber = botJid ? botJid.split("@")[0] : "";

  // Check cache first
  const cacheKey = `${rawJid}:${pushName}`;
  const cached = identityCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.identity;
  }

  let result: ResolvedIdentity;

  // Strategy 1: Phone from @s.whatsapp.net JID
  if (rawJid.includes("@s.whatsapp.net")) {
    const phone = rawJid.split("@")[0];
    result = resolveFromPhone(phone, pushName, "phone_from_jid");
    if (result.phone) {
      cacheResult(cacheKey, result);
      return result;
    }
  }

  // Strategy 2: Phone from participant field
  if (participant?.includes("@s.whatsapp.net")) {
    const phone = participant.split("@")[0];
    result = resolveFromPhone(phone, pushName, "phone_from_participant");
    if (result.phone) {
      cacheResult(cacheKey, result);
      return result;
    }
  }

  // Strategy 3: Phone from sender field (if not bot)
  if (sender?.includes("@s.whatsapp.net")) {
    const senderNumber = sender.split("@")[0];
    if (senderNumber !== botNumber) {
      result = resolveFromPhone(senderNumber, pushName, "phone_from_sender");
      if (result.phone) {
        cacheResult(cacheKey, result);
        return result;
      }
    }
  }

  // Strategy 4: LID cache lookup
  if (rawJid.includes("@lid")) {
    const cachedPhone = lookupLidCache(rawJid);
    if (cachedPhone) {
      result = resolveFromPhone(cachedPhone, pushName, "lid_cache");
      if (result.phone) {
        cacheResult(cacheKey, result);
        return result;
      }
    }
  }

  // Strategy 5: pushName → contacts.json (nickname/name match)
  const contactByPushName = findContactByPushName(pushName);
  if (contactByPushName) {
    result = {
      name: contactByPushName.name,
      phone: contactByPushName.phone,
      nickname: contactByPushName.nickname,
      division: contactByPushName.division ?? null,
      role: contactByPushName.role ?? null,
      pushName,
      resolutionMethod: "pushname_contacts",
    };
    console.log(
      `[IdentityResolver] Resolved "${pushName}" → ${result.name} (${result.phone}) via contacts.json [pushname_contacts]`
    );
    cacheResult(cacheKey, result);
    return result;
  }

  // Strategy 6: pushName → resolveNickname → findPhoneByName
  const resolvedNickname = resolveNickname(pushName);
  if (resolvedNickname) {
    const contactByName = findPhoneByName(resolvedNickname);
    if (contactByName) {
      result = {
        name: contactByName.name,
        phone: contactByName.phone,
        nickname: contactByName.nickname,
        division: contactByName.division ?? null,
        role: contactByName.role ?? null,
        pushName,
        resolutionMethod: "pushname_nickname_fuzzy",
      };
      console.log(
        `[IdentityResolver] Resolved "${pushName}" → "${resolvedNickname}" → ${result.name} (${result.phone}) via nickname+fuzzy [pushname_nickname_fuzzy]`
      );
      cacheResult(cacheKey, result);
      return result;
    }
  }

  // Strategy 7: Fallback — pushName only, no phone
  result = {
    name: pushName,
    phone: null,
    nickname: null,
    division: null,
    role: null,
    pushName,
    resolutionMethod: "pushname_only_fallback",
  };
  console.log(
    `[IdentityResolver] Could not resolve "${pushName}" to a known identity (JID: ${rawJid})`
  );
  cacheResult(cacheKey, result);
  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────

function resolveFromPhone(
  phone: string,
  pushName: string,
  method: string
): ResolvedIdentity {
  const contact = findNameByPhone(phone);
  if (contact) {
    console.log(
      `[IdentityResolver] Resolved phone ${phone} → ${contact.name} (${contact.nickname}) via ${method}`
    );
    return {
      name: contact.name,
      phone: contact.phone,
      nickname: contact.nickname,
      division: contact.division ?? null,
      role: contact.role ?? null,
      pushName,
      resolutionMethod: method,
    };
  }
  // Phone found but not in contacts
  return {
    name: pushName,
    phone,
    nickname: null,
    division: null,
    role: null,
    pushName,
    resolutionMethod: `${method}_no_contact`,
  };
}

function cacheResult(key: string, identity: ResolvedIdentity): void {
  identityCache.set(key, { identity, expiresAt: Date.now() + CACHE_TTL_MS });
}
