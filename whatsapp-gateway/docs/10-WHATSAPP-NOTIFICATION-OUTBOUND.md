# Fitur: Contact Lookup & Notifikasi WhatsApp (Two-Way)

| Field | Detail |
|-------|--------|
| **Feature** | Contact Lookup (Inbound) + Notifikasi Outbound WhatsApp ke PIC |
| **Version** | 0.2.0 |
| **Status** | Draft — Menunggu Implementasi |
| **Date** | 2026-05-07 |
| **Doc ID** | 10 |

---

## 1. Deskripsi Fitur

Dua fitur utama yang menggunakan **satu sumber data kontak yang sama** (`contacts.json`):

### 1.1 Fitur A — Caller ID / Greeting (Inbound)

Saat seseorang kirim pesan WhatsApp ke Roro, bot **membaca nomor HP pengirim**, mencocokkan dengan data kontak, lalu menyapa dengan **nama panggilan**.

### 1.2 Fitur B — Notifikasi ke PIC (Outbound)

Saat tiket dibuat dan PIC ditunjuk, Roro **mencari nomor HP PIC** di data kontak, lalu mengirim notifikasi WhatsApp.

### Alur Lengkap (Two-Way Flow)

```
========= INBOUND (Pengirim → Roro) =========

Orang A kirim pesan WA ke Roro
         │
         ▼
Roro baca nomor HP pengirim (dari WhatsApp API)
         │
         ▼
Roro cari nomor HP di contacts.json
         │
         ▼
Ketemu! Nomor = "6281234567890" → Nama = "Rizky"
         │
         ▼
Roro respons: "Halo Rizky! Ada yang bisa dibantu?"

========= PROCESSING (AI → Notion) ==========

Roro proses permintaan → AI buat tiket di Notion
         │
         ▼
Tiket ditugaskan ke PIC "Budi"

========= OUTBOUND (Roro → PIC) =============

Roro cari "Budi" di contacts.json
         │
         ▼
Ketemu! Nomor = "6281345678901"
         │
         ▼
Roro kirim WA ke Budi:
"Tiket baru dari Rizky. Mohon dicek dan dikerjakan ya."
```

## 2. Sumber Data: Contact List (`contacts.json`)

Satu file JSON yang dipakai untuk **dua arah** (inbound + outbound).

**Format: JSON**

```json
[
  { "name": "Rizky Pratama", "phone": "6281234567890", "nickname": "Rizky" },
  { "name": "Budi Santoso", "phone": "6281345678901", "nickname": "Budi" },
  { "name": "Sari Dewi", "phone": "6281456789012", "nickname": "Sari" },
  { "name": "Andi Kurniawan", "phone": "6281567890123", "nickname": "Andi" }
]
```

**Field:**
| Field | Wajib | Fungsi |
|-------|-------|--------|
| `name` | Ya | Nama lengkap — harus match dengan nama PIC di Notion |
| `phone` | Ya | Nomor WA format internasional, tanpa `+`/spasi/dash |
| `nickname` | Opsional | Nama panggilan — dipakai untuk greeting ("Halo Rizky!") |

### Cara Kerja Dua Arah

| Arah | Trigger | Lookup | Output |
|------|---------|--------|--------|
| **Inbound** (Caller ID) | Pesan masuk dari nomor X | Cari `phone` = X | Dapat `name` → "Halo Rizky!" |
| **Outbound** (Notifikasi) | Tiket ditugaskan ke "Budi" | Cari `name` = "Budi" | Dapat `phone` → Kirim WA ke Budi |

### 2.1 Pesan Greeting (Inbound)

Saat pengirim dikenali:
```
"Halo {nickname}! Ada yang bisa Roro bantu hari ini? 😊"
```

Saat pengirim TIDAK dikenali:
```
"Halo! Selamat datang. Ada yang bisa Roro bantu?"
```

### 2.2 Pesan Notifikasi ke PIC (Outbound)

```
🎫 *Tiket Baru dari {nickname_pengirim}*

📋 *Judul:* {judul_tiket}
📌 *PIC:* {nama_pic}
📅 *Dibuat:* {tanggal}

Mohon dicek dan dikerjakan ya. Terima kasih! 🙏

Balas *STATUS* untuk cek status tiket.
```

## 3. Arsitektur Teknis

### 3.1 Sequence Diagram

```
WhatsApp     Orchestrator   Contact Lookup   AI (Claude)   Notion API   WhatsApp API
  │               │               │               │              │              │
  │  pesan masuk  │               │               │              │              │
  │  (+ nomor HP) │               │               │              │              │
  │──────────────>│               │               │              │              │
  │               │  lookup nomor │               │              │              │
  │               │──────────────>│               │              │              │
  │               │  nama: Rizky  │               │              │              │
  │               │<──────────────│               │              │              │
  │               │               │               │              │              │
  │  "Halo Rizky! │               │               │              │              │
  │   Ada yang... │               │               │              │              │
  │<──────────────│               │               │              │              │
  │               │               │               │              │              │
  │  pesan request│               │               │              │              │
  │──────────────>│               │               │              │              │
  │               │  proses intent│               │              │              │
  │               │──────────────────────────────>│              │              │
  │               │               │               │  buat tiket  │              │
  │               │               │               │─────────────>│              │
  │               │               │               │  tiket data  │              │
  │               │               │               │<─────────────│              │
  │               │  respons+PIC  │               │              │              │
  │               │<──────────────────────────────│              │              │
  │               │               │               │              │              │
  │               │  lookup PIC   │               │              │              │
  │               │──────────────>│               │              │              │
  │               │  nomor Budi   │               │              │              │
  │               │<──────────────│               │              │              │
  │               │               │               │              │              │
  │               │  kirim notif ke Budi           │              │              │
  │               │─────────────────────────────────────────────────────────────>│
  │               │               │               │              │              │
  │  konfirmasi   │               │               │              │              │
  │  "Tiket dibuat│               │               │              │              │
  │   Budi sudah  │               │               │              │              │
  │   dinotifikasi│               │               │              │              │
  │<──────────────│               │               │              │              │
```

### 3.2 File & Struktur Baru

```
src/
├── config/
│   └── contacts.json          ← Contact list (satu sumber data untuk dua arah)
├── services/
│   ├── contact-lookup.ts      ← Service lookup dua arah (nama↔nomor HP)
│   └── notification.ts        ← Service kirim notifikasi WhatsApp outbound
├── utils/
│   └── message-template.ts    ← Template pesan (greeting + notifikasi)
```

### 3.3 Modul: `contact-lookup.ts`

```typescript
import contacts from '../config/contacts.json';

interface Contact {
  name: string;
  phone: string;
  nickname?: string;
}

// INBOUND: Nomor HP → Nama (untuk greeting)
export function findNameByPhone(phone: string): Contact | null {
  const normalized = phone.replace(/[^0-9]/g, '');
  return contacts.find(
    (c: Contact) => c.phone === normalized
  ) ?? null;
}

// OUTBOUND: Nama → Nomor HP (untuk notifikasi PIC)
export function findPhoneByName(name: string): string | null {
  const contact = contacts.find(
    (c: Contact) => c.name.toLowerCase() === name.toLowerCase()
  );
  return contact?.phone ?? null;
}

// Get display name for greeting
export function getDisplayName(phone: string): string {
  const contact = findNameByPhone(phone);
  return contact?.nickname ?? contact?.name ?? 'Kak';
}

export function getAllContacts(): Contact[] {
  return contacts;
}
```

### 3.4 Modul: `notification.ts`

```typescript
import { findPhoneByName, findNameByPhone, getDisplayName } from './contact-lookup';

interface TicketNotification {
  senderPhone: string;
  ticketTitle: string;
  picName: string;
  createdAt: string;
}

// INBOUND: Generate greeting berdasarkan nomor HP pengirim
export function buildGreeting(senderPhone: string): string {
  const name = getDisplayName(senderPhone);
  return `Halo ${name}! Ada yang bisa Roro bantu hari ini? 😊`;
}

// OUTBOUND: Kirim notifikasi ke PIC
export async function notifyPIC(ticket: TicketNotification): Promise<boolean> {
  const senderName = getDisplayName(ticket.senderPhone);
  const picPhone = findPhoneByName(ticket.picName);

  if (!picPhone) {
    console.warn(`[NOTIFICATION] PIC "${ticket.picName}" tidak ditemukan di contact list`);
    return false;
  }

  const message = `🎫 *Tiket Baru dari ${senderName}*\n\n` +
    `📋 *Judul:* ${ticket.ticketTitle}\n` +
    `📌 *PIC:* ${ticket.picName}\n` +
    `📅 *Dibuat:* ${ticket.createdAt}\n\n` +
    `Mohon dicek dan dikerjakan ya. Terima kasih! 🙏\n\n` +
    `Balas *STATUS* untuk cek status tiket.`;

  await sendWhatsAppMessage(picPhone, message);
  return true;
}
```

## 4. Functional Requirements

### FR-NOTIF-001: Contact List Management
- Contact list disimpan di `src/config/contacts.json`
- Format: array of `{ name, phone, nickname? }`
- Penambahan/perubahan kontak dilakukan manual di file JSON
- `name` harus match (case-insensitive) dengan nama PIC di Notion
- `phone` format internasional tanpa `+` (contoh: `6281234567890`)

### FR-NOTIF-002: Inbound Caller ID (Nomor HP → Nama)
- Saat pesan masuk, sistem membaca nomor HP pengirim dari WhatsApp API
- Lookup nomor HP ke contact list
- Jika ditemukan → Roro menyapa dengan nama/nickname: *"Halo Rizky!"*
- Jika tidak ditemukan → greeting generik: *"Halo! Selamat datang."*
- Nama pengirim juga dipakai di pesan notifikasi ke PIC ("Tiket dari Rizky")

### FR-NOTIF-003: Outbound PIC Lookup (Nama → Nomor HP)
- Sistem mengekstrak nama PIC dari respons AI saat tiket dibuat
- Lookup nama ke contact list (case-insensitive match)
- Jika PIC tidak ditemukan → log warning, tidak crash
- Jika ditemukan → return nomor HP untuk notifikasi

### FR-NOTIF-004: WhatsApp Outbound Notification
- Kirim pesan WhatsApp ke nomor HP PIC yang ditemukan
- Pesan menyertakan nama pengirim (dari caller ID lookup)
- Pesan menggunakan template standar (lihat bagian 2.2)
- Pengiriman via WhatsApp API yang sudah ada (Twilio/Evolution API)
- Jika pengiriman gagal → log error, retry 1x

### FR-NOTIF-005: Confirmation to Sender
- Setelah tiket berhasil dibuat, pengirim dapat konfirmasi
- Konfirmasi menyertakan info bahwa PIC sudah dinotifikasi
- Contoh: *"Tiket berhasil dibuat! Budi sudah Roro notifikasi via WhatsApp."*

## 5. Edge Cases & Error Handling

| Skenario | Handling |
|----------|----------|
| Nomor HP pengirim tidak ada di contact list | Greeting generik: "Halo! Selamat datang." |
| Nomor HP pengirim beda format (628 vs 08) | Normalisasi: hapus +, spasi, dash, lalu cocokkan |
| Nama PIC tidak ada di contact list | Log warning, tiket tetap dibuat, notifikasi di-skip |
| Nama PIC beda format (misal "Budi" vs "Budi Santoso") | Case-insensitive + partial match sebagai fallback |
| Nomor HP PIC tidak valid / tidak aktif | Log error dari WhatsApp API, tiket tetap dibuat |
| Gagal kirim notifikasi | Retry 1x, jika masih gagal log error |
| Multiple PIC di satu tiket | Kirim notifikasi ke semua PIC yang ditemukan |
| Pengirim = PIC yang ditunjuk | Tetap kirim notifikasi (sama-sama dapat info) |

## 6. Priority & Scope

| Aspect | Detail |
|--------|--------|
| **Priority** | P1 — Fitur tambahan MVP |
| **Complexity** | Medium |
| **Dependensi** | WhatsApp API terkonfigurasi, tiket creation sudah jalan, data anggota SGA sudah dimasukkan |
| **Estimasi Effort** | 3-4 hari kerja |

## 7. Testing Checklist

**Inbound (Caller ID):**
- [ ] Contact list terbaca dengan benar dari `contacts.json`
- [ ] Lookup nomor HP → nama berhasil (exact match)
- [ ] Lookup nomor HP beda format tetap match ("62812..." == "0812...")
- [ ] Nomor HP tidak ditemukan → greeting generik, tidak crash
- [ ] Greeting menggunakan nickname jika tersedia, fallback ke name
- [ ] Nama pengirim terbawa ke konteks AI untuk notifikasi

**Outbound (Notifikasi PIC):**
- [ ] Lookup nama PIC → nomor HP berhasil (case-insensitive)
- [ ] Lookup nama tidak ditemukan → return null, tidak crash
- [ ] Notifikasi terkirim ke nomor HP yang benar
- [ ] Template pesan terformat dengan benar (termasuk nama pengirim)
- [ ] Konfirmasi ke pengirim menyertakan info PIC dinotifikasi
- [ ] Edge case: PIC tidak ditemukan → sistem tetap jalan
- [ ] Edge case: Gagal kirim WA → retry 1x, log error
- [ ] Integration test: Full flow pesan masuk → greeting → tiket → notifikasi PIC

## 8. Future Enhancements (Out of Scope Sekarang)

- **Dynamic contact list** — CRUD kontak via WhatsApp admin command
- **PIC balas notifikasi** — Update status tiket via reply
- **Notifikasi status update** — Kirim notifikasi saat tiket di-update, bukan hanya saat dibuat
- **Notifikasi ke pengirim** — Info ke pengirim saat PIC menyelesaikan tiket
- **Contact list di database** — Pindah dari hardcode ke tabel PostgreSQL
- **Group notification** — Kirim ke group WhatsApp jika PIC bukan individu

---

*Dokumen ini living document — akan diupdate saat implementasi dimulai.*
