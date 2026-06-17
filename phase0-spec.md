# AI Interview Coach — Phase 0 Spec (MVP)

## 1. Positioning

A voice-based AI mock interviewer for non-native English speakers preparing for English-language job interviews. The entire experience — interview and feedback — happens in English. The product's edge is L1-aware coaching (fluency, confidence, cultural framing) layered on top of a JD- and CV-grounded interview, not just generic question practice.

## 2. MVP Feature Scope (locked)

- JD + CV input, parsed via LLM extraction (role, seniority, skills, claimed achievements)
- Company research via search API, cached per company
- Persona generation: system prompt built from JD + research + difficulty archetype
- Push-to-talk voice interview loop (STT in, TTS out), adaptive difficulty within session
- Feedback engine: STAR scoring, story-gap analysis, CV-gap analysis, native-speaker rewrite, cultural framing notes
- Cross-session pattern memory (recurring mistakes tracked over time)
- Shareable readiness report
- Points-based credits + Stripe test mode

**Explicitly out of scope for September** (backlog): tone/energy audio analysis, mock panel mode, lightning-round mode, salary negotiation module, real-time (non-push-to-talk) streaming voice, cross-user aggregate data moat.

## 3. Tech Stack

Next.js, Tailwind/shadcn, Supabase (db/auth/storage), Stripe (test mode), Vercel, Anthropic/OpenAI APIs (chat + STT + TTS), Vitest.

## 4. Data Model (high-level)

- `users` — auth, credit balance
- `sessions` — jd_text, cv_text, company_research (cached, keyed by company), persona_config, difficulty_archetype, status
- `transcripts` — session_id, turns (role, text, audio_ref, timestamp)
- `feedback_reports` — session_id, star_scores, story_gaps, cv_gaps, rewrites, cultural_notes, share_token
- `mistake_patterns` — user_id, pattern_type, count, last_seen_session_id
- `transactions` — user_id, credits_delta, type (purchase/spend), session_id

## 5. Interviewer Persona Behavior Contract

The interviewer must:

1. Stay in character for the entire session — never break to coach, explain, or answer meta-questions about the interview itself ("what's a good answer to this?" gets redirected, not answered).
2. Ask one question at a time and wait for a complete answer before responding.
3. Probe vague or underspecified answers with a natural follow-up (e.g., asks for a concrete example, a number, or what specifically the candidate did) rather than moving on.
4. Calibrate tone to the selected archetype (friendly / neutral / tough) and to signals from the company research (e.g., a fast-paced startup interviewer reads differently from a enterprise/legal interviewer).
5. Adapt difficulty within the session: after 2-3 consecutive strong, well-structured answers, escalate to harder or more probing follow-ups. After a weak or confused answer, ease slightly rather than piling on, but never abandon realism.
6. Stay scoped to the role/company/JD — no unrelated tangents.
7. Default session length: 5-8 questions, ~15-20 minutes. (Assumption — adjust once real usage data exists.)
8. Remain professional and respectful regardless of how the candidate responds; never produce biased, discriminatory, or inappropriate commentary.

## 6. Feedback Engine Rubric

Generated once per session, from the full transcript + CV + JD:

- **STAR scoring** — per answer, does it have Situation/Task/Action/Result structure; flag answers that are pure description with no outcome.
- **Story-gap analysis** — which common categories (leadership, conflict, failure/learning, ambiguity, teamwork) are missing from the candidate's answer bank across the session.
- **CV-gap analysis** — claims, achievements, or experiences mentioned verbally that are not reflected in the CV text; output as a specific suggested line to add, not just "this is missing."
- **Native-speaker rewrite** — for 2-3 of the candidate's weaker answers, a side-by-side rewrite preserving their actual content/ideas in more natural, idiomatic English.
- **Cultural framing notes** — flag answers that undersell achievements (modest framing where confident framing is expected) and suggest a more assertive rephrasing without fabricating accomplishments.
- **Pattern tagging** — tag recurring issues (e.g., article omission, preposition errors, hedging language, weak quantification of impact) for storage in `mistake_patterns`, surfaced in the report as a trend ("you've done X in 4 of your last 5 sessions").

## 7. Eval Test Suite

These are the non-deterministic evals — write these before writing the persona/feedback prompts, and run the prompts against them before considering a phase done.

| # | Eval | Pass condition |
|---|---|---|
| 1 | Mid-interview meta-question ("what should I have said?") | Interviewer redirects in-character, does not coach |
| 2 | Vague answer ("I led a project") | Interviewer asks a concrete follow-up for specifics |
| 3 | 3 consecutive strong answers | Next question is measurably harder/more probing |
| 4 | Transcript mentions an achievement absent from CV | Feedback flags it with a specific suggested CV line |
| 5 | Transcript covers leadership + teamwork only | Feedback flags missing categories (conflict, failure, ambiguity) |
| 6 | Native-speaker rewrite of a rough answer | Rewrite preserves original facts/content, adds no fabricated detail |
| 7 | Overly modest answer ("I just helped a bit, others did more") | Feedback flags under-selling, suggests confident reframe, no fabrication |
| 8 | Candidate gives an unusual/hostile/off-topic input | Interviewer stays professional, redirects to the interview |

## 8. Open Assumptions to Validate

- Session length (5-8 questions) — revisit after first beta users.
- Difficulty archetypes limited to 3 (friendly/neutral/tough) for MVP.
- Pattern memory only persists within a single user account, not shared/aggregated across users (that's the backlog data-moat feature).
