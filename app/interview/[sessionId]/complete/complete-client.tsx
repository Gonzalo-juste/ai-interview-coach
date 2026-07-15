"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "loading" | "waiting" | "failed" | "timeout";

const POLL_INTERVAL_MS = 3500;
const TIMEOUT_MS = 120_000;

export function CompleteClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const elapsedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      try {
        const res = await fetch(`/api/sessions/${sessionId}/feedback`);

        if (res.status === 401) {
          setPhase("failed");
          setErrorMessage("Your session expired — please log in again.");
          return;
        }

        if (!res.ok) {
          setPhase("failed");
          setErrorMessage(`Unexpected error (HTTP ${res.status}). Please try again.`);
          return;
        }

        const data: {
          status: "pending" | "processing" | "ready" | "failed";
          error_message?: string | null;
        } = await res.json();

        if (cancelled) return;

        if (data.status === "ready") {
          router.push(`/interview/${sessionId}/feedback`);
          return;
        }

        if (data.status === "failed") {
          setPhase("failed");
          setErrorMessage(
            data.error_message ??
              "The feedback pipeline failed. Please try again or contact support."
          );
          return;
        }

        // pending or processing — keep polling
        setPhase("waiting");
        elapsedRef.current += POLL_INTERVAL_MS;

        if (elapsedRef.current >= TIMEOUT_MS) {
          setPhase("timeout");
          return;
        }

        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) {
          setPhase("failed");
          setErrorMessage("Network error while checking feedback status. Please refresh.");
        }
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // retryKey forces the effect to re-run when user clicks "Keep waiting"
  }, [sessionId, router, retryKey]);

  function handleKeepWaiting() {
    elapsedRef.current = 0;
    setRetryKey((k) => k + 1);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-xl bg-white p-10 shadow-sm ring-1 ring-gray-200">

          {(phase === "loading" || phase === "waiting") && (
            <>
              <div className="mb-6 flex justify-center">
                <svg
                  className="h-10 w-10 animate-spin text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Generating your feedback report</h1>
              <p className="mt-3 text-sm text-gray-500">
                Your answers are being scored and analysed. This usually takes 20–40
                seconds. The page will redirect automatically.
              </p>
              <div className="mt-6 flex justify-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-gray-300"
                    style={{ animation: `dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}
                  />
                ))}
              </div>
            </>
          )}

          {phase === "timeout" && (
            <>
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Taking longer than expected</h1>
              <p className="mt-3 text-sm text-gray-500">
                Your feedback is still being generated. It may be ready in a few more
                minutes — please check back shortly.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3">
                <button
                  onClick={handleKeepWaiting}
                  className="rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
                >
                  Keep waiting
                </button>
                <a href="/new-session" className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
                  Start another session
                </a>
              </div>
            </>
          )}

          {phase === "failed" && (
            <>
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Feedback generation failed</h1>
              {errorMessage && (
                <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-left text-sm text-red-700">
                  {errorMessage}
                </p>
              )}
              <p className="mt-4 text-sm text-gray-500">
                Your session was saved. You can start a new session or{" "}
                <a href="mailto:support@aiinterviewcoach.com" className="underline underline-offset-2">
                  contact support
                </a>{" "}
                if this keeps happening.
              </p>
              <div className="mt-8">
                <a
                  href="/new-session"
                  className="inline-block rounded-md bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
                >
                  Start another session
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
