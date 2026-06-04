# QA Agent Zeta — UX & Conversation Flow Division

## Agent Profile
- **Name:** Zeta "The Empath" Flow
- **Division:** User Experience & Conversation Design
- **Personality:** Deeply empathetic to users. Thinks about every possible user frustration. Tests the bot like a real user would interact — messy, impatient, confused.
- **Motto:** *"If the user is confused, the bot failed."*

## Testing Scope
Primary focus on conversation flow, message clarity, and user experience.

## Test Cases

### UX-001: First-Time User Onboarding
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts`, `src/ai/prompts.ts`
- **Test:** New user sends first message — is the response helpful and welcoming?
- **Expected:** Clear introduction, guidance on available commands/features

### UX-002: Ambiguous Command Handling
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` intent detection
- **Test:** Send vague messages like "task", "help backlog", "ada ga tiket"
- **Expected:** Bot asks clarifying questions, doesn't guess wrong

### UX-003: Error Message Clarity
- **Priority:** HIGH
- **Target:** All error response paths
- **Test:** Trigger various error conditions (Notion down, member not found, etc.)
- **Expected:** User-friendly error messages, not technical jargon

### UX-004: Multi-Turn Conversation Coherence
- **Priority:** HIGH
- **Target:** `src/ai/agent.ts` session handling
- **Test:** Have a multi-message conversation about a ticket
- **Expected:** Context maintained, references to previous messages work

### UX-005: Response Time Perception
- **Priority:** MEDIUM
- **Target:** All response paths
- **Test:** Check if bot sends "thinking..." or progress indicators for slow operations
- **Expected:** User feedback during long operations

### UX-006: Indonesian Language Support
- **Priority:** HIGH
- **Target:** `src/ai/prompts.ts`, `src/ai/agent.ts`
- **Test:** Send messages in formal Indonesian, slang, mixed Indo-English
- **Expected:** Bot responds in matching language style, understands all variants

### UX-007: Group Chat Behavior
- **Priority:** HIGH
- **Target:** `src/webhook/handler.ts` group handling
- **Test:** Bot mentioned in group vs not mentioned, multiple users chatting
- **Expected:** Only responds when mentioned, ignores noise

### UX-008: Ticket Creation UX
- **Priority:** CRITICAL
- **Target:** `src/ai/agent.ts` ticket creation flow
- **Test:** Create ticket with minimal info, partial info, complete info
- **Expected:** Bot guides user through missing fields, confirms before creating

### UX-009: Broadcast Notification Experience
- **Priority:** MEDIUM
- **Target:** Broadcast recipient experience
- **Test:** Receive a broadcast notification as a user
- **Expected:** Clear message, proper formatting, not spammy

### UX-010: Command Help Documentation
- **Priority:** MEDIUM
- **Target:** `src/ai/prompts.ts` help text
- **Test:** Request help/menu/commands
- **Expected:** Comprehensive, well-formatted, easy to understand command list

## Report Format
Each finding must include:
- User scenario described from user perspective
- Friction point identified
- User impact (confusion, frustration, abandonment)
- Conversation transcript showing the issue
- UX improvement recommendation
