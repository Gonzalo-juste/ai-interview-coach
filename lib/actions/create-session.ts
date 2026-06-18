"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractJdCv } from "@/lib/llm/extract";
import { researchCompany, type CompanyResearch } from "@/lib/llm/research";
import { buildPersonaPrompt, type DifficultyArchetype } from "@/lib/llm/persona";

export type CreateSessionState = { error: string } | null;

export async function createSession(
  _prev: CreateSessionState,
  formData: FormData
): Promise<CreateSessionState> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // Return a visible error rather than redirecting — /login may not exist yet
  // and the old redirect() call was being swallowed by the try/catch below.
  if (authError || !user) {
    return { error: "You must be signed in to create a session. Please log in at /login." };
  }

  const jdText = (formData.get("jd_text") as string | null)?.trim() ?? "";
  const cvText = (formData.get("cv_text") as string | null)?.trim() ?? "";
  const companyName = (formData.get("company_name") as string | null)?.trim() ?? "";
  const archetype = formData.get("difficulty_archetype") as DifficultyArchetype | null;

  if (!jdText || !cvText || !companyName || !archetype) {
    return { error: "All fields are required." };
  }

  if (!["friendly", "neutral", "tough"].includes(archetype)) {
    return { error: "Invalid difficulty archetype." };
  }

  let sessionId: string;

  try {
    // Check company research cache across all sessions (admin client bypasses RLS)
    const admin = createAdminClient();
    const { data: cached } = await admin
      .from("sessions")
      .select("company_research")
      .not("company_research", "is", null)
      .filter("company_research->>company_name", "eq", companyName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const [extraction, companyResearch] = await Promise.all([
      extractJdCv(jdText, cvText),
      cached?.company_research
        ? Promise.resolve(cached.company_research as CompanyResearch)
        : researchCompany(companyName),
    ]);

    const personaConfig = buildPersonaPrompt(extraction, companyResearch, archetype);

    const { data: session, error: insertError } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        jd_text: jdText,
        cv_text: cvText,
        company_research: companyResearch,
        persona_config: personaConfig,
        difficulty_archetype: archetype,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !session) {
      console.error("[createSession] insert error:", insertError);
      return {
        error: `Failed to save session: ${insertError?.message ?? "unknown error"}. Check server logs.`,
      };
    }

    sessionId = session.id;
  } catch (err) {
    // redirect() is now called OUTSIDE the try/catch, so only real errors land here.
    console.error("[createSession] unexpected error:", err);
    return {
      error: err instanceof Error ? err.message : "Something went wrong. Please try again.",
    };
  }

  // Called outside try/catch so Next.js handles the navigation correctly.
  // Previously this was inside try/catch and the thrown redirect was swallowed
  // because err.message is "" (not "NEXT_REDIRECT") in Next.js 15/16.
  redirect(`/sessions/${sessionId}`);
}
