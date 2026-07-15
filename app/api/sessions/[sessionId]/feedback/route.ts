import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the session belongs to the caller before returning any feedback.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Return 'pending' when the feedback_reports row does not exist yet.
  // Cast required: feedback_reports columns added in migrations 004/005 are not
  // in the generated Supabase types file (project is not linked to the CLI).
  interface FeedbackReportRow {
    status: string;
    story_gaps: unknown;
    cv_gaps: unknown;
    error_message: string | null;
    updated_at: string;
    readiness_verdict: string | null;
    top_priority: string | null;
    role_fit_verdict: unknown;
    reassurance_note: string | null;
    strength_evidence: unknown;
    interviewer_pressure_reframe: unknown;
    star_method_note: string | null;
    language_patterns: unknown;
    company_research_suggestion: unknown;
  }
  const { data: rawReport } = await supabase
    .from("feedback_reports")
    .select(
      "status, story_gaps, cv_gaps, error_message, updated_at, " +
        "readiness_verdict, top_priority, role_fit_verdict, reassurance_note, " +
        "strength_evidence, interviewer_pressure_reframe, star_method_note, " +
        "language_patterns, company_research_suggestion"
    )
    .eq("session_id", sessionId)
    .maybeSingle();
  const report = rawReport as unknown as FeedbackReportRow | null;

  if (!report) {
    return NextResponse.json({ status: "pending", answers: [] });
  }

  const { data: answers } = await supabase
    .from("answer_feedback")
    .select(
      "turn_index, star_situation_present, star_task_present, " +
        "star_action_present, star_result_present, star_quality_score, " +
        "rewrite, cultural_note, created_at"
    )
    .eq("session_id", sessionId)
    .order("turn_index", { ascending: true });

  return NextResponse.json({
    status: report.status,
    story_gaps: report.story_gaps,
    cv_gaps: report.cv_gaps,
    error_message: report.error_message ?? null,
    updated_at: report.updated_at,
    readiness_verdict: report.readiness_verdict ?? null,
    top_priority: report.top_priority ?? null,
    role_fit_verdict: report.role_fit_verdict ?? null,
    reassurance_note: report.reassurance_note ?? null,
    strength_evidence: report.strength_evidence ?? [],
    interviewer_pressure_reframe: report.interviewer_pressure_reframe ?? [],
    star_method_note: report.star_method_note ?? null,
    language_patterns: report.language_patterns ?? [],
    company_research_suggestion: report.company_research_suggestion ?? null,
    answers: answers ?? [],
  });
}
