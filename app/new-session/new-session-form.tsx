"use client";

import { useActionState } from "react";
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

export function NewSessionForm() {
  const [state, action, isPending] = useActionState<CreateSessionState, FormData>(
    createSession,
    null
  );

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
          Paste the full job posting. Include responsibilities, requirements, and any listed skills.
        </p>
        <textarea
          id="jd_text"
          name="jd_text"
          required
          disabled={isPending}
          rows={10}
          placeholder="Paste the job description here…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* CV */}
      <div className="space-y-2">
        <label htmlFor="cv_text" className="block text-sm font-medium text-gray-900">
          Your CV / Résumé
        </label>
        <p className="text-xs text-gray-500">
          Paste your CV as plain text. The more detail you include, the better the feedback.
        </p>
        <textarea
          id="cv_text"
          name="cv_text"
          required
          disabled={isPending}
          rows={10}
          placeholder="Paste your CV here…"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
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
          disabled={isPending}
          placeholder="e.g. Stripe, McKinsey, NHS Digital"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Difficulty Archetype */}
      <fieldset className="space-y-3" disabled={isPending}>
        <legend className="text-sm font-medium text-gray-900">Interviewer Difficulty</legend>
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
        disabled={isPending}
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
          Researching the company and building your interviewer — this takes 10-20 seconds.
        </p>
      )}
    </form>
  );
}
