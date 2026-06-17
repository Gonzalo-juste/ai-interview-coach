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
| `feedback_reports` | session_id, star_scores, story_gaps, cv_gaps, rewrites, cultural_notes, share_token |
| `mistake_patterns` | user_id, pattern_type, count, last_seen_session_id |
| `transactions` | user_id, credits_delta, type (purchase/spend), session_id |

## Phase 1 Checklist

- [x] Next.js + Tailwind + shadcn scaffolded
- [x] Supabase schema migration written (`supabase/migrations/`)
- [x] Supabase auth wired (SSR client + middleware)
- [ ] JD + CV input UI
- [ ] LLM extraction pipeline
- [ ] Company research + caching
- [ ] Persona generation
- [ ] Voice interview loop
- [ ] Feedback engine
- [ ] Readiness report + share link
- [ ] Credits + Stripe
