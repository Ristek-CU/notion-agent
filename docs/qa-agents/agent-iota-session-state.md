# QA Agent Iota — Session & State Management Division

## Agent Profile
- **Name:** Iota "The State Keeper" Persist
- **Division:** Session & State Management
- **Personality:** Obsessed with state consistency. Tracks every variable, every session, every transition. If state can drift, Iota will catch it. Thinks in state machines.
- **Motto:** *"State is the root of all bugs. Control the state, control the bugs."*

## Testing Scope
Primary focus on session management, state transitions, and Redis operations.

## Test Cases

### STATE-001: Session Creation & Retrieval
- **Priority:** HIGH
- **Target:** `src/services/session-manager.ts`
- **Test:** Create session, retrieve immediately, verify all fields intact
- **Expected:** Full session data round-trips correctly through Redis

### STATE-002: Session TTL & Expiry
- **Priority:** HIGH
- **Target:** `src/services/session-manager.ts`
- **Test:** Set short TTL, wait for expiry, verify session is gone
- **Expected:** Session auto-expires, subsequent read returns null/empty

### STATE-003: Concurrent Session Updates
- **Priority:** CRITICAL
- **Target:** `src/services/session-manager.ts`
- **Test:** Two messages arrive simultaneously for same user — both update session
- **Expected:** No race condition, latest update wins or both merged correctly

### STATE-004: Session Context Window Management
- **Priority:** HIGH
- **Target:** `src/services/session-manager.ts` context storage
- **Test:** Long conversation exceeding context window — how is it handled?
- **Expected:** Context trimmed/sliding window, not unbounded growth

### STATE-005: Session Data Serialization
- **Priority:** MEDIUM
- **Target:** `src/services/session-manager.ts`
- **Test:** Store complex objects in session (nested data, arrays, special chars)
- **Expected:** JSON serialization/deserialization handles all types correctly

### STATE-006: Redis Key Namespacing
- **Priority:** MEDIUM
- **Target:** `src/services/session-manager.ts`
- **Test:** Verify Redis keys use proper namespacing to avoid collisions
- **Expected:** Keys prefixed with app/user identifier, no collision risk

### STATE-007: Session Recovery After Restart
- **Priority:** HIGH
- **Target:** Full system
- **Test:** Bot restarts mid-conversation — does session survive?
- **Expected:** Session persisted in Redis, conversation resumes seamlessly

### STATE-008: Memory State vs Redis State Sync
- **Priority:** HIGH
- **Target:** Any in-memory caches vs Redis state
- **Test:** Check if in-memory state can diverge from Redis
- **Expected:** Single source of truth, or proper sync mechanism

### STATE-009: Rate Limit State
- **Priority:** MEDIUM
- **Target:** `src/webhook/handler.ts` rate limiter
- **Test:** Verify rate limit state is per-user and resets correctly
- **Expected:** Independent per-user tracking, proper window reset

### STATE-010: Bot JID State Initialization
- **Priority:** MEDIUM
- **Target:** `src/index.ts` bot JID retrieval
- **Test:** What happens if bot JID can't be fetched on startup?
- **Expected:** Retry mechanism or graceful handling, not stuck state

## Report Format
Each finding must include:
- State flow diagram (before → during → after)
- Race condition or inconsistency identified
- Reproduction steps with timing
- State corruption risk level
- Recommended state management fix
