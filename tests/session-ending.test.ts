import { describe, it, expect } from "vitest";
import { computeTurnKind } from "../lib/interview/session";
import { appendTurns, readTurns, type Turn } from "../lib/interview/transcript";
import { shouldEndSession, MIN_CANDIDATE_TURNS } from "../lib/interview/categories";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── In-memory Supabase mock ───────────────────────────────────────────────────

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

function interviewer(text: string, offsetMin = 0): Turn {
  return { role: "interviewer", text, timestamp: `2026-06-20T10:${String(offsetMin).padStart(2, "0")}:00Z` };
}
function candidate(text: string, offsetMin = 0): Turn {
  return { role: "candidate", text, timestamp: `2026-06-20T10:${String(offsetMin).padStart(2, "0")}:30Z` };
}

/** Transcript with exactly MIN_CANDIDATE_TURNS answers and required categories covered. */
function thresholdTranscript(): Turn[] {
  return [
    interviewer("Tell me about a time you handled a conflict at work.", 0),     // behavioral
    candidate("At my last company I had a disagreement with a PM...", 1),
    interviewer("Do you require visa sponsorship to work here?", 2),             // visa
    candidate("No, I'm authorized to work without sponsorship.", 3),
    interviewer("Can you walk me through your ML pipeline architecture?", 4),    // technical
    candidate("We used TensorFlow and a distributed feature store.", 5),
    interviewer("Your resume mentions a fintech role — tell me more.", 6),       // experience
    candidate("I was a backend engineer at Stripe, focusing on payment APIs.", 7),
    interviewer("What excites you most about this role?", 8),                    // company_fit
    candidate("I'm drawn to the scale of the data problems you're solving.", 9),
  ]; // 5 candidate turns, behavioral + visa covered → shouldEndSession = true
}

// ── computeTurnKind — main interview phase transitions ────────────────────────

describe("computeTurnKind — main interview transitions", () => {
  it("returns 'normal' when below the end threshold", () => {
    const turns: Turn[] = [
      interviewer("Tell me about yourself."),
      candidate("I'm a senior engineer with 8 years of experience."),
      interviewer("What's your biggest technical achievement?"),
      candidate("I rebuilt our data pipeline, cutting latency by 60%."),
    ];
    expect(computeTurnKind("active", turns)).toBe("normal");
  });

  it("returns 'generateFinalQ' when the threshold is first hit (status=active)", () => {
    const turns = thresholdTranscript();
    expect(shouldEndSession(turns)).toBe(true); // confirm threshold met
    expect(computeTurnKind("active", turns)).toBe("generateFinalQ");
    // The route generates the last main-interview question and sets status → "finalizing".
    // sessionEnded is NOT returned true — recording UI stays visible.
  });

  it("returns 'generateFinalQ' via the MAX_CANDIDATE_TURNS hard limit", () => {
    const maxTurns: Turn[] = [];
    for (let i = 0; i < 8; i++) {
      maxTurns.push(interviewer(`Question ${i + 1}`, i * 2));
      maxTurns.push(candidate(`Answer ${i + 1}`, i * 2 + 1));
    }
    expect(shouldEndSession(maxTurns)).toBe(true);
    expect(computeTurnKind("active", maxTurns)).toBe("generateFinalQ");
  });

  it("returns 'generateWrapUpPrompt' when status=finalizing (candidate answered the last main Q)", () => {
    // Key change from old behavior: "finalizing" no longer immediately closes.
    // It generates "any other questions before we wrap?", then sets wrap_0.
    const turns = thresholdTranscript();
    expect(computeTurnKind("finalizing", turns)).toBe("generateWrapUpPrompt");
    // sessionEnded is still false — recording UI stays visible for the wrap-up Q&A.
  });

  it("'generateWrapUpPrompt' fires regardless of turn count (status is authoritative)", () => {
    // Even with few turns, if status is "finalizing" we generate the wrap-up prompt.
    const fewTurns: Turn[] = [
      interviewer("Tell me about conflict."),
      candidate("I resolved a disagreement by..."),
    ];
    expect(computeTurnKind("finalizing", fewTurns)).toBe("generateWrapUpPrompt");
  });
});

// ── computeTurnKind — session NOT marked complete prematurely ─────────────────

describe("computeTurnKind — session completion is never premature", () => {
  it("no turn kind before wrap_1 + tool call should close the session", () => {
    // The only statuses that can lead to sessionEnded:true are wrap_0 (if model
    // calls end_interview) and wrap_1 (forced tool call). All statuses before
    // that return kinds that don't end the session.
    const turns = thresholdTranscript();

    expect(computeTurnKind("active", turns)).toBe("generateFinalQ");
    // generateFinalQ → status becomes "finalizing" → no session end yet

    expect(computeTurnKind("finalizing", turns)).toBe("generateWrapUpPrompt");
    // generateWrapUpPrompt → status becomes "wrap_0" → no session end yet

    expect(computeTurnKind("wrap_0", turns)).toBe("wrapUpContinue");
    // wrapUpContinue → model MAY call end_interview but no guaranteed close yet

    expect(computeTurnKind("wrap_1", turns)).toBe("wrapUpForceClose");
    // wrapUpForceClose → model MUST call end_interview → session closes
  });

  it("the candidate's final answer IS in the transcript before the closing kind is reached", async () => {
    const client = createMockSupabase();
    const sessionId = "session-ordering";

    // Seed the full path: main interview + final Q + wrap-up prompt + follow-up Q
    const base = thresholdTranscript();
    const finalQ    = interviewer("Looking back, what would you do differently?", 10);
    const wrapUp    = interviewer("Do you have any questions for us before we close?", 12);
    const followUpQ = interviewer("Great question! We use React and TypeScript on the frontend.", 14);

    await appendTurns(asClient(client), sessionId, [
      ...base, finalQ,
      candidate("I'd invest more time in early stakeholder alignment.", 11),
      wrapUp,
      candidate("Could you tell me more about the tech stack?", 13),
      followUpQ,
    ]);

    // Simulate Phase wrapUpForceClose: candidate asks their second question.
    // Step 1: route persists their answer FIRST.
    const candidateFinalAnswer = candidate("That's great to know, thank you.", 15);
    await appendTurns(asClient(client), sessionId, [candidateFinalAnswer]);

    // Step 2: read back (now includes the final candidate answer).
    const turns = await readTurns(asClient(client), sessionId);

    // Step 3: assert the candidate's answer is durable BEFORE we evaluate kind.
    expect(turns.some(t => t.role === "candidate" && t.text === candidateFinalAnswer.text)).toBe(true);

    // Step 4: ONLY NOW compute the turn kind (status was "wrap_1").
    const kind = computeTurnKind("wrap_1", turns);
    expect(kind).toBe("wrapUpForceClose");
    // The route will generate farewell + call end_interview + persist + mark complete.
  });
});
