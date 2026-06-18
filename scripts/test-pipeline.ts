/**
 * End-to-end test for the Phase 2 LLM pipeline.
 * Run with: npm run test:pipeline
 *
 * Tests each stage independently and prints results so you can
 * eyeball quality before wiring up the full form flow.
 */

import { extractJdCv, type JdCvExtraction } from "../lib/llm/extract";
import { researchCompany, type CompanyResearch } from "../lib/llm/research";
import { buildPersonaPrompt } from "../lib/llm/persona";

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_JD = `
Senior Backend Engineer — Payments Infrastructure

We're looking for a Senior Backend Engineer to join our Payments Infrastructure team.
You'll design and build high-throughput, low-latency systems that process millions of
payment transactions daily.

Requirements:
- 5+ years backend engineering experience
- Strong proficiency in Go, Python, or Java
- Experience with distributed systems and microservices architecture
- Deep knowledge of SQL (PostgreSQL) and NoSQL databases
- Experience with payment processing, financial systems, or high-reliability services
- Ability to debug complex distributed systems under production pressure

Nice to have:
- Experience with Kafka or similar message queues
- Knowledge of PCI-DSS compliance requirements
- Prior open source contributions
`.trim();

const SAMPLE_CV = `
Jane Smith  |  jane.smith@email.com  |  London, UK

EXPERIENCE

Senior Software Engineer — TechCorp (Jan 2021 – present)
- Led migration of monolithic payment service to microservices, reducing p99 latency by 40%
- Designed and built a distributed rate-limiting system handling 50,000 requests/second
- Owned on-call rotation for payments infrastructure serving 2M daily active users
- Mentored 3 junior engineers; ran weekly technical design review sessions

Software Engineer — StartupXYZ (Jun 2018 – Dec 2020)
- Built order management system processing £2M in daily transactions (Go + PostgreSQL)
- Reduced critical-path database query time by 60% via query optimisation and read replicas
- Implemented real-time fraud detection pipeline using Python, Kafka, and Redis
- Integrated with Stripe, Adyen, and PayPal payment gateways

EDUCATION
BSc Computer Science — University of Manchester (2018)  |  First Class Honours

SKILLS
Go · Python · Java · PostgreSQL · Redis · Kafka · AWS (EKS, RDS, SQS) · Docker · Kubernetes
`.trim();

const SAMPLE_COMPANY = "Stripe";

// ── Utilities ──────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function ok(label: string, value: unknown) {
  const display =
    typeof value === "string"
      ? value.length > 120
        ? value.slice(0, 120) + "…"
        : value
      : JSON.stringify(value, null, 2);
  console.log(`  ✓ ${label}:\n    ${display.replace(/\n/g, "\n    ")}`);
}

function assertNonEmpty(label: string, value: string | unknown[]) {
  const empty =
    typeof value === "string" ? value.trim().length === 0 : value.length === 0;
  if (empty) throw new Error(`FAIL: ${label} is empty`);
  ok(label, value);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

async function testExtraction(): Promise<JdCvExtraction> {
  section("Stage 1 — JD/CV Extraction  (claude-haiku-4-5)");
  console.log("  Calling Anthropic…");
  const start = Date.now();

  const result = await extractJdCv(SAMPLE_JD, SAMPLE_CV);

  console.log(`  Completed in ${Date.now() - start}ms\n`);
  assertNonEmpty("role_title", result.role_title);
  assertNonEmpty("seniority", result.seniority);
  assertNonEmpty("key_skills", result.key_skills);
  assertNonEmpty("claimed_achievements", result.claimed_achievements);
  assertNonEmpty("years_experience", result.years_experience);
  assertNonEmpty("industry", result.industry);

  ok("key_skills (all)", result.key_skills);
  ok("claimed_achievements (all)", result.claimed_achievements);

  return result;
}

async function testResearch(): Promise<CompanyResearch> {
  section("Stage 2 — Company Research  (Tavily → claude-haiku-4-5)");
  console.log(`  Searching for: ${SAMPLE_COMPANY}…`);
  const start = Date.now();

  const result = await researchCompany(SAMPLE_COMPANY);

  console.log(`  Completed in ${Date.now() - start}ms\n`);
  assertNonEmpty("summary", result.summary);
  assertNonEmpty("culture", result.culture);
  assertNonEmpty("interview_style", result.interview_style);
  assertNonEmpty("recent_highlights", result.recent_highlights);

  if (result.company_name !== SAMPLE_COMPANY) {
    throw new Error(`FAIL: company_name mismatch — got "${result.company_name}"`);
  }
  ok("company_name", result.company_name);
  ok("fetched_at", result.fetched_at);

  return result;
}

function testPersonaBuilder(
  extraction: JdCvExtraction,
  research: CompanyResearch
) {
  section("Stage 3 — Persona System Prompt Builder");

  for (const archetype of ["friendly", "neutral", "tough"] as const) {
    const { system_prompt } = buildPersonaPrompt(extraction, research, archetype);

    if (system_prompt.length < 500) {
      throw new Error(`FAIL: ${archetype} prompt suspiciously short (${system_prompt.length} chars)`);
    }

    // Each archetype has a unique phrase in the ## Your Tone section of the prompt
    const archetypeWord = { friendly: "warm", neutral: "business-like", tough: "demanding" }[archetype];

    const checks = [
      ["company name present", system_prompt.includes(SAMPLE_COMPANY)],
      ["role title present", system_prompt.includes(extraction.role_title)],
      ["in-character rule present", system_prompt.includes("Stay in character")],
      ["one question rule present", system_prompt.toLowerCase().includes("one question")],
      ["visa category present", system_prompt.toLowerCase().includes("visa")],
      ["archetype tone present", system_prompt.includes(archetypeWord)],
    ] as [string, boolean][];

    let failed = false;
    for (const [label, passed] of checks) {
      if (!passed) {
        console.error(`  ✗ [${archetype}] ${label}`);
        failed = true;
      } else {
        console.log(`  ✓ [${archetype}] ${label}`);
      }
    }
    if (failed) throw new Error(`FAIL: persona checks failed for archetype "${archetype}"`);
  }

  // Print the neutral prompt in full for review
  section("Neutral persona system prompt (full — review for quality)");
  const { system_prompt } = buildPersonaPrompt(extraction, research, "neutral");
  console.log(system_prompt);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🧪  AI Interview Coach — Phase 2 Pipeline Test");
  console.log(`   Company: ${SAMPLE_COMPANY}  |  Role: Senior Backend Engineer`);

  try {
    const extraction = await testExtraction();
    const research = await testResearch();
    testPersonaBuilder(extraction, research);

    section("Result");
    console.log("  All checks passed.\n");
    process.exit(0);
  } catch (err) {
    console.error("\n\n" + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}

main();
