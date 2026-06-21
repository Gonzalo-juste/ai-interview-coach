export interface AnswerSignals {
  wordCount: number;
  hasNumbers: boolean;
  hedgeWordCount: number;
  estimatedStrength: "weak" | "medium" | "strong";
}

const HEDGE_WORDS = [
  "i think",
  "i guess",
  "maybe",
  "perhaps",
  "sort of",
  "kind of",
  "i feel like",
  "i believe",
  "i'm not sure",
  "i suppose",
  "probably",
  "i would say",
  "basically",
  "i don't know",
  "not sure",
];

export function analyzeAnswer(text: string): AnswerSignals {
  const lower = text.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean);

  const wordCount = words.length;
  const hasNumbers = /\d+/.test(text);
  const hedgeWordCount = HEDGE_WORDS.filter((h) => lower.includes(h)).length;

  let score = 0;
  if (wordCount >= 80) score += 2;
  else if (wordCount >= 40) score += 1;
  if (hasNumbers) score += 2;
  score -= Math.min(hedgeWordCount, 3);

  const estimatedStrength =
    score >= 4 ? "strong" : score >= 2 ? "medium" : "weak";

  return { wordCount, hasNumbers, hedgeWordCount, estimatedStrength };
}

export function buildDifficultyNote(signals: AnswerSignals): string {
  const parts: string[] = [];

  if (signals.estimatedStrength === "strong") {
    parts.push(
      "The candidate's last answer was strong and specific — you may escalate difficulty or probe a related dimension."
    );
  } else if (signals.estimatedStrength === "weak") {
    parts.push(
      "The candidate's last answer was vague or brief — probe once for specifics before moving to the next topic, but don't pile on."
    );
  } else {
    parts.push(
      "The candidate's last answer was adequate — continue at current difficulty."
    );
  }

  if (signals.hedgeWordCount >= 2) {
    parts.push(
      "Note: candidate used several hedging phrases — they may lack confidence here."
    );
  }

  if (!signals.hasNumbers && signals.wordCount > 40) {
    parts.push(
      "Their answer lacked quantified outcomes — a good follow-up would ask for specific numbers or measurable impact."
    );
  }

  return parts.join(" ");
}
