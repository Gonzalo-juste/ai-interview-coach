"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// ── Exported types (consumed by the server page) ─────────────────────────────

export interface StoryGap {
  archetype: string;
  status: "missing" | "thin" | "covered";
  note: string;
  prepare_action: string;
}

export interface CvGap {
  direction: "cv_to_interview" | "interview_to_cv";
  claim: string;
  cv_excerpt: string;
  evidenced: boolean;
  note: string;
  suggested_cv_line?: string;
}

export interface DisplayAnswer {
  turnIndex: number;
  questionText: string | null;
  answerText: string;
  isBehavioral: boolean;
  starSituationPresent: boolean | null;
  starTaskPresent: boolean | null;
  starActionPresent: boolean | null;
  starResultPresent: boolean | null;
  starQualityScore: number | null;
  rewrite: string;
  culturalNote: string | null;
}

export interface StrengthEvidence {
  moment: string;
  why_it_matters: string;
}

export interface PressureReframe {
  observation: string;
  reframe: string;
}

export interface LanguagePattern {
  pattern: string;
  example_count: number;
  description: string;
}

export interface RoleFitVerdict {
  have: string[];
  need: string[];
}

export interface CompanyResearchSuggestion {
  searched: boolean;
  summary: string;
  suggestions: string[];
}

interface Props {
  sessionId: string;
  displayAnswers: DisplayAnswer[];
  storyGaps: StoryGap[];
  cvGaps: CvGap[];
  readinessVerdict: string | null;
  topPriority: string | null;
  roleFitVerdict: RoleFitVerdict | null;
  reassuranceNote: string | null;
  strengthEvidence: StrengthEvidence[];
  interviewerPressureReframe: PressureReframe[];
  starMethodNote: string | null;
  languagePatterns: LanguagePattern[];
  companyResearchSuggestion: CompanyResearchSuggestion | null;
  priorSessionCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ARCHETYPE_LABELS: Record<string, string> = {
  conflict_with_teammate: "Conflict with Teammate",
  failure_recovery: "Failure & Recovery",
  leadership_under_ambiguity: "Leadership Under Ambiguity",
  prioritization_under_pressure: "Prioritization Under Pressure",
  disagreeing_with_authority: "Disagreeing with Authority",
};

type Tab = "Overview" | "Per-Answer" | "Gaps";

// ── Shared badge components ───────────────────────────────────────────────────

function GapStatusBadge({ status }: { status: "covered" | "thin" | "missing" }) {
  const cls = {
    covered: "bg-green-100 text-green-700",
    thin: "bg-amber-100 text-amber-700",
    missing: "bg-red-100 text-red-700",
  }[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        cls
      )}
    >
      {status}
    </span>
  );
}

function EvidencedBadge({ evidenced }: { evidenced: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
        evidenced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      )}
    >
      {evidenced ? "evidenced" : "not evidenced"}
    </span>
  );
}

function StarBadge({ label, present }: { label: string; present: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 text-xs font-medium",
        present
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-400 line-through"
      )}
    >
      {label}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  const cls =
    score >= 4
      ? "bg-green-100 text-green-700"
      : score >= 3
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        cls
      )}
    >
      STAR {score}/5
    </span>
  );
}

function CategoryBadge({ isBehavioral }: { isBehavioral: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        isBehavioral
          ? "bg-purple-100 text-purple-700"
          : "bg-blue-100 text-blue-700"
      )}
    >
      {isBehavioral ? "behavioral" : "technical"}
    </span>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  storyGaps,
  readinessVerdict,
  topPriority,
  roleFitVerdict,
  reassuranceNote,
  strengthEvidence,
  interviewerPressureReframe,
  starMethodNote,
  languagePatterns,
  companyResearchSuggestion,
  priorSessionCount,
  onGapClick,
}: {
  storyGaps: StoryGap[];
  readinessVerdict: string | null;
  topPriority: string | null;
  roleFitVerdict: RoleFitVerdict | null;
  reassuranceNote: string | null;
  strengthEvidence: StrengthEvidence[];
  interviewerPressureReframe: PressureReframe[];
  starMethodNote: string | null;
  languagePatterns: LanguagePattern[];
  companyResearchSuggestion: CompanyResearchSuggestion | null;
  priorSessionCount: number;
  onGapClick: () => void;
}) {
  const coveredCount = storyGaps.filter((g) => g.status === "covered").length;
  const showCompanyResearch =
    companyResearchSuggestion?.searched === true &&
    (companyResearchSuggestion.suggestions?.length ?? 0) > 0;

  return (
    <div className="space-y-5">

      {/* 1. Strength evidence — read first, sets emotional frame */}
      {strengthEvidence.length > 0 && (
        <div className="rounded-xl bg-green-50 px-5 py-5 ring-1 ring-green-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-green-700">
            Moments that stood out
          </p>
          <div className="space-y-3">
            {strengthEvidence.map((item, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-green-900 leading-snug">
                  &ldquo;{item.moment}&rdquo;
                </p>
                <p className="mt-1 text-sm text-green-700">{item.why_it_matters}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Readiness verdict — headline */}
      {readinessVerdict && (
        <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Readiness verdict
          </p>
          <p className="text-base leading-relaxed text-gray-900">{readinessVerdict}</p>
        </div>
      )}

      {/* 3. Top priority — visually distinct */}
      {topPriority && (
        <div className="rounded-xl bg-amber-50 px-5 py-5 ring-1 ring-amber-200">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Top priority before your next interview
          </p>
          <p className="text-sm font-medium leading-relaxed text-amber-900">{topPriority}</p>
        </div>
      )}

      {/* 4. Role fit verdict */}
      {roleFitVerdict && (
        <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Role fit
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-green-700 flex items-center gap-1.5">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-2.5 w-2.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  </svg>
                </span>
                What you already have
              </p>
              <ul className="space-y-1.5">
                {roleFitVerdict.have.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-100">
                  <svg className="h-2.5 w-2.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </span>
                What this role still needs to see
              </p>
              <ul className="space-y-1.5">
                {roleFitVerdict.need.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 5. Interviewer pressure reframe */}
      {interviewerPressureReframe.length > 0 && (
        <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Reading the room
          </p>
          <div className="space-y-4">
            {interviewerPressureReframe.map((item, i) => (
              <div key={i}>
                <p className="text-sm text-gray-600">{item.observation}</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{item.reframe}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. STAR method note */}
      {starMethodNote && (
        <div className="rounded-xl bg-blue-50 px-5 py-4 ring-1 ring-blue-200">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Structure tip
          </p>
          <p className="text-sm leading-relaxed text-blue-900">{starMethodNote}</p>
        </div>
      )}

      {/* 7. Language patterns */}
      {languagePatterns.length > 0 && (
        <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Language coaching
          </p>
          <div className="space-y-4">
            {languagePatterns.map((lp, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-600">
                    {lp.pattern}
                  </span>
                  <span className="text-xs text-gray-400">
                    {lp.example_count} answer{lp.example_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-700">{lp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 8. Company research suggestions */}
      {showCompanyResearch && (
        <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Before your real interview, look into
          </p>
          <ul className="space-y-2">
            {companyResearchSuggestion!.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 9. Reassurance note */}
      {reassuranceNote && (
        <div className="rounded-xl bg-gray-50 px-5 py-4 ring-1 ring-gray-200">
          <p className="text-sm leading-relaxed text-gray-600">{reassuranceNote}</p>
        </div>
      )}

      {/* 10. Session history */}
      <div className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-500">
          {priorSessionCount === 0
            ? "This is your first session — track your progress here as you do more."
            : `You've completed ${priorSessionCount + 1} sessions in total.`}
        </p>
      </div>

      {/* 11. Story coverage — demoted to secondary position */}
      <div className="rounded-xl bg-white px-5 py-5 shadow-sm ring-1 ring-gray-200">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-700">Story coverage</h2>
          <span className="text-xs tabular-nums text-gray-400">{coveredCount}/5 covered</span>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Click a row for full details and preparation guidance.
        </p>
        <ul className="space-y-1">
          {storyGaps.map((gap) => (
            <li key={gap.archetype}>
              <button
                onClick={onGapClick}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-50 transition-colors"
              >
                <span className="text-gray-700">
                  {ARCHETYPE_LABELS[gap.archetype] ?? gap.archetype}
                </span>
                <GapStatusBadge status={gap.status} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Per-Answer tab — UNTOUCHED ────────────────────────────────────────────────

function PerAnswerTab({
  displayAnswers,
  expandedCards,
  toggleCard,
}: {
  displayAnswers: DisplayAnswer[];
  expandedCards: Set<number>;
  toggleCard: (turnIndex: number) => void;
}) {
  if (displayAnswers.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
        <p className="text-sm text-gray-500">
          No per-answer feedback was generated for this session.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayAnswers.map((answer, idx) => {
        const isOpen = expandedCards.has(answer.turnIndex);
        return (
          <div
            key={answer.turnIndex}
            className="rounded-xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden"
          >
            {/* Collapsed header */}
            <button
              onClick={() => toggleCard(answer.turnIndex)}
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-gray-400">
                  Question {idx + 1}
                </p>
                <p className="line-clamp-2 text-sm text-gray-800">
                  {answer.questionText ?? "—"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CategoryBadge isBehavioral={answer.isBehavioral} />
                  {answer.starQualityScore !== null && (
                    <QualityBadge score={answer.starQualityScore} />
                  )}
                </div>
              </div>
              <svg
                className={cn(
                  "mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-150",
                  isOpen && "rotate-180"
                )}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m19 9-7 7-7-7"
                />
              </svg>
            </button>

            {/* Expanded body */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-5">
                {/* Original answer vs rewrite */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Your answer
                    </p>
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                      {answer.answerText}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Native-speaker rewrite
                    </p>
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                      {answer.rewrite}
                    </p>
                  </div>
                </div>

                {/* STAR badges — only when behavioral (starQualityScore non-null) */}
                {answer.starQualityScore !== null && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      STAR structure
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <StarBadge
                        label="Situation"
                        present={answer.starSituationPresent ?? false}
                      />
                      <StarBadge
                        label="Task"
                        present={answer.starTaskPresent ?? false}
                      />
                      <StarBadge
                        label="Action"
                        present={answer.starActionPresent ?? false}
                      />
                      <StarBadge
                        label="Result"
                        present={answer.starResultPresent ?? false}
                      />
                    </div>
                  </div>
                )}

                {/* Cultural note */}
                {answer.culturalNote && (
                  <div className="rounded-lg bg-amber-50 px-4 py-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-600">
                      Cultural framing note
                    </p>
                    <p className="text-sm text-amber-800">{answer.culturalNote}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────

function GapsTab({
  storyGaps,
  cvGaps,
}: {
  storyGaps: StoryGap[];
  cvGaps: CvGap[];
}) {
  const interviewToCvGaps = cvGaps.filter((g) => g.direction === "interview_to_cv");
  const cvToInterviewGaps = cvGaps.filter((g) => g.direction === "cv_to_interview");

  return (
    <div className="space-y-8">
      {/* Story gaps */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Story Archetypes
        </h2>
        <div className="space-y-3">
          {storyGaps.map((gap) => (
            <div
              key={gap.archetype}
              className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-gray-800">
                  {ARCHETYPE_LABELS[gap.archetype] ?? gap.archetype}
                </p>
                <GapStatusBadge status={gap.status} />
              </div>
              {gap.note && (
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{gap.note}</p>
              )}
              {gap.prepare_action && gap.status !== "covered" && (
                <div className="mt-3 rounded-md bg-gray-50 px-3 py-2">
                  <p className="text-xs font-semibold text-gray-500 mb-0.5">Prepare:</p>
                  <p className="text-sm text-gray-700">{gap.prepare_action}</p>
                </div>
              )}
              {gap.prepare_action && gap.status === "covered" && (
                <p className="mt-2 text-xs text-gray-400 italic">{gap.prepare_action}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CV gaps — split into two labeled sections */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">CV Analysis</h2>

        {/* interview_to_cv: things said that are not on CV */}
        {interviewToCvGaps.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Strengthen your CV
            </h3>
            <p className="mb-3 text-xs text-gray-400">
              Things you said in this session that aren't on your CV yet.
            </p>
            <div className="space-y-3">
              {interviewToCvGaps.map((gap, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-gray-800">{gap.claim}</p>
                    <span className="inline-flex shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      add to CV
                    </span>
                  </div>
                  {gap.cv_excerpt && (
                    <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
                      &ldquo;{gap.cv_excerpt}&rdquo;
                    </p>
                  )}
                  {gap.note && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{gap.note}</p>
                  )}
                  {gap.suggested_cv_line && (
                    <div className="mt-3 rounded-md bg-blue-50 px-3 py-2">
                      <p className="text-xs font-semibold text-blue-600 mb-1">
                        Suggested CV line:
                      </p>
                      <p className="text-sm text-blue-800">{gap.suggested_cv_line}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* cv_to_interview: CV claims not backed up in this session */}
        {cvToInterviewGaps.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700">
              Prepare for next time
            </h3>
            <p className="mb-3 text-xs text-gray-400">
              Load-bearing CV claims not backed up with a story in this session.
            </p>
            <div className="space-y-3">
              {cvToInterviewGaps.map((gap, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-gray-800">{gap.claim}</p>
                    <EvidencedBadge evidenced={gap.evidenced} />
                  </div>
                  {gap.cv_excerpt && (
                    <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-500">
                      {gap.cv_excerpt}
                    </p>
                  )}
                  {gap.note && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">{gap.note}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {cvGaps.length === 0 && (
          <div className="rounded-xl bg-white px-5 py-6 text-center shadow-sm ring-1 ring-gray-200">
            <p className="text-sm text-gray-400">
              No CV claims were analysed in this session.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FeedbackClient({
  displayAnswers,
  storyGaps,
  cvGaps,
  readinessVerdict,
  topPriority,
  roleFitVerdict,
  reassuranceNote,
  strengthEvidence,
  interviewerPressureReframe,
  starMethodNote,
  languagePatterns,
  companyResearchSuggestion,
  priorSessionCount,
}: Omit<Props, "sessionId"> & { sessionId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  function toggleCard(turnIndex: number) {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(turnIndex)) next.delete(turnIndex);
      else next.add(turnIndex);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-lg font-bold text-gray-900">Feedback Report</h1>
            <a
              href="/new-session"
              className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
            >
              New session
            </a>
          </div>
          <nav className="-mb-px flex gap-6" aria-label="Feedback tabs">
            {(["Overview", "Per-Answer", "Gaps"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "border-b-2 pb-3 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {activeTab === "Overview" && (
          <OverviewTab
            storyGaps={storyGaps}
            readinessVerdict={readinessVerdict}
            topPriority={topPriority}
            roleFitVerdict={roleFitVerdict}
            reassuranceNote={reassuranceNote}
            strengthEvidence={strengthEvidence}
            interviewerPressureReframe={interviewerPressureReframe}
            starMethodNote={starMethodNote}
            languagePatterns={languagePatterns}
            companyResearchSuggestion={companyResearchSuggestion}
            priorSessionCount={priorSessionCount}
            onGapClick={() => setActiveTab("Gaps")}
          />
        )}
        {activeTab === "Per-Answer" && (
          <PerAnswerTab
            displayAnswers={displayAnswers}
            expandedCards={expandedCards}
            toggleCard={toggleCard}
          />
        )}
        {activeTab === "Gaps" && (
          <GapsTab storyGaps={storyGaps} cvGaps={cvGaps} />
        )}
      </main>
    </div>
  );
}
