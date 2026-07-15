-- ============================================================
-- Phase 4 cleanup: drop columns superseded by answer_feedback
-- Apply via: Supabase SQL editor (supabase db push not yet linked)
-- ============================================================
--
-- star_scores, rewrites, and cultural_notes were defined on feedback_reports
-- in migration 001 (initial schema). Per-answer data was moved to the
-- answer_feedback table in migration 004. These three columns were never
-- written to by the Phase 4 pipeline and are safe to drop.
--
-- See migration 004 for the answer_feedback table definition.

ALTER TABLE public.feedback_reports
  DROP COLUMN IF EXISTS star_scores,
  DROP COLUMN IF EXISTS rewrites,
  DROP COLUMN IF EXISTS cultural_notes;
