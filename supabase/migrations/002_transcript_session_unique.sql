-- Ensure one transcript row per session (needed for safe upsert pattern)
ALTER TABLE public.transcripts
  ADD CONSTRAINT transcripts_session_id_key UNIQUE (session_id);
