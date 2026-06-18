"use client";

import { useActionState, useState, useRef } from "react";
import { createSession, type CreateSessionState } from "@/lib/actions/create-session";

const archetypes = [
  {
    value: "friendly",
    label: "Friendly",
    description: "Warm, encouraging — safe practice environment",
  },
  {
    value: "neutral",
    label: "Neutral",
    description: "Professional, business-like — standard interview tone",
  },
  {
    value: "tough",
    label: "Tough",
    description: "Direct, demanding — FAANG / top-tier consulting level",
  },
] as const;

type UploadState =
  | { status: "idle" }
  | { status: "extracting" }
  | { status: "error"; message: string };

export function NewSessionForm() {
  const [state, action, isPending] = useActionState<CreateSessionState, FormData>(
    createSession,
    null
  );

  // CV input mode
  const [cvMode, setCvMode] = useState<"paste" | "upload">("paste");
  const [cvText, setCvText] = useState("");
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUpload({ status: "extracting" });

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/extract-cv", { method: "POST", body: fd });
      const data: { text?: string; error?: string } = await res.json();

      if (!res.ok || !data.text) {
        setUpload({
          status: "error",
          message: data.error ?? "Extraction failed. Please try again.",
        });
        return;
      }

      setCvText(data.text);
      setCvMode("paste"); // switch to paste view so the user can review/edit
      setUpload({ status: "idle" });
    } catch {
      setUpload({
        status: "error",
        message: "Upload failed — check your connection and try again.",
      });
    } finally {
      // Reset so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function switchMode(mode: "paste" | "upload") {
    setCvMode(mode);
    setUpload({ status: "idle" });
  }

  const busy = isPending || upload.status === "extracting";

  return (
    <form action={action} className="space-y-8">
      {state?.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Job Description */}
      <div className="space-y-2">
        <label htmlFor="jd_text" className="block text-sm font-medium text-gray-900">
          Job Description
        </label>
        <p className="text-xs text-gray-500">
          Paste the full job posting — responsibilities, requirements, and listed skills.
        </p>
        <textarea
          id="jd_text"
          name="jd_text"
          required
          disabled={busy}
          rows={10}
          placeholder="Paste the job description here…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* CV — paste or upload */}
      <div className="space-y-2">
        {/* Label row with mode toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">CV / Résumé</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {cvMode === "paste"
                ? "Paste as plain text — the more detail, the better the feedback."
                : "Upload a .pdf or .docx — text will be extracted for you to review."}
            </p>
          </div>

          {/* Paste / Upload toggle */}
          <div className="flex shrink-0 rounded-md border border-gray-200 p-0.5 text-xs font-medium">
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode("paste")}
              className={`rounded px-3 py-1.5 transition-colors ${
                cvMode === "paste"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Paste text
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => switchMode("upload")}
              className={`rounded px-3 py-1.5 transition-colors ${
                cvMode === "upload"
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-800"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              Upload file
            </button>
          </div>
        </div>

        {/* Upload panel */}
        {cvMode === "upload" && (
          <div className="space-y-3">
            <label
              htmlFor="cv_file"
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center transition-colors hover:border-gray-400 hover:bg-gray-100 ${
                upload.status === "extracting" ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {upload.status === "extracting" ? (
                <>
                  <svg
                    className="h-6 w-6 animate-spin text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v3m6.364 1.636-2.121 2.121M21 12h-3m-1.636 6.364-2.121-2.121M12 21v-3m-6.364-1.636 2.121-2.121M3 12h3m1.636-6.364 2.121 2.121"
                    />
                  </svg>
                  <span className="text-sm text-gray-500">Extracting text…</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-6 w-6 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <span className="text-sm font-medium text-gray-700">
                    Click to upload
                  </span>
                  <span className="text-xs text-gray-400">.pdf or .docx · max 5 MB</span>
                </>
              )}
              <input
                id="cv_file"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={upload.status === "extracting" || isPending}
                onChange={handleFile}
                className="sr-only"
              />
            </label>

            {upload.status === "error" && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {upload.message}
              </div>
            )}
          </div>
        )}

        {/* CV textarea — always in the DOM so its name="cv_text" is always submitted;
            shown in paste mode and after a successful upload */}
        <div className={cvMode === "upload" && upload.status !== "error" ? "hidden" : ""}>
          {cvText && cvMode === "paste" && upload.status === "idle" && (
            <p className="mb-1.5 flex items-center gap-1.5 text-xs text-green-700">
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
              Text extracted — review and edit before submitting.
            </p>
          )}
          <textarea
            id="cv_text"
            name="cv_text"
            required
            disabled={busy}
            rows={10}
            placeholder="Paste your CV here…"
            value={cvText}
            onChange={(e) => setCvText(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Company Name */}
      <div className="space-y-2">
        <label htmlFor="company_name" className="block text-sm font-medium text-gray-900">
          Target Company
        </label>
        <p className="text-xs text-gray-500">
          The AI will research this company and tailor the interviewer accordingly.
        </p>
        <input
          id="company_name"
          name="company_name"
          type="text"
          required
          disabled={busy}
          placeholder="e.g. Stripe, McKinsey, NHS Digital"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Difficulty Archetype */}
      <fieldset disabled={busy} className="space-y-3">
        <legend className="text-sm font-medium text-gray-900">
          Interviewer Difficulty
        </legend>
        <p className="text-xs text-gray-500">
          Choose how hard the AI interviewer should push you.
        </p>
        <div className="space-y-2">
          {archetypes.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 hover:border-gray-400 has-[:checked]:border-gray-900 has-[:checked]:bg-gray-50"
            >
              <input
                type="radio"
                name="difficulty_archetype"
                value={value}
                defaultChecked={value === "neutral"}
                className="mt-0.5 h-4 w-4 accent-gray-900"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{label}</span>
                <span className="block text-xs text-gray-500">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Submit */}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v3m6.364 1.636-2.121 2.121M21 12h-3m-1.636 6.364-2.121-2.121M12 21v-3m-6.364-1.636 2.121-2.121M3 12h3m1.636-6.364 2.121 2.121"
              />
            </svg>
            Analysing your materials…
          </span>
        ) : (
          "Generate Interview Session"
        )}
      </button>

      {isPending && (
        <p className="text-center text-xs text-gray-400">
          Researching the company and building your interviewer — this takes 10–20 seconds.
        </p>
      )}
    </form>
  );
}
