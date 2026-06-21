import type { Turn } from "./transcript";

export type QuestionCategory =
  | "technical"
  | "behavioral"
  | "experience"
  | "company_fit"
  | "visa";

export const REQUIRED_CATEGORIES: QuestionCategory[] = ["behavioral", "visa"];
export const MIN_CANDIDATE_TURNS = 5;
export const MAX_CANDIDATE_TURNS = 8;
// After this many consecutive interviewer turns on the same topic (initial question
// + follow-ups), the next system-prompt injection forces a category pivot.
export const MAX_SAME_TOPIC_TURNS = 2;

export function detectCategory(text: string): QuestionCategory | null {
  const lower = text.toLowerCase();

  if (
    /\bvisa\b|\bwork auth|\bsponsorship\b|\bright to work\b|\bwork permit\b|\bauthorized to work\b/.test(
      lower
    )
  )
    return "visa";

  if (
    /tell me about (a|an) (time|situation|instance|scenario|example)|walk me through (a|an) (time|situation|scenario|experience)|describe (a|an) (time|situation|instance|scenario|occasion|example)|give (me )?(a|an) example|share (a|an) example|what did you do when|when you('ve)? (had|had to|faced|dealt)/.test(
      lower
    )
  )
    return "behavioral";

  if (
    /technical|architecture|system design|how would you (build|design|approach)|your experience with|deep dive|scalab/.test(
      lower
    )
  )
    return "technical";

  if (
    /your (cv|resume)|you mentioned|you listed|you claimed|your role at|tell me more about your time at/.test(
      lower
    )
  )
    return "experience";

  if (
    /our (company|culture|values|team)|why \w+\?|what do you know about us|what attracts you|why this (role|company|position)/.test(
      lower
    )
  )
    return "company_fit";

  return null;
}

export function getCoveredCategories(turns: Turn[]): Set<QuestionCategory> {
  const covered = new Set<QuestionCategory>();
  for (const turn of turns) {
    if (turn.role !== "interviewer") continue;
    const cat = detectCategory(turn.text);
    if (cat) covered.add(cat);
  }
  return covered;
}

export function getCandidateTurnCount(turns: Turn[]): number {
  return turns.filter((t) => t.role === "candidate").length;
}

/**
 * Returns the current topic and how many consecutive interviewer turns have
 * been on that topic (including null follow-ups that extend the streak).
 *
 * Algorithm: walk forward through interviewer turns.
 * - An explicitly-detected category starts a new streak (count = 1).
 * - A null return means the question is a follow-up; it extends the current
 *   streak as long as an active topic exists.
 * - Nulls before the first detected category are ignored (we don't yet know
 *   the topic, so we can't count them against anything).
 */
export function getConsecutiveTurnsOnTopic(turns: Turn[]): {
  topic: QuestionCategory | null;
  count: number;
} {
  const interviewerTexts = turns
    .filter((t) => t.role === "interviewer")
    .map((t) => detectCategory(t.text));

  if (interviewerTexts.length === 0) return { topic: null, count: 0 };

  let currentTopic: QuestionCategory | null = null;
  let streakCount = 0;

  for (const cat of interviewerTexts) {
    if (cat === null) {
      // Generic follow-up — extends the streak only if we have an active topic.
      if (currentTopic !== null) streakCount++;
    } else if (cat === currentTopic) {
      // Same explicit category — extend the streak.
      streakCount++;
    } else {
      // New category detected — reset the streak.
      currentTopic = cat;
      streakCount = 1;
    }
  }

  return { topic: currentTopic, count: streakCount };
}

export function shouldEndSession(turns: Turn[]): boolean {
  const candidateCount = getCandidateTurnCount(turns);
  if (candidateCount >= MAX_CANDIDATE_TURNS) return true;

  const covered = getCoveredCategories(turns);
  const requiredCovered = REQUIRED_CATEGORIES.every((c) => covered.has(c));
  return candidateCount >= MIN_CANDIDATE_TURNS && requiredCovered;
}

export function buildCategoryGuidanceNote(turns: Turn[]): string {
  const covered = getCoveredCategories(turns);
  const candidateCount = getCandidateTurnCount(turns);
  const remaining = MAX_CANDIDATE_TURNS - candidateCount;
  const { topic: currentTopic, count: topicCount } =
    getConsecutiveTurnsOnTopic(turns);

  const all: QuestionCategory[] = [
    "technical",
    "behavioral",
    "experience",
    "company_fit",
    "visa",
  ];
  const uncovered = all.filter((c) => !covered.has(c));
  const mustCover = REQUIRED_CATEGORIES.filter((c) => !covered.has(c));

  const parts: string[] = [
    `Candidate turns answered: ${candidateCount}. Remaining budget: ~${remaining}.`,
  ];

  // Hard pivot instruction — highest priority, overrides everything else.
  // Fires once the model has drilled into a single topic long enough.
  if (topicCount >= MAX_SAME_TOPIC_TURNS && uncovered.length > 0) {
    const pivotTarget = mustCover[0] ?? uncovered[0];
    parts.push(
      `PIVOT REQUIRED: You have asked ${topicCount} consecutive questions about "${currentTopic}". ` +
        `The candidate has demonstrated sufficient depth on this topic. ` +
        `Your NEXT question MUST address "${pivotTarget}" — do NOT ask another follow-up about "${currentTopic}". ` +
        `Briefly acknowledge their answer in one sentence, then immediately pivot to ${pivotTarget}.`
    );
  } else if (mustCover.length > 0 && remaining <= mustCover.length + 1) {
    parts.push(
      `PRIORITY: You must still cover — ${mustCover.join(", ")} — before the session ends.`
    );
  } else if (uncovered.length > 0) {
    parts.push(`Not yet covered: ${uncovered.join(", ")}.`);
  } else {
    parts.push(
      "All required categories covered. Probe deeper or ask a synthesising question."
    );
  }

  return parts.join(" ");
}
