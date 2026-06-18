import { createClient } from "@supabase/supabase-js";

// Bypasses RLS — only use in server-side code for cross-user operations (e.g. cache lookups).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
