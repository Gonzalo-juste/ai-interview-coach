/**
 * Tests the /api/extract-cv route against the running dev server.
 * Run with: node scripts/test-extract-cv-api.mjs
 */

const BASE = "http://localhost:3000/api/extract-cv";

let passed = 0;
let failed = 0;

async function post(label, formData, expectStatus, expectErrorFragment) {
  let res, body;
  try {
    res = await fetch(BASE, { method: "POST", body: formData });
    body = await res.json();
  } catch (e) {
    console.error(`  ✗ [${label}] fetch failed: ${e.message}`);
    failed++;
    return;
  }

  const statusOk = res.status === expectStatus;
  const bodyOk = expectErrorFragment
    ? body.error?.toLowerCase().includes(expectErrorFragment.toLowerCase())
    : body.text && body.text.length > 0;

  if (statusOk && bodyOk) {
    console.log(`  ✓ [${label}] HTTP ${res.status} — ${body.error ?? "(text returned, length: " + body.text?.length + ")"}`);
    passed++;
  } else {
    console.error(`  ✗ [${label}] expected HTTP ${expectStatus} + "${expectErrorFragment ?? "text"}", got HTTP ${res.status}: ${JSON.stringify(body)}`);
    failed++;
  }
}

function fd(fileName, mimeType, content /* Buffer or string */) {
  const form = new FormData();
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  const blob = new Blob([bytes], { type: mimeType });
  form.append("file", blob, fileName);
  return form;
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log("\n🧪  /api/extract-cv route tests\n");

// 1. No file at all
{
  const form = new FormData(); // no "file" field
  await post("no file", form, 400, "no file");
}

// 2. Unsupported format (.txt)
await post(
  ".txt unsupported format",
  fd("resume.txt", "text/plain", "Hello world"),
  400,
  "unsupported format"
);

// 3. Corrupted / non-PDF binary sent as application/pdf
await post(
  "corrupted PDF",
  fd("cv.pdf", "application/pdf", "%PDF-1.4 garbage that is not a real pdf"),
  422,
  "password-protected"  // fragment from the error message
);

// 4. Valid-looking DOCX extension but garbled content sent as .docx
await post(
  "corrupted DOCX",
  fd(
    "cv.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "this is definitely not a zip-based docx file"
  ),
  422,
  "corrupted"
);

// 5. File too large (>5 MB)
{
  const bigBuffer = Buffer.alloc(6 * 1024 * 1024, 65); // 6 MB of 'A'
  await post("file too large", fd("big.pdf", "application/pdf", bigBuffer), 413, "too large");
}

// 6. Real minimal .docx (PK zip magic bytes + enough padding to pass size check)
// A real docx is a ZIP. We can create a minimal valid ZIP with just the content.
// Instead we send a file that mammoth will reject gracefully (not crash).
await post(
  "fake .docx that mammoth rejects",
  fd(
    "cv.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "PK\x03\x04 this looks like a zip but it is not"
  ),
  422,
  "corrupted"
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
