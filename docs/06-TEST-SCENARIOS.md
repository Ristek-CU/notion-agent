# Test Scenarios
## Oro Bot — WhatsApp Gateway for SGA Cakrawala Universe

---

## 1. Command Parsing

### TC-CMD-001: Help Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-001 |
| **Description** | Verify `!help` and `!bantuan` return the help menu |
| **Priority** | Critical |

| Case | Input | Expected Output |
|------|-------|-----------------|
| English command | `!help` | Help text with "Oro Bot — Panduan Singkat" header, command list, natural language tips |
| Indonesian command | `!bantuan` | Same help text |
| With trailing space | `!help ` | Same help text |
| Case insensitive | `!HELP` | Same help text |
| `!bantuan` with suffix | `!bantuan dong` | Same help text (regex prefix match) |

---

### TC-CMD-002: Project List Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-002 |
| **Description** | Verify `!projects` and `!project list` list all projects |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Basic | `!projects` | Formatted list: "*Master Projects* (N)" with name, divisions, HOP, backlog count |
| Alt form | `!project list` | Same output |
| Singular | `!project` | Same output |
| Case insensitive | `!PROJECTS` | Same output |
| Empty result | (no projects in Notion) | "Tidak ada project ditemukan." |

---

### TC-CMD-003: Project Detail Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-003 |
| **Description** | Verify `!project <name>` returns project details with backlog items |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Exact name | `!project Redesign Landing Page SGA` | Project detail: name, divisions, HOP, total backlog, grouped backlog by status |
| Partial name | `!project landing page` | Best matching project detail |
| Indonesian alias | `!projek landing page` | Same result (projek accepted) |
| Not found | `!project nonexistent xyz` | "Project 'nonexistent xyz' tidak ditemukan." + suggestion to use `!projects` |

---

### TC-CMD-004: Backlog Search Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-004 |
| **Description** | Verify `!backlog search <query>` and `!backlog cari <query>` search backlog items |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| English keyword | `!backlog search redesign` | Formatted results: "*Hasil Pencarian Backlog*" with status emoji, priority, project, Notion URL |
| Indonesian keyword | `!backlog cari navbar` | Same format |
| No results | `!backlog search xyznotfound123` | "Tidak ada backlog item yang cocok dengan 'xyznotfound123'." |
| Many results (>15) | `!backlog search a` | First 15 items + "...dan N item lainnya." |

---

### TC-CMD-005: Backlog by Division Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-005 |
| **Description** | Verify `!backlog division <name>` filters backlog by division with alias resolution |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Full division name | `!backlog division Research and Technology` | Backlog items for Ristek |
| Alias: ristek | `!backlog division ristek` | Same result (alias resolved) |
| Alias: bnp | `!backlog division bnp` | Backlog items for Business And Partnership |
| Indonesian keyword | `!backlog divisi media` | Backlog items for Media and Information |
| Unknown division | `!backlog division xyzdiv` | "Divisi 'xyzdiv' tidak ditemukan." + list of available divisions |

---

### TC-CMD-006: Backlog by Status Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-006 |
| **Description** | Verify `!backlog status <value>` filters backlog by status |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Not started | `!backlog status Not started` | Items with status "Not started" |
| In progress | `!backlog status In progress` | Items with status "In progress" |
| Done | `!backlog status Done` | Items with status "Done" |
| Empty status | `!backlog status ` | Error or empty result |

---

### TC-CMD-007: Backlog Update Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-007 |
| **Description** | Verify `!backlog update <name> status/priority <value>` updates a backlog item |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Update status | `!backlog update redesign status In progress` | "*Backlog Diperbarui!*" with item name, new status, changed by |
| Update priority | `!backlog update redesign prioritas High` | Same format, priority updated |
| Indonesian verb | `!backlog ubah redesign status Done` | Same result (ubah accepted) |
| Not found | `!backlog update xyznotfound status Done` | "Backlog item 'xyznotfound' tidak ditemukan." |
| Invalid field | `!backlog update redesign foo bar` | "Field harus *status* atau *prioritas*." |

---

### TC-CMD-008: Backlog Delete Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-008 |
| **Description** | Verify `!backlog delete <name>` archives a backlog item |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Delete by name | `!backlog delete redesign` | "*Backlog Dihapus!*" with restore hint: `!backlog restore redesign` |
| Indonesian verb | `!backlog hapus redesign` | Same result |
| Archive verb | `!backlog archive redesign` | Same result |
| Not found | `!backlog delete xyznotfound` | "Backlog item 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-009: Backlog Restore Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-009 |
| **Description** | Verify `!backlog restore <name>` restores an archived backlog item |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Restore by name | `!backlog restore redesign` | "*Backlog Di-restore!*" with status "Restored" and URL |
| Indonesian verb | `!backlog pulihkan redesign` | Same result |
| Not found | `!backlog restore xyznotfound` | "Backlog item 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-010: Backlog Bulk Update Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-010 |
| **Description** | Verify `!backlog bulk <from> to <to>` performs bulk status update |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Basic bulk | `!backlog bulk "Not started" to "In progress"` | "*Bulk Update Selesai!*" with updated count |
| With division | `!backlog bulk "Not started" to "In progress" ristek` | Same format, includes division |
| Indonesian verb | `!backlog masal "Not started" ke "In progress"` | Same result (masal/ke accepted) |
| Missing args | `!backlog bulk` | Format help: "*!backlog bulk <status_lama> ke <status_baru> [divisi]*" |

---

### TC-CMD-011: Ticket Detail Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-011 |
| **Description** | Verify `!detail <name/ID>` returns full ticket detail |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| By ticket ID | `!detail TK-20260426-001` | Full detail: name, status, priority, content (up to 500 chars), comments, URL |
| By name | `!detail redesign landing page` | Same format, searched by name |
| Indonesian alias | `!detailtiket TK-20260426-001` | Same result |
| Not found | `!detail xyznotfound` | "Tiket 'xyznotfound' tidak ditemukan." |
| Content > 500 chars | (ticket with long content) | Content truncated at 500 chars + "... (N karakter lagi)" |

---

### TC-CMD-012: Ticket Note Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-012 |
| **Description** | Verify `!note <ticket> <text>` adds a note to a ticket |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Add note | `!note redesign Header sudah selesai` | "*Catatan Ditambahkan!*" with note text and author |
| Indonesian alias | `!catatan redesign Progress ok` | Same result |
| Missing text | `!note redesign` | Format help: "*!note <nama tiket> <catatan>*" |
| Not found | `!note xyznotfound some text` | "Tiket 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-013: Ticket Comment Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-013 |
| **Description** | Verify `!comment <ticket> <text>` adds a comment to a ticket |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Add comment | `!comment redesign Progress bagus, lanjut!` | "*Komentar Ditambahkan!*" with prefixed author `[pushName] text` |
| Indonesian alias | `!komentar redesign Good job` | Same result |
| Missing text | `!comment redesign` | Format help: "*!comment <nama tiket> <komentar>*" |

---

### TC-CMD-014: Members List Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-014 |
| **Description** | Verify `!members` and `!members <division>` list members |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| All members | `!members` | "*Semua Anggota* (N)" with max 30 names, "+N lainnya" if >30 |
| By division | `!members ristek` | "*Anggota Research and Technology* (N)" |
| Indonesian alias | `!anggota` | Same as `!members` |
| Indonesian with division | `!anggota media` | Members of Media and Information |
| Unknown division | `!members xyzdiv` | "Tidak ada member ditemukan untuk divisi 'xyzdiv'." |

---

### TC-CMD-015: Divisions List Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-015 |
| **Description** | Verify `!divisions` lists all divisions |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Basic | `!divisions` | "*Divisi* (N)" with bullet list of all 12 divisions |
| Indonesian alias | `!divisi` | Same result |
| Singular | `!division` | Same result |

---

### TC-CMD-016: Member Tasks Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-016 |
| **Description** | Verify `!tugas <name>` returns backlog items assigned to a member |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| By nickname | `!tugas farhan` | "*Tugas Farhan Athalla Azis* (N)" with status emoji, priority |
| By full name | `!tugas Iqbal Azhari Pasaribu` | Same format |
| English alias | `!tasks farhan` | Same result |
| No tasks | `!tugas xyzperson` | "Tidak ada tugas ditemukan untuk 'xyzperson'." |
| Many tasks (>20) | `!tugas <active member>` | First 20 items + "...dan N lainnya." |

---

### TC-CMD-017: Assign PIC Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-017 |
| **Description** | Verify `!assignpic <ticket> <member>` assigns a PIC to a backlog item |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Assign by nickname | `!assignpic redesign iqbal` | "*PIC Ditambahkan!*" with member full name, WA notification sent to PIC |
| Alt command | `!pic redesign iqbal` | Same result |
| Member not found | `!assignpic redesign xyzperson` | "Member 'xyzperson' tidak ditemukan di database." |
| Ticket not found | `!assignpic xyznotfound iqbal` | "Tiket 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-018: Unassign PIC Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-018 |
| **Description** | Verify `!unassignpic <ticket> <member>` removes a PIC from a backlog item |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Unassign by nickname | `!unassignpic redesign iqbal` | "*PIC Dihapus!*" with removed member name |
| Alt command | `!removepic redesign iqbal` | Same result |
| Member not found | `!unassignpic redesign xyzperson` | "Member 'xyzperson' tidak ditemukan di database." |

---

### TC-CMD-019: Refresh Cache Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-019 |
| **Description** | Verify `!refresh` clears all caches |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Basic | `!refresh` | "*Cache Di-refresh!* Semua data akan diambil ulang dari Notion pada request berikutnya." |
| Alt command | `!sync` | Same result |

---

### TC-CMD-020: List Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-020 |
| **Description** | Verify `!list` and `!list <dept>` list backlog items |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| All items | `!list` | "*Master Backlog* (N)" grouped by status, max 10 per group |
| By department | `!list ristek` | "*Backlog: Ristek* (N)" with status and priority |
| Empty backlog | (no items in Notion) | "Master Backlog kosong." |

---

### TC-CMD-021: Stats Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-021 |
| **Description** | Verify `!stats` returns backlog statistics |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Basic | `!stats` | "*Statistik Backlog*" with total, Not started, In Progress, Complete, Blocking, per-priority breakdown, per-division breakdown |
| Indonesian alias | `!statistik` | Same result |

---

### TC-CMD-022: Close Ticket Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-022 |
| **Description** | Verify `!close <ticketId>` sets ticket status to Done |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid ticket ID | `!close TK-20260426-001` | "*Tiket Selesai!*" with ID, status: Done, closed by |
| Indonesian alias | `!selesai TK-20260426-001` | Same result |
| Alt alias | `!done TK-20260426-001` | Same result |
| Invalid format | `!close abc123` | No match (parseCommand returns null, falls through to NLP) |
| Not found | `!close TK-99999999-999` | "Tiket TK-99999999-999 tidak ditemukan." |

---

### TC-CMD-023: Delete Ticket Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-023 |
| **Description** | Verify `!delete <ticketId>` archives a ticket by ID |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid ticket ID | `!delete TK-20260426-001` | "*Tiket Dihapus (Archived)!*" with ID, deleted by |
| Indonesian alias | `!hapus TK-20260426-001` | Same result |
| Not found | `!delete TK-99999999-999` | "Tiket TK-99999999-999 tidak ditemukan." |

---

### TC-CMD-024: Assign Ticket Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-024 |
| **Description** | Verify `!assign <ticketId> <name>` assigns a member to a ticket by ID |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Assign member | `!assign TK-20260426-001 iqbal` | "*Tiket Di-assign!*" with ticket name, assignee full name, WA notification sent |
| Indonesian alias | `!pasang TK-20260426-001 iqbal` | Same result |
| Missing name | `!assign TK-20260426-001` | Format help: "*!assign TK-XXXXXXXX-XXX @nama*" |
| Not found | `!assign TK-99999999-999 iqbal` | "Tiket TK-99999999-999 tidak ditemukan." |

---

### TC-CMD-025: Update Ticket Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-025 |
| **Description** | Verify `!update <ticketId> <field> <value>` updates a ticket field via AI parsing |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Update status | `!update TK-20260426-001 status In progress` | "*Tiket Diperbarui!*" with field and value |
| Update priority | `!update TK-20260426-001 prioritas High` | Same format |
| Indonesian alias | `!ubah TK-20260426-001 status Done` | Same result |
| Invalid field | `!update TK-20260426-001 foo bar` | "Field harus *status* atau *prioritas*." |
| Not found | `!update TK-99999999-999 status Done` | "Tiket TK-99999999-999 tidak ditemukan." |

---

### TC-CMD-026: Database Create Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-026 |
| **Description** | Verify `!db create <name> in <parent>` creates a Notion database |
| **Priority** | Low |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid creation | `!db create "Sprint Backlog" in abc123def456` | "*Database Dibuat!*" with name, ID, URL |
| Indonesian alias | `!database buat "Sprint" in abc123` | Same result |
| Invalid parent | `!db create "Test" in invalidid` | "Gagal membuat database. Pastikan parent page ID valid dan bot punya akses." |

---

### TC-CMD-027: Database Schema Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-027 |
| **Description** | Verify `!db schema <id>` returns database schema |
| **Priority** | Low |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid ID | `!db schema abc123def456` | "*Database Schema: <title>*" with ID and property list (name + type) |
| Alt alias | `!db info abc123def456` | Same result |
| Invalid ID | `!db schema invalidid` | "Gagal mengambil schema database." |

---

### TC-CMD-028: Subpage Create Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-028 |
| **Description** | Verify `!subpage <parent> <title>` creates a sub-page under a ticket |
| **Priority** | Low |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid creation | `!subpage redesign Subtask: Header Component` | "*Sub-page Dibuat!*" with parent name, sub-page title, URL |
| Indonesian alias | `!subhalaman redesign Subtask` | Same result |
| Parent not found | `!subpage xyznotfound Subtask` | "Tiket 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-029: Image Attach Command

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-029 |
| **Description** | Verify `!image <ticket> <url>` attaches an image to a ticket |
| **Priority** | Low |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Valid URL | `!image redesign https://example.com/screenshot.png` | "*Gambar Dilampirkan!*" with ticket name, URL, author |
| Indonesian alias | `!gambar redesign https://example.com/img.png` | Same result |
| Invalid URL | `!image redesign not-a-url` | "Gagal melampirkan gambar. Pastikan URL gambar valid." |
| Ticket not found | `!image xyznotfound https://example.com/img.png` | "Tiket 'xyznotfound' tidak ditemukan." |

---

### TC-CMD-030: Status Check Shortcut

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CMD-030 |
| **Description** | Verify `status TK-xxx`, `cek TK-xxx`, `info TK-xxx` shortcuts |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| status prefix | `status TK-20260426-001` | "*Status Tiket: TK-20260426-001*" with name, status, priority, URL |
| cek prefix | `cek TK-20260426-001` | Same result |
| info prefix | `info TK-20260426-001` | Same result |
| Invalid ID format | `status abc123` | No match (falls through to NLP) |

---

## 2. Natural Language Processing

### TC-NLP-001: Ticket Creation via Natural Language

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-001 |
| **Description** | Verify AI correctly extracts ticket data from natural language and creates a ticket |
| **Priority** | Critical |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Simple creation | `buatin tiket redesign landing page untuk ristek` | Ticket created with judul, departemen: Research and Technology, PIC notification if assigned |
| With PIC and deadline | `buat tiket fix bug navbar, assign ke iqbal dan raihan, deadline 30 mei` | Ticket with pics: ["Iqbal Azhari Pasaribu", "Raihan Firdaus Hadi Saputra"], deadline: 2026-05-30 |
| With priority and status | `bikin tiket urgent, status in progress, prioritas high, untuk ristek` | Ticket with prioritas: High, status: In progress |
| With project | `buat tiket testing bot untuk ristek, project Research & Feedback Hub` | Ticket with project relation resolved |
| With reviewedBy | `buat tiket, reviewed by mika` | Ticket with reviewedBy: ["Aldridge Mika Gunawan"] |
| Fast execution (no confirmation) | `buat tiket fix error` | Ticket created immediately — no "mau aku proses ya?" or "bener nih?" prompts |

---

### TC-NLP-002: Self-Reference Detection

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-002 |
| **Description** | Verify bot detects self-referencing pronouns and shows user's own tasks |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| "tugas gw" | `tugas gw` | User's backlog items (resolved via senderPhone → contact lookup → full name → Notion query) |
| "backlog saya" | `backlog saya dong` | Same behavior |
| "cek tugas aku" | `cek tugas aku` | Same behavior |
| "cek backlog dong" | `cek backlog dong` | Same behavior (short query with "dong" implies self-reference) |
| Unknown phone | `tugas gw` (phone not in contacts) | "Hmm, nomor kamu belum terdaftar di database aku nih..." |

---

### TC-NLP-003: Member Lookup via Natural Language

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-003 |
| **Description** | Verify bot resolves member names from natural language and shows their tasks |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| "tugas farhan" | `tugas farhan` | Farhan Athalla Azis's backlog items |
| "tugas <name>" at end | `cek tugas iqbal` | Iqbal Azhari Pasaribu's backlog items |
| "kirim pesan ke faza" | `kirim pesan ke faza` | Faza Qinthoro's tasks + WA notification sent to Faza |
| Member with no tasks | `tugas xyzperson` | "Wah, saat ini belum ada tugas yang di-assign ke *Xyzperson* nih..." |
| Priority over self-ref | `tugas farhan` (from user named Farhan) | Shows Farhan's tasks (specific name takes priority over self-reference) |

---

### TC-NLP-004: Division Detection via Natural Language

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-004 |
| **Description** | Verify bot detects division references in natural language |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| "backlog ristek" | `backlog ristek` | Backlog for Research and Technology |
| "tugas divisi media" | `tugas divisi media` | Backlog for Media and Information |
| "cek backlog bnp" | `cek backlog bnp` | Backlog for Business And Partnership |
| "yang open di pcr" | `yang open di pcr` | Not started items for Public and Community Relations |

---

### TC-NLP-005: Follow-Up Questions

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-005 |
| **Description** | Verify bot handles follow-up questions using session context |
| **Priority** | High |

| Case | Input (after context) | Expected Output |
|------|-----------------------|-----------------|
| "deadline kapan?" | After viewing a ticket | Deadline info from last shown ticket(s) |
| "siapa pic?" | After viewing backlog | PIC list from last shown results |
| "statusnya?" | After viewing tasks | Status summary from last shown results |
| "linknya" | After viewing items | Notion URLs from last shown results |
| "projectnya" | After viewing items | Project names from last shown results |
| "divisinya" | After viewing items | Division from session context |
| "prioritasnya" | After viewing items | Priority from last shown results |
| "detailnya" | After viewing ticket name | Full ticket detail via `!detail` handler |
| "yang tadi" | After any query | "Oh, yang tadi bahas soal *X* ya?" with follow-up prompt |

---

### TC-NLP-006: Greeting Detection

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-006 |
| **Description** | Verify bot responds to greetings with time-appropriate message |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| "hai" | `hai` | Time-based greeting + "Aku Roro, bot asisten SGA" + capability summary |
| "halo" | `halo` | Same format |
| "pagi" (5-11 AM) | `pagi` | "Selamat pagi {pushName}!" |
| "siang" (11 AM-3 PM) | `siang` | "Selamat siang {pushName}!" |
| "sore" (3-6 PM) | `sore` | "Selamat sore {pushName}!" |
| "malam" (6 PM-5 AM) | `malam` | "Selamat malam {pushName}!" |
| Long message with greeting | `hai, mau tanya tentang backlog ristek` | NOT treated as greeting (>25 chars), falls through to NLP |

---

### TC-NLP-007: Stats via Natural Language

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-007 |
| **Description** | Verify "statistik backlog" and similar phrases trigger stats |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| "statistik backlog" | `statistik backlog` | Same as `!stats` output |
| "stats backlog" | `stats backlog` | Same result |
| "ringkasan backlog" | `ringkasan backlog` | Same result |
| "stats" alone | `stats` | Same result |

---

### TC-NLP-008: Broadcast via Natural Language

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-008 |
| **Description** | Verify broadcast intent triggers mass task notification |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Full broadcast | `kirim notifikasi ke semua anggota sesuai tasknya` | "*Broadcast Task Notification Selesai!*" with sent/skipped/failed counts |
| Short broadcast | `broadcast task ke semua member` | Same result |
| "notifikasi semua anggota" | `notifikasi semua anggota tentang tugasnya` | Same result |

---

### TC-NLP-009: Out-of-Scope Requests

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-009 |
| **Description** | Verify bot rejects requests outside its scope (no code, recipes, etc.) |
| **Priority** | High |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Code request | `kasih kode python kalkulator` | AI returns empty/minimal reply (is_ticket: false, reply: "") |
| Recipe request | `resep masakan apa enak` | Same behavior |
| Story request | `cerita dong` | Same behavior |
| General question | `berapa 1+1` | Routed to AI chat, politely redirected to scope |

---

### TC-NLP-010: Query vs Ticket Disambiguation

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NLP-010 |
| **Description** | Verify bot correctly distinguishes between reading queries and creation requests |
| **Priority** | Critical |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Query: "cek status" | `cek status tugas backlog tim ristek` | is_query: true, shows backlog for ristek |
| Query: "yang open" | `yang masih open ada apa aja` | is_query: true, shows Not started items |
| Ticket: "buat tiket" | `buat tiket fix bug navbar` | is_ticket: true, creates ticket |
| Ticket: "bikin" | `bikin fitur login buat app mobile` | is_ticket: true, creates ticket |
| Ambiguous: "backlog" | `backlog` (alone) | Treated as query, shows summary |

---

## 3. Division Alias Resolution

### TC-DIV-001: Exact Alias Match

| Field | Detail |
|-------|--------|
| **TC ID** | TC-DIV-001 |
| **Description** | Verify all 12 divisions resolve correctly from their aliases |
| **Priority** | Critical |

| Alias | Expected Division |
|-------|--------------------|
| `ristek` | Research and Technology |
| `tech` | Research and Technology |
| `teknologi` | Research and Technology |
| `it` | Research and Technology |
| `rnd` | Research and Technology |
| `media` | Media and Information |
| `minfo` | Media and Information |
| `medinfo` | Media and Information |
| `pcr` | Public and Community Relations |
| `pubcom` | Public and Community Relations |
| `humas` | Public and Community Relations |
| `bnp` | Business And Partnership |
| `bisnis` | Business And Partnership |
| `sponsor` | Business And Partnership |
| `icd` | Intellectual & Career Development |
| `karir` | Intellectual & Career Development |
| `advo` | Student Advocacy and Welfare |
| `saw` | Student Advocacy and Welfare |
| `ukm` | UKM Development |
| `treasurer` | Treasurer |
| `keuangan` | Treasurer |
| `finance` | Treasurer |
| `controller` | Controller |
| `controker` | Controller |
| `audit` | Controller |
| `secretary` | Secretary |
| `sekretaris` | Secretary |
| `sec` | Secretary |
| `executive` | Executive |
| `eksekutif` | Executive |
| `bph` | BPH |

---

### TC-DIV-002: Alias Resolution Edge Cases

| Field | Detail |
|-------|--------|
| **TC ID** | TC-DIV-002 |
| **Description** | Verify alias resolution handles edge cases |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Case insensitive | `RISTEK` | Research and Technology |
| Full name match | `Research and Technology` | Research and Technology |
| Contains match | `business` | Business And Partnership |
| Word boundary for short aliases | `it` in "backlog it" | Research and Technology |
| No false match for short alias | `it` in "audit report" | null (word boundary prevents false match) |
| Empty input | `` | null |
| Unknown input | `xyzdiv` | null |
| Division context detection | "backlog ristek" | Research and Technology (has division context) |
| No division context | "I love tech" | null or Research and Technology only if alias >= 4 chars |

---

## 4. Member Nickname Resolution

### TC-NICK-001: Exact Nickname Match

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NICK-001 |
| **Description** | Verify exact nickname lookup resolves to correct full name |
| **Priority** | Critical |

| Nickname | Expected Full Name |
|----------|--------------------|
| `ojan` | Andi Fauzan H |
| `farhan` | Farhan Athalla Azis |
| `iqbal` | Iqbal Azhari Pasaribu |
| `faza` | Faza Qinthoro |
| `mika` | Aldridge Mika Gunawan |
| `satrio` | Satrio Lehandika Putra |
| `raihan` | Raihan Firdaus Hadi Saputra |
| `fauzan` | Andi Fauzan H |
| `naeko` | Sevilla Naeko Lathiifah |
| `bhima` | Thoriq Bhima Filiandro |

---

### TC-NICK-002: Fuzzy Matching (Typo Tolerance)

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NICK-002 |
| **Description** | Verify Levenshtein-based fuzzy matching resolves typos |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| 1-char typo (short name) | `fara` | null or closest match within edit distance |
| 2-char typo (short name) | `ibqal` | Iqbal Azhari Pasaribu (Levenshtein distance 2) |
| 1-char typo (longer name) | `marshel` | Marshelinda Rukmana |
| Case insensitive | `OJAN` | Andi Fauzan H |
| Multi-word input | `andi fauzan` | Andi Fauzan H |
| Single letter | `a` | null (too short, < 2 chars) |
| Empty input | `` | null |

---

### TC-NICK-003: Partial Match

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NICK-003 |
| **Description** | Verify partial name matching resolves prefix/suffix matches |
| **Priority** | Medium |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Prefix match | `far` | Farhan Athalla Azis (or Farrel Abda Aghazka — first match) |
| First word of full name | `diva` | Diva Nabilla (first exact match in MEMBER_NICKNAMES) |
| Unknown name | `xyzperson` | null |

---

## 5. Notion Integration

### TC-NOT-001: Ticket Creation (CRUD - Create)

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-001 |
| **Description** | Verify ticket creation writes to Notion Master Backlog correctly |
| **Priority** | Critical |

| Case | Input Data | Expected Notion State |
|------|-----------|----------------------|
| Full ticket | judul, deskripsi, divisi, project, pics, prioritas, status, deadline, reviewedBy | New page in Master Backlog with all properties set, relations resolved to page IDs |
| Minimal ticket | judul only | New page with judul, other fields defaulted |
| Division resolution | departemen: "ristek" | Division relation resolved to Research and Technology page ID |
| PIC resolution | pics: ["iqbal"] | PIC relation resolved to Iqbal Azhari Pasaribu page ID |
| Unresolved PIC | pics: ["xyzperson"] | Conversation state saved, user prompted for full name |
| Ticket ID format | Any creation | TK-YYYYMMDD-XXX format |

---

### TC-NOT-002: Ticket Read Operations

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-002 |
| **Description** | Verify reading ticket data from Notion |
| **Priority** | Critical |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| List all backlog | `listBacklog()` | All active backlog items with resolved PIC names, division names, project names |
| Search by name | `searchBacklog("redesign")` | Items where Name contains "redesign" |
| Filter by status | `getBacklogByStatus("In progress")` | Items with status "In progress" |
| Filter by division | `getBacklogByDivision("ristek")` | Items for Research and Technology |
| Filter by member | `getBacklogByMemberName("farhan")` | Items assigned to Farhan Athalla Azis |
| Page detail | `getTicketDetail(pageId)` | Full detail: properties, content blocks (up to 500 chars), comments |

---

### TC-NOT-003: Ticket Update Operations

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-003 |
| **Description** | Verify updating ticket data in Notion |
| **Priority** | High |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| Update status | `updateBacklogStatus(pageId, "Done")` | Status changed to Done in Notion |
| Update priority | `updateBacklogPriority(pageId, "High")` | Priority changed to High |
| Bulk update | `bulkUpdateBacklogStatus(filter, "In progress")` | All matching items updated, returns {updated, errors} |
| Assign PIC | `assignPicToBacklog(pageId, memberId)` | PIC relation added (appended, not replaced) |
| Unassign PIC | `removePicFromBacklog(pageId, memberId)` | PIC relation removed |

---

### TC-NOT-004: Ticket Delete/Restore Operations

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-004 |
| **Description** | Verify archive and restore operations in Notion |
| **Priority** | High |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| Archive ticket | `archiveTicketDirect(pageId)` | Page archived in Notion |
| Restore ticket | `restoreBacklogItem(pageId)` | Page restored from archive |

---

### TC-NOT-005: Project Operations

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-005 |
| **Description** | Verify project listing and detail queries |
| **Priority** | Medium |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| List projects | `listProjects()` | All projects with divisions, HOP, backlog count |
| Search project | `searchProject("landing page")` | Best matching project |
| Project detail | `getProjectDetails("landing page")` | Project info + all related backlog items grouped by status |

---

### TC-NOT-006: Member/Division Queries

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-006 |
| **Description** | Verify member and division listing with filtering |
| **Priority** | Medium |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| List divisions | `listDivisions()` | All 12 divisions |
| List members | `listMembers()` | All members with division IDs |
| Members by division | `getMembersByDivision("ristek")` | Members in Research and Technology |
| Members by unknown division | `getMembersByDivision("xyz")` | Empty array |

---

### TC-NOT-007: Relation Resolution

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-007 |
| **Description** | Verify Notion relation fields are resolved to human-readable names |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| PIC relation | Page with PIC relation IDs | PIC names resolved via `resolvePageTitle()` |
| Division relation | Page with Division relation IDs | Division names resolved |
| Project relation | Page with Project relation IDs | Project names resolved |
| Invalid relation ID | Broken relation ID | "(unknown)" fallback |

---

### TC-NOT-008: Database and Sub-page Operations

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOT-008 |
| **Description** | Verify Notion database creation and sub-page creation |
| **Priority** | Low |

| Case | Operation | Expected Output |
|------|-----------|-----------------|
| Create database | `createDatabase({parent, title, properties})` | New database with Name (title), Status (status), Priority (select) |
| Get schema | `getDatabaseSchema(dbId)` | Database title + property list with types |
| Create sub-page | `createSubPage({parentPageId, title, content})` | New child page under parent |
| Attach image | `appendImageBlock(pageId, url, caption)` | Image block appended to page |

---

## 6. Session Management

### TC-SES-001: Session Creation and Retrieval

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-001 |
| **Description** | Verify session is created for new users and retrieved for returning users |
| **Priority** | Critical |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| New phone number | First message from a number | New session created with userName, empty history |
| Returning user | Second message from same number | Existing session retrieved, lastActivityAt updated |
| Name update | Same number, different pushName | userName updated to new pushName |

---

### TC-SES-002: Conversation History

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-002 |
| **Description** | Verify conversation history is maintained within limits |
| **Priority** | High |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Save user message | Any message | Added to recentMessages with role: "user", timestamp |
| Save assistant response | Any response | Added with role: "assistant", content truncated to 500 chars |
| Max history limit | 15+ messages | Only last 10 turns retained (MAX_HISTORY = 10) |
| Intent tracking | Response with context.intent | session.lastIntent updated |

---

### TC-SES-003: Context Tracking

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-003 |
| **Description** | Verify session tracks context fields for follow-up detection |
| **Priority** | High |

| Case | Context Updated | Session Fields |
|------|----------------|----------------|
| Ticket created | intent, ticketId, ticketName | lastIntent, lastTicketId, lastTicketName |
| Project viewed | project | lastProject, activeProject |
| Division queried | division | lastDivision |
| Member tasks shown | memberName, notionResults | lastMemberName, activeMemberName, lastNotionResults |
| List shown | ticketNames | activeTicketNames |

---

### TC-SES-004: Session TTL (30-minute expiry)

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-004 |
| **Description** | Verify sessions expire after 30 minutes of inactivity |
| **Priority** | High |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Active session | Message within 30 min | Session persists, context retained |
| Expired session | No messages for 30+ min | Session deleted by cleanup interval (every 5 min) |
| After expiry | New message after expiry | Fresh session created, no previous context |

---

### TC-SES-005: Follow-Up Detection

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-005 |
| **Description** | Verify `detectFollowUp()` correctly identifies follow-up patterns |
| **Priority** | High |

| Case | Input | Expected FollowUpType |
|------|-------|----------------------|
| "ya" | `ya` | "confirmation" |
| "tidak" | `tidak` | "confirmation" |
| "ok" | `ok` | "confirmation" |
| "gas" | `gas` | "confirmation" |
| "terus gimana" | `terus gimana` | "continuation" |
| "deadline kapan" | `deadline kapan?` | "question_detail" |
| "siapa pic" | `siapa pic?` | "question_detail" |
| "statusnya" | `statusnya` | "question_detail" |
| "yang tadi" | `yang tadi` | "reference_previous" |
| "ubah status" | `ubah status` | "update_request" |
| New ticket request | `buat tiket baru` | null (creation intent is NOT a follow-up) |
| No prior session | Any message (new user) | null |

---

### TC-SES-006: Context Summary for AI

| Field | Detail |
|-------|--------|
| **TC ID** | TC-SES-006 |
| **Description** | Verify `getContextSummary()` produces useful context for AI prompts |
| **Priority** | Medium |

| Case | Session State | Expected Summary |
|------|---------------|-----------------|
| Empty session | No messages | Empty string |
| Active session | lastIntent, lastTopic, recentMessages | Multi-line string with intent, topic, active entities, last 4 conversation turns |
| Long messages | Messages > 150 chars | Each turn truncated to 150 chars |

---

## 7. Outbound Notifications

### TC-NOTIF-001: PIC Notification on Ticket Creation

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOTIF-001 |
| **Description** | Verify PIC receives WA notification when ticket is created |
| **Priority** | Critical |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| PIC in contacts | Create ticket with PIC "Iqbal Azhari Pasaribu" | WA message sent to Iqbal's phone with ticket title, ID, division, sender name |
| PIC not in contacts | Create ticket with PIC "Unknown Person" | Notification skipped, console log: "PIC tidak ditemukan di contacts — skip notifikasi" |
| Multiple PICs | Create ticket with 2+ PICs | Each PIC notified individually via `setImmediate` (async, non-blocking) |
| Notification failure | WA send fails | Retry 1x, then log error, ticket creation still succeeds |

---

### TC-NOTIF-002: PIC Notification on Ticket Assignment

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOTIF-002 |
| **Description** | Verify PIC receives WA notification when assigned via `!assign` |
| **Priority** | High |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| Assign via command | `!assign TK-xxx iqbal` | WA notification sent to Iqbal |
| Assign via `!pic` | `!assignpic redesign iqbal` | WA notification sent to Iqbal |
| PIC not in contacts | Assign unknown member | Notification skipped |

---

### TC-NOTIF-003: Broadcast to All Members

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOTIF-003 |
| **Description** | Verify broadcast sends personalized task notifications to all members |
| **Priority** | Medium |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| Normal broadcast | "kirim notifikasi ke semua anggota" | Each member with active tasks receives personal WA message with their task list |
| Member with no tasks | Contact with 0 active tasks | Skipped (no message sent), counted in "noTasks" |
| Invalid phone number | Contact with missing/short phone | Skipped, counted in "skipped" |
| Send failure | WA API error for one member | Counted in "failed", other members still processed |
| Rate limiting | Broadcasting to 100+ contacts | 1-second delay between each send to avoid spam detection |
| Summary returned | After broadcast completes | Summary with total, notified, noTasks, failed, skipped counts |

---

### TC-NOTIF-004: Direct Message to Member

| Field | Detail |
|-------|--------|
| **TC ID** | TC-NOTIF-004 |
| **Description** | Verify "kirim pesan ke <name>" sends task info + WA notification |
| **Priority** | Medium |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Known member | `kirim pesan ke faza` | Shows Faza's tasks + sends WA notification to Faza's phone |
| Member not in contacts | `kirim pesan ke xyzperson` | Shows tasks but notes "nomor WA belum ada di database" |
| Member with no tasks | `kirim pesan ke <member with no tasks>` | "belum punya tugas yang di-assign" message |

---

## 8. Contact Lookup Service

### TC-CONTACT-001: Phone Number Lookup

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CONTACT-001 |
| **Description** | Verify `findNameByPhone()` resolves phone numbers to contacts |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Exact match | `6281234567890` | Contact object with name, phone, nickname |
| With country code | `+6281234567890` | Same result (normalized) |
| With leading 0 | `081234567890` | Same result (0 → 62) |
| With spaces/dashes | `+62 812-3456-7890` | Same result (cleaned) |
| Unknown number | `6289999999999` | null |
| Empty input | `` | null |

---

### TC-CONTACT-002: Name to Phone Lookup

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CONTACT-002 |
| **Description** | Verify `findPhoneByName()` resolves names to phone numbers |
| **Priority** | High |

| Case | Input | Expected Output |
|------|-------|-----------------|
| Full name exact | `Iqbal Azhari Pasaribu` | Contact with phone number |
| Nickname exact | `iqbal` | Same result |
| Partial name | `Iqbal` | Same result (contains match) |
| Case insensitive | `IQBAL` | Same result |
| Unknown name | `xyzperson` | null |

---

### TC-CONTACT-003: Display Name Resolution

| Field | Detail |
|-------|--------|
| **TC ID** | TC-CONTACT-003 |
| **Description** | Verify `resolveDisplayName()` returns the best available name |
| **Priority** | Medium |

| Case | Input (phone, pushName) | Expected Output |
|------|-------------------------|-----------------|
| Known phone | (valid phone, any pushName) | Full name from contacts |
| Unknown phone, known pushName | (null, "Iqbal") | Full name from pushName lookup |
| Unknown both | (null, "UnknownPerson123") | "UnknownPerson123" (raw pushName) |

---

## 9. Pending Ticket Conversation State

### TC-PEND-001: Unresolved PIC Flow

| Field | Detail |
|-------|--------|
| **TC ID** | TC-PEND-001 |
| **Description** | Verify conversation state for unresolved PIC names during ticket creation |
| **Priority** | High |

| Step | Input | Expected Output |
|------|-------|-----------------|
| 1. Create with unknown PIC | `buat tiket redesign, assign ke xyzperson` | "ada nama yang belum aku kenali: *xyzperson* — nama lengkapnya siapa ya?" |
| 2. Provide full name | `Andi Fauzan H` | PIC resolved, ticket created, confirmation message |
| 2b. Still unknown | `another unknown` | "Hmm, tetap gak nemu nih... Coba kasih nama lengkapnya ya, atau ketik *batal*" |
| 3. Cancel | `batal` | "Oke, pembuatan tiket dibatalkan." |
| TTL expiry | Wait 5+ minutes | Pending ticket auto-cleaned, next message treated as new conversation |

---

### TC-PEND-002: Multiple Unresolved PICs

| Field | Detail |
|-------|--------|
| **TC ID** | TC-PEND-002 |
| **Description** | Verify sequential resolution of multiple unresolved PICs |
| **Priority** | Medium |

| Step | Input | Expected Output |
|------|-------|-----------------|
| 1. Create with 2 unknown PICs | `buat tiket, assign ke abc dan xyz` | "ada nama yang belum aku kenali: *abc* — nama lengkapnya siapa ya?" |
| 2. Resolve first | `Andi Fauzan H` | "Oke, Andi Fauzan H sudah aku temukan! Masih ada yang belum aku kenali: *xyz*" |
| 3. Resolve second | `Iqbal Azhari Pasaribu` | All resolved, ticket created |

---

## 10. AI Client (Anthropic)

### TC-AI-001: API Call and Response

| Field | Detail |
|-------|--------|
| **TC ID** | TC-AI-001 |
| **Description** | Verify Anthropic API calls succeed and return valid responses |
| **Priority** | Critical |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Successful call | Valid messages array | Response with content[0].type === "text" |
| Token logging | Any call | CSV log entry in logs/ai-calls.csv with timestamp, model, tokens, inference_ms, caller |
| Stats tracking | Multiple calls | Cumulative stats via `getAIStats()` |

---

### TC-AI-002: Retry Logic

| Field | Detail |
|-------|--------|
| **TC ID** | TC-AI-002 |
| **Description** | Verify retry logic handles transient API errors |
| **Priority** | High |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| 429 Rate limit | API returns 429 | Retry after 2s, then 5s, then 10s (max 3 retries) |
| 500 Server error | API returns 500 | Same retry behavior |
| 400 Bad request | API returns 400 | No retry, throw immediately |
| All retries fail | 429 on all attempts | Throw last error |

---

## 11. Group Chat Behavior

### TC-GRP-001: Bot Mentioned in Group

| Field | Detail |
|-------|--------|
| **TC ID** | TC-GRP-001 |
| **Description** | Verify bot responds only when mentioned in group chats |
| **Priority** | High |

| Case | Context | Expected Behavior |
|------|---------|-------------------|
| Bot mentioned | isGroup=true, isBotMentioned=true | Process message through smart message handler |
| Bot not mentioned | isGroup=true, isBotMentioned=false | Return empty string (ignore) |
| DM | isGroup=false | Always process message |

---

## 12. Edge Cases and Error Handling

### TC-EDGE-001: Rapid Messages

| Field | Detail |
|-------|--------|
| **TC ID** | TC-EDGE-001 |
| **Description** | Verify bot handles rapid successive messages |
| **Priority** | Medium |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| 5 messages in 1 second | Multiple messages | Each processed independently, session state updates sequentially |
| Overlapping commands | `!stats` then `!list` within 1s | Both processed, session reflects last response |

---

### TC-EDGE-002: Very Long Message

| Field | Detail |
|-------|--------|
| **TC ID** | TC-EDGE-002 |
| **Description** | Verify bot handles very long messages |
| **Priority** | Low |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| 2000-word message | Long essay about a task | AI extracts relevant intent, creates ticket or responds succinctly |
| Session truncation | Long response | Saved to session truncated at 500 chars |

---

### TC-EDGE-003: Notion API Errors

| Field | Detail |
|-------|--------|
| **TC ID** | TC-EDGE-003 |
| **Description** | Verify graceful handling of Notion API failures |
| **Priority** | High |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| Notion timeout | API call times out | "Waduh, gagal ambil data nih... Coba lagi nanti ya!" |
| Invalid database ID | Missing NOTION_MASTER_BACKLOG_ID | Error thrown with clear message |
| Permission denied | Bot lacks Notion access | "Gagal membuat database. Pastikan parent page ID valid dan bot punya akses." |
| Rate limited | Notion API 429 | Retry via notion-api-core retry logic |

---

### TC-EDGE-004: Malformed AI Response

| Field | Detail |
|-------|--------|
| **TC ID** | TC-EDGE-004 |
| **Description** | Verify bot handles unparseable AI responses |
| **Priority** | Medium |

| Case | Scenario | Expected Behavior |
|------|----------|-------------------|
| Non-JSON response | AI returns plain text | `extractJSON()` returns null, falls through to `handleChat()` |
| Missing fields | AI returns `{is_ticket: true}` without judul | judul defaults to "Tiket Baru" |
| Empty response | AI returns empty string | Falls through to `handleChat()` |

---

### TC-EDGE-005: Casual Response Wrapper

| Field | Detail |
|-------|--------|
| **TC ID** | TC-EDGE-005 |
| **Description** | Verify `addCasualTouch()` wraps system responses appropriately |
| **Priority** | Low |

| Case | Input | Expected Behavior |
|------|-------|-------------------|
| Short message (<30 chars) | "Done." | Not wrapped (returned as-is) |
| Help text | Message containing "Oro Bot" | Not wrapped (already formatted) |
| Long system message | Stats output | Wrapped with casual opening via AI |
| AI wrap failure | Anthropic API error | Fallback: "Sip, nih {pushName}!\n\n" + original message |

---

## Test Execution Priority Matrix

### P0 — Critical (Must Pass Before Release)

| TC IDs | Feature |
|--------|---------|
| TC-CMD-001, TC-CMD-020, TC-CMD-021, TC-CMD-022 | Core commands: help, list, stats, close |
| TC-NLP-001, TC-NLP-010 | Ticket creation and query/ticket disambiguation |
| TC-DIV-001 | Division alias resolution (all 12 divisions) |
| TC-NICK-001 | Member nickname resolution |
| TC-NOT-001, TC-NOT-002 | Notion CRUD: create and read |
| TC-SES-001, TC-SES-004 | Session creation and TTL |
| TC-NOTIF-001 | PIC notification on ticket creation |
| TC-AI-001 | Anthropic API connectivity |

### P1 — High (Should Pass Before Release)

| TC IDs | Feature |
|--------|---------|
| TC-CMD-002 through TC-CMD-007, TC-CMD-011, TC-CMD-016, TC-CMD-017, TC-CMD-024, TC-CMD-025, TC-CMD-030 | All remaining high-priority commands |
| TC-NLP-002 through TC-NLP-005 | Self-reference, member lookup, division detection, follow-ups |
| TC-DIV-002 | Alias edge cases |
| TC-NICK-002 | Fuzzy matching |
| TC-NOT-003, TC-NOT-004, TC-NOT-007 | Update, delete/restore, relation resolution |
| TC-SES-002, TC-SES-003, TC-SES-005 | History, context, follow-up detection |
| TC-NOTIF-002 | PIC notification on assignment |
| TC-CONTACT-001, TC-CONTACT-002 | Contact lookup |
| TC-PEND-001 | Unresolved PIC flow |
| TC-GRP-001 | Group chat behavior |
| TC-EDGE-003 | Notion API error handling |
| TC-AI-002 | Retry logic |

### P2 — Medium (Should Pass Before Production)

| TC IDs | Feature |
|--------|---------|
| TC-CMD-008 through TC-CMD-010, TC-CMD-012 through TC-CMD-015, TC-CMD-018, TC-CMD-019 | Medium-priority commands |
| TC-NLP-006, TC-NLP-007, TC-NLP-008 | Greetings, stats NL, broadcast |
| TC-NICK-003 | Partial match |
| TC-NOT-005, TC-NOT-006 | Project and member queries |
| TC-SES-006 | Context summary |
| TC-NOTIF-003, TC-NOTIF-004 | Broadcast and direct message |
| TC-CONTACT-003 | Display name resolution |
| TC-PEND-002 | Multiple unresolved PICs |
| TC-EDGE-001, TC-EDGE-004 | Rapid messages, malformed AI |

### P3 — Low (Nice to Have)

| TC IDs | Feature |
|--------|---------|
| TC-CMD-026 through TC-CMD-029 | Database, schema, subpage, image commands |
| TC-NOT-008 | Database and sub-page operations |
| TC-EDGE-002, TC-EDGE-005 | Long messages, casual wrapper |

---

*Update status setiap test execution. Mark PASS/FAIL dan catat actual results.*
