-- ============================================================
-- Phase 4 expansion: richer feedback fields on feedback_reports
-- Apply via: Supabase SQL editor
-- ============================================================

ALTER TABLE public.feedback_reports
  ADD COLUMN IF NOT EXISTS readiness_verdict          TEXT,
  ADD COLUMN IF NOT EXISTS top_priority               TEXT,
  ADD COLUMN IF NOT EXISTS strength_evidence          JSONB,
  ADD COLUMN IF NOT EXISTS interviewer_pressure_reframe JSONB,
  ADD COLUMN IF NOT EXISTS star_method_note           TEXT,
  ADD COLUMN IF NOT EXISTS language_patterns          JSONB,
  ADD COLUMN IF NOT EXISTS role_fit_verdict           JSONB,
  ADD COLUMN IF NOT EXISTS reassurance_note           TEXT,
  ADD COLUMN IF NOT EXISTS company_research_suggestion JSONB;
