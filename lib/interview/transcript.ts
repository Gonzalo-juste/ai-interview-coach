import type { SupabaseClient } from "@supabase/supabase-js";

export interface Turn {
  role: "interviewer" | "candidate";
  text: string;
  audio_ref?: string | null;
  timestamp: string;
}

export function mergeTurns(existing: Turn[], newTurns: Turn[]): Turn[] {
  return [...existing, ...newTurns];
}

export async function readTurns(
  supabase: SupabaseClient,
  sessionId: string
): Promise<Turn[]> {
  const { data } = await supabase
    .from("transcripts")
    .select("turns")
    .eq("session_id", sessionId)
    .maybeSingle();

  return (data?.turns as Turn[]) ?? [];
}

export async function appendTurns(
  supabase: SupabaseClient,
  sessionId: string,
  newTurns: Turn[]
): Promise<void> {
  const { data: existing } = await supabase
    .from("transcripts")
    .select("id, turns")
    .eq("session_id", sessionId)
    .maybeSingle();

  const merged = mergeTurns((existing?.turns as Turn[]) ?? [], newTurns);

  if (existing) {
    const { error } = await (supabase
      .from("transcripts")
      .update({ turns: merged })
      .eq("id", existing.id) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) throw new Error(`Transcript update failed: ${error.message}`);
  } else {
    const { error } = await (supabase
      .from("transcripts")
      .insert({ session_id: sessionId, turns: merged }) as unknown as Promise<{ error: { message: string } | null }>);
    if (error) throw new Error(`Transcript insert failed: ${error.message}`);
  }
}
