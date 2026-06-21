import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InterviewClient } from "./interview-client";
import type { PersonaConfig } from "@/lib/llm/persona";
import type { Turn } from "@/lib/interview/transcript";

export default async function InterviewPage({
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

  const { data: session } = await supabase
    .from("sessions")
    .select("id, status, persona_config, company_research, difficulty_archetype")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) redirect("/new-session");
  if (session.status === "completed") {
    redirect(`/interview/${sessionId}/complete`);
  }

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("turns")
    .eq("session_id", sessionId)
    .maybeSingle();

  const initialTurns = (transcript?.turns as Turn[]) ?? [];
  const persona = session.persona_config as PersonaConfig;
  const companyName =
    (session.company_research as { company_name?: string })?.company_name ??
    "the company";

  return (
    <InterviewClient
      sessionId={sessionId}
      sessionStatus={session.status as "pending" | "active" | "finalizing" | "wrap_0" | "wrap_1"}
      companyName={companyName}
      roleTitle={persona.extraction.role_title}
      archetype={session.difficulty_archetype as string}
      initialTurns={initialTurns}
    />
  );
}
