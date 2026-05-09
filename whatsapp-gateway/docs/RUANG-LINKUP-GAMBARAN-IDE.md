# RuangLinkUp Kampus
## Gambaran Ide — Semua Layanan Kampus, Cukup via WhatsApp

**Untuk**: Tim Ristek
**Tanggal**: April 2026
**Sifat**: Dokumen Ide / Concept Paper

---

# Apa Itu RuangLinkUp?

**RuangLinkUp** adalah sebuah gerbang layanan kampus yang bisa diakses **cukup lewat WhatsApp**.

Nama "RuangLinkUp" sendiri bermakna: **Ruang** (tempat) + **Link** (koneksi) + **Up** (aktif/naik). Jadi ini adalah ruang digital yang menghubungkan seluruh layanan kampus ke satu titik akses.

**Intinya**: Semua yang biasanya harus datang ke kantor, buka web, login ke sistem beda-beda — sekarang cukup **chat 1 nomor WhatsApp**.

---

# Gambaran Besarnya

```
SEKARANG:

  Mahasiswa mau pinjam kelas
    → cari form fisik / buka web
    → isi data
    → kirim / antar ke TU
    → tunggu konfirmasi (hari-hari)
    → follow up manual

  Mahasiswa mau belanja di kantin kejujuran
    → harus datang fisik
    → tidak tahu stok apa yang ada
    → tidak tahu harga terbaru
    → tidak ada tracking penghasilan/dana

SESUDAH RuangLinkUp:

  Mahasiswa mau pinjam kelas
    → chat WA: "Mau pinjam kelas besok jam 10 ruang A201"
    → sistem cek ketersediaan otomatis
    → konfirmasi / pilih ruangan lain
    → selesai. < 2 menit.

  Mahasiswa mau belanja di kantin kejujuran
    → chat WA: "Kantin ada apa aja hari ini?"
    → sistem kirim list barang + harga
    → chat WA: "Ambil indomie 2, aqua 1"
    → sistem catat, beri total harga
    → bayar di kantin, ambil barang, done
```

---

# Layanan yang Ada di RuangLinkUp

## 1. Kantin Kejujuran

**Konsep**: Kantin yang beroperasi dengan sistem kepercayaan — user ambil barang sendiri, catat sendiri, bayar sendiri. WhatsApp jadi katalog + pencatatan digital.

### Yang Bisa Dilakukan via WA:

```
User:  "Kantin ada apa aja hari ini?"
Bot:   "Kantin Kejujuran - Stok Hari Ini:

       MAKANAN:
       - Indomie Goreng    Rp 5.000  (stok: 24)
       - Roti Bakar        Rp 8.000  (stok: 10)
       - Nasi Goreng       Rp 12.000 (stok: 5)

       MINUMAN:
       - Aqua 600ml        Rp 4.000  (stok: 30)
       - Es Teh Manis      Rp 5.000  (stok: 15)
       - Kopi Sachet       Rp 3.000  (stok: 20)

       SNACK:
       - Chitato           Rp 8.000  (stok: 12)
       - Oreo              Rp 5.000  (stok: 8)"

User:  "Ambil indomie goreng 2 sama aqua 1"
Bot:   "Dicatat ya!

       - Indomie Goreng x2 = Rp 10.000
       - Aqua 600ml x1     = Rp 4.000
       ─────────────────────────────
       TOTAL: Rp 14.000

       Silakan ambil barang di kantin dan masukkan pembayaran ke kotak.
       Ketik 'sudah bayar' setelah membayar. Terima kasih!"

User:  "Sudah bayar"
Bot:   "Pembayaran Rp 14.000 sudah dicatat. Terima kasih sudah jujur!
       Saldo kantin sekarang: Rp 245.000"
```

### Fitur Kantin Kejujuran:

- **Katalog stok real-time** — user bisa cek apa aja yang ada tanpa harus datang
- **Pencatatan otomatis** — setiap pengambilan dicatat, stok dikurangi otomatis
- **Tracking keuangan** — berapa masuk, berapa keluar, berapa selisih (buat deteksi discrepancy)
- **Notifikasi stok menipis** — kalau stok item tertentu sisa < 5, sistem notifikasi pengelola
- **Laporan harian/mingguan** — rekap penjualan otomatis untuk pengelola kantin
- **System kejujuran tracking** — catat berapa yang diambil vs berapa yang dibayar, detect anomaly

### Manfaat:
- Kantin bisa buka 24/7 tanpa perlu penjaga tetap
- Semua transaksi tercatat rapi
- Stok bisa di-monitor tanpa harus bolak-balik cek fisik
- Pengelola bisa lihat laporan kapan saja via WA juga

---

## 2. Pinjem Kelas (Booking Ruangan)

**Konsep**: Booking ruang kelas, ruang rapat, lab, atau area kampus lainnya langsung via WhatsApp. Tanpa form, tanpa ke TU, tanpa tunggu konfirmasi berhari-hari.

### Yang Bisa Dilakukan via WA:

```
User:  "Mau pinjem kelas besok jam 10"
Bot:   "Untuk booking kelas, aku butuh info berikut:
       Tanggal: Besok (23 April 2026)
       Jam: 10:00 - selesai jam berapa?
       Berapa orang?
       Keperluan?"

User:  "Jam 10-12, 15 orang, latihan presentasi tugas"
Bot:   "Aku cek ketersediaan dulu ya...

       Ruangan tersedia besok 10:00-12:00:

       1. A201 - Kelas Reguler (kapasitas 30) ✓
       2. A305 - Kelas Reguler (kapasitas 40) ✓
       3. B102 - Kelas Besar (kapasitas 60)  ✓
       4. Lab Komputer 2 (kapasitas 20)     ✓

       Mau pilih ruangan yang mana? (ketik nomor)"

User:  "1"
Bot:   "Booking dikonfirmasi!

       RUANGAN: A201
       TANGGAL: 23 April 2026 (Rabu)
       JAM: 10:00 - 12:00
       OLEH: Budi Santoso (2024001001)
       KEPERLUAN: Latihan presentasi tugas
       KAPASITAS: 15 orang

       Kode booking: BK-20260423-001
       Ketik 'batal BK-20260423-001' kalau mau membatalkan.

       Jangan lupa kembalikan kunci ke TU ya!"
```

### Skenario Lanjutan:

```
User:  "Jadwal ruang A201 minggu ini?"
Bot:   "Jadwal Ruang A201 - Minggu Ini:

       Senin 23/04:
       - 08:00-10:00 MK Algoritma (Dosen: Pak Andi)
       - 10:00-12:00 [KOSONG]
       - 13:00-15:00 MK Basis Data (Dosen: Bu Sari)
       - 15:00-17:00 Booking BK-20260423-001 (Budi - Presentasi)

       Selasa 24/04:
       - 08:00-12:00 UTS Semester Genap
       - 13:00-15:30 [KOSONG]
       - 15:30-17:00 MK Jaringan (Dosen: Pak Rudi)

       Mau booking di slot yang kosong?"

User:  "Booking A201 selasa jam 13:00-15:00 untuk rapat organisasi"
Bot:   "Booking dikonfirmasi!
       Ruang: A201 | Selasa 24/04 | 13:00-15:00
       Kode: BK-20260424-002
       Keperluan: Rapat organisasi"
```

### Fitur Pinjem Kelas:

- **Cek ketersediaan real-time** — lihat jadwal ruangan mana yang kosong
- **Booking instan** — konfirmasi langsung tanpa approval manual (untuk ruangan reguler)
- **Konflik otomatis** — sistem deteksi kalau ada jadwal bentrok
- **Reminder otomatis** — ingetin user sebelum jam booking
- **Pembatalan via WA** — ketik "batal [kode booking]" langsung batal
- **Kuota & aturan** — maksimal booking per minggu, durasi maksimal, dll
- **Approval flow** — untuk ruangan khusus (aula, lab), tetap butuh approval TU (notifikasi otomatis ke TU via WA juga)
- **Integrasi jadwal kuliah** — ruangan yang sudah ada jadwal kuliah otomatis diblok

### Manfaat:
- Mahasiswa nggak perlu ke TU cuma buat pinjam kelas
- TU bisa monitor semua booking dari satu tempat
- Bentrok jadwal berkurang drastis
- Data penggunaan ruangan bisa dianalisis

---

## 3. Layanan Lainnya yang Bisa Ditambahkan

Karena arsitekturnya modular (MCP), layanan lain tinggal "dipasang":

### Laporkan Fasilitas
```
User:  "AC ruang A201 bocor, lantai basah"
Bot:   "Laporan diterima!
       ID: LR-20260422-015
       Lokasi: A201
       Masalah: AC bocor, lantai basah
       Status: Menunggu penanganan
       Tim kampus sudah diberitahu."
```

### Info & Pengumuman
```
User:  "Ada pengumuman apa hari ini?"
Bot:   "Pengumuman Hari Ini (22 April):

       1. [AKADEMIK] UTS dimulai 25 April - jadwal sudah bisa dilihat
       2. [KEGIATAN] Seminar AI - 24 April, Aula Lt.3, 14:00
       3. [FASILITAS] Lab Komputer 1 maintenance sampai jam 3 sore
       4. [BEASISWA] Pendaftaran beasiswa semester depan dibuka sampai 30 April

       Ketik nomor untuk detail."
```

### Surat Keterangan
```
User:  "Mau buat surat keterangan mahasiswa aktif"
Bot:   "Surat Keterangan Mahasiswa Aktif

       Data kamu:
       Nama: Budi Santoso
       NIM: 2024001001
       Jurusan: Teknik Informatika
       Semester: 4
       Status: Aktif

       Data sudah benar? (ya/tidak)"
User:  "Ya"
Bot:   "Permohonan surat dicatat!
       Nomor: SK-20260422-003
       Estimasi selesai: 2 hari kerja
       Surat bisa diambil di TU atau minta dikirim softcopy.
       Ketik 'status SK-20260422-003' untuk cek progress."
```

### UKM & Organisasi
```
User:  "Daftar UKM apa aja?"
Bot:   "Daftar Unit Kegiatan Mahasiswa:

       1. UKM Paduan Suara - Latihan: Rabu 16:00
       2. UKM Basket - Latihan: Selasa & Kamis 17:00
       3. UKM Programming - Latihan: Jumat 14:00
       4. UKM Photography - Latihan: Sabtu 10:00
       5. UKM English Club - Latihan: Senin 15:00

       Ketik nomor untuk info detail & cara gabung."
```

### Perpustakaan
```
User:  "Buku 'Pemrograman Python' ada?"
Bot:   "Pencarian buku:
       - 'Python Programming' oleh John Zelle
         Lokasi: Rak D3-12 | Status: Tersedia ✓
         ISBN: 978-1234567890
       - 'Automate the Boring Stuff with Python'
         Lokasi: Rak D3-12 | Status: Dipinjam (kembali 28 April)

       Mau reservasi yang tersedia?"
```

---

# Gambaran Sistem

## Arsitektur Konsep

```
                    +---------------------------+
                    |     WHATSAPP CHANNEL      |
                    |  (1 nomor WA untuk semua) |
                    +-------------+-------------+
                                  |
                                  v
                    +---------------------------+
                    |      AI OTAK (Claude)      |
                    |                            |
                    |  Baca pesan user           |
                    |  Pahami maksudnya          |
                    |  Tentukan layanan apa      |
                    |  Ambil data dari sistem    |
                    |  Format jawaban            |
                    +-------------+-------------+
                                  |
                 +----------------+----------------+
                 |                |                |
                 v                v                v
          +----------+     +----------+     +----------+
          | MODULE   |     | MODULE   |     | MODULE   |
          | Kantin   |     | Booking  |     | Surat &  |
          | Kejujuran|     | Ruangan  |     | Info     |
          +----+-----+     +----+-----+     +----+-----+
               |                |                |
               v                v                v
          [Inventori      [Jadwal &       [Sistem Akademik
           Kantin DB]      Ruangan DB]     & Surat DB]
```

Setiap **MODULE** (ini yang kita sebut MCP) adalah modul terpisah yang:
- Berdiri sendiri
- Punya database/API sendiri
- Bisa ditambah tanpa ubah sistem utama
- Bisa di-maintenance tanpa ganggu module lain

## Contoh Module Kantin Kejujuran

```
┌─────────────────────────────────────────────────────┐
│                  MODULE KANTIN                       │
│                                                      │
│  DATA:                                              │
│  ├── Daftar barang (nama, harga, stok, kategori)   │
│  ├── Riwayat transaksi (siapa, apa, kapan, bayar)  │
│  ├── Stok harian (masuk, keluar, sisa)              │
│  └── Laporan keuangan (harian, mingguan, bulanan)   │
│                                                      │
│  ACTIONS:                                           │
│  ├── cek_stok        → Lihat semua barang + stok    │
│  ├── catat_ambil     → User ambil barang, kurangi   │
│  ├── catat_bayar     → User konfirmasi bayar        │
│  ├── restock         → Tambah stok baru             │
│  ├── laporan_harian  → Rekap hari ini               │
│  └── notifikasi_stok → Alert kalau hampir habis     │
│                                                      │
│  YANG DIHUBUNGKAN:                                  │
│  Database inventori kantin (bisa simple table)      │
│                                                      │
│  YANG BISA AKSES:                                   │
│  ├── User biasa → cek stok, catat ambil, catat bayar│
│  └── Pengelola → semua + restock + laporan          │
└─────────────────────────────────────────────────────┘
```

## Contoh Module Booking Ruangan

```
┌─────────────────────────────────────────────────────┐
│               MODULE BOOKING RUANGAN                │
│                                                      │
│  DATA:                                              │
│  ├── Daftar ruangan (nama, lokasi, kapasitas, jenis)│
│  ├── Jadwal tetap (jadwal kuliah, rutin)            │
│  ├── Booking list (siapa, kapan, ruang, status)     │
│  ├── Aturan (max durasi, max per minggu, dll)       │
│  └── Kalender (available vs booked per ruangan)     │
│                                                      │
│  ACTIONS:                                           │
│  ├── cek_ketersediaan → Lihat slot kosong           │
│  ├── booking          → Buat booking baru           │
│  ├── batal_booking    → Batalkan booking            │
│  ├── jadwal_ruang     → Lihat jadwal 1 ruangan     │
│  ├── jadwal_saya      → Lihat semua booking saya   │
│  └── approve_booking  → (TU) Approve booking khusus│
│                                                      │
│  YANG DIHUBUNGKAN:                                  │
│  ├── Jadwal kuliah (dari SIAKAD)                    │
│  └── Database booking (baru)                        │
│                                                      │
│  YANG BISA AKSES:                                   │
│  ├── User biasa → cek, booking, batal, jadwal saya  │
│  └── TU/Admin → semua + approve + override          │
└─────────────────────────────────────────────────────┘
```

---

# Gambaran User Experience

## Perjalanan User — Dari Awal Sampai Terbiasa

### Day 1: Pertama Kali Pakai

```
User menyimpan nomor WA RuangLinkUp

User:  "Halo"
Bot:   "Selamat datang di RuangLinkUp!

       Aku bot asisten kampus. Ada beberapa layanan yang bisa kamu pakai:

       1. Kantin Kejujuran — Cek stok, catat belanja
       2. Pinjem Kelas — Booking ruangan
       3. Info Kampus — Pengumuman, jadwal, surat
       4. Laporkan Masalah — Fasilitas rusak, keluhan
       5. Perpustakaan — Cari buku, cek pinjaman

       Ketik nomor atau langsung ceritakan kebutuhanmu.
       Contoh: 'Mau pinjem kelas besok jam 10'
               'Kantin ada indomie ga?'
               'Ada pengumuman apa hari ini?'"
```

### Day 5: Udah Terbiasa

```
User:  "besok butuh A201 jam 2-4 buat rapat, sekalian cek kantin ada kopi ga"
Bot:   "Siap, aku proses keduanya!

       BOOKING:
       Ruang A201 - Besok 14:00-16:00
       Kode: BK-20260424-010 ✓ Dikonfirmasi

       KANTIN:
       Kopi Sachet tersedia (stok: 18, Rp 3.000)
       Kopi Gula Aren tersedia (stok: 5, Rp 5.000)

       Mau catat pengambilan kopi?"
```

**AI pahai kalau user minta 2 hal sekaligus** — booking kelas DAN cek kantin — dan menjawab keduanya dalam 1 response.

---

# Gambaran Dashboard Pengelola (Opsional, Bisa via WA juga)

Pengelola kantin, TU, dan admin juga bisa ngobrol dengan sistem:

### Pengelola Kantin via WA:
```
Admin:  "Laporan kantin minggu ini"
Bot:    "Laporan Kantin Kejujuran — Minggu 16-22 April

        PENJUALAN:
        Total transaksi: 147 kali
        Total pendapatan: Rp 1.850.000
        Item terlaris: Indomie Goreng (52 pcs)

        STOK MENIPIS:
        - Aqua 600ml (sisa 3) → perlu restock
        - Roti Bakar (sisa 2) → perlu restock

        KEJUJURAN:
        Total barang diambil: 147
        Total pembayaran tercatat: 145
        Selisih: 2 transaksi belum dikonfirmasi bayar
        Tingkat kejujuran: 98.6%

        Ketik 'restock' untuk input stok baru."
```

### TU via WA:
```
TU:    "Booking ruangan hari ini"
Bot:   "Booking Hari Ini (22 April):

       1. A201 | 10:00-12:00 | Budi - Presentasi | ✓ Approved
       2. B102 | 13:00-15:00 | Sari - Rapat Org.  | ✓ Approved
       3. Aula | 14:00-17:00 | UKM Musik - Latihan| ⏳ Menunggu Approval

       Ketik 'approve 3' untuk approve booking Aula."
```

---

# Gambaran Data & Tracking

## Apa yang Tercatat Otomatis

```
Setiap interaksi via WA menciptakan data:

┌─────────────────────────────────────────────────┐
│ KANTIN KEJUJURAN                                │
│                                                  │
│ Transaksi:                                      │
│ ├── User, waktu, item, qty, total              │
│ ├── Status pembayaran (sudah/belum)             │
│ └── Discrepancy (kalau ada selisih)             │
│                                                  │
│ Stok:                                           │
│ ├── Per item: masuk, keluar, sisa               │
│ ├── Threshold alert (kalau sisa < 5)            │
│ └── Riwayat restock                             │
│                                                  │
│ Analitik:                                       │
│ ├── Item terlaris per periode                   │
│ ├── Jam ramai                                   │
│ ├── Tingkat kejujuran (ambil vs bayar)          │
│ └── Tren penjualan                              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ BOOKING RUANGAN                                 │
│                                                  │
│ Booking:                                        │
│ ├── User, ruangan, tanggal, jam, keperluan     │
│ ├── Status: confirmed/cancelled/completed       │
│ └── No-show tracking (kalau booking tapi gak dtg)│
│                                                  │
│ Utilisasi:                                      │
│ ├── Ruangan paling sering dipakai               │
│ ├── Slot waktu paling ramai                     │
│ ├── Utilisasi per ruangan (% terpakai)          │
│ └── Pola penggunaan per jurusan/organisasi      │
│                                                  │
│ Kontrol:                                        │
│ ├── Max booking per user per minggu             │
│ ├── Auto-cancel kalau no-show 2x                │
│ └── Blacklist/limit kalau seria abuse           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ INTERAKSI UMUM                                  │
│                                                  │
│ ├── Total pesan masuk per hari                  │
│ ├── Layanan paling sering diminta               │
│ ├── Jam paling aktif                            │
│ ├── Pertanyaan yang AI tidak bisa jawab         │
│ └── Feedback / complain user                    │
└─────────────────────────────────────────────────┘
```

---

# Gambaran Teknis Singkat

## Stack

| Komponen | Teknologi |
|----------|-----------|
| Channel | WhatsApp Business API (Twilio) |
| AI Brain | Claude API (Anthropic) |
| Backend | Node.js + TypeScript |
| Database | PostgreSQL |
| Cache & Queue | Redis |
| Module System | MCP (modular, satu-satu) |

## Prinsip Desain

1. **Modular** — Tiap layanan (kantin, booking, surat) adalah module terpisah. Tambah layanan = tambah module. Nggak usah ubah core system.

2. **Conversational** — User nggak perlu hafal command. Cukup ketik natural language, AI yang pahami. "Mau pinjem kelas" sama aja dengan "booking ruangan" sama aja dengan "apus iso booking ruang neng endi".

3. **Testing First** — Kita POC dulu, buktiin bisa jalan, baru bangun beneran. Nggak langsung bikin besar.

4. **Start Small** — Mulai dari 1-2 layanan yang paling sering dipakai. Kalau berhasil, tambah yang lain.

5. **Role-Aware** — Mahasiswa, staf, TU, admin punya akses berbeda. TU bisa approve booking, pengelola bisa restock kantin, mahasiswa bisa booking dan catat belanja.

---

# Mengapa Ini Bisa Jalan

1. **WhatsApp sudah ada di semua HP** — Nggak perlu install app baru, nggak perlu bikin frontend, nggak perlu ajarin user UI baru. Semua orang sudah bisa pakai WhatsApp.

2. **AI sudah cukup pintar** — Claude bisa memahami bahasa Indonesia, nangkap maksud user dari pesan natural, dan merespons dengan cara yang ramah. Nggak perlu keyword matching kaku.

3. **Arsitektur modular** — Kita nggak bangun semuanya sekaligus. Bangun 1 module, jalan, tambah module lain. Setiap module berdiri sendiri.

4. **Biaya rendah** — Untuk POC: Twilio sandbox gratis, Claude API bayar per pakai (murah untuk volume awal), server bisa pakai yang sudah ada.

---

# Pertanyaan untuk Diskusi

1. **Layanan mana yang paling urgent?** Kantin kejujuran dulu atau pinjem kelas dulu? Atau ada yang lebih prioritas?

2. **Data source** — Untuk kantin, datanya kita bikin sendiri (database baru). Untuk booking, apakah ada jadwal kuliah yang bisa kita pakai? Formatnya apa?

3. **Aturan** — Untuk booking ruangan: perlu approval TU atau langsung auto-confirm? Ada limit berapa kali booking per minggu? Untuk kantin: batas stok minimum berapa?

4. **Siapa pengelola** — Kantin di-siapa? Booking di-siapa? Mereka juga pakai WA untuk manage?

5. **Scope MVP** — Kalau kita mulai dari 1 layanan dulu untuk POC, mana yang paling masuk akal?

---

*RuangLinkUp — Satu Chat, Semua Layanan Kampus.*
