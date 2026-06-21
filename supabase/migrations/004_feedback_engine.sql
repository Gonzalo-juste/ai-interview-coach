-- ============================================================
-- Phase 4: feedback engine schema
-- Apply via: Supabase SQL editor (supabase db push not yet linked)
-- ============================================================

-- 1. Extend feedback_reports
--    - status: drives the polling flow (pending→processing→ready|failed)
--    - error_message: human-readable failure reason when status='failed'
--    - session_id UNIQUE: required for upsert idempotency in the pipeline
--
--    Existing columns retained unchanged:
--      star_scores, rewrites, cultural_notes (now redundant — per-answer
--      data moves to answer_feedback, but we keep these to avoid a
--      destructive migration on existing rows)

ALTER TABLE public.feedback_reports
  ADD COLUMN status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  ADD COLUMN error_message TEXT;

ALTER TABLE public.feedback_reports
  ADD CONSTRAINT feedback_reports_session_id_key UNIQUE (session_id);

-- 2. answer_feedback: one row per candidate answer per session
--
--    transcript_id FK exists for ON DELETE CASCADE — when the transcript
--    row is deleted, all its answer_feedback rows cascade.
--
--    Uniqueness key is (transcript_id, turn_index), NOT transcript_id alone,
--    because migration 002 enforces one transcript row per session, so
--    UNIQUE(transcript_id) would allow only one answer per session.
--
--    turn_index is the position of this candidate turn in the full turns
--    JSONB array, used as the idempotency key for upserts.

CREATE TABLE public.answer_feedback (
  id                     UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id          UUID      NOT NULL REFERENCES public.transcripts(id) ON DELETE CASCADE,
  session_id             UUID      NOT NULL REFERENCES public.sessions(id)    ON DELETE CASCADE,
  turn_index             INTEGER   NOT NULL,
  star_situation_present BOOLEAN,
  star_task_present      BOOLEAN,
  star_action_present    BOOLEAN,
  star_result_present    BOOLEAN,
  star_quality_score     SMALLINT  CHECK (star_quality_score BETWEEN 1 AND 5),
  rewrite                TEXT      NOT NULL,
  cultural_note          TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transcript_id, turn_index)
);

-- 3. RLS on answer_feedback: owner-only, same pattern as transcripts

ALTER TABLE public.answer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "answer_feedback: own session" ON public.answer_feedback
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = answer_feedback.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- 4. Index for the join done by the GET /feedback endpoint

CREATE INDEX idx_answer_feedback_session_id ON public.answer_feedback(session_id);
