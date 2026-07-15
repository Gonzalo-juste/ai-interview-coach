import Anthropic from "@anthropic-ai/sdk";
import type { Turn } from "@/lib/interview/transcript";

// ---------------------------------------------------------------------------
// Anthropic tool definitions
// ---------------------------------------------------------------------------

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

export const SESSION_ANALYSIS_TOOL: Anthropic.Tool = {
  name: "analyze_session",
  description:
    "Analyze the full interview transcript against the candidate's CV and job description. " +
    "Produce a comprehensive coaching report with session verdict, gap analysis, " +
    "strength evidence, language coaching, and role-fit assessment.",
  input_schema: {
    type: "object" as const,
    properties: {

      // ── Verdict + priority ────────────────────────────────────────────────
      readiness_verdict: {
        type: "string",
        description:
          "1-3 sentence qualitative judgment on overall interview readiness. " +
          "MUST open by naming something real and specific the candidate did well BEFORE naming any gap. " +
          "Read like an experienced, honest interview coach — grounded entirely in transcript evidence. " +
          "Never generic encouragement.",
      },
      top_priority: {
        type: "string",
        description:
          "ONE specific, actionable thing to fix before the next real interview. " +
          "Pulled from the highest-severity gap (missing story archetype, CV gap, or recurring language issue). " +
          "Singular and concrete enough to act on directly.",
      },

      // ── Story gaps (all 5, with prepare_action) ───────────────────────────
      story_gaps: {
        type: "array",
        description: "Assessment of five behavioral story archetypes. Always include all five entries.",
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
                "One sentence for the candidate. For covered: positive acknowledgement. " +
                "For missing/thin: describe what was lacking.",
            },
            prepare_action: {
              type: "string",
              description:
                "A short, concrete instruction for what to prepare. E.g. " +
                "'Write down a specific story where you had to deliver difficult feedback to a colleague' " +
                "or 'Review your Polars story — add the business impact metric you mentioned briefly.' " +
                "For covered: a brief reinforcing note rather than a preparation task.",
            },
          },
          required: ["archetype", "status", "note", "prepare_action"],
        },
      },

      // ── CV gaps (bidirectional) ────────────────────────────────────────────
      cv_gaps: {
        type: "array",
        description:
          "Bidirectional CV ↔ interview analysis. Two directions: " +
          "(1) cv_to_interview: ONLY for load-bearing CV claims not demonstrated (e.g. core skills, key projects) — " +
          "never flag minor tools or secondary bullet points. " +
          "(2) interview_to_cv: things said strongly in the interview that are NOT on the CV — " +
          "suggest a specific CV line to add.",
        items: {
          type: "object",
          properties: {
            direction: {
              type: "string",
              enum: ["cv_to_interview", "interview_to_cv"],
              description:
                "cv_to_interview: CV claim not backed up in interview. " +
                "interview_to_cv: strong interview claim missing from CV.",
            },
            claim: {
              type: "string",
              description:
                "For cv_to_interview: the CV claim. For interview_to_cv: the thing the candidate said.",
            },
            cv_excerpt: {
              type: "string",
              description:
                "For cv_to_interview: exact phrase from the CV. " +
                "For interview_to_cv: the relevant transcript excerpt.",
            },
            evidenced: {
              type: "boolean",
              description:
                "For cv_to_interview: true if substantiated in the interview. " +
                "For interview_to_cv: always false (the point is it's missing from the CV).",
            },
            note: {
              type: "string",
              description:
                "For cv_to_interview: frame as opportunity — 'Not covered this session — worth having a concrete example ready.' " +
                "For interview_to_cv: why this matters and suggest adding it.",
            },
            suggested_cv_line: {
              type: "string",
              description:
                "interview_to_cv ONLY: a concrete CV bullet point the candidate could add, with specific wording. " +
                "Omit for cv_to_interview items.",
            },
          },
          required: ["direction", "claim", "cv_excerpt", "evidenced", "note"],
        },
      },

      // ── Role fit ──────────────────────────────────────────────────────────
      role_fit_verdict: {
        type: "object",
        description:
          "Direct, role-specific synthesis: what the candidate clearly demonstrated vs. " +
          "what this specific JD needs and wasn't shown. Grounded in transcript evidence and actual JD text.",
        properties: {
          have: {
            type: "array",
            items: { type: "string" },
            description:
              "1-4 things the candidate clearly demonstrated, tied to JD requirements. " +
              "Specific and evidence-grounded — never vague like 'good communication.'",
          },
          need: {
            type: "array",
            items: { type: "string" },
            description:
              "1-4 things this specific role/JD cares about that weren't demonstrated. " +
              "Specific to the JD — not generic interview advice.",
          },
        },
        required: ["have", "need"],
      },

      // ── Reassurance ───────────────────────────────────────────────────────
      reassurance_note: {
        type: "string",
        description:
          "2-3 honest, grounded sentences addressing interview anxiety directly. " +
          "Must be true and specific to this candidate's actual performance — never generic platitudes. " +
          "Do NOT reference an imagined 'ideal native speaker' — frame around the candidate's " +
          "own demonstrated strengths against the role.",
      },

      // ── Optional enrichment fields ─────────────────────────────────────────
      strength_evidence: {
        type: "array",
        description:
          "0-3 specific, evidenced instances where the candidate handled real pressure well — " +
          "a tough follow-up, a self-correction, a clear technical explanation under repeated probing. " +
          "CRITICAL: only include genuinely strong moments. If the session is weak, return 0-1 items. " +
          "Never pad to reach a target count. Empty array is valid.",
        items: {
          type: "object",
          properties: {
            moment: {
              type: "string",
              description: "What the candidate did — specific quote or paraphrase from the transcript.",
            },
            why_it_matters: {
              type: "string",
              description: "Why this impressed — what it signals to a real interviewer.",
            },
          },
          required: ["moment", "why_it_matters"],
        },
      },
      interviewer_pressure_reframe: {
        type: "array",
        description:
          "0-2 moments where the interviewer asked multiple follow-ups on the same topic, " +
          "reframed as engagement/interest — ONLY when that's genuinely what the transcript shows " +
          "(probing depth, not correcting an error). Do NOT reframe a correction as praise.",
        items: {
          type: "object",
          properties: {
            observation: {
              type: "string",
              description: "What happened: the repeated follow-up pattern observed.",
            },
            reframe: {
              type: "string",
              description: "The honest reframe: why this is a positive signal, not a failure signal.",
            },
          },
          required: ["observation", "reframe"],
        },
      },
      star_method_note: {
        type: "string",
        description:
          "If the candidate used STAR structure in a behavioral answer WITHOUT being taught it: " +
          "name this as a transferable method they already used. E.g. 'You structured your X story as " +
          "Situation → Task → Action → Result without naming it — that's the STAR method.' " +
          "If answers were unstructured, briefly introduce STAR as a tool to use next time (framed as a gift). " +
          "Omit this field entirely if not applicable.",
      },
      language_patterns: {
        type: "array",
        description:
          "Recurring grammatical or structural patterns across 2+ answers. " +
          "Derived by comparing originals with rewrites across all answers together. " +
          "Frame each as 'here's how to say what you already know, more smoothly' — never 'your grammar is broken.' " +
          "If no clear pattern exists, return empty array.",
        items: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Short label for the pattern, e.g. 'Article omission before roles/projects'.",
            },
            example_count: {
              type: "integer",
              description: "How many answers showed this pattern.",
            },
            description: {
              type: "string",
              description: "Specific, positive coaching note with a brief before/after example.",
            },
          },
          required: ["pattern", "example_count", "description"],
        },
      },
    },
    required: [
      "readiness_verdict",
      "top_priority",
      "story_gaps",
      "cv_gaps",
      "role_fit_verdict",
      "reassurance_note",
      "strength_evidence",
      "interviewer_pressure_reframe",
      "language_patterns",
    ],
  },
};

// Tool for extracting company research suggestions from raw search results.
// Used in the post-analysis company research step.
export const COMPANY_RESEARCH_SUGGESTION_TOOL: Anthropic.Tool = {
  name: "extract_company_research_suggestions",
  description:
    "Extract specific, concrete research suggestions from raw web search results about a company. " +
    "Only surface suggestions grounded in the actual search results provided — never invent or guess.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description:
          "Brief description of what the search found, or explanation of why reliable " +
          "suggestions could not be extracted (thin results, stale content, etc.).",
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description:
          "2-3 concrete, specific things the candidate should research before a real interview " +
          "— e.g. a named recent product, initiative, or technology. " +
          "Must be grounded in the actual search results. Empty array if results are thin or ambiguous.",
      },
    },
    required: ["summary", "suggestions"],
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
  archetype: string;
}

function toneInstruction(archetype: string): string {
  if (archetype === "tough") {
    return (
      "TONE MODE: Direct and unsoftened. Name weaknesses plainly. " +
      "Remain evidence-based and professional — never cruel or dismissive. " +
      "Do not soften language around gaps."
    );
  }
  if (archetype === "friendly") {
    return (
      "TONE MODE: Lead with strength and frame gaps as next steps. " +
      "Use encouragement-forward language while remaining honest. " +
      "Never change the underlying severity judgment — only the framing."
    );
  }
  return "TONE MODE: Balanced and neutral. Professional and direct without being harsh.";
}

export function buildSessionSystemPrompt(ctx: SessionPromptCtx): string {
  const transcript = ctx.turns
    .map((t) => `[${t.role.toUpperCase()}]: ${t.text}`)
    .join("\n\n");

  return (
    `You are an expert interview coach. Analyze the following mock interview session and produce a comprehensive coaching report.\n\n` +
    `${toneInstruction(ctx.archetype)}\n` +
    `CRITICAL: Tone affects ONLY phrasing and word choice. Underlying facts, gap severity, and judgments must be identical regardless of tone mode.\n\n` +
    `JOB DESCRIPTION:\n${ctx.jdText || "(not provided)"}\n\n` +
    `CANDIDATE CV:\n${ctx.cvText || "(not provided)"}\n\n` +
    `FULL TRANSCRIPT:\n${transcript}\n\n` +
    `ANALYSIS INSTRUCTIONS:\n` +
    `1. readiness_verdict: Open by naming ONE real, specific thing the candidate did well (grounded in transcript). THEN name the most important gap. 1-3 sentences total.\n` +
    `2. top_priority: The single most urgent, actionable fix before a real interview.\n` +
    `3. story_gaps: All 5 archetypes. Add prepare_action: a concrete, specific preparation instruction for each.\n` +
    `4. cv_gaps (bidirectional):\n` +
    `   - cv_to_interview: ONLY load-bearing claims (core skills, key projects central to the role). Frame as opportunity, not failure. Skip minor tools.\n` +
    `   - interview_to_cv: scan the transcript for strong, specific things said that are NOT on the CV. Suggest concrete CV wording.\n` +
    `5. role_fit_verdict: Compare demonstrated evidence vs JD requirements. Specific and tied to actual JD language.\n` +
    `6. reassurance_note: 2-3 honest, specific sentences about this candidate's actual strengths vs this specific role. No generic platitudes.\n` +
    `7. strength_evidence: ONLY genuine high-quality moments under pressure. 0 items is valid — do not pad.\n` +
    `8. interviewer_pressure_reframe: ONLY reframe follow-up probes that were genuinely about depth, not corrections.\n` +
    `9. star_method_note: If STAR structure was used naturally, name it. If answers were unstructured, introduce STAR as a gift.\n` +
    `10. language_patterns: Look across ALL rewrites vs originals for recurring patterns (min 2 answers). Positive framing only.\n\n` +
    `Call analyze_session with your complete findings.`
  );
}

export interface CompanyResearchPromptCtx {
  companyName: string;
  rawContent: string;
}

export function buildCompanyResearchPrompt(ctx: CompanyResearchPromptCtx): string {
  return (
    `You are helping a job candidate prepare for an interview at ${ctx.companyName}.\n\n` +
    `Below are web search results about ${ctx.companyName}'s recent products, technology, and strategic initiatives.\n\n` +
    `SEARCH RESULTS:\n${ctx.rawContent}\n\n` +
    `Extract 2-3 SPECIFIC, CONCRETE things the candidate should research before their real interview. ` +
    `Each suggestion must be directly grounded in what the search results actually say — never invent or generalize. ` +
    `If results are thin, stale, or too vague to produce specific suggestions, return an empty array and explain why in the summary.\n\n` +
    `Call extract_company_research_suggestions.`
  );
}
