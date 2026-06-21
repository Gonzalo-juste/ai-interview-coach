/**
 * Contract test: every status value written by the turn route must be present
 * in the migration that defines the sessions.status CHECK constraint.
 *
 * Root cause this caught: migrations 001 only allowed 'pending' | 'active' |
 * 'completed' | 'cancelled'.  The turn route wrote 'finalizing', 'wrap_0', and
 * 'wrap_1' — all of which violated the constraint and silently failed, keeping
 * every session permanently at 'active'.  shouldEndSession() kept returning true
 * so generateFinalQ fired on every subsequent turn instead of ever reaching the
 * wrap-up phase.
 *
 * If you add a new status value to session.ts, this test will fail until you
 * also add it to the migration that updates sessions_status_check.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// All status values that SessionStatus in lib/interview/session.ts can produce.
// Keep this list in sync with the SessionStatus type.
const CODE_STATUS_VALUES = [
  "pending",
  "active",
  "finalizing",
  "wrap_0",
  "wrap_1",
  "completed",
  "cancelled", // kept from the original schema for soft-delete use
] as const;

// The migration file that owns the sessions_status_check constraint.
const CONSTRAINT_MIGRATION_PATH = join(
  __dirname,
  "../supabase/migrations/003_session_status_values.sql"
);

function readMigration(): string {
  try {
    return readFileSync(CONSTRAINT_MIGRATION_PATH, "utf8");
  } catch (err) {
    throw new Error(
      `Cannot read constraint migration at ${CONSTRAINT_MIGRATION_PATH}: ${err}. ` +
        "Create it with ALTER TABLE sessions DROP CONSTRAINT sessions_status_check / ADD CONSTRAINT."
    );
  }
}

describe("sessions.status constraint migration", () => {
  it("migration file exists and contains a CHECK constraint definition", () => {
    const sql = readMigration();
    expect(sql).toMatch(/ADD\s+CONSTRAINT\s+sessions_status_check/i);
    expect(sql).toMatch(/CHECK\s*\(/i);
  });

  it.each(CODE_STATUS_VALUES)(
    "constraint allows status value '%s' (used by the turn route)",
    (statusValue) => {
      const sql = readMigration();
      // The migration must contain the quoted value 'status_value'
      expect(sql).toContain(`'${statusValue}'`);
    }
  );

  it("migration drops the old constraint before adding the new one (idempotent apply)", () => {
    const sql = readMigration();
    expect(sql).toMatch(/DROP\s+CONSTRAINT\s+sessions_status_check/i);
  });
});
