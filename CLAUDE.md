# AI Interview Coach — Project Guide

Full spec: [phase0-spec.md](./phase0-spec.md)

## MVP Scope (locked for September)

**Core loop:** JD + CV → company research → AI interviewer persona → push-to-talk voice session → feedback report.

**What's in:**
- JD + CV input with LLM-based extraction (role, seniority, skills, achievements)
- Company research via search API, cached per company
- Interviewer persona built from JD + research + difficulty archetype (friendly / neutral / tough)
- Push-to-talk voice loop — STT in, TTS out — with adaptive difficulty within a session
- Feedback engine: STAR scoring, story-gap analysis, CV-gap analysis, native-speaker rewrites, cultural framing notes
- Cross-session mistake pattern memory (per user account)
- Shareable readiness report
- Credits + Stripe (test mode)

**Out of scope until after September:** tone/energy audio analysis, panel mode, lightning-round mode, salary negotiation, real-time streaming voice, cross-user aggregate data.

See §2 of phase0-spec.md for the locked feature list, §5 for the interviewer behavior contract, §6 for the feedback rubric, and §7 for the eval test suite that must pass before each phase ships.

## Tech Stack

Next.js (App Router) · Tailwind + shadcn/ui · Supabase (db / auth / storage) · Stripe test mode · Vercel · Anthropic/OpenAI APIs (chat + STT + TTS) · Vitest

## Data Model (§4 of spec)

| Table | Key columns |
|---|---|
| `users` | auth id, credit_balance |
| `sessions` | user_id, jd_text, cv_text, company_research, persona_config, difficulty_archetype, status |
| `transcripts` | session_id, turns (JSONB: role, text, audio_ref, timestamp) |
| `feedback_reports` | session_id, status, story_gaps, cv_gaps, readiness_verdict, top_priority, strength_evidence, interviewer_pressure_reframe, star_method_note, language_patterns, role_fit_verdict, reassurance_note, company_research_suggestion, share_token |
| `answer_feedback` | session_id, transcript_id, turn_index, star_* scores, rewrite, cultural_note |
| `mistake_patterns` | user_id, pattern_type, count, last_seen_session_id |
| `transactions` | user_id, credits_delta, type (purchase/spend), session_id |

## Phase Checklist

- [x] Next.js + Tailwind + shadcn scaffolded
- [x] Supabase schema migration written (`supabase/migrations/`)
- [x] Supabase auth wired (SSR client + middleware)
- [x] JD + CV input UI
- [x] LLM extraction pipeline
- [x] Company research + caching
- [x] Persona generation
- [x] Voice interview loop
- [x] Feedback engine (STAR scoring, story gaps, CV gaps, rewrites, 9-field session analysis, tone mode)
- [ ] Readiness report + share link — `share_token` column exists, no share UI or route built yet — Phase 6
- [ ] Credits + Stripe — `transactions` table exists, no Stripe integration yet — Phase 7

## Structural Gaps (not blocking MVP, tracked here)

- `mistake_patterns` — schema exists, no code writes to it yet — Phase 5
- `share_token` on `feedback_reports` — column exists, no share UI or public route built — Phase 6
- `transactions` / Stripe — table exists, credits field on `users` exists, no Stripe integration — Phase 7
- Supabase CLI not linked — all migrations must be applied manually via the SQL editor (no `supabase db push`)
