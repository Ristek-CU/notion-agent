/**
 * Unit tests untuk message-template.ts
 *
 * Covers:
 * - Greeting dikenali vs tidak dikenali
 * - Template pesan notifikasi PIC terformat benar
 * - Template konfirmasi pengirim
 */
import { describe, it, expect, vi } from "vitest";

// Mock contact-lookup sebelum import module yang pakai
vi.mock("../services/contact-lookup.js", () => ({
  findNameByPhone: (phone: string) => {
    if (phone === "6281234567890") {
      return { name: "Andi Fauzan H", phone: "6281234567890", nickname: "andi" };
    }
    return null;
  },
  getDisplayName: (phone: string) => {
    if (phone === "6281234567890") return "Andi";
    return "0899-9999-9999";
  },
  isKnownContact: (phone: string) => phone === "6281234567890",
}));

import {
  buildGreeting,
  buildPICNotificationMessage,
  buildSenderConfirmation,
} from "../utils/message-template";

describe("message-template", () => {
  // ── buildGreeting ────────────────────────────────────────────────

  describe("buildGreeting", () => {
    it("harus return greeting personal untuk nomor dikenali", () => {
      const result = buildGreeting("6281234567890");
      expect(result).toContain("Andi");
    });

    it("harus return greeting umum untuk nomor tidak dikenali", () => {
      const result = buildGreeting("6289999999999");
      expect(result).toContain("Halo");
    });

    it("harus return greeting umum untuk input kosong", () => {
      const result = buildGreeting("");
      expect(result).toBeTruthy();
    });
  });

  // ── buildPICNotificationMessage ──────────────────────────────────

  describe("buildPICNotificationMessage", () => {
    it("harus format pesan notifikasi dengan semua field", () => {
      const result = buildPICNotificationMessage({
        senderName: "Ojan",
        ticketTitle: "Buat Landing Page",
        picName: "Andi",
        ticketId: "TK-20260507-123",
        division: "Ristek",
        createdAt: "7/5/2026",
      });

      expect(result).toContain("Ojan");
      expect(result).toContain("Buat Landing Page");
      expect(result).toContain("Andi");
      expect(result).toContain("TK-20260507-123");
      expect(result).toContain("Ristek");
    });

    it("harus format pesan tanpa divisi", () => {
      const result = buildPICNotificationMessage({
        senderName: "Ojan",
        ticketTitle: "Test Tiket",
        picName: "Budi",
        ticketId: "TK-001",
      });

      expect(result).toContain("Test Tiket");
      expect(result).toContain("TK-001");
      expect(result).not.toContain("Divisi:");
    });

    it("harus selalu ada judul dan ticket ID", () => {
      const result = buildPICNotificationMessage({
        senderName: "Test",
        ticketTitle: "Minimal",
        picName: "PIC",
        ticketId: "TK-000",
      });

      expect(result).toContain("Minimal");
      expect(result).toContain("TK-000");
    });
  });

  // ── buildSenderConfirmation ──────────────────────────────────────

  describe("buildSenderConfirmation", () => {
    it("harus mention PIC dan ticket ID", () => {
      const result = buildSenderConfirmation("Ojan", ["Andi"], "TK-001");

      expect(result).toContain("Andi");
      expect(result).toContain("TK-001");
    });

    it("harus return string kosong jika tidak ada PIC", () => {
      const result = buildSenderConfirmation("Ojan", [], "TK-002");

      expect(result).toBe("");
    });

    it("harus handle multiple PICs", () => {
      const result = buildSenderConfirmation("Ojan", ["Andi", "Budi"], "TK-003");

      expect(result).toContain("Andi");
      expect(result).toContain("Budi");
      expect(result).toContain("TK-003");
    });
  });
});
