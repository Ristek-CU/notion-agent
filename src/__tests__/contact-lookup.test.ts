/**
 * Unit tests untuk contact-lookup.ts
 *
 * Covers:
 * - Lookup nomor HP → nama (exact match)
 * - Lookup nomor HP beda format (normalisasi)
 * - Lookup nama → nomor HP (case-insensitive)
 * - Lookup nomor/nama tidak ditemukan → null
 * - getAllContacts
 */
import { describe, it, expect } from "vitest";
import {
  findNameByPhone,
  findPhoneByName,
  getDisplayName,
  getAllContacts,
} from "../services/contact-lookup";

describe("contact-lookup", () => {
  // ── findNameByPhone ──────────────────────────────────────────────

  describe("findNameByPhone", () => {
    it("harus return kontak yang cocok (exact match)", () => {
      const result = findNameByPhone("6288289048433");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Andi Fauzan H");
    });

    it("harus normalize nomor dengan + prefix", () => {
      const result = findNameByPhone("+6288289048433");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Andi Fauzan H");
    });

    it("harus normalize nomor dengan spasi dan dash", () => {
      const result = findNameByPhone("62-882-8904-8433");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Andi Fauzan H");
    });

    it("harus normalize nomor dengan 0 prefix (local format)", () => {
      const result = findNameByPhone("088289048433");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Andi Fauzan H");
    });

    it("harus return null untuk nomor yang tidak ditemukan", () => {
      const result = findNameByPhone("6289999999999");
      expect(result).toBeNull();
    });

    it("harus return null untuk input kosong", () => {
      const result = findNameByPhone("");
      expect(result).toBeNull();
    });

    it("harus return null untuk input bukan string", () => {
      const result = findNameByPhone(null as unknown as string);
      expect(result).toBeNull();
    });

    it("harus return kontak dengan division dan role", () => {
      const result = findNameByPhone("6288289048433");
      expect(result).not.toBeNull();
      expect(result!.division).toBe("Research and Technology");
      expect(result!.role).toBe("Deputy Head");
    });

    it("harus return kontak BPH", () => {
      const result = findNameByPhone("6285230083798");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Aguini Providensia Tjandra");
      expect(result!.division).toBe("BPH");
    });
  });

  // ── findPhoneByName ──────────────────────────────────────────────

  describe("findPhoneByName", () => {
    it("harus return nomor HP berdasarkan nama lengkap (exact)", () => {
      const result = findPhoneByName("Andi Fauzan H");
      expect(result).not.toBeNull();
      expect(result!.phone).toBe("6288289048433");
    });

    it("harus case-insensitive match", () => {
      const result = findPhoneByName("andi fauzan h");
      expect(result).not.toBeNull();
      expect(result!.phone).toBe("6288289048433");
    });

    it("harus match berdasarkan nickname", () => {
      const result = findPhoneByName("kanaya");
      expect(result).not.toBeNull();
      expect(result!.phone).toBe("6285218784442");
    });

    it("harus match berdasarkan nickname case-insensitive", () => {
      const result = findPhoneByName("Kanaya");
      expect(result).not.toBeNull();
      expect(result!.phone).toBe("6285218784442");
    });

    it("harus return null untuk nama yang tidak ditemukan", () => {
      const result = findPhoneByName("Siapa Ini");
      expect(result).toBeNull();
    });

    it("harus return null untuk input kosong", () => {
      const result = findPhoneByName("");
      expect(result).toBeNull();
    });

    it("harus return null untuk input bukan string", () => {
      const result = findPhoneByName(undefined as unknown as string);
      expect(result).toBeNull();
    });

    it("harus match nama dengan partial name", () => {
      const result = findPhoneByName("Satrio");
      expect(result).not.toBeNull();
      expect(result!.name).toContain("Satrio");
    });
  });

  // ── getDisplayName ───────────────────────────────────────────────

  describe("getDisplayName", () => {
    it("harus return nickname (capitalized) untuk kontak Andi", () => {
      const result = getDisplayName("6288289048433");
      expect(result).toBe("Andi"); // nickname "andi" → capitalized "Andi"
    });

    it("harus return nickname untuk kontak Kanaya", () => {
      const result = getDisplayName("6285218784442");
      expect(result).toBe("Kanaya"); // nickname "kanaya" → "Kanaya"
    });

    it("harus return formatted phone number untuk nomor tidak dikenali", () => {
      const result = getDisplayName("6289999999999");
      // Harus return formatted number, bukan 'Kamu'
      expect(result).toContain("0899");
    });
  });

  // ── getAllContacts ───────────────────────────────────────────────

  describe("getAllContacts", () => {
    it("harus return array contacts", () => {
      const contacts = getAllContacts();
      expect(Array.isArray(contacts)).toBe(true);
      expect(contacts.length).toBeGreaterThan(0);
    });

    it("setiap kontak harus punya name dan phone", () => {
      const contacts = getAllContacts();
      for (const contact of contacts) {
        expect(contact).toHaveProperty("name");
        expect(contact).toHaveProperty("phone");
        expect(contact.name).toBeTruthy();
        expect(contact.phone).toBeTruthy();
      }
    });

    it("harus punya minimal 100 kontak (semua divisi)", () => {
      const contacts = getAllContacts();
      expect(contacts.length).toBeGreaterThanOrEqual(100);
    });
  });
});
