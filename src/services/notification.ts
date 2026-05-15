/**
 * notification.ts — Layanan notifikasi WhatsApp outbound
 *
 * Fitur:
 * - Greeting personal berdasarkan nomor HP pengirim
 * - Notifikasi ke PIC saat tiket dibuat
 * - Retry 1x jika gagal kirim
 */

import { findPhoneByName, getDisplayName, getFullName } from "./contact-lookup";
import { buildGreeting as buildGreetingTpl, buildPICNotificationMessage } from "../utils/message-template";
import { sendDirectMessage } from "../wa/sender";
import { env } from "../config";

interface TicketNotification {
  senderPhone: string;
  ticketTitle: string;
  picName: string;
  ticketId: string;
  division?: string;
  createdAt?: string;
}

/**
 * Generate pesan greeting berdasarkan nomor HP pengirim
 * Return greeting personal jika dikenali, greeting umum jika tidak
 */
export function buildGreeting(senderPhone: string): string {
  try {
    return buildGreetingTpl(senderPhone);
  } catch (error) {
    console.warn("[Notification] Gagal build greeting:", error);
    return "Hai!";
  }
}

/**
 * Dapatkan display name dari nomor HP
 */
export function getSenderDisplayName(senderPhone: string): string {
  try {
    return getDisplayName(senderPhone);
  } catch (error) {
    console.warn("[Notification] Gagal get display name:", error);
    return "Kamu";
  }
}

/**
 * Kirim notifikasi ke PIC via WhatsApp saat tiket dibuat
 * Return true jika berhasil, false jika gagal
 */
export async function notifyPIC(ticket: TicketNotification): Promise<boolean> {
  const { picName, senderPhone, ticketTitle, ticketId, division, createdAt } = ticket;

  try {
    // Lookup nomor HP PIC dari nama
    const picContact = findPhoneByName(picName);

    if (!picContact) {
      console.warn(`[Notification] PIC "${picName}" tidak ditemukan di contacts — skip notifikasi`);
      return false;
    }

    const picPhone = picContact.phone;

    // Dapatkan nama lengkap pengirim untuk notifikasi
    const senderName = getFullName(senderPhone) || getDisplayName(senderPhone);

    // Build pesan notifikasi
    const message = buildPICNotificationMessage({
      senderName,
      ticketTitle,
      picName,
      ticketId,
      division,
      createdAt: createdAt || new Date().toLocaleDateString("id-ID"),
    });

    console.log(`[Notification] Mengirim notifikasi ke PIC ${picName} (${picPhone})`);

    // Kirim via WhatsApp
    try {
      await sendDirectMessage(env.EVOLUTION_INSTANCE_NAME, picPhone, message);
      console.log(`[Notification] Notifikasi terkirim ke PIC ${picName}`);
      return true;
    } catch (sendError) {
      // Retry 1x
      console.warn(`[Notification] Gagal kirim ke PIC, retry 1x...`, sendError);
      try {
        await sendDirectMessage(env.EVOLUTION_INSTANCE_NAME, picPhone, message);
        console.log(`[Notification] Notifikasi terkirim ke PIC ${picName} (retry berhasil)`);
        return true;
      } catch (retryError) {
        console.error(`[Notification] Retry juga gagal untuk PIC ${picName}:`, retryError);
        return false;
      }
    }
  } catch (error) {
    console.error("[Notification] Error notifyPIC:", error);
    return false;
  }
}

/**
 * Kirim konfirmasi ke pengirim bahwa tiket sudah dibuat dan PIC sudah dinotifikasi
 */
export async function notifySenderConfirmation(
  _senderPhone: string,
  ticket: {
    ticketTitle: string;
    ticketId: string;
    picName: string;
    picNotified: boolean;
  }
): Promise<void> {
  try {
    // Konfirmasi ini biasanya sudah di-handle oleh AI response,
    // tapi bisa dipakai sebagai fallback
    console.log(`[Notification] Konfirmasi tiket ${ticket.ticketId} untuk pengirim`);
  } catch (error) {
    console.warn("[Notification] Gagal build konfirmasi:", error);
  }
}
