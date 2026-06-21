import { describe, it, expect } from "vitest";
import {
  appendTurns,
  readTurns,
  mergeTurns,
  type Turn,
} from "../lib/interview/transcript";
import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal in-memory Supabase mock covering only the operations used by transcript.ts
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

// Shorthand for casting the mock to SupabaseClient
function asClient(mock: ReturnType<typeof createMockSupabase>): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

describe("mergeTurns", () => {
  it("concatenates existing and new turns in order", () => {
    const existing: Turn[] = [
      { role: "interviewer", text: "Hello.", timestamp: "2026-06-18T10:00:00Z" },
      { role: "candidate", text: "Hi there.", timestamp: "2026-06-18T10:01:00Z" },
    ];
    const newTurns: Turn[] = [
      {
        role: "interviewer",
        text: "Tell me about yourself.",
        timestamp: "2026-06-18T10:02:00Z",
      },
    ];

    const merged = mergeTurns(existing, newTurns);

    expect(merged).toHaveLength(3);
    expect(merged[0].role).toBe("interviewer");
    expect(merged[1].role).toBe("candidate");
    expect(merged[2].role).toBe("interviewer");
    expect(merged[2].text).toBe("Tell me about yourself.");
  });

  it("handles merging into an empty existing array", () => {
    const turns: Turn[] = [
      { role: "interviewer", text: "Welcome.", timestamp: "2026-06-18T10:00:00Z" },
    ];
    expect(mergeTurns([], turns)).toEqual(turns);
  });
});

describe("appendTurns / readTurns", () => {
  it("creates a new transcript row on first call and reads it back", async () => {
    const client = createMockSupabase();
    const sessionId = "session-001";

    await appendTurns(asClient(client), sessionId, [
      { role: "interviewer", text: "Welcome to the interview.", timestamp: "2026-06-18T10:00:00Z" },
    ]);

    const stored = await readTurns(asClient(client), sessionId);

    expect(stored).toHaveLength(1);
    expect(stored[0].role).toBe("interviewer");
    expect(stored[0].text).toBe("Welcome to the interview.");
  });

  it("accumulates turns in correct order across multiple calls", async () => {
    const client = createMockSupabase();
    const sessionId = "session-002";

    const t1: Turn = {
      role: "interviewer",
      text: "Tell me about your background.",
      timestamp: "2026-06-18T10:00:00Z",
    };
    const t2: Turn = {
      role: "candidate",
      text: "I have 5 years in software engineering.",
      timestamp: "2026-06-18T10:01:00Z",
    };
    const t3: Turn = {
      role: "interviewer",
      text: "What was your most challenging project?",
      timestamp: "2026-06-18T10:02:00Z",
    };
    const t4: Turn = {
      role: "candidate",
      text: "Building a distributed caching layer that cut p99 latency by 60%.",
      timestamp: "2026-06-18T10:03:00Z",
    };

    await appendTurns(asClient(client), sessionId, [t1]);
    await appendTurns(asClient(client), sessionId, [t2]);
    await appendTurns(asClient(client), sessionId, [t3]);
    await appendTurns(asClient(client), sessionId, [t4]);

    const stored = await readTurns(asClient(client), sessionId);

    expect(stored).toHaveLength(4);
    expect(stored.map((t) => t.role)).toEqual([
      "interviewer",
      "candidate",
      "interviewer",
      "candidate",
    ]);
    expect(stored[0].timestamp).toBe("2026-06-18T10:00:00Z");
    expect(stored[3].timestamp).toBe("2026-06-18T10:03:00Z");
    expect(stored[1].text).toBe("I have 5 years in software engineering.");
    expect(stored[3].text).toBe(
      "Building a distributed caching layer that cut p99 latency by 60%."
    );
  });

  it("handles batched multi-turn appends correctly", async () => {
    const client = createMockSupabase();
    const sessionId = "session-003";

    await appendTurns(asClient(client), sessionId, [
      { role: "interviewer", text: "Q1", timestamp: "2026-06-18T10:00:00Z" },
      { role: "candidate", text: "A1", timestamp: "2026-06-18T10:01:00Z" },
    ]);

    await appendTurns(asClient(client), sessionId, [
      { role: "interviewer", text: "Q2", timestamp: "2026-06-18T10:02:00Z" },
    ]);

    const stored = await readTurns(asClient(client), sessionId);

    expect(stored).toHaveLength(3);
    expect(stored.map((t) => t.role)).toEqual([
      "interviewer",
      "candidate",
      "interviewer",
    ]);
    expect(stored.map((t) => t.text)).toEqual(["Q1", "A1", "Q2"]);
  });

  it("resume: appending to an existing transcript preserves all prior turns", async () => {
    // Simulates a user refreshing mid-interview: the server reads the existing
    // turns, the client resumes, and the next candidate turn is appended without
    // losing any history.
    const client = createMockSupabase();
    const sessionId = "session-resume";

    // Seed the transcript as it would look after the interview was already started
    // (opening question asked, first two answers given)
    await appendTurns(asClient(client), sessionId, [
      { role: "interviewer", text: "Welcome. Why do you want this role?", timestamp: "2026-06-18T09:00:00Z" },
      { role: "candidate", text: "I'm passionate about the problem space.", timestamp: "2026-06-18T09:01:00Z" },
      { role: "interviewer", text: "Can you give a concrete example?", timestamp: "2026-06-18T09:02:00Z" },
    ]);

    // User refreshes. Server calls readTurns and passes the result to the client.
    const resumedTurns = await readTurns(asClient(client), sessionId);
    expect(resumedTurns).toHaveLength(3);
    expect(resumedTurns[0].role).toBe("interviewer");

    // User speaks their second answer (the /turn API appends candidate + interviewer)
    await appendTurns(asClient(client), sessionId, [
      { role: "candidate", text: "At my last company I shipped X, which improved Y by 40%.", timestamp: "2026-06-18T09:03:00Z" },
      { role: "interviewer", text: "Tell me about a time you handled conflict.", timestamp: "2026-06-18T09:04:00Z" },
    ]);

    const final = await readTurns(asClient(client), sessionId);

    // All 5 turns must be present in order — no history lost on resume
    expect(final).toHaveLength(5);
    expect(final.map((t) => t.role)).toEqual([
      "interviewer",
      "candidate",
      "interviewer",
      "candidate",
      "interviewer",
    ]);
    expect(final[0].text).toBe("Welcome. Why do you want this role?");
    expect(final[3].text).toBe("At my last company I shipped X, which improved Y by 40%.");
    expect(final[4].text).toBe("Tell me about a time you handled conflict.");

    // Timestamps from the original session are preserved verbatim
    expect(final[0].timestamp).toBe("2026-06-18T09:00:00Z");
    expect(final[2].timestamp).toBe("2026-06-18T09:02:00Z");
  });

  it("does not mix turns between different sessions", async () => {
    const client = createMockSupabase();

    await appendTurns(asClient(client), "session-A", [
      { role: "interviewer", text: "Session A question.", timestamp: "2026-06-18T10:00:00Z" },
    ]);
    await appendTurns(asClient(client), "session-B", [
      { role: "candidate", text: "Session B answer.", timestamp: "2026-06-18T10:01:00Z" },
    ]);

    const storedA = await readTurns(asClient(client), "session-A");
    const storedB = await readTurns(asClient(client), "session-B");

    expect(storedA).toHaveLength(1);
    expect(storedA[0].role).toBe("interviewer");
    expect(storedB).toHaveLength(1);
    expect(storedB[0].role).toBe("candidate");
  });
});
