import { describe, it, expect } from "vitest";
import {
  detectCategory,
  getConsecutiveTurnsOnTopic,
  buildCategoryGuidanceNote,
  MAX_SAME_TOPIC_TURNS,
} from "../lib/interview/categories";
import type { Turn } from "../lib/interview/transcript";

function t(
  items: { role: "interviewer" | "candidate"; text: string }[]
): Turn[] {
  return items.map((item, i) => ({
    ...item,
    timestamp: `2026-06-20T10:${String(i).padStart(2, "0")}:00Z`,
  }));
}

// ── detectCategory ────────────────────────────────────────────────────────────

describe("detectCategory", () => {
  it("identifies visa questions", () => {
    expect(detectCategory("Do you require visa sponsorship to work here?")).toBe("visa");
    expect(detectCategory("Are you authorized to work in the US?")).toBe("visa");
    expect(detectCategory("What is your current work permit status?")).toBe("visa");
  });

  it("identifies behavioral questions", () => {
    expect(detectCategory("Tell me about a time you handled a conflict at work.")).toBe("behavioral");
    expect(detectCategory("Give me an example of showing leadership under pressure.")).toBe("behavioral");
    expect(detectCategory("Describe a situation where you dealt with ambiguity.")).toBe("behavioral");
    // Phrasings present in real transcripts that the original regex missed:
    expect(detectCategory("Walk me through a time when you've built something you're proud of?")).toBe("behavioral");
    expect(detectCategory("Walk me through a time you had to debug a critical production issue.")).toBe("behavioral");
    expect(detectCategory("Describe a time when you disagreed with your manager.")).toBe("behavioral");
    expect(detectCategory("When you've faced a tight deadline, how did you prioritise?")).toBe("behavioral");
    expect(detectCategory("When you've dealt with a difficult stakeholder, what did you do?")).toBe("behavioral");
  });

  // Phrasings the LLM interviewer generates that the old regex missed and caused
  // behavioral answers to be routed through score_non_behavioral_answer in Phase 4.
  it("identifies behavioral questions — extended phrasings (Phase 4 regression fix)", () => {
    // "walk me through a situation/scenario" — was missing (only "time" was covered)
    expect(detectCategory("Walk me through a situation where you had to pick up a new skill rapidly.")).toBe("behavioral");
    expect(detectCategory("Walk me through a situation where you disagreed with a colleague.")).toBe("behavioral");
    expect(detectCategory("Walk me through a scenario where you had to reprioritise mid-project.")).toBe("behavioral");

    // "describe an instance/scenario" — was missing ("instance" not in the allowed noun list)
    expect(detectCategory("Describe an instance when you had to learn something new under pressure.")).toBe("behavioral");
    expect(detectCategory("Describe a scenario where you needed to manage a difficult stakeholder.")).toBe("behavioral");
    expect(detectCategory("Describe an occasion when you made a decision with incomplete information.")).toBe("behavioral");

    // "tell me about a situation/instance/example" — "a time" variant already worked;
    // these extend it to other nouns the LLM might naturally use
    expect(detectCategory("Tell me about a situation where you had to influence without authority.")).toBe("behavioral");
    expect(detectCategory("Tell me about an instance when your approach to a problem backfired.")).toBe("behavioral");

    // "share an example" — newly added pattern
    expect(detectCategory("Can you share an example of a time you had to adapt quickly?")).toBe("behavioral");
  });

  it("does NOT mis-classify follow-up probes as behavioral after the regex expansion", () => {
    // Regression guard: ensure the broader patterns didn't introduce false positives
    // on the specific follow-up probe phrasings that are supposed to return null.
    expect(detectCategory("What were the main bottlenecks you encountered?")).toBeNull();
    expect(detectCategory("How did that turn out?")).toBeNull();
    expect(detectCategory("Can you elaborate on that approach?")).toBeNull();
    expect(detectCategory("What metrics did you track?")).toBeNull();
    expect(detectCategory("How did you handle that at scale?")).toBeNull();
  });

  it("identifies technical questions", () => {
    expect(detectCategory("Can you walk me through the architecture of that system?")).toBe("technical");
    expect(detectCategory("How would you design a scalable data pipeline?")).toBe("technical");
  });

  it("returns null for generic follow-ups that don't match any category", () => {
    // These are the questions that were drilling into the ML project:
    expect(detectCategory("What were the main bottlenecks you encountered?")).toBeNull();
    expect(detectCategory("How did you handle that at scale?")).toBeNull();
    expect(detectCategory("What metrics did you track for the model?")).toBeNull();
    expect(detectCategory("Can you elaborate on that approach?")).toBeNull();
    expect(detectCategory("How did that turn out?")).toBeNull();
    // The four follow-ups from the live session that were (correctly) null:
    expect(detectCategory("When you realized it kept going down the same thread, what was your first hypothesis?")).toBeNull();
    expect(detectCategory("What exactly did you change in your code to prevent that counter from resetting?")).toBeNull();
    expect(detectCategory("Did you consider any other approaches besides tightening the pattern itself?")).toBeNull();
    expect(detectCategory("Did you actually measure or test whether your final fix worked?")).toBeNull();
  });
});

// ── getConsecutiveTurnsOnTopic ────────────────────────────────────────────────

describe("getConsecutiveTurnsOnTopic", () => {
  it("returns count 0 with topic null when there are no turns", () => {
    expect(getConsecutiveTurnsOnTopic([])).toEqual({ topic: null, count: 0 });
  });

  it("returns count 1 for a single detected-category interviewer question", () => {
    const result = getConsecutiveTurnsOnTopic(
      t([
        { role: "interviewer", text: "Walk me through your ML pipeline architecture." },
        { role: "candidate", text: "We used TensorFlow and a feature store." },
      ])
    );
    expect(result.topic).toBe("technical");
    expect(result.count).toBe(1);
  });

  it("counts null follow-ups as extending the current topic streak", () => {
    // This is exactly the bug scenario: opening architecture question + 3 follow-ups
    const result = getConsecutiveTurnsOnTopic(
      t([
        { role: "interviewer", text: "Walk me through your ML pipeline architecture." }, // technical → streak=1
        { role: "candidate", text: "We used TensorFlow and distributed training." },
        { role: "interviewer", text: "What were the main bottlenecks you faced?" }, // null → streak=2
        { role: "candidate", text: "The main issue was training latency." },
        { role: "interviewer", text: "How did you optimize the training loop?" }, // null → streak=3
        { role: "candidate", text: "We used quantization and gradient checkpointing." },
        { role: "interviewer", text: "What metrics did you track for the model?" }, // null → streak=4
        { role: "candidate", text: "We tracked p99 latency and throughput." },
      ])
    );
    expect(result.topic).toBe("technical");
    expect(result.count).toBe(4);
    expect(result.count).toBeGreaterThanOrEqual(MAX_SAME_TOPIC_TURNS);
  });

  it("resets the streak when a new explicit category is detected", () => {
    const result = getConsecutiveTurnsOnTopic(
      t([
        { role: "interviewer", text: "Walk me through the architecture." }, // technical → streak=1
        { role: "candidate", text: "We used microservices." },
        { role: "interviewer", text: "What bottlenecks did you face?" }, // null → streak=2
        { role: "candidate", text: "Training was slow." },
        { role: "interviewer", text: "Tell me about a time you handled a conflict." }, // behavioral → reset, streak=1
        { role: "candidate", text: "At my last company..." },
      ])
    );
    expect(result.topic).toBe("behavioral");
    expect(result.count).toBe(1);
  });

  it("does not count null questions that appear before any category is detected", () => {
    const result = getConsecutiveTurnsOnTopic(
      t([
        { role: "interviewer", text: "Can you tell me a bit about yourself?" }, // null — no active topic yet
        { role: "candidate", text: "Sure, I'm a software engineer..." },
        { role: "interviewer", text: "Walk me through the architecture of your main project." }, // technical → streak=1
        { role: "candidate", text: "We used..." },
      ])
    );
    expect(result.topic).toBe("technical");
    expect(result.count).toBe(1); // opener doesn't count toward the streak
  });

  it("correctly handles topic switch mid-stream with null follow-ups on both sides", () => {
    // technical + follow-up, then behavioral + follow-up
    const result = getConsecutiveTurnsOnTopic(
      t([
        { role: "interviewer", text: "Walk me through the architecture." }, // technical → streak=1
        { role: "candidate", text: "We used..." },
        { role: "interviewer", text: "What bottlenecks did you face?" }, // null → streak=2 (technical)
        { role: "candidate", text: "Training was slow." },
        { role: "interviewer", text: "Tell me about a time you handled conflict." }, // behavioral → reset, streak=1
        { role: "candidate", text: "Once I had a disagreement..." },
        { role: "interviewer", text: "How did that resolution affect the team?" }, // null → streak=2 (behavioral)
        { role: "candidate", text: "It improved trust significantly." },
      ])
    );
    expect(result.topic).toBe("behavioral");
    expect(result.count).toBe(2);
  });
});

// ── buildCategoryGuidanceNote — pivot enforcement ─────────────────────────────

describe("buildCategoryGuidanceNote — pivot enforcement", () => {
  it("does NOT emit PIVOT when the streak is below MAX_SAME_TOPIC_TURNS", () => {
    const note = buildCategoryGuidanceNote(
      t([
        { role: "interviewer", text: "Walk me through your ML pipeline architecture." }, // streak=1
        { role: "candidate", text: "We used TensorFlow." },
      ])
    );
    expect(note).not.toContain("PIVOT");
  });

  it("emits PIVOT REQUIRED once streak reaches MAX_SAME_TOPIC_TURNS", () => {
    // streak hits 2 after the first follow-up
    const note = buildCategoryGuidanceNote(
      t([
        { role: "interviewer", text: "Walk me through your ML pipeline architecture." }, // technical, streak=1
        { role: "candidate", text: "We used TensorFlow." },
        { role: "interviewer", text: "What bottlenecks did you face?" }, // null, streak=2 → threshold
        { role: "candidate", text: "Training latency was the main issue." },
      ])
    );
    expect(note).toContain("PIVOT REQUIRED");
    expect(note).toContain("technical");
  });

  it("targets a required category (behavioral or visa) in the pivot instruction", () => {
    const note = buildCategoryGuidanceNote(
      t([
        { role: "interviewer", text: "Can you describe the architecture of your ML system?" }, // technical, streak=1
        { role: "candidate", text: "We used a microservices approach." },
        { role: "interviewer", text: "How did you handle failures in the pipeline?" }, // null, streak=2
        { role: "candidate", text: "We added retries and circuit breakers." },
      ])
    );
    expect(note).toContain("PIVOT REQUIRED");
    // behavioral and visa are both required and uncovered — pivot note must name one
    expect(note).toMatch(/behavioral|visa/);
  });

  it("replicates the exact reported bug: 4 drill-downs on same ML project", () => {
    const bugTurns = t([
      { role: "interviewer", text: "Walk me through your ML pipeline architecture." }, // technical, streak=1
      { role: "candidate", text: "We used TensorFlow and distributed training." },
      { role: "interviewer", text: "What were the main bottlenecks you faced?" }, // null, streak=2 → fires
      { role: "candidate", text: "The main issue was training latency." },
      { role: "interviewer", text: "How did you optimize the training loop?" }, // null, streak=3
      { role: "candidate", text: "We used quantization and pruning." },
      { role: "interviewer", text: "What metrics did you track for the model?" }, // null, streak=4
      { role: "candidate", text: "We tracked p99 latency and throughput." },
    ]);

    const note = buildCategoryGuidanceNote(bugTurns);
    expect(note).toContain("PIVOT REQUIRED");
    expect(note).toContain("technical");
    // Must direct to a required category since behavioral and visa are both uncovered
    expect(note).toMatch(/behavioral|visa/);
    // The pivot note names the topic the model must NOT revisit
    expect(note).toContain('"technical"');
  });

  it("clears PIVOT after the model pivots to a new category, then can re-trigger", () => {
    // The model followed the pivot instruction and asked a behavioral question.
    // The streak resets to 1 on behavioral → no PIVOT note.
    const note = buildCategoryGuidanceNote(
      t([
        { role: "interviewer", text: "Walk me through the system architecture." }, // technical, streak=1
        { role: "candidate", text: "We used microservices." },
        { role: "interviewer", text: "What was the hardest part?" }, // null, streak=2 → fired pivot
        { role: "candidate", text: "The hardest part was consistency." },
        { role: "interviewer", text: "Tell me about a time you handled a conflict at work." }, // behavioral → streak=1
        { role: "candidate", text: "At my last company there was a disagreement about priorities..." },
      ])
    );
    expect(note).not.toContain("PIVOT REQUIRED");
    // visa is still uncovered and required — should still appear in guidance
    expect(note).toContain("visa");
  });

  it("does not emit PIVOT when all categories are already covered", () => {
    // All 5 categories hit — even with a long technical streak, no pivot needed
    const note = buildCategoryGuidanceNote(
      t([
        { role: "interviewer", text: "Walk me through the architecture." }, // technical
        { role: "candidate", text: "..." },
        { role: "interviewer", text: "Tell me about a time you handled conflict." }, // behavioral
        { role: "candidate", text: "..." },
        { role: "interviewer", text: "Your resume mentions a fintech role." }, // experience
        { role: "candidate", text: "..." },
        { role: "interviewer", text: "Why this company specifically?" }, // company_fit
        { role: "candidate", text: "..." },
        { role: "interviewer", text: "Do you require visa sponsorship?" }, // visa
        { role: "candidate", text: "No, I'm authorized to work here." },
        { role: "interviewer", text: "Great. Back to the architecture — how did you handle load spikes?" }, // technical, streak=2
        { role: "candidate", text: "We used auto-scaling." },
        { role: "interviewer", text: "What was the peak traffic you handled?" }, // null, streak=2
        { role: "candidate", text: "About 50k RPS." },
      ])
    );
    expect(note).not.toContain("PIVOT REQUIRED");
    expect(note).toContain("All required categories covered");
  });

  // ── Regression: live-session transcript replay ─────────────────────────────
  // Q1 used "Walk me through a time" which did NOT match the old behavioral regex,
  // keeping currentTopic=null throughout so the streak was always 0 and PIVOT
  // never fired even after 5 consecutive questions on the same story.
  it("regression: 'walk me through a time' opener registers as behavioral and triggers PIVOT after one follow-up", () => {
    // Q1 opener — the phrase that was previously undetected
    expect(detectCategory("Walk me through a time when you've built something with code that you're genuinely proud of?")).toBe("behavioral");

    // Replay the exact live transcript (answers abbreviated)
    const liveTurns = t([
      { role: "interviewer", text: "Walk me through a time when you've built something with code that you're genuinely proud of?" }, // was: null → now: behavioral, streak=1
      { role: "candidate",   text: "I built a category-rotation system for an AI interviewer that..." },
      { role: "interviewer", text: "When you realized it kept going down the same thread, what was your first hypothesis about what was causing that?" }, // null → streak=2 → PIVOT fires here
      { role: "candidate",   text: "My first hypothesis was that the regex wasn't matching the opener phrase..." },
      { role: "interviewer", text: "What exactly did you change in your code to prevent that counter from resetting?" }, // null → streak=3
      { role: "candidate",   text: "I added 'walk me through a time' to the behavioral patterns..." },
      { role: "interviewer", text: "Did you consider any other approaches besides tightening the pattern itself?" }, // null → streak=4
      { role: "candidate",   text: "Yes, I also considered using the LLM for classification..." },
      { role: "interviewer", text: "Did you actually measure or test whether your final fix worked?" }, // null → streak=5
      { role: "candidate",   text: "Yes, I added Vitest tests for the exact phrases that failed." },
    ]);

    // Streak should be 5 (1 behavioral opener + 4 null follow-ups)
    const { topic, count } = getConsecutiveTurnsOnTopic(liveTurns);
    expect(topic).toBe("behavioral");
    expect(count).toBeGreaterThanOrEqual(MAX_SAME_TOPIC_TURNS);

    // PIVOT REQUIRED must appear in the note after the second turn (Q3 onwards)
    // Test the state after Q2's candidate answer (turns 0-3 = I1, C1, I2, C2)
    const afterQ2Answer = liveTurns.slice(0, 4);
    const note = buildCategoryGuidanceNote(afterQ2Answer);
    expect(note).toContain("PIVOT REQUIRED");
    expect(note).toContain("behavioral");
    // Must target visa (the other required category that's uncovered)
    expect(note).toMatch(/visa/);
  });
});
