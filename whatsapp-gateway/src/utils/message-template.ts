// src/utils/message-template.ts
// Template pesan WhatsApp untuk greeting, notifikasi PIC, dan konfirmasi.

import { getDisplayName, isKnownContact } from "../services/contact-lookup.js";

// ─── Greeting Templates ─────────────────────────────────────────────

/**
 * Generate pesan greeting berdasarkan nomor HP pengirim.
 * Dikenali → pakai nama panggilan, tidak dikenali → greeting umum.
 */
export function buildGreeting(senderPhone: string): string {
  if (isKnownContact(senderPhone)) {
    const name = getDisplayName(senderPhone);
    return `Halo ${name}! 👋`;
  }
  return "Halo! 👋";
}

// ─── PIC Notification Templates ─────────────────────────────────────

export interface TicketNotification {
  senderName: string;   // Nama pengirim yang membuat tiket
  ticketTitle: string;  // Judul tiket
  picName: string;      // Nama PIC yang ditugaskan
  ticketId: string;     // ID tiket (misal TK-20260506-889)
  division?: string;    // Divisi (opsional)
  priority?: string;    // Prioritas (opsional)
  notionUrl?: string;   // Link Notion (opsional)
  createdAt?: string;   // Tanggal dibuat (opsional)
}

/**
 * Generate pesan notifikasi untuk PIC yang ditugaskan ke tiket baru.
 */
export function buildPICNotificationMessage(ticket: TicketNotification): string {
  let msg = `📋 *Tiket Baru Untuk Kamu!*\n\n`;
  msg += `Hai *${ticket.picName}*, kamu baru saja ditugaskan ke tiket baru nih:\n\n`;
  msg += `📌 *${ticket.ticketTitle}*\n`;
  if (ticket.ticketId) msg += `🆔 ID: ${ticket.ticketId}\n`;
  if (ticket.division) msg += `🏢 Divisi: ${ticket.division}\n`;
  if (ticket.priority) msg += `⚡ Prioritas: ${ticket.priority}\n`;
  msg += `👤 Dari: ${ticket.senderName}\n`;
  if (ticket.createdAt) msg += `📅 Tanggal: ${ticket.createdAt}\n`;
  if (ticket.notionUrl) msg += `\n🔗 Lihat detail: ${ticket.notionUrl}`;
  msg += `\n\n— Roro (Bot Notion)`;
  return msg;
}

/**
 * Generate pesan konfirmasi ke pengirim bahwa PIC sudah dinotifikasi.
 */
export function buildSenderConfirmation(
  _senderName: string,
  picNames: string[],
  ticketId: string
): string {
  if (picNames.length === 0) return "";

  const nameList = picNames.join(", ");
  return `\n\n📨 Udah aku kabarin *${nameList}* ya${picNames.length > 1 ? " semua" : ""}! Nanti dia cek tiket *${ticketId}* nya.`;
}

// ─── Error / Fallback Templates ─────────────────────────────────────

/**
 * Pesan ketika PIC tidak ditemukan di kontak.
 */
export function buildPICNotFoundWarning(picName: string): string {
  return `⚠️ Maaf, nomor WA *${picName}* belum terdaftar di kontak bot. Nanti aku kasih tau manual ya kalau ada tiket baru.`;
}
