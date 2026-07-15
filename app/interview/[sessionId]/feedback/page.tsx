import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Turn } from "@/lib/interview/transcript";
import { FeedbackClient } from "./feedback-client";
import type {
  DisplayAnswer,
  StoryGap,
  CvGap,
  StrengthEvidence,
  PressureReframe,
  LanguagePattern,
  RoleFitVerdict,
  CompanyResearchSuggestion,
} from "./feedback-client";

export const metadata = { title: "Feedback Report — AI Interview Coach" };

interface AnswerFeedbackRow {
  turn_index: number;
  star_situation_present: boolean | null;
  star_task_present: boolean | null;
  star_action_present: boolean | null;
  star_result_present: boolean | null;
  star_quality_score: number | null;
  rewrite: string;
  cultural_note: string | null;
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify session ownership
  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) redirect("/new-session");

  // Load the feedback report with all fields.
  // Cast required: columns added in migrations 004/005 are not in generated Supabase types.
  interface FeedbackReportRow {
    status: string;
    story_gaps: unknown;
    cv_gaps: unknown;
    readiness_verdict: unknown;
    top_priority: unknown;
    role_fit_verdict: unknown;
    reassurance_note: unknown;
    strength_evidence: unknown;
    interviewer_pressure_reframe: unknown;
    star_method_note: unknown;
    language_patterns: unknown;
    company_research_suggestion: unknown;
  }
  const { data: rawReport } = await supabase
    .from("feedback_reports")
    .select(
      "status, story_gaps, cv_gaps, " +
        "readiness_verdict, top_priority, role_fit_verdict, reassurance_note, " +
        "strength_evidence, interviewer_pressure_reframe, star_method_note, " +
        "language_patterns, company_research_suggestion"
    )
    .eq("session_id", sessionId)
    .maybeSingle();
  const report = rawReport as unknown as FeedbackReportRow | null;

  // If not ready yet (or never generated), send back to the waiting screen
  if (!report || report.status !== "ready") {
    redirect(`/interview/${sessionId}/complete`);
  }

  // Count prior sessions for this user with a ready feedback report (excluding this one).
  // Two queries: get session IDs for this user, then count ready feedback_reports.
  const { data: userSessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", user.id)
    .neq("id", sessionId);

  const otherSessionIds = (userSessions ?? []).map((s: { id: string }) => s.id);

  let priorSessionCount = 0;
  if (otherSessionIds.length > 0) {
    const { count } = await supabase
      .from("feedback_reports")
      .select("*", { count: "exact", head: true })
      .in("session_id", otherSessionIds)
      .eq("status", "ready");
    priorSessionCount = count ?? 0;
  }

  // Load per-answer feedback rows, ordered by turn position.
  // Cast required because answer_feedback is not in the generated Supabase types
  // (migration 004 must be applied manually via the SQL editor).
  const { data: rawAnswerRows } = await supabase
    .from("answer_feedback")
    .select(
      "turn_index, star_situation_present, star_task_present, " +
        "star_action_present, star_result_present, star_quality_score, " +
        "rewrite, cultural_note"
    )
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });
  const answerRows = rawAnswerRows as unknown as AnswerFeedbackRow[] | null;

  // Load the transcript to join question/answer text with feedback rows
  const { data: transcript } = await supabase
    .from("transcripts")
    .select("turns")
    .eq("session_id", sessionId)
    .maybeSingle();

  const turns = (transcript?.turns as Turn[]) ?? [];

  const displayAnswers: DisplayAnswer[] = (answerRows ?? []).map((row) => {
    const candidateTurn = turns[row.turn_index];

    let questionText: string | null = null;
    for (let i = row.turn_index - 1; i >= 0; i--) {
      if (turns[i]?.role === "interviewer") {
        questionText = turns[i].text;
        break;
      }
    }

    return {
      turnIndex: row.turn_index,
      questionText,
      answerText: candidateTurn?.text ?? "",
      isBehavioral: row.star_quality_score !== null,
      starSituationPresent: row.star_situation_present,
      starTaskPresent: row.star_task_present,
      starActionPresent: row.star_action_present,
      starResultPresent: row.star_result_present,
      starQualityScore: row.star_quality_score,
      rewrite: row.rewrite,
      culturalNote: row.cultural_note,
    };
  });

  return (
    <FeedbackClient
      sessionId={sessionId}
      displayAnswers={displayAnswers}
      storyGaps={(report.story_gaps ?? []) as StoryGap[]}
      cvGaps={(report.cv_gaps ?? []) as CvGap[]}
      readinessVerdict={(report.readiness_verdict as string | null) ?? null}
      topPriority={(report.top_priority as string | null) ?? null}
      roleFitVerdict={(report.role_fit_verdict as RoleFitVerdict | null) ?? null}
      reassuranceNote={(report.reassurance_note as string | null) ?? null}
      strengthEvidence={(report.strength_evidence as StrengthEvidence[] | null) ?? []}
      interviewerPressureReframe={
        (report.interviewer_pressure_reframe as PressureReframe[] | null) ?? []
      }
      starMethodNote={(report.star_method_note as string | null) ?? null}
      languagePatterns={
        (report.language_patterns as LanguagePattern[] | null) ?? []
      }
      companyResearchSuggestion={
        (report.company_research_suggestion as CompanyResearchSuggestion | null) ?? null
      }
      priorSessionCount={priorSessionCount}
    />
  );
}
