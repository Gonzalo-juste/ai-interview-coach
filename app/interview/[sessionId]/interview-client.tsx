"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Turn } from "@/lib/interview/transcript";

type InterviewStatus =
  | "ready"       // no turns yet, waiting for "Begin"
  | "starting"    // waiting for /start API
  | "idle"        // waiting for candidate
  | "recording"   // MediaRecorder active
  | "processing"  // uploading + awaiting API response
  | "playing"     // interviewer speaking via Web Speech API
  | "complete";   // session ended, redirecting

interface Props {
  sessionId: string;
  sessionStatus: "pending" | "active" | "finalizing" | "wrap_0" | "wrap_1";
  companyName: string;
  roleTitle: string;
  archetype: string;
  initialTurns: Turn[];
}

export function InterviewClient({
  sessionId,
  sessionStatus,
  companyName,
  roleTitle,
  archetype,
  initialTurns,
}: Props) {
  const router = useRouter();

  // "active" means the server already started this interview — go straight to
  // idle so the user can never reach "Begin Interview" and hit the 409 guard.
  const [status, setStatus] = useState<InterviewStatus>(
    sessionStatus === "active" ||
    sessionStatus === "finalizing" ||
    sessionStatus === "wrap_0" ||
    sessionStatus === "wrap_1" ||
    initialTurns.length > 0
      ? "idle"
      : "ready"
  );
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Web Speech API refs
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onSpeechEndRef = useRef<(() => void) | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Load voices eagerly and keep the list fresh.  On Chrome/Edge the first
  // getVoices() call returns [] — the list populates asynchronously and
  // the "voiceschanged" event fires when it's ready.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  // ── TTS via Web Speech API ────────────────────────────────────────────────

  const speakText = useCallback((text: string, onEnd: () => void) => {
    onSpeechEndRef.current = onEnd;
    setStatus("playing");

    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[TTS] speechSynthesis not available — skipping audio");
      onEnd();
      return;
    }

    window.speechSynthesis.cancel(); // discard any previous utterance

    const utter = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utter;

    // Prefer a local en-US voice; fall back to any English voice
    const voices =
      voicesRef.current.length > 0
        ? voicesRef.current
        : window.speechSynthesis.getVoices(); // re-check in case they loaded

    const voice =
      voices.find((v) => v.lang === "en-US" && v.localService) ||
      voices.find((v) => v.lang.startsWith("en-US")) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null;

    if (voice) utter.voice = voice;
    utter.lang = "en-US";
    utter.rate = 0.92; // slightly slower for clarity

    utter.onend = () => {
      utteranceRef.current = null;
      onSpeechEndRef.current?.();
      onSpeechEndRef.current = null;
    };

    utter.onerror = (e) => {
      // "interrupted" fires when we cancel() mid-utterance — not a real error
      if (e.error === "interrupted") return;
      console.error("[TTS] SpeechSynthesisUtterance error:", e.error);
      utteranceRef.current = null;
      onSpeechEndRef.current?.();
      onSpeechEndRef.current = null;
    };

    window.speechSynthesis.speak(utter);
  }, []);

  // Called by the "Skip" button — cancels speech and advances state
  const skipSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel(); // triggers utter.onerror with "interrupted"
    }
    utteranceRef.current = null;
    // cancel() won't fire onend, so advance state manually
    const cb = onSpeechEndRef.current;
    onSpeechEndRef.current = null;
    cb?.();
  }, []);

  // ── Safe JSON fetch ───────────────────────────────────────────────────────

  async function safeFetchJson(
    url: string,
    init: RequestInit
  ): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const res = await fetch(url, init);
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      console.error(
        `[InterviewClient] Non-JSON response from ${url}, HTTP ${res.status}`
      );
      data = { error: `Server error (HTTP ${res.status}) — please try again` };
    }
    return { ok: res.ok, status: res.status, data };
  }

  // ── Interview actions ─────────────────────────────────────────────────────

  const beginInterview = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const { ok, status: httpStatus, data } = await safeFetchJson(
        `/api/interview/${sessionId}/start`,
        { method: "POST" }
      );

      if (!ok) {
        if (httpStatus === 409) {
          // First click partially succeeded — session is active with existing
          // transcript.  Refresh so the server returns the in-progress state.
          router.refresh();
          return;
        }
        throw new Error((data.error as string) ?? "Failed to start interview");
      }

      const text = data.text as string;
      setTurns([{ role: "interviewer", text, timestamp: new Date().toISOString() }]);
      speakText(text, () => setStatus("idle"));
    } catch (err) {
      setError((err as Error).message);
      setStatus("ready");
    }
  }, [sessionId, speakText, router]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch {
      setError(
        "Microphone access denied. Please allow microphone access and try again."
      );
    }
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    setStatus("processing");

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const baseMime = recorder.mimeType.split(";")[0].trim();
      const ext = baseMime.includes("webm")
        ? "webm"
        : baseMime.includes("ogg")
        ? "ogg"
        : baseMime.includes("mp4")
        ? "mp4"
        : "webm";

      const formData = new FormData();
      formData.append("audio", blob, `recording.${ext}`);

      try {
        const { ok, data } = await safeFetchJson(
          `/api/interview/${sessionId}/turn`,
          { method: "POST", body: formData }
        );

        if (!ok) {
          throw new Error((data.error as string) ?? "Processing failed");
        }

        const now = new Date().toISOString();
        const interviewerText = data.interviewerText as string;
        setTurns((prev) => [
          ...prev,
          { role: "candidate", text: data.candidateText as string, timestamp: now },
          { role: "interviewer", text: interviewerText, timestamp: now },
        ]);

        // (d) client-side log — shows what value the client actually received
        // and what branch it will take.
        console.log(
          `[client] turn response: sessionEnded=${data.sessionEnded} ` +
            `(type=${typeof data.sessionEnded}) ` +
            `interviewerText="${(data.interviewerText as string).slice(0, 60)}..."`
        );

        if (data.sessionEnded) {
          console.log("[client] sessionEnded=true -> will redirect after TTS");
          speakText(interviewerText, () => {
            setStatus("complete");
            setTimeout(
              () => router.push(`/interview/${sessionId}/complete`),
              1200
            );
          });
        } else {
          console.log("[client] sessionEnded=false -> returning to idle");
          speakText(interviewerText, () => setStatus("idle"));
        }
      } catch (err) {
        setError((err as Error).message);
        setStatus("idle");
      }
    };

    recorder.stop();
  }, [sessionId, speakText, router]);

  const handlePressStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (status === "idle") startRecording();
    },
    [status, startRecording]
  );

  const handlePressEnd = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (status === "recording") stopRecording();
    },
    [status, stopRecording]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex-none border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {companyName}
            </h1>
            <p className="text-xs capitalize text-gray-500">
              {roleTitle} &middot; {archetype} interviewer
            </p>
          </div>
          <StatusBadge status={status} />
        </div>
      </header>

      {/* Transcript */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {turns.length === 0 && status === "ready" && (
            <p className="mt-16 text-center text-sm text-gray-400">
              Your interviewer is ready. Press{" "}
              <span className="font-medium">Begin Interview</span> when you are.
            </p>
          )}

          {turns.length === 0 && status === "idle" && (
            <p className="mt-16 text-center text-sm text-gray-400">
              Resuming your interview. Press the button below to continue
              answering.
            </p>
          )}

          {turns.map((turn, i) => (
            <TurnBubble key={i} turn={turn} />
          ))}

          {status === "processing" && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Spinner />
              <span>Processing your answer…</span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
              {status === "ready" && (
                <button
                  onClick={beginInterview}
                  className="ml-3 underline hover:no-underline"
                >
                  Try again
                </button>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </main>

      {/* Controls */}
      <footer className="flex-none border-t border-gray-200 bg-white px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3">
          {status === "ready" && (
            <button
              onClick={beginInterview}
              className="rounded-full bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
            >
              Begin Interview
            </button>
          )}

          {status === "starting" && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner />
              <span>Preparing your interviewer…</span>
            </div>
          )}

          {(status === "idle" || status === "recording") && (
            <>
              <button
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onTouchStart={handlePressStart}
                onTouchEnd={handlePressEnd}
                className={[
                  "flex h-20 w-20 select-none flex-col items-center justify-center rounded-full text-center text-xs font-medium transition-all",
                  status === "recording"
                    ? "animate-pulse scale-110 bg-red-500 text-white shadow-lg shadow-red-200"
                    : "bg-gray-900 text-white hover:scale-105 hover:bg-gray-700",
                ].join(" ")}
              >
                {status === "recording" ? (
                  "Recording…"
                ) : (
                  <>
                    Hold to
                    <br />
                    answer
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400">
                {status === "idle"
                  ? "Hold the button while speaking, release when done."
                  : "Release when you've finished speaking."}
              </p>
            </>
          )}

          {status === "playing" && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-blue-200 bg-blue-50">
                <SpeakerIcon />
              </div>
              <p className="text-xs text-gray-500">
                Interviewer speaking…{" "}
                <button
                  onClick={skipSpeech}
                  className="underline hover:no-underline"
                >
                  skip
                </button>
              </p>
            </div>
          )}

          {status === "processing" && (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
              <Spinner size="lg" />
            </div>
          )}

          {status === "complete" && (
            <p className="text-sm text-gray-500">
              Interview complete — redirecting…
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TurnBubble({ turn }: { turn: Turn }) {
  const isInterviewer = turn.role === "interviewer";
  return (
    <div className={`flex ${isInterviewer ? "justify-start" : "justify-end"}`}>
      <div
        className={[
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm",
          isInterviewer
            ? "rounded-tl-sm bg-white text-gray-900 ring-1 ring-gray-200"
            : "rounded-tr-sm bg-gray-900 text-white",
        ].join(" ")}
      >
        <p
          className={`mb-1 text-[10px] font-medium ${
            isInterviewer ? "text-gray-400" : "text-gray-300"
          }`}
        >
          {isInterviewer ? "Interviewer" : "You"}
        </p>
        <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: InterviewStatus }) {
  const cfg: Record<InterviewStatus, { dot: string; label: string }> = {
    ready:      { dot: "bg-gray-300",                 label: "Ready" },
    starting:   { dot: "bg-yellow-400 animate-pulse", label: "Starting…" },
    idle:       { dot: "bg-green-400",                label: "Live" },
    recording:  { dot: "bg-red-500 animate-pulse",    label: "Recording" },
    processing: { dot: "bg-yellow-400 animate-pulse", label: "Processing" },
    playing:    { dot: "bg-blue-400 animate-pulse",   label: "Speaking" },
    complete:   { dot: "bg-gray-300",                 label: "Complete" },
  };
  const { dot, label } = cfg[status];
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </div>
  );
}

function Spinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "h-6 w-6" : "h-3 w-3";
  return (
    <svg
      className={`animate-spin ${sz} text-gray-400`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      className="h-8 w-8 text-blue-400"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
      />
    </svg>
  );
}
