// Smoke test: run one real replan query through Groq and print what comes back, plus a full
// baseline-vs-revised diff using the real deterministic core. This is the first real network
// call the replan agent makes — everything up to now was typechecked and proven against a
// hand-built ReplanAgentResult, never a real Groq response.
//
// Usage:
//   npx vite-node scripts/smoke-test-replan.ts "flooring is delayed by 10 days"
//   npx vite-node scripts/smoke-test-replan.ts "what's the weather today"   (should say not applicable)
//   npx vite-node scripts/smoke-test-replan.ts "electrical is delayed"      (should ask for a day count)
//
// Needs GROQ_API_KEY in your environment.
import { buildReplanPreview } from '../src/services/replan/apply';
import { skf } from '../src/data/skf';
import norms from '../src/norms/norms-v1.json';

async function main() {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.error('Usage: npx vite-node scripts/smoke-test-replan.ts "<query>"');
    process.exit(1);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY is not set. Export it or add it to your .env before running this.');
    process.exit(1);
  }

  const cfg = {
    calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 },
    buffer: { internalBufferDays: 7, min: 0, max: 15 },
    normsVersion: norms.version,
  };
  const today = '2026-08-11';

  console.log(`Query: "${query}"`);
  console.log('Running against SKF, Pune (real project data) — calling Groq (openai/gpt-oss-20b)...\n');

  const started = Date.now();
  try {
    const preview = await buildReplanPreview(skf, cfg, today, query, { apiKey });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`✅ Got a response in ${elapsed}s\n`);

    console.log('applicable:', preview.applicable);
    console.log('summary:', preview.summary);
    if (preview.clarifyingQuestion) console.log('clarifyingQuestion:', preview.clarifyingQuestion);
    console.log('delays proposed by the agent:', JSON.stringify(preview.delays, null, 2));

    if (!preview.applicable) {
      console.log('\n(Not a replan request — correctly fell through without touching the plan.)');
      return;
    }
    if (!preview.delays.length) {
      console.log('\n(Agent asked for clarification instead of guessing a day count — correct behavior for an ambiguous query.)');
      return;
    }

    console.log(`\ninternal end: ${preview.internalEndBefore} -> ${preview.internalEndAfter}`);
    console.log('I/E invariant holds after:', preview.ieInvariantHoldsAfter);
    console.log(`\n${preview.changedActivities.length} activities changed:`);
    for (const c of preview.changedActivities) {
      console.log(`  ${c.name} [${c.trade}]: ${c.startBefore} -> ${c.startAfter} (+${c.deltaWorkingDays} working days)`);
    }

    // Sanity checks
    const problems: string[] = [];
    if (preview.delays.some((d) => !Number.isFinite(d.delayWorkingDays) || d.delayWorkingDays <= 0)) {
      problems.push('A proposed delay has a non-positive or non-numeric delayWorkingDays — the agent should never produce this.');
    }
    if (preview.applicable && preview.delays.length && preview.changedActivities.length === 0) {
      problems.push('Delays were proposed but nothing changed — either the match found no activities, or the delay was smaller than existing float (not necessarily wrong, but worth checking match values above).');
    }
    if (problems.length) {
      console.log('\n⚠️  Sanity check flags:');
      for (const p of problems) console.log(`  - ${p}`);
    } else {
      console.log('\n✅ Sanity checks passed.');
    }
  } catch (err) {
    console.error(`\n❌ Replan preview failed after ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.error(err instanceof Error ? err.message : err);
    console.error('\nCommon causes: wrong/expired GROQ_API_KEY, model name changed on Groq\'s side, or a 429 rate limit on the free tier.');
    process.exit(1);
  }
}

main();