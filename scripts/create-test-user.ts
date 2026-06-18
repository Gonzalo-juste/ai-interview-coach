/**
 * Creates a confirmed test user in Supabase auth so the DB diagnostic can run.
 * Run with: npm run create:test-user
 * Safe to run repeatedly — skips creation if user already exists.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const TEST_EMAIL = "test@ai-interview-coach.dev";
const TEST_PASSWORD = "testpassword123";

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existing } = await admin.auth.admin.listUsers();
  const alreadyExists = existing?.users.some((u) => u.email === TEST_EMAIL);

  if (alreadyExists) {
    console.log(`User ${TEST_EMAIL} already exists — skipping creation.`);
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true, // skip email confirmation
  });

  if (error) {
    console.error("Failed to create user:", error.message);
    process.exit(1);
  }

  console.log(`Created test user: ${TEST_EMAIL} (id: ${data.user.id})`);
  console.log(`Password: ${TEST_PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
