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

  // Return 'pending' when the feedback_reports row does not exist yet
  // (i.e. the pipeline has not been triggered, or the session has not ended).
  const { data: report } = await supabase
    .from("feedback_reports")
    .select("status, story_gaps, cv_gaps, error_message, updated_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({
      status: "pending",
      story_gaps: null,
      cv_gaps: null,
      answers: [],
    });
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
    answers: answers ?? [],
  });
}
