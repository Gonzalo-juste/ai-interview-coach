import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { appendTurns } from "@/lib/interview/transcript";
import type { PersonaConfig } from "@/lib/llm/persona";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, status, persona_config")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status === "completed") {
      return NextResponse.json(
        { error: "Session already completed" },
        { status: 409 }
      );
    }
    // Block any status that means the interview is already running.
    if (
      session.status === "active" ||
      session.status === "finalizing" ||
      session.status === "wrap_0" ||
      session.status === "wrap_1"
    ) {
      return NextResponse.json(
        { error: "Interview already started" },
        { status: 409 }
      );
    }

    const persona = session.persona_config as PersonaConfig;

    console.log(`[start] Generating opening question for session ${sessionId}`);

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: persona.system_prompt,
      messages: [{ role: "user", content: "[begin]" }],
    });

    const text =
      msg.content.find((b): b is Anthropic.TextBlock => b.type === "text")
        ?.text ?? "";
    if (!text) {
      return NextResponse.json(
        { error: "Model returned empty response" },
        { status: 502 }
      );
    }

    await appendTurns(supabase, sessionId, [
      { role: "interviewer", text, timestamp: new Date().toISOString() },
    ]);

    await supabase
      .from("sessions")
      .update({ status: "active" })
      .eq("id", sessionId);

    console.log(`[start] Done for session ${sessionId}`);

    // TTS is handled client-side via Web Speech API — return text only
    return NextResponse.json({ text });
  } catch (err) {
    console.error(`[start] Unhandled error for session ${sessionId}:`, err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
