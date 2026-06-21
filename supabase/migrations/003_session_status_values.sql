-- Extend sessions.status check constraint to include the intermediate states
-- introduced for the wrap-up flow.
--
-- Original constraint only allowed: pending | active | completed | cancelled
-- The turn route now writes:        finalizing | wrap_0 | wrap_1
-- Those writes silently failed against the old constraint, keeping every
-- session permanently at 'active' and preventing wrap-up from ever being reached.
--
-- Apply via: supabase db push  (or paste into Supabase SQL editor)

ALTER TABLE public.sessions
  DROP CONSTRAINT sessions_status_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN (
    'pending',
    'active',
    'finalizing',   -- last main-interview question asked; next answer starts wrap-up
    'wrap_0',       -- wrap-up prompt given ("any questions?"); 0 exchanges answered
    'wrap_1',       -- 1 exchange answered; model must close after the next
    'completed',
    'cancelled'
  ));
