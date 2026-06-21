import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai"; // used with Groq's OpenAI-compatible endpoint
import { createClient } from "@/lib/supabase/server";
import { generateFeedback } from "@/lib/feedback/pipeline";
import { appendTurns, readTurns, type Turn } from "@/lib/interview/transcript";
import { analyzeAnswer, buildDifficultyNote } from "@/lib/interview/adaptive";
import {
  buildCategoryGuidanceNote,
  detectCategory,
  getConsecutiveTurnsOnTopic,
  getCoveredCategories,
  MAX_SAME_TOPIC_TURNS,
} from "@/lib/interview/categories";
import { computeTurnKind, type SessionStatus, type TurnKind } from "@/lib/interview/session";
import type { PersonaConfig } from "@/lib/llm/persona";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Groq's Whisper endpoint is OpenAI-compatible.
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// ---------------------------------------------------------------------------
// Wrap-up tools
//
// Two separate tools replace the earlier single "respond_to_candidate" tool
// with an end_session boolean field.  The fix: the model's choice of WHICH
// tool to call is the structured signal, not a boolean it can get wrong.
//
// Failure mode of the boolean approach:
//   - tool_choice:"auto" -> model returns farewell as plain text, no tool call -> sessionEnded=false
//   - tool_choice:"any" + boolean field -> model calls tool but sets end_session:false when
//     candidate declines (misinterpretation), so sessionEnded stays false forever
//
// Fix: calling close_interview is unambiguous. At wrapUpForceClose only
// close_interview is offered, so the model literally cannot avoid closing.
// ---------------------------------------------------------------------------

const WRAP_UP_ANSWER_TOOL: Anthropic.Tool = {
  name: "answer_question",
  description:
    "Use this when the candidate has asked a genuine question about the role, team, " +
    "culture, process, or next steps, and you want to answer it before the interview ends. " +
    "After this answer the candidate may ask one more question.",
  input_schema: {
    type: "object" as const,
    properties: {
      answer: {
        type: "string",
        description: "Your helpful, conversational answer to the candidate's question.",
      },
    },
    required: ["answer"],
  },
};

const WRAP_UP_CLOSE_TOOL: Anthropic.Tool = {
  name: "close_interview",
  description:
    "Use this to close the interview with a warm farewell. Call this when: " +
    "(a) the candidate said they have no further questions in ANY phrasing " +
    "('no thanks', 'I am all set', 'that covers it', a simple 'no', silence, etc.); or " +
    "(b) you have already answered the maximum number of follow-up questions. " +
    "When in doubt, use this tool — do not invent reasons to keep the session open.",
  input_schema: {
    type: "object" as const,
    properties: {
      farewell: {
        type: "string",
        description:
          "Your warm, professional closing message. Should feel conclusive — " +
          "no dangling questions or open invitations.",
      },
    },
    required: ["farewell"],
  },
};

// System-prompt notes per turn kind
const FINAL_Q_NOTE =
  "\n\nFINAL QUESTION: This is the last question of the structured interview. " +
  "Choose a meaningful topic not yet fully explored, or a synthesising question " +
  "that lets the candidate reflect on their experience. After the candidate answers " +
  "you will invite them to ask any questions they have.";

const WRAP_UP_PROMPT_NOTE =
  "\n\nWRAP-UP PHASE: The structured interview is now complete. Warmly thank the " +
  "candidate for their time and thoughtful answers. Invite them to ask any questions " +
  "they have about the role, team, culture, or next steps. Be genuine and conversational.";

const WRAP_UP_CONTINUE_NOTE =
  "\n\nWRAP-UP Q&A (exchange 1 of 2): The candidate is responding to your wrap-up invitation. " +
  "You MUST call exactly one of the two available tools:\n" +
  "- answer_question: if the candidate asked a genuine question about the role or team.\n" +
  "- close_interview: if the candidate said they have no further questions in ANY phrasing, " +
  "or if they thanked you and wrapped up. When in doubt, use close_interview.";

const WRAP_UP_FORCE_CLOSE_NOTE =
  "\n\nWRAP-UP Q&A (final exchange): Call close_interview now. " +
  "If the candidate asked one last question, answer it briefly inside the farewell field. " +
  "The interview must end on this turn — close_interview is the only tool available.";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
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

    const { data: session } = await supabase
      .from("sessions")
      .select("id, status, persona_config")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status === "completed") {
      return NextResponse.json(
        { error: "Session already completed" },
        { status: 409 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "No audio provided" }, { status: 400 });
    }

    const baseMime = audioFile.type.split(";")[0].trim();
    const ext = baseMime.includes("webm")
      ? "webm"
      : baseMime.includes("ogg")
      ? "ogg"
      : baseMime.includes("mp4")
      ? "mp4"
      : "webm";

    console.log(
      `[turn] START session=${sessionId} dbStatus=${session.status} ` +
        `audio=${audioFile.size}B ext=${ext}`
    );

    const namedFile = new File(
      [await audioFile.arrayBuffer()],
      `recording.${ext}`,
      { type: `audio/${ext}` }
    );

    const transcription = await groq.audio.transcriptions.create({
      file: namedFile,
      model: "whisper-large-v3-turbo",
    });

    const candidateText = transcription.text.trim();
    if (!candidateText) {
      return NextResponse.json(
        { error: "No speech detected — please try again" },
        { status: 422 }
      );
    }

    // Persist the candidate's answer BEFORE any completion logic.
    const candidateTurn: Turn = {
      role: "candidate",
      text: candidateText,
      timestamp: new Date().toISOString(),
    };
    await appendTurns(supabase, sessionId, [candidateTurn]);

    // Read the full transcript (now includes the just-persisted candidate turn).
    const turns = await readTurns(supabase, sessionId);

    const kind: TurnKind = computeTurnKind(session.status as SessionStatus, turns);

    console.log(`[turn] kind=${kind} totalTurns=${turns.length} session=${sessionId}`);

    const isWrapUpPhase =
      kind === "generateWrapUpPrompt" ||
      kind === "wrapUpContinue" ||
      kind === "wrapUpForceClose";

    const useTools = kind === "wrapUpContinue" || kind === "wrapUpForceClose";

    const persona = session.persona_config as PersonaConfig;

    let coachingContext: string;
    if (isWrapUpPhase) {
      const phaseNote =
        kind === "generateWrapUpPrompt"
          ? WRAP_UP_PROMPT_NOTE
          : kind === "wrapUpContinue"
          ? WRAP_UP_CONTINUE_NOTE
          : WRAP_UP_FORCE_CLOSE_NOTE;
      coachingContext = phaseNote;
    } else {
      const signals = analyzeAnswer(candidateText);
      const difficultyNote = buildDifficultyNote(signals);
      const categoryNote = buildCategoryGuidanceNote(turns);
      const phaseNote = kind === "generateFinalQ" ? FINAL_Q_NOTE : "";

      const lastInterviewerTurn = [...turns]
        .reverse()
        .find((t) => t.role === "interviewer");
      const lastDetected = lastInterviewerTurn
        ? detectCategory(lastInterviewerTurn.text)
        : null;
      const { topic: currentTopic, count: streakCount } =
        getConsecutiveTurnsOnTopic(turns);
      const covered = [...getCoveredCategories(turns)];
      console.log(
        `[category] last_q="${lastDetected ?? "null"}" topic="${currentTopic ?? "null"}" ` +
          `streak=${streakCount}/${MAX_SAME_TOPIC_TURNS} covered=[${covered.join(",")}]`
      );

      coachingContext = `${difficultyNote}\n${categoryNote}${phaseNote}`;
    }

    const systemWithContext = `${persona.system_prompt}

--- CURRENT SESSION STATE (coaching context, not shown to candidate) ---
${coachingContext}
---`;

    // Build Anthropic message history. Prepend a synthetic "[begin]" user
    // message so the array always starts with role:"user".
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "[begin]" },
    ];
    for (const turn of turns) {
      messages.push({
        role: turn.role === "interviewer" ? "assistant" : "user",
        content: turn.text,
      });
    }

    const baseParams = {
      model: "claude-haiku-4-5-20251001" as const,
      max_tokens: isWrapUpPhase ? 800 : 600,
      system: systemWithContext,
      messages,
    };

    // At wrapUpContinue: offer both tools, force one to be called.
    // At wrapUpForceClose: offer only close_interview so the model cannot avoid closing.
    const wrapUpTools =
      kind === "wrapUpForceClose"
        ? [WRAP_UP_CLOSE_TOOL]
        : [WRAP_UP_ANSWER_TOOL, WRAP_UP_CLOSE_TOOL];

    const msg = await anthropic.messages.create(
      useTools
        ? {
            ...baseParams,
            tools: wrapUpTools,
            tool_choice: { type: "any" } as const,
          }
        : baseParams
    );

    // ---------------------------------------------------------------------------
    // Parse response
    // ---------------------------------------------------------------------------

    const answerBlock =
      useTools
        ? (msg.content.find(
            (b): b is Anthropic.ToolUseBlock =>
              b.type === "tool_use" &&
              (b as Anthropic.ToolUseBlock).name === "answer_question"
          ) ?? null)
        : null;

    const closeBlock =
      useTools
        ? (msg.content.find(
            (b): b is Anthropic.ToolUseBlock =>
              b.type === "tool_use" &&
              (b as Anthropic.ToolUseBlock).name === "close_interview"
          ) ?? null)
        : null;

    const textBlock =
      msg.content.find((b): b is Anthropic.TextBlock => b.type === "text") ?? null;

    // Logging — (a) which tool was called, (b) raw tool output
    const contentSummary = msg.content.map((b) => b.type).join(",");
    console.log(
      `[wrapup] kind=${kind} stop_reason=${msg.stop_reason} content=[${contentSummary}] ` +
        `answer_tool=${answerBlock ? "CALLED" : "not_called"} ` +
        `close_tool=${closeBlock ? "CALLED" : "not_called"} ` +
        `session=${sessionId}`
    );
    if (answerBlock) {
      console.log(
        `[wrapup] answer_question input="${JSON.stringify(answerBlock.input)}" session=${sessionId}`
      );
    }
    if (closeBlock) {
      console.log(
        `[wrapup] close_interview input="${JSON.stringify(closeBlock.input)}" session=${sessionId}`
      );
    }

    let interviewerText: string;
    let nextStatus: SessionStatus;
    let sessionEnded = false;

    if (useTools) {
      if (closeBlock || kind === "wrapUpForceClose") {
        // close_interview called, OR wrapUpForceClose which must always close.
        const farewell =
          (closeBlock?.input as { farewell?: string } | undefined)?.farewell?.trim() ||
          textBlock?.text?.trim() ||
          "Thank you so much for your time. It was a genuine pleasure speaking with you.";
        interviewerText = farewell;
        nextStatus = "completed";
        sessionEnded = true;
      } else if (answerBlock) {
        // answer_question called — one more exchange allowed.
        interviewerText =
          (answerBlock.input as { answer?: string } | undefined)?.answer?.trim() ||
          textBlock?.text?.trim() ||
          "";
        nextStatus = "wrap_1";
        sessionEnded = false;
      } else {
        // tool_choice:"any" guarantees a call — this branch is a safety net.
        console.error(
          `[wrapup] UNEXPECTED: no tool block in response despite tool_choice:any ` +
            `stop_reason=${msg.stop_reason} session=${sessionId}`
        );
        interviewerText =
          textBlock?.text?.trim() ||
          "Thank you so much for your time. It was a pleasure speaking with you.";
        nextStatus = "completed";
        sessionEnded = true;
      }
    } else {
      interviewerText = textBlock?.text?.trim() ?? "";
      if (!interviewerText) {
        return NextResponse.json(
          { error: "Model returned empty response" },
          { status: 502 }
        );
      }
      const statusMap: Record<Exclude<TurnKind, "wrapUpContinue" | "wrapUpForceClose">, SessionStatus> = {
        normal: session.status as SessionStatus,
        generateFinalQ: "finalizing",
        generateWrapUpPrompt: "wrap_0",
      };
      nextStatus = statusMap[kind as Exclude<TurnKind, "wrapUpContinue" | "wrapUpForceClose">];
    }

    // (c) log the computed server-side values before persisting
    console.log(
      `[wrapup] DECISION kind=${kind} nextStatus=${nextStatus} sessionEnded=${sessionEnded} session=${sessionId}`
    );

    // Persist the interviewer turn FIRST, then advance session status.
    // Farewell must be durable before the session is marked complete.
    const interviewerTurn: Turn = {
      role: "interviewer",
      text: interviewerText,
      timestamp: new Date().toISOString(),
    };
    await appendTurns(supabase, sessionId, [interviewerTurn]);

    if (nextStatus !== session.status) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ status: nextStatus })
        .eq("id", sessionId);

      if (updateError) {
        // A constraint violation here (e.g. status value not in sessions_status_check)
        // would silently keep the session at its old status, causing generateFinalQ
        // to fire on every subsequent turn instead of ever reaching the wrap-up phase.
        // Return an explicit 500 so the client shows an error and the developer
        // sees a clear failure rather than a mysteriously looping session.
        console.error(
          `[turn] FATAL: status update ${session.status} -> ${nextStatus} failed: ` +
            `${updateError.message} (code=${updateError.code}) session=${sessionId}`
        );
        return NextResponse.json(
          {
            error: `Session state update failed (${updateError.code}): ${updateError.message}. ` +
              `The migration 003_session_status_values.sql may not have been applied.`,
          },
          { status: 500 }
        );
      }

      console.log(
        `[turn] status updated ${session.status} -> ${nextStatus} session=${sessionId}`
      );
    }

    // (d) log what the client will receive
    console.log(
      `[turn] RESPONSE sessionEnded=${sessionEnded} session=${sessionId}`
    );

    // Kick off feedback generation after the response is sent so the client
    // is not blocked. after() keeps the serverless function alive until the
    // pipeline resolves. The feedback_reports row is created here (with the
    // authed client while cookies are still available), and the pipeline
    // updates it from 'pending' → 'processing' → 'ready'|'failed'.
    if (sessionEnded) {
      const { error: frErr } = await supabase
        .from("feedback_reports")
        .insert({ session_id: sessionId, status: "pending" });
      if (frErr && frErr.code !== "23505") {
        // 23505 = unique_violation: row already exists from a prior attempt — harmless
        console.error(`[turn] feedback_reports insert failed:`, frErr.message);
      }

      after(async () => {
        console.log(`[feedback] trigger session=${sessionId}`);
        await generateFeedback(sessionId);
      });
    }

    return NextResponse.json({ candidateText, interviewerText, sessionEnded });
  } catch (err) {
    console.error(`[turn] unhandled error for session ${sessionId}:`, err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
