-- ============================================================
-- AI Interview Coach — initial schema
-- Run via: supabase db push  (or paste into Supabase SQL editor)
-- ============================================================

-- users: extends auth.users with app-specific columns
CREATE TABLE public.users (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_balance INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- sessions: one per mock interview
CREATE TABLE public.sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jd_text              TEXT,
  cv_text              TEXT,
  company_research     JSONB,      -- cached by company name key
  persona_config       JSONB,
  difficulty_archetype TEXT        CHECK (difficulty_archetype IN ('friendly', 'neutral', 'tough')),
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- transcripts: full turn-by-turn record for a session
-- turns: [{role: 'interviewer'|'candidate', text, audio_ref, timestamp}]
CREATE TABLE public.transcripts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  turns      JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- feedback_reports: generated once per completed session
CREATE TABLE public.feedback_reports (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  star_scores    JSONB,      -- per-answer STAR breakdown
  story_gaps     JSONB,      -- missing category analysis
  cv_gaps        JSONB,      -- verbal claims absent from CV + suggested CV lines
  rewrites       JSONB,      -- native-speaker rewrites for weak answers
  cultural_notes JSONB,      -- undersell flags + reframe suggestions
  share_token    TEXT        UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- mistake_patterns: cross-session memory of recurring issues (per user)
CREATE TABLE public.mistake_patterns (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pattern_type         TEXT        NOT NULL,   -- e.g. 'article_omission', 'weak_quantification'
  count                INTEGER     NOT NULL DEFAULT 1,
  last_seen_session_id UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, pattern_type)
);

-- transactions: credit ledger
CREATE TABLE public.transactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credits_delta  INTEGER     NOT NULL,         -- positive = purchase, negative = spend
  type           TEXT        NOT NULL CHECK (type IN ('purchase', 'spend')),
  session_id     UUID        REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_sessions_user_id         ON public.sessions(user_id);
CREATE INDEX idx_transcripts_session_id   ON public.transcripts(session_id);
CREATE INDEX idx_feedback_session_id      ON public.feedback_reports(session_id);
CREATE INDEX idx_feedback_share_token     ON public.feedback_reports(share_token);
CREATE INDEX idx_mistake_patterns_user_id ON public.mistake_patterns(user_id);
CREATE INDEX idx_transactions_user_id     ON public.transactions(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mistake_patterns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions      ENABLE ROW LEVEL SECURITY;

-- users: own row only
CREATE POLICY "users: own row" ON public.users
  FOR ALL USING (auth.uid() = id);

-- sessions: own sessions only
CREATE POLICY "sessions: own" ON public.sessions
  FOR ALL USING (auth.uid() = user_id);

-- transcripts: via session ownership
CREATE POLICY "transcripts: own session" ON public.transcripts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = transcripts.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- feedback_reports: own session, OR public via share_token (read-only)
CREATE POLICY "feedback: own session" ON public.feedback_reports
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.sessions
      WHERE sessions.id = feedback_reports.session_id
        AND sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "feedback: public share link" ON public.feedback_reports
  FOR SELECT USING (share_token IS NOT NULL);

-- mistake_patterns: own only
CREATE POLICY "mistake_patterns: own" ON public.mistake_patterns
  FOR ALL USING (auth.uid() = user_id);

-- transactions: own only
CREATE POLICY "transactions: own" ON public.transactions
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Auto-create users row on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Auto-update updated_at on modification
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_transcripts_updated_at
  BEFORE UPDATE ON public.transcripts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_feedback_updated_at
  BEFORE UPDATE ON public.feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_mistake_patterns_updated_at
  BEFORE UPDATE ON public.mistake_patterns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
