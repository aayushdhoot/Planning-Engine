// Smoke test: run one real image through Groq's vision model and print what comes back.
// This is the first real network call the extraction layer makes — everything up to now was
// typechecked but never actually round-tripped through Groq. Run this before wiring extraction
// into the app, so a schema/auth/model problem shows up here, not buried in the UI later.
//
// Usage:
//   npx vite-node scripts/smoke-test-extraction.ts <path-to-image.jpg-or-png>
//
// Needs GROQ_API_KEY in your environment (.env, loaded automatically by vite-node/dotenv if
// you have it configured, or export it in the shell first: export GROQ_API_KEY=...).
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { extractWithVision } from '../src/services/extraction/vision-client';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx vite-node scripts/smoke-test-extraction.ts <path-to-image>');
    process.exit(1);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set. Export it or add it to your .env before running this.');
    process.exit(1);
  }

  const ext = extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : null;
  if (!mimeType) {
    console.error(`Unsupported extension "${ext}" — pass a .png, .jpg, or .jpeg file.`);
    process.exit(1);
  }

  const bytes = readFileSync(filePath);
  const imageBase64 = bytes.toString('base64');
  console.log(`Loaded ${filePath} (${(bytes.length / 1024).toFixed(0)} KB) — calling Groq (qwen/qwen3.6-27b)...`);

  const started = Date.now();
  try {
    const result = await extractWithVision(
      { fileName: filePath.split('/').pop() ?? filePath, filePath, imageBase64, mimeType },
      { apiKey },
    );
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n✅ Got a response in ${elapsed}s\n`);
    console.log(JSON.stringify(result, null, 2));

    // Quick sanity checks, not a full test suite — just enough to catch an obviously broken run.
    const problems: string[] = [];
    if (!result.kind) problems.push('kind field is missing');
    if (!Array.isArray(result.lowConfidenceNotes)) problems.push('lowConfidenceNotes is not an array');
    const totalItems =
      (result.siteConditions?.length ?? 0) +
      (result.materialItems?.length ?? 0) +
      (result.scopeNotes?.length ?? 0) +
      (result.designRefs?.length ?? 0) +
      (result.contract ? 1 : 0);
    if (totalItems === 0 && result.lowConfidenceNotes.length === 0) {
      problems.push('Nothing extracted AND no lowConfidenceNotes explaining why — the model should always say something');
    }

    if (problems.length) {
      console.log('\n⚠️  Sanity check flags (not necessarily wrong, but worth a look):');
      for (const p of problems) console.log(`  - ${p}`);
    } else {
      console.log('\n✅ Sanity checks passed — kind is set, lowConfidenceNotes is an array, and something was either extracted or explained.');
    }
  } catch (err) {
    console.error(`\n❌ Extraction failed after ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.error(err instanceof Error ? err.message : err);
    console.error('\nCommon causes: wrong/expired GROQ_API_KEY, model name changed on Groq\'s side (check console.groq.com/docs/vision), or a 429 rate limit on the free tier.');
    process.exit(1);
  }
}

main();