import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectCategory, type QuestionCategory } from "@/lib/interview/categories";
import type { Turn } from "@/lib/interview/transcript";
import { searchCompanyProductUpdates } from "@/lib/llm/research";
import {
  BEHAVIORAL_TOOL,
  NON_BEHAVIORAL_TOOL,
  SESSION_ANALYSIS_TOOL,
  COMPANY_RESEARCH_SUGGESTION_TOOL,
  buildAnswerSystemPrompt,
  buildSessionSystemPrompt,
  buildCompanyResearchPrompt,
} from "./prompts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnswerContext {
  turnIndex: number;
  questionText: string | null;
  answerText: string;
  isBehavioral: boolean;
}

export interface PerAnswerResult {
  turnIndex: number;
  star_situation_present: boolean | null;
  star_task_present: boolean | null;
  star_action_present: boolean | null;
  star_result_present: boolean | null;
  star_quality_score: number | null;
  rewrite: string;
  cultural_note: string | null;
}

export interface CompanyResearchSuggestion {
  searched: boolean;
  summary: string;
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

export function buildAnswerContexts(turns: Turn[]): AnswerContext[] {
  const contexts: AnswerContext[] = [];
  let lastInterviewerText: string | null = null;
  // Sticky category: when the interviewer asks a follow-up probe that doesn't
  // match any category (detectCategory → null), that probe is part of the same
  // topic as the previous explicit question. Without stickiness, drill-down
  // answers to behavioral questions would get classified as non-behavioral.
  let activeCategory: QuestionCategory | null = null;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role === "interviewer") {
      lastInterviewerText = turn.text;
      const detected = detectCategory(turn.text);
      if (detected !== null) {
        // Only update the active category on an explicit detection.
        // null = follow-up probe — inherit the previous category.
        activeCategory = detected;
      }
    } else if (turn.role === "candidate") {
      contexts.push({
        turnIndex: i,
        questionText: lastInterviewerText,
        answerText: turn.text,
        isBehavioral: activeCategory === "behavioral",
      });
    }
  }

  return contexts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(300 * Math.pow(2, attempt)); // 300ms, 600ms
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Per-answer LLM call
// ---------------------------------------------------------------------------

async function processAnswer(
  anthropic: Anthropic,
  ctx: AnswerContext
): Promise<PerAnswerResult> {
  const tool = ctx.isBehavioral ? BEHAVIORAL_TOOL : NON_BEHAVIORAL_TOOL;

  const msg = await callWithRetry(() =>
    anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: buildAnswerSystemPrompt(ctx),
      messages: [{ role: "user", content: "Score and rewrite this interview answer." }],
      tools: [tool],
      tool_choice: { type: "any" } as const,
    })
  );

  const toolBlock = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolBlock) {
    throw new Error(`No tool call in per-answer response for turn ${ctx.turnIndex}`);
  }

  const input = toolBlock.input as Record<string, unknown>;

  if (ctx.isBehavioral) {
    return {
      turnIndex: ctx.turnIndex,
      star_situation_present: input.star_situation_present as boolean,
      star_task_present: input.star_task_present as boolean,
      star_action_present: input.star_action_present as boolean,
      star_result_present: input.star_result_present as boolean,
      star_quality_score: input.star_quality_score as number,
      rewrite: input.rewrite as string,
      cultural_note: (input.cultural_note as string | undefined) ?? null,
    };
  }

  return {
    turnIndex: ctx.turnIndex,
    star_situation_present: null,
    star_task_present: null,
    star_action_present: null,
    star_result_present: null,
    star_quality_score: null,
    rewrite: input.rewrite as string,
    cultural_note: (input.cultural_note as string | undefined) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Company research suggestion (non-blocking, cached by company name)
// ---------------------------------------------------------------------------

async function tryGetCompanyResearchSuggestion(
  companyName: string | null,
  sessionId: string,
  supabase: SupabaseClient,
  anthropic: Anthropic
): Promise<CompanyResearchSuggestion | null> {
  if (!companyName) return null;

  try {
    // Check cache: look for any other session with the same company that already
    // has a company_research_suggestion in its feedback_reports row.
    const { data: companySessions } = await supabase
      .from("sessions")
      .select("id")
      .filter("company_research->>company_name", "eq", companyName)
      .not("company_research", "is", null);

    const otherSessionIds = (companySessions ?? [])
      .map((s: { id: string }) => s.id)
      .filter((id: string) => id !== sessionId);

    if (otherSessionIds.length > 0) {
      const { data: cached } = await supabase
        .from("feedback_reports")
        .select("company_research_suggestion")
        .in("session_id", otherSessionIds)
        .not("company_research_suggestion", "is", null)
        .eq("status", "ready")
        .limit(1)
        .maybeSingle();

      if (cached?.company_research_suggestion) {
        console.log(`[feedback] company research cache hit for "${companyName}"`);
        return cached.company_research_suggestion as CompanyResearchSuggestion;
      }
    }

    // Cache miss — do a fresh Tavily search
    console.log(`[feedback] company research cache miss — searching for "${companyName}"`);
    const rawContent = await searchCompanyProductUpdates(companyName);

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      tools: [COMPANY_RESEARCH_SUGGESTION_TOOL],
      tool_choice: { type: "any" } as const,
      messages: [
        {
          role: "user",
          content: buildCompanyResearchPrompt({ companyName, rawContent }),
        },
      ],
    });

    const toolBlock = msg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolBlock) return null;

    const input = toolBlock.input as { summary: string; suggestions: string[] };
    return { searched: true, summary: input.summary, suggestions: input.suggestions };
  } catch (err) {
    console.error(`[feedback] company research suggestion failed (non-fatal):`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function generateFeedback(
  sessionId: string,
  deps?: { supabase?: SupabaseClient; anthropic?: Anthropic }
): Promise<void> {
  const supabase = deps?.supabase ?? createAdminClient();
  const anthropic =
    deps?.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Step 1 — mark processing immediately
  const { error: processingErr } = await supabase
    .from("feedback_reports")
    .update({ status: "processing" })
    .eq("session_id", sessionId);

  if (processingErr) {
    console.error(
      `[feedback] failed to set processing status for session ${sessionId}:`,
      processingErr.message
    );
    return;
  }

  try {
    // Load session — now also fetching difficulty_archetype and company_research
    const { data: session, error: sessionErr } = await supabase
      .from("sessions")
      .select("jd_text, cv_text, difficulty_archetype, company_research")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !session) {
      throw new Error(`Session ${sessionId} not found: ${sessionErr?.message}`);
    }

    const archetype = (session.difficulty_archetype as string) ?? "neutral";
    const companyName =
      (session.company_research as { company_name?: string } | null)?.company_name ??
      null;

    // Load transcript (single row per session per migration 002)
    const { data: transcript, error: transcriptErr } = await supabase
      .from("transcripts")
      .select("id, turns")
      .eq("session_id", sessionId)
      .single();

    if (transcriptErr || !transcript) {
      throw new Error(
        `Transcript for session ${sessionId} not found: ${transcriptErr?.message}`
      );
    }

    const turns = transcript.turns as Turn[];
    const contexts = buildAnswerContexts(turns);

    console.log(
      `[feedback] session=${sessionId} answers=${contexts.length} ` +
        `behavioral=${contexts.filter((c) => c.isBehavioral).length} archetype=${archetype}`
    );

    // Step 2 — fan-out: all per-answer calls in parallel, upsert as each resolves
    type AnswerOutcome =
      | { ok: true; result: PerAnswerResult }
      | { ok: false; turnIndex: number; error: unknown };

    const outcomes = await Promise.all(
      contexts.map(async (ctx): Promise<AnswerOutcome> => {
        try {
          const result = await processAnswer(anthropic, ctx);

          const { error: upsertErr } = await supabase
            .from("answer_feedback")
            .upsert(
              {
                transcript_id: transcript.id,
                session_id: sessionId,
                turn_index: ctx.turnIndex,
                star_situation_present: result.star_situation_present,
                star_task_present: result.star_task_present,
                star_action_present: result.star_action_present,
                star_result_present: result.star_result_present,
                star_quality_score: result.star_quality_score,
                rewrite: result.rewrite,
                cultural_note: result.cultural_note,
              },
              { onConflict: "transcript_id,turn_index" }
            );

          if (upsertErr) {
            throw new Error(`Upsert failed for turn ${ctx.turnIndex}: ${upsertErr.message}`);
          }

          console.log(`[feedback] answer turn=${ctx.turnIndex} upserted session=${sessionId}`);
          return { ok: true, result };
        } catch (err) {
          console.error(
            `[feedback] answer turn=${ctx.turnIndex} failed session=${sessionId}:`,
            err
          );
          return { ok: false, turnIndex: ctx.turnIndex, error: err };
        }
      })
    );

    const failures = outcomes.filter(
      (o): o is Extract<AnswerOutcome, { ok: false }> => !o.ok
    );
    if (failures.length > 0) {
      throw new Error(
        `${failures.length} of ${contexts.length} answer(s) failed to process ` +
          `(turns: ${failures.map((f) => f.turnIndex).join(", ")})`
      );
    }

    // Step 3 — fan-in: session analysis + company research run in parallel.
    // Company research failure is non-fatal (it returns null on error internally).
    const [aggregationMsg, companySuggestion] = await Promise.all([
      callWithRetry(() =>
        anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 4000,
          system: buildSessionSystemPrompt({
            jdText: session.jd_text ?? "",
            cvText: session.cv_text ?? "",
            turns,
            archetype,
          }),
          messages: [{ role: "user", content: "Analyze this interview session." }],
          tools: [SESSION_ANALYSIS_TOOL],
          tool_choice: { type: "any" } as const,
        })
      ),
      tryGetCompanyResearchSuggestion(companyName, sessionId, supabase, anthropic),
    ]);

    const aggregationBlock = aggregationMsg.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!aggregationBlock) {
      throw new Error("No tool call in aggregation response");
    }

    const agg = aggregationBlock.input as {
      readiness_verdict: string;
      top_priority: string;
      story_gaps: unknown[];
      cv_gaps: unknown[];
      role_fit_verdict: unknown;
      reassurance_note: string;
      strength_evidence?: unknown[];
      interviewer_pressure_reframe?: unknown[];
      star_method_note?: string;
      language_patterns?: unknown[];
    };

    console.log(
      `[feedback] aggregation complete session=${sessionId} ` +
        `story_gaps=${agg.story_gaps.length} cv_gaps=${agg.cv_gaps.length} ` +
        `company_research=${companySuggestion ? "yes" : "null"}`
    );

    // Step 4 — write all results and mark ready
    const { error: readyErr } = await supabase
      .from("feedback_reports")
      .update({
        status: "ready",
        story_gaps: agg.story_gaps,
        cv_gaps: agg.cv_gaps,
        readiness_verdict: agg.readiness_verdict,
        top_priority: agg.top_priority,
        role_fit_verdict: agg.role_fit_verdict,
        reassurance_note: agg.reassurance_note,
        strength_evidence: agg.strength_evidence ?? [],
        interviewer_pressure_reframe: agg.interviewer_pressure_reframe ?? [],
        star_method_note: agg.star_method_note ?? null,
        language_patterns: agg.language_patterns ?? [],
        company_research_suggestion: companySuggestion,
      })
      .eq("session_id", sessionId);

    if (readyErr) {
      throw new Error(`Failed to write ready status: ${readyErr.message}`);
    }

    console.log(`[feedback] pipeline complete session=${sessionId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[feedback] pipeline failed session=${sessionId}:`, err);

    const { error: failErr } = await supabase
      .from("feedback_reports")
      .update({ status: "failed", error_message: message })
      .eq("session_id", sessionId);

    if (failErr) {
      console.error(
        `[feedback] FATAL: could not write failed status session=${sessionId}:`,
        failErr.message
      );
    }
  }
}
