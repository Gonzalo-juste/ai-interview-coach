import Anthropic from "@anthropic-ai/sdk";
import type { Turn } from "@/lib/interview/transcript";

// ---------------------------------------------------------------------------
// Anthropic tool definitions
// ---------------------------------------------------------------------------

// Behavioral answers: full STAR evaluation + rewrite + optional cultural note.
// cultural_note is not in `required` — the model omits the field when not
// applicable, and the pipeline treats a missing key as null.
export const BEHAVIORAL_TOOL: Anthropic.Tool = {
  name: "score_behavioral_answer",
  description:
    "Evaluate a behavioral interview answer using the STAR framework and produce " +
    "a native-speaker rewrite. Only call this tool for behavioral answers.",
  input_schema: {
    type: "object" as const,
    properties: {
      star_situation_present: {
        type: "boolean",
        description: "Does the answer describe a specific situation with enough context?",
      },
      star_task_present: {
        type: "boolean",
        description: "Does the answer clarify the candidate's specific role or responsibility?",
      },
      star_action_present: {
        type: "boolean",
        description: "Does the answer describe concrete actions the candidate personally took?",
      },
      star_result_present: {
        type: "boolean",
        description: "Does the answer include a measurable or observable outcome?",
      },
      star_quality_score: {
        type: "integer",
        minimum: 1,
        maximum: 5,
        description:
          "Overall STAR quality: 1=no structure, 3=adequate but vague, 5=strong structured story with clear impact.",
      },
      rewrite: {
        type: "string",
        description:
          "A native-speaker rewrite of the candidate's answer. Preserve all facts, " +
          "specifics, and story structure. Fix grammar, idioms, and fluency only. " +
          "Do not add achievements or details that were not mentioned.",
      },
      cultural_note: {
        type: "string",
        description:
          "A brief coaching note if the answer undersells an achievement or uses " +
          "overly modest framing where confident framing is culturally expected in " +
          "English-language interviews. Suggest a more assertive rephrasing without " +
          "fabricating anything. Omit this field entirely if the framing is already appropriate.",
      },
    },
    required: [
      "star_situation_present",
      "star_task_present",
      "star_action_present",
      "star_result_present",
      "star_quality_score",
      "rewrite",
    ],
  },
};

// Non-behavioral answers (technical, visa, experience, company_fit):
// rewrite + optional cultural note only. STAR scores are always null for these.
export const NON_BEHAVIORAL_TOOL: Anthropic.Tool = {
  name: "score_non_behavioral_answer",
  description:
    "Produce a native-speaker rewrite of a non-behavioral interview answer " +
    "(technical, experience, company-fit, or visa questions). Do not score for STAR.",
  input_schema: {
    type: "object" as const,
    properties: {
      rewrite: {
        type: "string",
        description:
          "A native-speaker rewrite preserving all facts. Fix grammar, idioms, and " +
          "fluency only. Do not add information that was not in the original answer.",
      },
      cultural_note: {
        type: "string",
        description:
          "Optional: a brief coaching note if the candidate undersells themselves " +
          "or uses unexpectedly modest framing. Omit if framing is already appropriate.",
      },
    },
    required: ["rewrite"],
  },
};

// Session-level aggregation: story gaps + CV gaps.
export const SESSION_ANALYSIS_TOOL: Anthropic.Tool = {
  name: "analyze_session",
  description:
    "Analyze the full interview transcript against the candidate's CV and job description " +
    "to identify story gaps and CV-gap mismatches.",
  input_schema: {
    type: "object" as const,
    properties: {
      story_gaps: {
        type: "array",
        description:
          "Assessment of five behavioral story archetypes. Always include all five entries.",
        items: {
          type: "object",
          properties: {
            archetype: {
              type: "string",
              enum: [
                "conflict_with_teammate",
                "failure_recovery",
                "leadership_under_ambiguity",
                "prioritization_under_pressure",
                "disagreeing_with_authority",
              ],
            },
            status: {
              type: "string",
              enum: ["missing", "thin", "covered"],
              description:
                "missing: never addressed; thin: touched on but no concrete outcome; " +
                "covered: full story with situation, action, and result.",
            },
            note: {
              type: "string",
              description:
                "One sentence for the candidate. For missing/thin: what question " +
                "they should prepare. For covered: positive acknowledgement.",
            },
          },
          required: ["archetype", "status", "note"],
        },
      },
      cv_gaps: {
        type: "array",
        description:
          "Claims or achievements from the CV that were or were not substantiated in the interview.",
        items: {
          type: "object",
          properties: {
            claim: {
              type: "string",
              description: "The specific claim or achievement from the CV.",
            },
            cv_excerpt: {
              type: "string",
              description: "The exact phrase or sentence from the CV.",
            },
            evidenced: {
              type: "boolean",
              description:
                "true if the candidate substantiated this claim with a concrete story " +
                "during the interview; false if it was never demonstrated.",
            },
            note: {
              type: "string",
              description:
                "For evidenced=false: a specific suggested interview story or example " +
                "the candidate could prepare. For evidenced=true: brief confirmation.",
            },
          },
          required: ["claim", "cv_excerpt", "evidenced", "note"],
        },
      },
    },
    required: ["story_gaps", "cv_gaps"],
  },
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export interface AnswerPromptCtx {
  questionText: string | null;
  answerText: string;
  isBehavioral: boolean;
}

export function buildAnswerSystemPrompt(ctx: AnswerPromptCtx): string {
  const questionSection = ctx.questionText
    ? `INTERVIEWER QUESTION:\n${ctx.questionText}\n\n`
    : "";

  return (
    `You are an expert English-language interview coach specialising in non-native speakers.\n\n` +
    `${questionSection}` +
    `CANDIDATE'S ANSWER:\n${ctx.answerText}\n\n` +
    (ctx.isBehavioral
      ? `Evaluate this behavioral answer for STAR structure, rewrite it in natural idiomatic ` +
        `English, and flag any cultural framing issues. Call score_behavioral_answer.`
      : `Rewrite this answer in natural idiomatic English, preserving all facts. ` +
        `Flag any cultural framing issues if present. Call score_non_behavioral_answer.`)
  );
}

export interface SessionPromptCtx {
  jdText: string;
  cvText: string;
  turns: Turn[];
}

export function buildSessionSystemPrompt(ctx: SessionPromptCtx): string {
  const transcript = ctx.turns
    .map((t) => `[${t.role.toUpperCase()}]: ${t.text}`)
    .join("\n\n");

  return (
    `You are an expert interview coach. Analyze the following interview session.\n\n` +
    `JOB DESCRIPTION:\n${ctx.jdText || "(not provided)"}\n\n` +
    `CANDIDATE CV:\n${ctx.cvText || "(not provided)"}\n\n` +
    `FULL TRANSCRIPT:\n${transcript}\n\n` +
    `Identify: (1) which of the five behavioral story archetypes were covered/missing/thin, ` +
    `and (2) which CV claims were or were not substantiated in the interview. ` +
    `Call analyze_session with your findings.`
  );
}
