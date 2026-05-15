# User Stories & Backlog
## Oro Bot — WhatsApp + Notion AI Assistant for SGA Cakrawala Universe

---

## Target Users

| Persona | Role | Typical Usage |
|---------|------|---------------|
| Anggota SGA | Regular member | Create tickets, check own tasks, search backlog via WhatsApp |
| Ketua/Co-Ketua SGA | Leadership | View backlog statistics, broadcast notifications, manage priorities |
| Head of Division | Division head | View division backlog, assign PIC, update status, bulk operations |
| Tim Ristek | Developer | Monitor AI usage, debug issues, manage cache, maintain bot |

---

## US-001: Create Ticket via WhatsApp Natural Language

**As an** Anggota SGA,
**I want to** create a ticket by describing it in natural language via WhatsApp,
**So that** I can log work items without opening Notion.

**Acceptance Criteria:**
1. Given I send `"buat tiket untuk ristek, fix bug navbar, assign ke iqbal, deadline 15 mei"`, When processed by AI, Then a backlog item is created in Notion Master Backlog with title "Fix Bug Navbar", division "Research and Technology", PIC "Iqbal Azhari Pasaribu", deadline "2026-05-15", and I receive the ticket ID (format `TK-YYYYMMDD-NNN`) and Notion URL
2. Given the AI rephrases my casual message into a professional Notion description, When the ticket is created, Then the description field contains a properly structured write-up — not a copy-paste of my original message
3. Given I provide insufficient data (e.g., only a title), When processed, Then the ticket is still created with available data; the bot does NOT ask for confirmation before creating
4. Given a PIC name cannot be resolved (not in member database), When the ticket is being created, Then the bot saves conversation state (5-minute TTL) and asks for the full name; once provided, it completes the ticket creation
5. Given I type `"batal"` or `"cancel"` during pending PIC resolution, When processed, Then the pending ticket is discarded and I receive a cancellation confirmation

**Command Format:** Natural language (no prefix required) — AI auto-detects creation intent via keywords like "buat", "bikin", "tambah", "create"
**Priority:** P0 | **Status:** Live

---

## US-002: Check My Assigned Tasks

**As an** Anggota SGA,
**I want to** check tasks assigned to me by saying "tugas gw" or similar,
**So that** I know what I need to work on without opening Notion.

**Acceptance Criteria:**
1. Given I send `"tugas gw dong"`, `"cek backlog saya"`, or `"tugas aku"`, When processed, Then the bot resolves my phone number to my full name via contacts database and queries Notion backlog for items where I am PIC
2. Given I send `"cek backlog dong"` (short query with particle), When processed, Then the bot treats this as a self-reference query and shows my tasks
3. Given I send `"tugas farhan"`, When processed, Then the bot shows Farhan's tasks (not mine) — explicit name takes priority over self-reference
4. Given my phone number is not in the contacts database, When I use a self-reference pronoun, Then the bot responds that my number is not registered and suggests contacting admin
5. Given I have more than 20 tasks, When results are displayed, Then only the first 20 are shown with a "...dan N item lainnya" suffix

**Command Format:** `!tugas <nama>` (explicit) or natural language: `"tugas gw"`, `"backlog saya"`, `"cek tugas aku"`
**Priority:** P0 | **Status:** Live

---

## US-003: Search Backlog by Keyword

**As an** Anggota SGA,
**I want to** search the backlog by keyword,
**So that** I can find specific items quickly.

**Acceptance Criteria:**
1. Given I send `!backlog search navbar`, When processed, Then all backlog items whose title contains "navbar" are returned with status, priority, project, and Notion URL
2. Given no items match the keyword, When processed, Then the bot responds with a suggestion to try a different keyword or use `!list`
3. Given more than 15 results match, When displayed, Then only the first 15 are shown with a "...dan N item lainnya" suffix
4. Given I use natural language like `"cari backlog yang ada kata landing page"`, When processed, Then the AI routes this as a keyword search query

**Command Format:** `!backlog search <keyword>` or `!backlog cari <keyword>` or natural language
**Priority:** P0 | **Status:** Live

---

## US-004: Check Ticket Status by ID

**As an** Anggota SGA,
**I want to** check a ticket's status by its ID,
**So that** I can track progress on specific items.

**Acceptance Criteria:**
1. Given I send `status TK-20260426-001`, `cek TK-20260426-001`, or `info TK-20260426-001`, When processed, Then the bot returns the ticket name, current status, priority, and Notion URL
2. Given the ticket ID does not exist, When processed, Then the bot responds "Tiket TK-XXXXXXXX-XXX tidak ditemukan" with a reminder of the correct format
3. Given I send `!detail TK-20260426-001`, When processed, Then the bot returns full ticket detail including description content (up to 500 chars) and recent comments

**Command Format:** `status TK-XXXXXXXX-XXX`, `cek TK-XXXXXXXX-XXX`, `info TK-XXXXXXXX-XXX`, `!detail <ticket-name-or-ID>`
**Priority:** P0 | **Status:** Live

---

## US-005: See All Available Commands

**As an** Anggota SGA,
**I want to** see all available commands via `!help`,
**So that** I know what the bot can do.

**Acceptance Criteria:**
1. Given I send `!help` or `!bantuan`, When processed, Then the bot returns a formatted help message listing all commands organized by category (most used, ticket creation, backlog management, etc.)
2. Given I send `"panduan"`, `"bantuan"`, `"cara pakai"`, or `"help"` (without `!`), When processed via AI, Then the bot also returns the help message
3. Given the help message is displayed, Then it includes a tip that using `!` commands is faster and more token-efficient than natural language

**Command Format:** `!help`, `!bantuan`, or natural language: `"panduan"`, `"cara pakai oro"`
**Priority:** P0 | **Status:** Live

---

## US-006: Add Notes and Comments to Tickets

**As an** Anggota SGA,
**I want to** add notes or comments to existing tickets,
**So that** I can provide updates and context.

**Acceptance Criteria:**
1. Given I send `!note redesign Sudah selesai bagian header`, When processed, Then a note block is appended to the "Redesign Landing Page SGA" ticket page in Notion with my name as author
2. Given I send `!comment redesign Progress bagus, lanjut!`, When processed, Then a comment is appended prefixed with `[pushName]` to the ticket's Notion page
3. Given the ticket name does not match any backlog item, When processed, Then the bot responds "Tiket '...' tidak ditemukan"
4. Given I omit the note/comment text, When processed, Then the bot responds with the correct format: `!note <nama tiket> <catatan>`

**Command Format:** `!note <ticket-name> <text>`, `!catatan <ticket-name> <text>`, `!comment <ticket-name> <text>`, `!komentar <ticket-name> <text>`
**Priority:** P0 | **Status:** Live

---

## US-007: View Backlog Statistics

**As a** Ketua/Co-Ketua SGA,
**I want to** see backlog statistics via `!stats`,
**So that** I can track overall organizational progress.

**Acceptance Criteria:**
1. Given I send `!stats` or `!statistik`, When processed, Then the bot returns: total item count, breakdown by status (Not started, In Progress, Complete, Blocking), breakdown by priority (High, Medium, Low), and breakdown by division
2. Given I send `"statistik backlog"` or `"stats backlog"` (natural language), When processed, Then the AI routes to the same stats handler
3. Given the backlog is empty, When processed, Then the bot responds "Gagal mengambil statistik" or shows zero counts
4. Given divisions are listed, When displayed, Then they are sorted by count (highest first)

**Command Format:** `!stats`, `!statistik`, or natural language: `"statistik backlog"`, `"ringkasan backlog"`, `"stats"`
**Priority:** P0 | **Status:** Live

---

## US-008: View All Projects and Their Status

**As a** Ketua/Co-Ketua SGA,
**I want to** see all projects and their status,
**So that** I can manage priorities across the organization.

**Acceptance Criteria:**
1. Given I send `!projects`, When processed, Then all projects are listed with division, Head of Project, and backlog count
2. Given I send `!project landing page`, When processed, Then the bot returns project details including all related backlog items grouped by status (Not started, In progress, etc.)
3. Given I send `"progress project web sga gimana"` (natural language), When processed, Then the AI detects project intent and routes to the project detail handler
4. Given a project name is not found, When processed, Then the bot responds "Project '...' tidak ditemukan" and suggests `!projects` to see all

**Command Format:** `!projects`, `!project <name>`, or natural language: `"detail project X"`, `"progress project X"`
**Priority:** P0 | **Status:** Live

---

## US-009: View Division Backlog

**As a** Head of Division,
**I want to** see my division's backlog,
**So that** I can assign tasks and manage workload.

**Acceptance Criteria:**
1. Given I send `!backlog divisi ristek`, When processed, Then all backlog items for "Research and Technology" division are returned with status, priority, and Notion URL
2. Given I send `!list ristek`, When processed, Then backlog items matching "ristek" keyword are returned
3. Given I send `"cek backlog ristek"` (natural language), When processed, Then the AI detects the division alias and routes to the division backlog handler
4. Given I send `!backlog status "In progress"`, When processed, Then all backlog items with status "In progress" are returned regardless of division

**Command Format:** `!backlog divisi <name>`, `!backlog division <name>`, `!backlog dept <name>`, `!list <dept>`, or natural language
**Priority:** P0 | **Status:** Live

---

## US-010: Assign PIC to Backlog Items

**As a** Head of Division,
**I want to** assign PIC to backlog items,
**So that** tasks are distributed among team members.

**Acceptance Criteria:**
1. Given I send `!pic redesign iqbal`, When processed, Then "Iqbal Azhari Pasaribu" is added as PIC to the backlog item matching "redesign" and a WhatsApp notification is sent to Iqbal
2. Given I send `!assign TK-20260426-001 farhan`, When processed, Then "Farhan Athalla Azis" is assigned as PIC and a comment is added to the ticket noting the assignment
3. Given the member name is not found in the database, When processed, Then the bot responds "Member '...' tidak ditemukan di database"
4. Given I send `!removepic redesign iqbal`, When processed, Then Iqbal is removed from the PIC relation of that ticket

**Command Format:** `!pic <ticket-name> <member>`, `!assignpic <ticket-name> <member>`, `!assign TK-xxx <member>`, `!removepic <ticket-name> <member>`, `!unassignpic <ticket-name> <member>`
**Priority:** P0 | **Status:** Live

---

## US-011: Update Ticket Status

**As a** Head of Division,
**I want to** update ticket status,
**So that** progress is tracked accurately.

**Acceptance Criteria:**
1. Given I send `!update TK-20260426-001 status In progress`, When processed, Then the ticket's status is updated to "In progress" in Notion and I receive a confirmation with the Notion URL
2. Given I send `!backlog update redesign status Done`, When processed, Then the first backlog item matching "redesign" has its status updated
3. Given I send `!close TK-20260426-001`, When processed, Then the ticket status is set to "Done"
4. Given I send `!update TK-xxx prioritas High`, When processed, Then the ticket's priority is updated to "High"
5. Given an invalid status value is provided, When processed, Then the AI parses the update request and maps it to the closest valid status value

**Valid Status Values:** Not started, In progress, Need to review, Need to fix, Done, Blocking
**Command Format:** `!update TK-xxx status <value>`, `!update TK-xxx prioritas <value>`, `!backlog update <name> status <value>`, `!close TK-xxx`, `!selesai TK-xxx`, `!done TK-xxx`
**Priority:** P0 | **Status:** Live

---

## US-012: Bulk Update Backlog Status

**As a** Head of Division,
**I want to** bulk update backlog status,
**So that** I can manage multiple items at once.

**Acceptance Criteria:**
1. Given I send `!backlog bulk "Not started" ke "In progress"`, When processed, Then all backlog items with status "Not started" are updated to "In progress"
2. Given I send `!backlog bulk "In progress" to "Done" ristek`, When processed, Then only items in "Research and Technology" division with "In progress" status are updated to "Done"
3. Given the bulk update completes, When the response is returned, Then it includes: count of updated items, count of errors (if any), and executor name
4. Given I omit the target status, When processed, Then the bot responds with the correct format: `!backlog bulk <status_lama> ke <status_baru> [divisi]`

**Command Format:** `!backlog bulk <from_status> to <to_status> [division]`, `!backlog masal <from_status> ke <to_status> [division]`
**Priority:** P1 | **Status:** Live

---

## US-013: Use Division Aliases

**As any** user,
**I want to** use division aliases like "ristek" instead of full names,
**So that** I can interact with the bot quickly.

**Acceptance Criteria:**
1. Given I type `"ristek"` in any command or message, When resolved, Then it maps to "Research and Technology"
2. Given I type `"bnp"`, When resolved, Then it maps to "Business And Partnership"
3. Given I type `"pcr"`, `"pubcom"`, or `"PR"`, When resolved, Then all map to "Public and Community Relations"
4. Given I type `"advo"` or `"saw"`, When resolved, Then both map to "Student Advocacy and Welfare"
5. Given I type an unrecognized alias, When processed, Then the bot attempts fuzzy matching against all 12 divisions and their known aliases (80+ aliases total)

**Supported Aliases (partial list):**
- Research and Technology: ristek, tech, teknologi, IT, R&D, dev
- Media and Information: media, minfo, medinfo, informasi, konten
- Public and Community Relations: PCR, pubcom, PR, humas, eksternal
- Business And Partnership: BNP, bisnis, partnership, sponsor
- Intellectual & Career Development: ICD, karir, pelatihan, career
- Student Advocacy and Welfare: advo, advokasi, SAW
- Treasurer: treasurer, keuangan, finance, bendahara
- Controller: controller, controker, kontrol, audit
- Secretary: secretary, sekretaris, sec, administrasi
- Executive: executive, eksekutif, strategi
- BPH: bph, badan pengurus harian, board

**Priority:** P0 | **Status:** Live

---

## US-014: Use Member Nicknames

**As any** user,
**I want to** use member nicknames like "ojan" instead of full names,
**So that** I can assign PIC and query tasks quickly.

**Acceptance Criteria:**
1. Given I type `"assign ke iqbal"` in a ticket creation message, When resolved, Then the bot maps "iqbal" to "Iqbal Azhari Pasaribu" and sets him as PIC
2. Given I type `"tugas farhan"`, When resolved, Then the bot maps "farhan" to "Farhan Athalla Azis" and queries his backlog items
3. Given I type a nickname with a typo (e.g., "iqbl"), When resolved, Then the bot uses fuzzy matching (Levenshtein distance) to find the closest member
4. Given a nickname maps to multiple members, When resolved, Then the first exact match is used; if no exact match, the first partial match is returned
5. Given I type a full name, When resolved, Then the bot matches directly without nickname lookup

**Examples:** "ojan" -> "Andi Fauzan H", "mika" -> "Aldridge Mika Gunawan", "nyssa" -> "Nyssa Mutiara Syakieb", "teo" -> "Stepanus Teo"
**Priority:** P0 | **Status:** Live

---

## US-015: Receive WhatsApp Notification When Assigned as PIC

**As any** user,
**I want to** receive a WhatsApp notification when I'm assigned as PIC,
**So that** I'm immediately aware of new responsibilities.

**Acceptance Criteria:**
1. Given a ticket is created with me as PIC, When the ticket is saved to Notion, Then I receive a WhatsApp message with: ticket title, ticket ID, division, creator name, and creation date
2. Given I am assigned to an existing ticket via `!assign` or `!pic`, When the assignment is saved, Then I receive a WhatsApp notification about the new assignment
3. Given my phone number is not in the contacts database, When the bot tries to notify me, Then the notification is silently skipped and logged
4. Given the WhatsApp send fails, When the retry logic executes, Then the system retries once; if it still fails, the error is logged but the ticket operation still succeeds

**Priority:** P0 | **Status:** Live

---

## US-016: Broadcast Task Notifications to All Members

**As a** Ketua/Co-Ketua SGA,
**I want to** broadcast notifications to all members about their tasks,
**So that** everyone is reminded of their active work items.

**Acceptance Criteria:**
1. Given I send `"kirim notifikasi ke semua anggota tentang tugasnya"`, When processed, Then the bot iterates through all contacts and sends each member a personalized WhatsApp message listing only their active (not Done) tasks
2. Given a member has no active tasks, When the broadcast processes them, Then they are skipped (no empty message sent)
3. Given the broadcast completes, When the summary is returned, Then it shows: total contacts, notified count, skipped (no tasks) count, failed count, and invalid phone count
4. Given messages are being sent in bulk, When the bot sends each message, Then there is a 1-second delay between sends to avoid WhatsApp spam detection
5. Given a member's phone number is invalid (< 10 digits), When processed, Then they are counted as "skipped (invalid phone)" and no message is sent

**Trigger Patterns:** `"broadcast task ke semua member"`, `"kirim semua notifikasi ke semua anggota"`, `"notifikasi semua anggota tentang tugasnya"`, or any message containing "masing masing" / "sesuai tugasnya"
**Priority:** P1 | **Status:** Live

---

## US-017: Use Follow-Up Questions in Conversation

**As any** user,
**I want to** ask follow-up questions referencing previous conversation context,
**So that** I can drill into details without repeating myself.

**Acceptance Criteria:**
1. Given I previously asked about a ticket and now send `"deadline kapan"`, When processed, Then the bot references the last Notion results from my session and shows deadlines for those items
2. Given I send `"siapa pic"`, `"pic siapa"`, or `"assign ke siapa"`, When processed, Then the bot shows PIC information for items from the previous query
3. Given I send `"linknya"` or `"urlnya"`, When processed, Then the bot returns Notion URLs from the last query results
4. Given I send `"yang tadi"` or `"yang itu"`, When processed, Then the bot references the last conversation topic and asks what I want to know about it
5. Given I send `"detailnya"`, When processed, Then the bot fetches full detail for the last referenced ticket
6. Given my session has expired (30-minute TTL), When I send a follow-up, Then the bot treats it as a new message and asks for clarification

**Follow-Up Types Detected:** `reference_previous` ("yang tadi", "itu"), `question_detail` ("deadline kapan", "siapa pic"), `confirmation` ("ya", "tidak"), `continuation` ("terus gimana"), `update_request` ("ubah statusnya")
**Priority:** P0 | **Status:** Live

---

## US-018: Attach Images to Tickets

**As any** user,
**I want to** attach images to tickets,
**So that** I can provide visual context (screenshots, mockups, etc.).

**Acceptance Criteria:**
1. Given I send `!image redesign https://example.com/screenshot.png`, When processed, Then the image is appended as an image block to the matching ticket's Notion page
2. Given I send an image via WhatsApp with a caption referencing a ticket name, When processed, Then the bot auto-matches the caption text to an existing backlog item and attaches the image
3. Given the image URL is invalid or inaccessible, When processed, Then the bot responds "Gagal melampirkan gambar. Pastikan URL gambar valid dan bisa diakses."
4. Given the ticket name does not match, When processed, Then the bot responds "Tiket '...' tidak ditemukan"

**Command Format:** `!image <ticket-name> <url>`, `!gambar <ticket-name> <url>`, or send image via WhatsApp with descriptive caption
**Priority:** P1 | **Status:** Live

---

## US-019: Use Bot in Group Chats with @Mention

**As any** user,
**I want to** use the bot in group chats by @mentioning it,
**So that** I can interact with Oro in shared team channels.

**Acceptance Criteria:**
1. Given I @mention the bot in a group chat, When the webhook receives the message, Then the bot processes it and replies in the group (not DM)
2. Given I send a message in a group WITHOUT @mentioning the bot, When processed, Then the bot ignores the message (returns empty string)
3. Given the bot's JID is auto-fetched from Evolution API at startup, When a message arrives, Then `contextInfo.mentionedJid` is checked against the bot's JID
4. Given the @mention text is embedded in the message, When processed, Then the mention text is stripped before the message is analyzed

**Priority:** P1 | **Status:** Live

---

## US-020: Bot Greeting and Capability Introduction

**As any** user,
**I want to** be greeted by the bot and learn its capabilities,
**So that** I know how to start using it.

**Acceptance Criteria:**
1. Given I send `"halo"`, `"hai"`, `"hi"`, `"hello"`, `"hey"`, `"pagi"`, `"siang"`, `"sore"`, or `"malam"` (<= 25 chars), When processed, Then the bot responds with a time-appropriate greeting (Selamat pagi/siang/sore/malam) followed by a brief introduction: "Aku Roro, bot asisten SGA" and a summary of capabilities (create tickets, check project progress, view tasks per division)
2. Given I send `"siapa kamu"` or `"halo bot siapa kamu"`, When processed by AI, Then the bot responds "Halo! Aku Oro, bot asisten SGA Cakrawala Universe" with a brief capability overview
3. Given I send a greeting at 08:00, When processed, Then the greeting includes "Selamat pagi"; at 14:00 it includes "Selamat siang"; at 20:00 it includes "Selamat malam"
4. Given the greeting response, When displayed, Then it includes a tip to type `!help` for the full command list

**Priority:** P1 | **Status:** Live

---

## Backlog Summary

### By Priority

| Priority | Count | Stories |
|----------|-------|---------|
| **P0** | 14 | US-001 through US-015 (excl. US-012) |
| **P1** | 6 | US-012, US-016, US-018, US-019, US-020 |
| **Total** | 20 | All live |

### By Target User

| Target User | Stories |
|-------------|---------|
| Anggota SGA | US-001, US-002, US-003, US-004, US-005, US-006 |
| Ketua/Co-Ketua | US-007, US-008, US-016 |
| Head of Division | US-009, US-010, US-011, US-012 |
| Any User | US-013, US-014, US-015, US-017, US-018, US-019, US-020 |

### By Status

| Status | Count |
|--------|-------|
| **Live** | 20 |
| **Planned** | 0 |

---

*All user stories reflect the actual Oro Bot implementation as of version 2.0.0 (2026-05-15). Every story listed above is live in production.*
