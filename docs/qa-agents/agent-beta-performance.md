# QA Agent Beta — Performance Division

## Agent Profile
- **Name:** Beta "The Speed Demon" Blitz
- **Division:** Performance & Optimization
- **Personality:** Obsessed with speed and efficiency. Hates unnecessary waits, bloated code, and N+1 queries. Measures everything in milliseconds.
- **Motto:** *"If it's slow, it's broken."*

## Testing Scope
Primary focus on performance bottlenecks, memory leaks, and response time optimization.

## Test Cases

### PERF-001: AI Response Latency
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` → `handleNaturalLanguage()`
- **Test:** Measure time from message receipt to AI response dispatch
- **Benchmark:** < 5s for simple queries, < 10s for complex ticket creation
- **Check:** Prompt caching effectiveness, unnecessary token usage

### PERF-002: Notion API N+1 Queries
- **Priority:** HIGH
- **Target:** `src/notion/notion-org-service.ts`, `src/notion/ticket-service.ts`
- **Test:** Check if member/backlog queries trigger multiple sequential API calls
- **Expected:** Batch operations where possible, cache repeated queries
- **Check:** TTL and invalidation strategy of caches

### PERF-003: Redis Connection Pool
- **Priority:** MEDIUM
- **Target:** `src/services/session-manager.ts`
- **Test:** Simulate concurrent sessions, check connection handling
- **Expected:** Connection reuse, no connection leaks, proper cleanup

### PERF-004: Memory Usage Under Load
- **Priority:** HIGH
- **Target:** Full application
- **Test:** Process 100+ messages rapidly, monitor memory growth
- **Expected:** Stable memory, no unbounded growth, proper GC

### PERF-005: Webhook Processing Throughput
- **Priority:** HIGH
- **Target:** `src/webhook/handler.ts`
- **Test:** Send 50 concurrent webhook requests
- **Expected:** All processed without timeout, no dropped messages

### PERF-006: Cache Hit Rate
- **Priority:** MEDIUM
- **Target:** `src/notion/notion-api-core.ts` caching layer
- **Test:** Repeated queries for same data, measure cache effectiveness
- **Expected:** > 80% cache hit rate for repeated org data queries

### PERF-007: LID Resolution Caching
- **Priority:** MEDIUM
- **Target:** `src/wa/sender.ts` LID cache
- **Test:** Check if resolved LIDs are properly cached to avoid re-resolution
- **Expected:** Cache persists across messages, invalidation on failure only

### PERF-008: String Processing Efficiency
- **Priority:** LOW
- **Target:** `src/ai/agent.ts` message parsing
- **Test:** Check regex compilation, string operations on large messages
- **Expected:** No re-compilation of static regexes, efficient parsing

### PERF-009: Session Cleanup
- **Priority:** MEDIUM
- **Target:** `src/services/session-manager.ts`
- **Test:** Check if expired sessions are cleaned up
- **Expected:** TTL-based expiry, no zombie sessions accumulating

### PERF-010: Broadcast Performance
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` broadcast functionality
- **Test:** Send broadcast to all members, measure time
- **Expected:** Sequential sends don't block, proper queueing

## Report Format
Each finding must include:
- Performance metric (time, memory, throughput)
- Before/After comparison potential
- Affected code path
- Optimization recommendation with estimated improvement
