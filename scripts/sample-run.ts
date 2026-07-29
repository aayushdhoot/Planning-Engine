// Sample run: ingest all three projects, emit canonical JSON + both reports,
// and assert T1-SCHEMA / T1-TRACE / T1-IE / T1-DETERMINISM on the emitted artifacts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { auditTrace, canonicalJson, validatePlan } from '../src/engine/schema';
import { renderReport } from '../src/reports/render';
import { buildDeck } from '../src/reports/deck';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import { kohler } from '../src/data/others';
import norms from '../src/norms/norms-v1.json';

const OUT = 'sample-output';
mkdirSync(OUT, { recursive: true });

const calendar: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2026-07-28';
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

for (const p of [skf, emirates, kohler]) {
  console.log(`\n=== ${p.name} ===`);
  const internal = buildPlan(p, cfg, TODAY);
  const external = clientView(internal);

  const iJson = canonicalJson(internal);
  const eJson = canonicalJson(external);
  writeFileSync(`${OUT}/${p.id}-internal.json`, iJson);
  writeFileSync(`${OUT}/${p.id}-client.json`, eJson);
  writeFileSync(`${OUT}/${p.id}-internal-report.html`, renderReport(internal, 'internal'));
  writeFileSync(`${OUT}/${p.id}-client-report.html`, renderReport(external, 'client'));
  await buildDeck(internal, 'internal').writeFile({ fileName: `${OUT}/${p.id}-internal-deck.pptx` });
  await buildDeck(external, 'client').writeFile({ fileName: `${OUT}/${p.id}-client-deck.pptx` });

  const v = validatePlan(internal);
  check('T1-SCHEMA internal', v.ok, v.errors.join('; '));
  check('T1-SCHEMA client', validatePlan(external).ok);
  const a = auditTrace(internal);
  check('T1-TRACE', a.ok, `${a.tracedCount} traced fields; ${a.orphans.length} orphans`);
  check('T1-IE', internal.ieInvariant.holds, `ext ${internal.ieInvariant.externalEnd} ≥ int ${internal.ieInvariant.internalEnd}, buffer ${internal.ieInvariant.bufferCalendarDays}d`);
  check('T1-DETERMINISM', sha(iJson) === sha(canonicalJson(buildPlan(p, cfg, TODAY))), `sha ${sha(iJson)}`);

  // client-view leak check
  const leaks: string[] = [];
  if (p.bcsValue && eJson.includes(String(p.bcsValue.value))) leaks.push('BCS total');
  if (eJson.includes('"internalOnly": true')) leaks.push('internal-only assumption');
  if (eJson.includes('"margin"') && external.modules.cashflow.margin !== null) leaks.push('margin');
  check('Client view has no internal leakage', leaks.length === 0, leaks.join(', '));

  console.log(`  status=${internal.project.status} activities=${internal.modules.timeline.activities.length} ` +
    `critical=${internal.modules.timeline.criticalPath.length} confidence=${Math.round(internal.confidence.score * 100)}% ` +
    `internalJSON=${iJson.length}B clientJSON=${eJson.length}B (delta ${iJson.length - eJson.length}B redacted)`);
}

console.log(`\n${failures === 0 ? 'ALL SAMPLE-RUN CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
