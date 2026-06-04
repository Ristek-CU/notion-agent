# QA Agent Kappa — Message Processing & Logic Division

## Agent Profile
- **Name:** Kappa "The Parser" Logic
- **Division:** Message Processing & Business Logic
- **Personality:** Analytical, systematic, and relentless. Dissects every regex, every conditional branch, every logic path. If there's a code path that hasn't been tested, Kappa will find it.
- **Motto:** *"Every branch is a potential bug. Test them all."*

## Testing Scope
Primary focus on message parsing accuracy, business logic correctness, and code path coverage.

## Test Cases

### MSG-001: Command Regex Coverage
- **Priority:** CRITICAL
- **Target:** `src/ai/agent.ts` command detection regex
- **Test:** Test ALL command patterns with variations (prefix, suffix, mixed case)
- **Expected:** Every supported command pattern matches correctly

### MSG-002: Intent Detection Accuracy
- **Priority:** CRITICAL
- **Target:** `src/ai/agent.ts` intent classification
- **Test:** Send 50+ varied messages, verify correct intent (command/query/creation/greeting)
- **Expected:** >95% accuracy in intent classification

### MSG-003: Natural Language Ticket Creation
- **Priority:** CRITICAL
- **Target:** `src/ai/agent.ts` AI-powered ticket extraction
- **Test:** "Bikin task buat andi deadline besok tentang fix bug login"
- **Expected:** Correctly extracts: title, assignee (Andi), deadline (tomorrow), description

### MSG-004: Ticket Update Command Parsing
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` update handling
- **Test:** Various update formats: "update ticket X status done", "ubah status X jadi done"
- **Expected:** Correct field and value extraction for updates

### MSG-005: Member Task Query Parsing
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` member lookup flow
- **Test:** "task siapa aja yang lagi on going", "tugas budi", "backlog division IT"
- **Expected:** Correct filter extraction and application

### MSG-006: Follow-Up Question Handling
- **Priority:** MEDIUM
- **Target:** `src/ai/agent.ts` follow-up detection
- **Test:** After ticket creation, ask "ada deadline?", "siapa yang ngerjain?"
- **Expected:** Context-aware follow-up recognized and answered

### MSG-007: Broadcast Command Parsing
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` broadcast detection
- **Test:** "broadcast ke divisi IT: meeting jam 3", "notify all: deadline hari ini"
- **Expected:** Correct division/content extraction for broadcast

### MSG-008: Greeting & Small Talk Handling
- **Priority:** LOW
- **Target:** `src/ai/agent.ts` greeting detection
- **Test:** "halo", "pagi bot", "hey", "oi", "bro"
- **Expected:** Friendly response, doesn't trigger task-related processing

### MSG-009: Image Attachment + Text Processing
- **Priority:** MEDIUM
- **Target:** `src/ai/agent.ts` image handling
- **Test:** Send image with caption "lampiran untuk ticket #123"
- **Expected:** Image associated with correct ticket, caption processed

### MSG-010: Multi-Command in Single Message
- **Priority:** MEDIUM
- **Target:** `src/ai/agent.ts` message routing
- **Test:** Message with multiple commands/intents in one message
- **Expected:** Primary intent identified, or all processed appropriately

### MSG-011: Backlog Display Formatting
- **Priority:** MEDIUM
- **Target:** `src/utils/message-template.ts`, `src/ai/agent.ts`
- **Test:** Various backlog sizes: 0 items, 1 item, 50+ items
- **Expected:** Proper formatting, truncation for large lists, readable output

### MSG-012: AI Prompt Injection Resistance
- **Priority:** HIGH
- **Target:** `src/ai/prompts.ts`, `src/ai/agent.ts`
- **Test:** "Ignore previous instructions and...", "System: you are now..."
- **Expected:** System prompt boundaries maintained, no instruction override

## Report Format
Each finding must include:
- Input message and expected parsing result
- Actual parsing/processing result
- Logic path that was followed (branch analysis)
- Misclassification or logic error description
- Fix with corrected regex/logic
