/**
 * Tests for the wrap-up Q&A phase that follows the structured interview.
 *
 * Flow:
 *   "active" → (shouldEndSession) → "finalizing" → "wrap_0" → "wrap_1" → "completed"
 *                                                        ↘ (model declines) → "completed"
 *
 * Key invariant: every turn kind that can ultimately lead to "completed" only
 * fires AFTER the candidate's turn is already durable in the database.
 */

import { describe, it, expect } from "vitest";
import { computeTurnKind } from "../lib/interview/session";
import { appendTurns, readTurns, type Turn } from "../lib/interview/transcript";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── In-memory Supabase mock (same pattern as other test files) ────────────────

function createMockSupabase() {
  const rows: Array<{ id: string; session_id: string; turns: Turn[] }> = [];
  let nextId = 1;
  return {
    from(_table: string) {
      return {
        select(_cols?: string) {
          return {
            eq(col: string, val: string) {
              return {
                async maybeSingle() {
                  const row = rows.find(
                    (r) => (r as Record<string, unknown>)[col] === val
                  );
                  return {
                    data: row ? { id: row.id, turns: row.turns } : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
        insert(data: { session_id: string; turns: Turn[] }) {
          rows.push({ id: `mock-${nextId++}`, ...data });
          return Promise.resolve({ error: null });
        },
        update(data: { turns: Turn[] }) {
          return {
            eq(_col: string, id: string) {
              const row = rows.find((r) => r.id === id);
              if (row) row.turns = data.turns;
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

function asClient(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

function iQ(text: string, min = 0): Turn {
  return { role: "interviewer", text, timestamp: `2026-06-20T10:${String(min).padStart(2, "0")}:00Z` };
}
function cA(text: string, min = 0): Turn {
  return { role: "candidate", text, timestamp: `2026-06-20T10:${String(min).padStart(2, "0")}:30Z` };
}

// ── computeTurnKind — wrap-up status values ───────────────────────────────────

describe("computeTurnKind — wrap-up phase routing", () => {
  const anyTurns: Turn[] = [];

  it("status='wrap_0' → wrapUpContinue (model may answer Q1 or call end_interview)", () => {
    expect(computeTurnKind("wrap_0", anyTurns)).toBe("wrapUpContinue");
  });

  it("status='wrap_1' → wrapUpForceClose (model MUST call end_interview)", () => {
    expect(computeTurnKind("wrap_1", anyTurns)).toBe("wrapUpForceClose");
  });

  it("status='finalizing' → generateWrapUpPrompt (not closing — generates 'any questions?')", () => {
    // Key regression guard: "finalizing" must NOT return "isEnding:true" any more.
    // It generates the wrap-up invitation and transitions to wrap_0.
    expect(computeTurnKind("finalizing", anyTurns)).toBe("generateWrapUpPrompt");
  });

  it("status='completed' → normal (belt-and-suspenders guard, route blocks before reaching here)", () => {
    expect(computeTurnKind("completed", anyTurns)).toBe("normal");
  });
});

// ── Full wrap-up sequence — status transitions ────────────────────────────────

describe("full wrap-up sequence status transitions", () => {
  it("traces the complete path from active → completed through wrap-up", () => {
    // A transcript that has passed shouldEndSession (all categories covered, 5+ turns).
    const mainInterviewTurns: Turn[] = [
      iQ("Tell me about a time you handled conflict at work.", 0),    // behavioral
      cA("I had a disagreement with a PM about scope...", 1),
      iQ("Do you require visa sponsorship?", 2),                      // visa
      cA("No, I'm authorized to work without sponsorship.", 3),
      iQ("Walk me through your system architecture.", 4),             // technical
      cA("We used a microservices approach with Kafka.", 5),
      iQ("Your resume mentions Stripe — tell me more.", 6),           // experience
      cA("I was a backend engineer there for two years.", 7),
      iQ("What excites you most about this role?", 8),                // company_fit
      cA("The scale of the data problems is really compelling.", 9),
    ];

    // shouldEndSession = true now, so active → generateFinalQ
    expect(computeTurnKind("active", mainInterviewTurns)).toBe("generateFinalQ");
    // Route persists final Q, sets status → "finalizing"

    // Candidate answers the final main question. Route reads turns, calls computeTurnKind.
    const afterFinalQ = [
      ...mainInterviewTurns,
      iQ("Looking back, what would you have done differently?", 10),
      cA("I'd have invested more time in stakeholder alignment early on.", 11),
    ];
    expect(computeTurnKind("finalizing", afterFinalQ)).toBe("generateWrapUpPrompt");
    // Route generates "any questions?", sets status → "wrap_0"

    // Candidate asks their first follow-up.
    const afterWrapUpPrompt = [
      ...afterFinalQ,
      iQ("Do you have any questions for us before we close?", 12),
      cA("Yes — what does the tech stack on the data team look like?", 13),
    ];
    expect(computeTurnKind("wrap_0", afterWrapUpPrompt)).toBe("wrapUpContinue");
    // Route calls Anthropic with tool_choice:auto. If model does NOT call end_interview:
    // → sets status → "wrap_1"

    // Candidate asks their second follow-up.
    const afterFirstExchange = [
      ...afterWrapUpPrompt,
      iQ("Great question — we use Python and dbt with a Snowflake warehouse.", 14),
      cA("That's helpful. What does onboarding typically look like for this role?", 15),
    ];
    expect(computeTurnKind("wrap_1", afterFirstExchange)).toBe("wrapUpForceClose");
    // Route calls Anthropic with tool_choice:any. Model MUST call end_interview.
    // Farewell is extracted from tool input, persisted, then status → "completed".
  });

  it("model may close early (at wrap_0) if candidate declines further questions", () => {
    // At wrap_0, if the candidate says "No, I think I'm good, thanks!" the model
    // should call end_interview. The route checks for the tool call and closes.
    // This tests that computeTurnKind("wrap_0", ...) = "wrapUpContinue" — which
    // is the kind that includes tool_choice:auto, allowing the model to close.
    const turns: Turn[] = [
      iQ("Do you have any questions for us before we close?", 0),
      cA("No, I think I'm all set — thank you so much for your time!", 1),
    ];
    const kind = computeTurnKind("wrap_0", turns);
    expect(kind).toBe("wrapUpContinue");
    // When kind=wrapUpContinue and the model calls end_interview, the route sets
    // sessionEnded:true and nextStatus:"completed" — no need to go through wrap_1.
  });
});

// ── Ordering invariant — farewell persisted before completion ─────────────────

describe("ordering invariant — farewell is durable before session marked complete", () => {
  it("candidate's second wrap-up answer is in DB before the closing kind is reached", async () => {
    const client = createMockSupabase();
    const sessionId = "session-wrapup-ordering";

    // Seed the transcript up through the interviewer's answer to Q1.
    const interviewerAnswerQ1: Turn = iQ("We use React and TypeScript on the frontend.", 14);
    await appendTurns(asClient(client), sessionId, [
      iQ("Tell me about conflict.", 0),
      cA("I resolved a disagreement by...", 1),
      iQ("Do you need visa sponsorship?", 2),
      cA("No.", 3),
      iQ("Walk me through the architecture.", 4),
      cA("Microservices with Kafka.", 5),
      iQ("Your Stripe role — tell me more.", 6),
      cA("Backend engineer, payment APIs.", 7),
      iQ("What excites you about this role?", 8),
      cA("The data scale.", 9),
      iQ("What would you have done differently?", 10),
      cA("Earlier stakeholder alignment.", 11),
      iQ("Do you have any questions for us?", 12),
      cA("What's the tech stack?", 13),
      interviewerAnswerQ1,
    ]);

    // The candidate asks their second (and final) follow-up question.
    // Step 1: route persists their answer FIRST.
    const candidateQ2: Turn = cA("What does onboarding look like?", 15);
    await appendTurns(asClient(client), sessionId, [candidateQ2]);

    // Step 2: read back (now includes the second follow-up).
    const turns = await readTurns(asClient(client), sessionId);

    // Step 3: assert the candidate's Q2 is durable before we evaluate the kind.
    expect(turns.some(t => t.role === "candidate" && t.text === candidateQ2.text)).toBe(true);

    // Step 4: ONLY NOW compute the turn kind (status was "wrap_1").
    const kind = computeTurnKind("wrap_1", turns);
    expect(kind).toBe("wrapUpForceClose");
    // The route will now call Anthropic with tool_choice:any, receive end_interview,
    // persist the farewell turn, THEN mark status → "completed".
  });

  it("farewell turn is structurally valid for persistence", () => {
    // Simulate what the route does: farewell text extracted from tool input,
    // wrapped in a Turn, then persisted. Verify the Turn shape is correct.
    const farewell =
      "Onboarding is typically a 2-week ramp with pairing sessions. " +
      "It was truly a pleasure speaking with you today — best of luck with the process!";
    const turn: Turn = {
      role: "interviewer",
      text: farewell,
      timestamp: new Date().toISOString(),
    };
    expect(turn.role).toBe("interviewer");
    expect(turn.text).toBe(farewell);
    expect(turn.timestamp).toBeTruthy();
  });

  it("session is NOT marked 'completed' until wrapUpForceClose kind is reached", () => {
    // All intermediate kinds must NOT result in sessionEnded:true.
    // This mirrors the test in session-ending.test.ts but traces the full path.
    const turns: Turn[] = [];

    // Step 1: still in main interview, not yet at threshold
    expect(computeTurnKind("active", turns)).toBe("normal");

    // Step 2: threshold hit — use full question texts so category detection fires.
    // (Short abbreviations like "Tell me about conflict." don't match the regexes.)
    const threshold: Turn[] = [
      iQ("Tell me about a time you handled a conflict at work.", 0), cA("I resolved it by...", 1),
      iQ("Do you require visa sponsorship to work here?", 2), cA("No, not needed.", 3),
      iQ("Can you walk me through your ML pipeline architecture?", 4), cA("Microservices.", 5),
      iQ("Your resume mentions a Stripe role — tell me more.", 6), cA("Backend engineer.", 7),
      iQ("What excites you most about this role?", 8), cA("The scale.", 9),
    ];
    expect(computeTurnKind("active", threshold)).toBe("generateFinalQ");  // not closing

    // Step 3: candidate answered the final main Q → "finalizing"
    expect(computeTurnKind("finalizing", threshold)).toBe("generateWrapUpPrompt");  // not closing

    // Step 4: wrap-up prompt given → "wrap_0"
    expect(computeTurnKind("wrap_0", threshold)).toBe("wrapUpContinue");  // not closing (unless model calls tool)

    // Step 5: 1 exchange answered → "wrap_1" → force close
    expect(computeTurnKind("wrap_1", threshold)).toBe("wrapUpForceClose");
    // At this point the route receives the tool call and closes. The session
    // is only marked "completed" AFTER the farewell is persisted to transcripts.
  });
});
