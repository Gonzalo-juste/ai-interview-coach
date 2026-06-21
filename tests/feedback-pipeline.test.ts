/**
 * Tests for the Phase 4 feedback pipeline.
 *
 * Coverage:
 * 1. buildAnswerContexts — pure function, no mocks
 * 2. Non-behavioral transcripts → null STAR fields
 * 3. Behavioral transcripts → non-null STAR fields
 * 4. Status transitions: pending → processing → ready (happy path)
 * 5. Status transitions: pending → processing → failed (error path)
 * 6. Upsert idempotency: running the pipeline twice does not create duplicate rows
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Turn } from "@/lib/interview/transcript";
import { buildAnswerContexts } from "@/lib/feedback/pipeline";
import { generateFeedback } from "@/lib/feedback/pipeline";

// ---------------------------------------------------------------------------
// Section 1: buildAnswerContexts — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe("buildAnswerContexts", () => {
  it("returns one context per candidate turn", () => {
    const turns: Turn[] = [
      { role: "interviewer", text: "Tell me about yourself.", timestamp: "t1" },
      { role: "candidate", text: "I have 5 years of experience.", timestamp: "t2" },
      { role: "interviewer", text: "Tell me about a time you handled a conflict at work.", timestamp: "t3" },
      { role: "candidate", text: "I once disagreed with my manager...", timestamp: "t4" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts).toHaveLength(2);
  });

  it("sets correct turnIndex matching the position in the full turns array", () => {
    const turns: Turn[] = [
      { role: "interviewer", text: "Question one.", timestamp: "t1" },
      { role: "candidate", text: "Answer one.", timestamp: "t2" },      // index 1
      { role: "interviewer", text: "Question two.", timestamp: "t3" },
      { role: "candidate", text: "Answer two.", timestamp: "t4" },      // index 3
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].turnIndex).toBe(1);
    expect(contexts[1].turnIndex).toBe(3);
  });

  it("marks answers as behavioral when preceded by a behavioral question", () => {
    const turns: Turn[] = [
      {
        role: "interviewer",
        text: "Tell me about a time you handled a conflict at work.",
        timestamp: "t1",
      },
      { role: "candidate", text: "Sure, it was during a project...", timestamp: "t2" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].isBehavioral).toBe(true);
  });

  it("marks answers as non-behavioral for technical questions", () => {
    const turns: Turn[] = [
      {
        role: "interviewer",
        text: "Describe your experience with system design and architecture.",
        timestamp: "t1",
      },
      { role: "candidate", text: "I've designed several large-scale systems...", timestamp: "t2" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].isBehavioral).toBe(false);
  });

  it("marks answers as non-behavioral when no preceding interviewer question", () => {
    const turns: Turn[] = [
      { role: "candidate", text: "Opening statement.", timestamp: "t1" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].isBehavioral).toBe(false);
    expect(contexts[0].questionText).toBeNull();
  });

  it("associates each answer with the most recent interviewer question", () => {
    const turns: Turn[] = [
      { role: "interviewer", text: "Tell me about a time you failed.", timestamp: "t1" },
      { role: "interviewer", text: "Actually, tell me about a leadership situation.", timestamp: "t2" },
      { role: "candidate", text: "I led a team through a reorg...", timestamp: "t3" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].questionText).toBe("Actually, tell me about a leadership situation.");
  });

  // Sticky-category: follow-up probes (detectCategory → null) must NOT reset the
  // active category to null. Drill-down answers to behavioral questions should
  // stay marked as behavioral even when immediately preceded by a probe.
  it("sticky category: follow-up probe after behavioral question keeps isBehavioral=true", () => {
    const turns: Turn[] = [
      {
        role: "interviewer",
        text: "Tell me about a time you had to learn something new under pressure.",
        timestamp: "t1",
      },
      { role: "candidate", text: "At my last job we had to migrate to Kubernetes...", timestamp: "t2" },
      {
        role: "interviewer",
        text: "What was the most challenging part of that migration?", // null category (probe)
        timestamp: "t3",
      },
      { role: "candidate", text: "The hardest part was rewriting the deployment scripts.", timestamp: "t4" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].isBehavioral).toBe(true);
    // Probe-preceded answer must still be behavioral (sticky category from the opener)
    expect(contexts[1].isBehavioral).toBe(true);
  });

  it("sticky category resets when a new explicit non-behavioral question is asked", () => {
    const turns: Turn[] = [
      {
        role: "interviewer",
        text: "Tell me about a time you disagreed with your manager.",
        timestamp: "t1",
      },
      { role: "candidate", text: "There was a design disagreement...", timestamp: "t2" },
      {
        role: "interviewer",
        text: "Walk me through the architecture of that system.", // explicit: technical
        timestamp: "t3",
      },
      { role: "candidate", text: "We used a microservices approach.", timestamp: "t4" },
    ];
    const contexts = buildAnswerContexts(turns);
    expect(contexts[0].isBehavioral).toBe(true);   // behavioral opener
    expect(contexts[1].isBehavioral).toBe(false);  // explicit technical question resets category
  });

  // Phase 4 routing consistency: the three phrasings the user specified must all
  // be classified as behavioral — both by detectCategory AND by buildAnswerContexts.
  it("Phase 4 routing: 'tell me about a time', 'walk me through a situation', 'describe an instance' all route to behavioral scoring", () => {
    const phrasings: Turn[][] = [
      [
        { role: "interviewer", text: "Tell me about a time you had to learn something new under pressure.", timestamp: "t1" },
        { role: "candidate", text: "We migrated to a new framework...", timestamp: "t2" },
      ],
      [
        { role: "interviewer", text: "Walk me through a situation where you had to pick up a new skill rapidly.", timestamp: "t1" },
        { role: "candidate", text: "When I joined the team, I had to learn Go from scratch...", timestamp: "t2" },
      ],
      [
        { role: "interviewer", text: "Describe an instance when you disagreed with a technical decision.", timestamp: "t1" },
        { role: "candidate", text: "At my previous company, we debated whether to use GraphQL...", timestamp: "t2" },
      ],
    ];

    for (const turns of phrasings) {
      const contexts = buildAnswerContexts(turns);
      expect(contexts).toHaveLength(1);
      expect(contexts[0].isBehavioral).toBe(true);
    }
  });

  it("handles an empty turns array", () => {
    expect(buildAnswerContexts([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Section 2 & 3: STAR field null/non-null based on isBehavioral
//
// The pipeline's processAnswer sets STAR fields to null for non-behavioral
// answers regardless of what the model returns. We test this via the pipeline
// with a mocked Anthropic client.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeSupabaseMock(opts?: {
  sessionRows?: Row[];
  transcriptRows?: Row[];
  feedbackRows?: Row[];
  answerRows?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    sessions: opts?.sessionRows ?? [],
    transcripts: opts?.transcriptRows ?? [],
    feedback_reports: opts?.feedbackRows ?? [
      { session_id: "sess-1", status: "pending" },
    ],
    answer_feedback: opts?.answerRows ?? [],
  };

  // Track mutations for assertions
  const mutations: Array<{ table: string; op: "update" | "upsert" | "insert"; data: unknown }> =
    [];

  const makeQuery = (table: string) => {
    let filterKey: string | null = null;
    let filterVal: unknown = null;
    let pendingUpdateData: Row | null = null;

    const q = {
      select: (_cols?: string) => q,
      order: () => q,
      eq: (key: string, val: unknown) => {
        filterKey = key;
        filterVal = val;
        // If there's a pending update, flush it now that we have the filter
        if (pendingUpdateData !== null) {
          const data = pendingUpdateData;
          pendingUpdateData = null;
          mutations.push({ table, op: "update", data });
          const rows = tables[table] ?? [];
          const idx = rows.findIndex((r) => r[key] === val);
          if (idx >= 0) Object.assign(rows[idx], data);
        }
        return q;
      },
      then: (resolve: (v: { error: null }) => void) => {
        // Makes the chain awaitable when used as: await supabase.from(...).update(...).eq(...)
        resolve({ error: null });
      },
      maybeSingle: async () => {
        const rows = tables[table] ?? [];
        const row = filterKey
          ? rows.find((r) => r[filterKey!] === filterVal)
          : rows[0];
        return { data: row ?? null, error: null };
      },
      single: async () => {
        const rows = tables[table] ?? [];
        const row = filterKey
          ? rows.find((r) => r[filterKey!] === filterVal)
          : rows[0];
        return {
          data: row ?? null,
          error: row ? null : { message: "not found", code: "PGRST116" },
        };
      },
      update: (data: Row) => {
        // Store the data; the filter will be set on the subsequent .eq() call.
        pendingUpdateData = data;
        return q;
      },
      upsert: (data: Row, _opts?: unknown) => {
        mutations.push({ table, op: "upsert", data });
        const rows = (tables[table] = tables[table] ?? []);
        const existing = rows.findIndex(
          (r) =>
            r.transcript_id === data.transcript_id &&
            r.turn_index === data.turn_index
        );
        if (existing >= 0) {
          Object.assign(rows[existing], data);
        } else {
          rows.push({ ...data });
        }
        return { error: null };
      },
      insert: (data: Row) => {
        mutations.push({ table, op: "insert", data });
        (tables[table] = tables[table] ?? []).push(data);
        return { error: null };
      },
    };
    return q;
  };

  const supabase = {
    from: (table: string) => makeQuery(table),
    _tables: tables,
    _mutations: mutations,
  };
  return supabase;
}

/** Build a minimal Anthropic mock that returns the given tool call input. */
function makeAnthropicMock(
  perAnswerInput: (ctx: { isBehavioral: boolean }) => Record<string, unknown>,
  aggregationInput: Record<string, unknown> = {
    story_gaps: [],
    cv_gaps: [],
  }
) {
  let callCount = 0;
  const totalAnswerCalls = 0; // used to distinguish fan-out vs fan-in calls

  const mock = {
    messages: {
      create: vi.fn(async (params: { tools?: Array<{ name: string }> }) => {
        callCount++;
        const toolName = params.tools?.[0]?.name ?? "analyze_session";

        const isAggregation = toolName === "analyze_session";
        const input = isAggregation
          ? aggregationInput
          : perAnswerInput({ isBehavioral: toolName === "score_behavioral_answer" });

        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: toolName, input }],
        };
      }),
    },
    _callCount: () => callCount,
  };
  void totalAnswerCalls;
  return mock;
}

// Session + transcript fixtures
const BEHAVIORAL_TURNS: Turn[] = [
  {
    role: "interviewer",
    text: "Tell me about a time you handled a conflict at work.",
    timestamp: "t1",
  },
  { role: "candidate", text: "I once disagreed with my lead over a design choice...", timestamp: "t2" },
];

const MIXED_TURNS: Turn[] = [
  {
    role: "interviewer",
    text: "Tell me about a time you handled a conflict at work.",
    timestamp: "t1",
  },
  { role: "candidate", text: "I disagreed with my lead...", timestamp: "t2" },
  {
    role: "interviewer",
    text: "Describe your experience with system design and architecture.",
    timestamp: "t3",
  },
  { role: "candidate", text: "I've built distributed systems at scale.", timestamp: "t4" },
];

// ---------------------------------------------------------------------------
// Section 3: STAR fields are null for non-behavioral, non-null for behavioral
// ---------------------------------------------------------------------------

describe("STAR fields by answer type", () => {
  it("behavioral answers receive non-null STAR fields", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-1", jd_text: "Engineer JD", cv_text: "My CV" }],
      transcriptRows: [{ id: "tx-1", session_id: "sess-1", turns: BEHAVIORAL_TURNS }],
      feedbackRows: [{ session_id: "sess-1", status: "pending" }],
    });

    const anthropic = makeAnthropicMock(({ isBehavioral }) =>
      isBehavioral
        ? {
            star_situation_present: true,
            star_task_present: true,
            star_action_present: true,
            star_result_present: true,
            star_quality_score: 4,
            rewrite: "Rewritten behavioral answer.",
          }
        : { rewrite: "Rewritten non-behavioral." }
    );

    await generateFeedback("sess-1", { supabase: supabase as never, anthropic: anthropic as never });

    const upserted = supabase._tables.answer_feedback[0];
    expect(upserted.star_situation_present).toBe(true);
    expect(upserted.star_task_present).toBe(true);
    expect(upserted.star_action_present).toBe(true);
    expect(upserted.star_result_present).toBe(true);
    expect(upserted.star_quality_score).toBe(4);
  });

  it("non-behavioral answers have all STAR fields as null regardless of model output", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-2", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [
        {
          id: "tx-2",
          session_id: "sess-2",
          turns: [
            {
              role: "interviewer",
              text: "Describe your experience with system design and architecture.",
              timestamp: "t1",
            },
            { role: "candidate", text: "I've built large-scale distributed systems.", timestamp: "t2" },
          ] as Turn[],
        },
      ],
      feedbackRows: [{ session_id: "sess-2", status: "pending" }],
    });

    const anthropic = makeAnthropicMock(() => ({
      // Model would never return STAR fields for non-behavioral tool,
      // but even if it somehow did, the pipeline ignores them.
      rewrite: "Clear, idiomatic rewrite.",
    }));

    await generateFeedback("sess-2", { supabase: supabase as never, anthropic: anthropic as never });

    const upserted = supabase._tables.answer_feedback[0];
    expect(upserted.star_situation_present).toBeNull();
    expect(upserted.star_task_present).toBeNull();
    expect(upserted.star_action_present).toBeNull();
    expect(upserted.star_result_present).toBeNull();
    expect(upserted.star_quality_score).toBeNull();
    expect(upserted.rewrite).toBe("Clear, idiomatic rewrite.");
  });
});

// ---------------------------------------------------------------------------
// Section 4: Status transitions — happy path
// ---------------------------------------------------------------------------

describe("feedback pipeline status transitions", () => {
  it("transitions pending → processing → ready on success", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-ok", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [{ id: "tx-ok", session_id: "sess-ok", turns: BEHAVIORAL_TURNS }],
      feedbackRows: [{ session_id: "sess-ok", status: "pending" }],
    });

    const anthropic = makeAnthropicMock(
      () => ({
        star_situation_present: true,
        star_task_present: true,
        star_action_present: false,
        star_result_present: false,
        star_quality_score: 2,
        rewrite: "Rewritten.",
      }),
      { story_gaps: [{ archetype: "failure_recovery", status: "missing", note: "Prepare one." }], cv_gaps: [] }
    );

    await generateFeedback("sess-ok", { supabase: supabase as never, anthropic: anthropic as never });

    const statusHistory = supabase._mutations
      .filter((m) => m.table === "feedback_reports" && m.op === "update")
      .map((m) => (m.data as Row).status);

    expect(statusHistory).toEqual(["processing", "ready"]);

    const finalRow = supabase._tables.feedback_reports.find(
      (r) => r.session_id === "sess-ok"
    );
    expect(finalRow?.status).toBe("ready");
    expect(finalRow?.story_gaps).toHaveLength(1);
  });

  it("transitions pending → processing → failed when Anthropic throws", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-fail", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [{ id: "tx-fail", session_id: "sess-fail", turns: BEHAVIORAL_TURNS }],
      feedbackRows: [{ session_id: "sess-fail", status: "pending" }],
    });

    const anthropic = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("Anthropic quota exceeded")),
      },
    };

    await generateFeedback("sess-fail", {
      supabase: supabase as never,
      anthropic: anthropic as never,
    });

    const statusHistory = supabase._mutations
      .filter((m) => m.table === "feedback_reports" && m.op === "update")
      .map((m) => (m.data as Row).status);

    expect(statusHistory[0]).toBe("processing");
    expect(statusHistory[statusHistory.length - 1]).toBe("failed");

    const finalRow = supabase._tables.feedback_reports.find(
      (r) => r.session_id === "sess-fail"
    );
    expect(finalRow?.status).toBe("failed");
    expect(typeof finalRow?.error_message).toBe("string");
    expect((finalRow?.error_message as string).length).toBeGreaterThan(0);
  });

  it("never leaves status at 'processing' — always terminates in ready or failed", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-term", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [{ id: "tx-term", session_id: "sess-term", turns: MIXED_TURNS }],
      feedbackRows: [{ session_id: "sess-term", status: "pending" }],
    });

    // Fail on the aggregation call specifically (first two calls are per-answer)
    let callCount = 0;
    const anthropic = {
      messages: {
        create: vi.fn(async (params: { tools?: Array<{ name: string }> }) => {
          callCount++;
          const toolName = params.tools?.[0]?.name ?? "analyze_session";
          if (toolName === "analyze_session") {
            throw new Error("aggregation failed");
          }
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", name: toolName, input: { rewrite: "ok" } }],
          };
        }),
      },
    };

    await generateFeedback("sess-term", {
      supabase: supabase as never,
      anthropic: anthropic as never,
    });

    const finalRow = supabase._tables.feedback_reports.find(
      (r) => r.session_id === "sess-term"
    );
    expect(finalRow?.status).not.toBe("processing");
    expect(["ready", "failed"]).toContain(finalRow?.status);
    void callCount;
  });
});

// ---------------------------------------------------------------------------
// Section 6: Upsert idempotency
// ---------------------------------------------------------------------------

describe("upsert idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("running the pipeline twice produces the same number of answer_feedback rows", async () => {
    // Both runs go through the same mock client so the in-memory state is shared.
    // The upsert mock deduplicates on (transcript_id, turn_index), so a second
    // run must not add new rows.
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-idem", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [{ id: "tx-idem", session_id: "sess-idem", turns: BEHAVIORAL_TURNS }],
      feedbackRows: [{ session_id: "sess-idem", status: "pending" }],
    });

    const makeAnthropicForRun = (rewrite: string) =>
      makeAnthropicMock(
        () => ({
          star_situation_present: true,
          star_task_present: true,
          star_action_present: true,
          star_result_present: true,
          star_quality_score: 5,
          rewrite,
        }),
        { story_gaps: [], cv_gaps: [] }
      );

    // First run
    await generateFeedback("sess-idem", {
      supabase: supabase as never,
      anthropic: makeAnthropicForRun("First rewrite.") as never,
    });
    const countAfterFirst = supabase._tables.answer_feedback.length;

    // Second run — same client, same in-memory tables
    await generateFeedback("sess-idem", {
      supabase: supabase as never,
      anthropic: makeAnthropicForRun("Updated rewrite.") as never,
    });
    const countAfterSecond = supabase._tables.answer_feedback.length;

    // Row count must not increase — upsert deduplicates on (transcript_id, turn_index)
    expect(countAfterSecond).toBe(countAfterFirst);
    // And the row content should reflect the second run's output
    expect(supabase._tables.answer_feedback[0].rewrite).toBe("Updated rewrite.");
  });

  it("second run updates existing rows rather than inserting new ones", async () => {
    const supabase = makeSupabaseMock({
      sessionRows: [{ id: "sess-upd", jd_text: "JD", cv_text: "CV" }],
      transcriptRows: [{ id: "tx-upd", session_id: "sess-upd", turns: BEHAVIORAL_TURNS }],
      feedbackRows: [{ session_id: "sess-upd", status: "pending" }],
    });

    // Seed an existing answer_feedback row for the same (transcript_id, turn_index)
    supabase._tables.answer_feedback.push({
      transcript_id: "tx-upd",
      session_id: "sess-upd",
      turn_index: 1, // candidate turn is at index 1 in BEHAVIORAL_TURNS
      rewrite: "Old rewrite.",
      star_quality_score: 1,
    });

    const anthropic = makeAnthropicMock(() => ({
      star_situation_present: true,
      star_task_present: true,
      star_action_present: true,
      star_result_present: true,
      star_quality_score: 5,
      rewrite: "Updated rewrite.",
    }), { story_gaps: [], cv_gaps: [] });

    await generateFeedback("sess-upd", {
      supabase: supabase as never,
      anthropic: anthropic as never,
    });

    // Still exactly one row
    expect(supabase._tables.answer_feedback).toHaveLength(1);
    // Row was updated, not duplicated
    expect(supabase._tables.answer_feedback[0].rewrite).toBe("Updated rewrite.");
    expect(supabase._tables.answer_feedback[0].star_quality_score).toBe(5);
  });
});
