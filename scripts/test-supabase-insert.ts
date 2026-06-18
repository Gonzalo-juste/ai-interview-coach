/**
 * Diagnostic script — tests Supabase connectivity, auth state, and sessions insert.
 * Run with: npm run test:db
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function section(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

async function main() {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
    console.error("Missing env vars — run with: npm run test:db");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });

  // ── 1. Connectivity ──────────────────────────────────────────────────────────

  section("1 — Connectivity (admin client → sessions table)");

  const { error: pingError } = await admin.from("sessions").select("count").limit(0);

  if (pingError) {
    console.error("  ✗ Cannot reach sessions table:", pingError.message);
    console.error("    → Have you run the migration in your Supabase project?");
    process.exit(1);
  }
  console.log("  ✓ sessions table reachable");

  // ── 2. Auth users ────────────────────────────────────────────────────────────

  section("2 — Auth users in this project");

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();

  if (usersError) {
    console.error("  ✗ Could not list users:", usersError.message);
    process.exit(1);
  }

  const users = usersData.users;
  if (users.length === 0) {
    console.log("  ⚠ No users exist yet.");
    console.log("    → Visit /login in the dev server to create an account first.");
    console.log("    → Then re-run this script.\n");
    process.exit(0);
  }

  for (const u of users) {
    console.log(
      `  ✓ ${u.email ?? "(no email)"} — id: ${u.id} — confirmed: ${!!u.email_confirmed_at}`
    );
  }

  const firstUser = users[0];

  // ── 3. Ensure public.users row exists ────────────────────────────────────────

  section("3 — public.users row (created by signup trigger)");

  const { data: pubUser } = await admin
    .from("users")
    .select("id, credit_balance")
    .eq("id", firstUser.id)
    .maybeSingle();

  if (!pubUser) {
    console.log("  ⚠ No row in public.users — trigger may not have fired. Inserting...");
    const { error: upsertErr } = await admin
      .from("users")
      .upsert({ id: firstUser.id, credit_balance: 0 });
    if (upsertErr) {
      console.error("  ✗ public.users upsert failed:", upsertErr.message);
      process.exit(1);
    }
    console.log("  ✓ public.users row created");
  } else {
    console.log(`  ✓ public.users row exists (credit_balance: ${pubUser.credit_balance})`);
  }

  // ── 4. Admin insert (bypasses RLS) ──────────────────────────────────────────

  section("4 — sessions INSERT with service-role key (bypasses RLS)");

  const stub = {
    user_id: firstUser.id,
    jd_text: "DIAGNOSTIC — Senior Backend Engineer",
    cv_text: "DIAGNOSTIC — 5 years Go, PostgreSQL",
    company_research: { company_name: "TestCo", summary: "A test company." },
    persona_config: { system_prompt: "Test prompt.", archetype: "neutral" },
    difficulty_archetype: "neutral",
    status: "pending",
  };

  const { data: inserted, error: insertErr } = await admin
    .from("sessions")
    .insert(stub)
    .select("id, created_at")
    .single();

  if (insertErr) {
    console.error("  ✗ Admin insert failed:", insertErr.message, insertErr.details ?? "");
    process.exit(1);
  }
  console.log(`  ✓ Insert succeeded — id: ${inserted.id}`);

  await admin.from("sessions").delete().eq("id", inserted.id);
  console.log("  ✓ Test row cleaned up");

  // ── 5. Anon insert without session (must be blocked by RLS) ─────────────────

  section("5 — sessions INSERT with anon key + no session (must be blocked by RLS)");

  const { error: anonErr } = await anon
    .from("sessions")
    .insert({ ...stub, jd_text: "ANON TEST" })
    .select("id")
    .single();

  if (anonErr) {
    console.log(`  ✓ RLS correctly blocked unauthenticated insert: ${anonErr.message}`);
  } else {
    console.error("  ✗ RLS did NOT block the insert — check your policies");
    process.exit(1);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  section("Result");
  console.log("  DB layer healthy. Bugs are in the server action — see the fix commit.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
