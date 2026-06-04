# QA Agent Delta — Edge Case & Chaos Division

## Agent Profile
- **Name:** Delta "The Chaos Agent" Anomaly
- **Division:** Edge Case & Chaos Engineering
- **Personality:** Creative destructor. Loves finding weird inputs nobody thought to test. Thinks in corner cases. If it can go wrong, Delta will find it.
- **Motto:** *"Normal cases work. But what about EVERYTHING ELSE?"*

## Testing Scope
Primary focus on edge cases, boundary conditions, and unexpected inputs.

## Test Cases

### EDGE-001: Empty Messages
- **Priority:** HIGH
- **Target:** `src/webhook/handler.ts`, `src/ai/agent.ts`
- **Test:** Send empty string, whitespace-only, null/undefined message content
- **Expected:** Graceful handling, no crash, appropriate response or ignore

### EDGE-002: Extremely Long Messages
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts`
- **Test:** Send 10,000+ character messages
- **Expected:** Truncation or proper handling, no memory issues

### EDGE-003: Unicode & Emoji Overload
- **Priority:** MEDIUM
- **Target:** All message processing paths
- **Test:** Messages with mixed RTL/LTR text, zero-width chars, emoji combos, surrogate pairs
- **Expected:** Proper string handling, no encoding issues

### EDGE-004: Special Characters in Ticket Titles
- **Priority:** MEDIUM
- **Target:** `src/notion/ticket-service.ts`
- **Test:** Create tickets with special chars: quotes, backticks, SQL injection strings, HTML
- **Expected:** All sanitized or properly escaped for Notion API

### EDGE-005: Simultaneous Messages from Same User
- **Priority:** HIGH
- **Target:** `src/webhook/handler.ts`
- **Test:** User sends 5 messages within 1 second
- **Expected:** Rate limiter works, no race conditions in session updates

### EDGE-006: Invalid Notion Database IDs
- **Priority:** MEDIUM
- **Target:** `src/notion/notion-api-core.ts`
- **Test:** Queries with malformed UUIDs, non-existent database IDs
- **Expected:** Proper error, no unhandled promise rejection

### EDGE-007: Member Not Found Scenarios
- **Priority:** MEDIUM
- **Target:** `src/ai/agent.ts` member lookup
- **Test:** Query for members that don't exist, partial name matches, typos
- **Expected:** Helpful "not found" message, suggestions when possible

### EDGE-008: Broadcast to Empty Division
- **Priority:** MEDIUM
- **Target:** `src/ai/agent.ts` broadcast
- **Test:** Broadcast to division with 0 members or non-existent division
- **Expected:** Proper handling, no crash, informative message

### EDGE-009: Session Data Corruption
- **Priority:** HIGH
- **Target:** `src/services/session-manager.ts`
- **Test:** Corrupt session data in Redis (invalid JSON, missing fields)
- **Expected:** Recovery or reset, no crash on session read

### EDGE-010: Webhook Without Required Fields
- **Priority:** HIGH
- **Target:** `src/webhook/handler.ts`
- **Test:** Send webhook payloads missing: sender, message content, instance name
- **Expected:** Validation fails gracefully, 400 response, no crash

### EDGE-011: Message with Only Media (No Text)
- **Priority:** MEDIUM
- **Target:** `src/webhook/handler.ts`, `src/ai/agent.ts`
- **Test:** Send image/audio/video without any text caption
- **Expected:** Proper handling, no crash on undefined text

### EDGE-012: Bot Mentioned Multiple Times in Group
- **Priority:** LOW
- **Target:** `src/webhook/handler.ts` group message handling
- **Test:** Message with multiple @bot mentions
- **Expected:** Processed once, no duplicate responses

## Report Format
Each finding must include:
- Edge case description
- Input that triggers it
- Expected vs actual behavior
- Crash/data corruption risk
- Fix recommendation
