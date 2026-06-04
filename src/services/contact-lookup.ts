// src/services/contact-lookup.ts
// Service untuk lookup kontak berdasarkan nomor HP atau nama.
// Digunakan untuk inbound caller ID dan outbound notifikasi PIC.

import fs from "fs";
import path from "path";

// Load contacts at runtime instead of static import
// This allows contacts.json to be gitignored while CI still builds
function loadContactsData(): Contact[] {
  try {
    const contactsPath = path.resolve(__dirname, "../config/contacts.json");
    const raw = fs.readFileSync(contactsPath, "utf-8");
    return JSON.parse(raw) as Contact[];
  } catch {
    console.warn("[ContactLookup] contacts.json not found or invalid — using empty list");
    return [];
  }
}

const contactsData: Contact[] = loadContactsData();

export interface Contact {
  name: string;
  phone: string;
  nickname: string;
  division?: string;
  role?: string;
}

// ─── Normalisasi Nomor HP ────────────────────────────────────────────

/**
 * Normalisasi nomor HP: hapus +, spasi, dash, tanda kurung, dan pastikan format 62xxx.
 * Contoh: "+62 812-3456-7890" → "6281234567890"
 */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[\s\-\+\(\)\.]/g, "");
  // Jika dimulai dengan "0", ganti jadi "62"
  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  }
  // Jika dimulai dengan "+62" atau "62", biarkan
  return cleaned;
}

// ─── Lookup Functions ────────────────────────────────────────────────

/**
 * Cari kontak berdasarkan nomor HP (exact match setelah normalisasi).
 * Digunakan untuk inbound caller ID — identifikasi siapa yang mengirim pesan.
 *
 * @param phone Nomor HP dalam format apapun
 * @returns Object kontak atau null jika tidak ditemukan
 */
export function findNameByPhone(phone: string): Contact | null {
  if (!phone) return null;
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  for (const contact of contactsData as Contact[]) {
    if (normalizePhone(contact.phone) === normalized) {
      return contact;
    }
  }
  return null;
}

/**
 * Cari nomor HP berdasarkan nama (case-insensitive, partial match).
 * Digunakan untuk outbound notifikasi — cari nomor PIC untuk dikirimi pesan.
 *
 * @param name Nama lengkap, nickname, atau partial name
 * @returns Object kontak atau null jika tidak ditemukan
 */
export function findPhoneByName(name: string): Contact | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  if (!lower) return null;

  for (const contact of contactsData as Contact[]) {
    // Exact match nama lengkap
    if (contact.name.toLowerCase() === lower) {
      return contact;
    }
    // Exact match nickname
    if (contact.nickname.toLowerCase() === lower) {
      return contact;
    }
  }

  // Partial match: nama input mengandung nama kontak atau sebaliknya
  for (const contact of contactsData as Contact[]) {
    const contactLower = contact.name.toLowerCase();
    const nickLower = contact.nickname.toLowerCase();

    if (contactLower.includes(lower) || lower.includes(contactLower)) {
      return contact;
    }
    if (nickLower.includes(lower) || lower.includes(nickLower)) {
      return contact;
    }
  }

  return null;
}

/**
 * Dapatkan display name berdasarkan nomor HP.
 * Prioritas: nickname > name > nomor HP terformat.
 * Digunakan untuk greeting pesan masuk.
 *
 * @param phone Nomor HP
 * @returns Nama untuk ditampilkan
 */
export function getDisplayName(phone: string): string {
  const contact = findNameByPhone(phone);
  if (!contact) {
    // Format nomor HP: 6281234567890 → 0812-3456-7890
    const normalized = normalizePhone(phone);
    if (normalized.length >= 10) {
      return `0${normalized.slice(2, 5)}-${normalized.slice(5, 9)}-${normalized.slice(9)}`;
    }
    return phone;
  }
  // Return nama lengkap dari database contacts
  return contact.name;
}

/**
 * Dapatkan nama lengkap berdasarkan nomor HP.
 * Digunakan untuk notifikasi PIC (butuh nama lengkap, bukan nickname).
 *
 * @param phone Nomor HP
 * @returns Nama lengkap atau null jika tidak ditemukan
 */
export function getFullName(phone: string): string | null {
  const contact = findNameByPhone(phone);
  return contact ? contact.name : null;
}

/**
 * Cari kontak berdasarkan pushName WhatsApp (case-insensitive, partial match).
 * Digunakan sebagai fallback kalau nomor HP gak bisa di-extract (misal @lid).
 * Mencoba match terhadap name, nickname, dan first name.
 *
 * @param pushName Nama yang dikirim WhatsApp (display name user)
 * @returns Object kontak atau null jika tidak ditemukan
 */
export function findContactByPushName(pushName: string): Contact | null {
  if (!pushName || pushName === "Unknown") return null;
  const lower = pushName.toLowerCase().trim();
  if (!lower) return null;

  // 1. Exact match nickname
  for (const contact of contactsData as Contact[]) {
    if (contact.nickname.toLowerCase() === lower) {
      return contact;
    }
  }

  // 2. Exact match full name
  for (const contact of contactsData as Contact[]) {
    if (contact.name.toLowerCase() === lower) {
      return contact;
    }
  }

  // 3. Push name contains first name or vice versa
  for (const contact of contactsData as Contact[]) {
    const firstName = contact.name.split(" ")[0].toLowerCase();
    const nickLower = contact.nickname.toLowerCase();

    // pushName matches first name
    if (firstName === lower) return contact;
    // pushName contains nickname or vice versa
    if (nickLower.includes(lower) || lower.includes(nickLower)) return contact;
    // pushName contains first name or vice versa
    if (firstName.includes(lower) || lower.includes(firstName)) return contact;
  }

  return null;
}

/**
 * Dapatkan display name yang paling akurat.
 * Prioritas: contact by phone > contact by pushName > pushName WhatsApp.
 *
 * @param phone Nomor HP (bisa null)
 * @param pushName Nama WhatsApp dari payload
 * @returns Nama untuk ditampilkan
 */
export function resolveDisplayName(phone: string | null, pushName: string): string {
  // 1. Coba lookup via nomor HP (paling akurat)
  if (phone) {
    const contact = findNameByPhone(phone);
    if (contact) {
      return contact.name;
    }
  }

  // 2. Coba lookup via pushName terhadap database kontak
  const contactByPushName = findContactByPushName(pushName);
  if (contactByPushName) {
    return contactByPushName.name;
  }

  // 3. Fallback: pakai pushName WhatsApp apa adanya
  return pushName || "Unknown";
}

/**
 * Return semua kontak yang terdaftar.
 */
export function getAllContacts(): Contact[] {
  return contactsData as Contact[];
}

/**
 * Cek apakah nomor HP dikenali (terdaftar di contacts).
 */
export function isKnownContact(phone: string): boolean {
  return findNameByPhone(phone) !== null;
}
