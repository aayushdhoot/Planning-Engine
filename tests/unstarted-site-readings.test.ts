import { describe, expect, it } from 'vitest';
import type { BoqPackage, CalendarConfig, EngineConfig, ProjectInputs, SiteConditionNote } from '../src/domain/types';
import { buildPlan } from '../src/engine/planner';
import norms from '../src/norms/norms-v1.json';

const cfg: EngineConfig = {
  calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 } as CalendarConfig,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const t = (value: number, source = 'test') => ({ value, provenance: 'input' as const, source });
const pkg = (code: string, trade: string, amount: number): BoqPackage =>
  ({ code, name: code, clientAmount: t(amount), bcsAmount: null, trade });

const TRADES = ['civil', 'partition', 'ceiling', 'flooring', 'electrical', 'hvac', 'carpentry', 'painting'];
const packages = TRADES.map((tr, i) => pkg(`P${i}`, tr, 10_000_000));

/** Every trade reported complete by the vision reader, as both new projects were. */
const allComplete: SiteConditionNote[] = TRADES.map((trade) => ({
  trade, status: 'complete', note: 'looks finished', source: 'WhatsApp image — vision extraction',
})) as SiteConditionNote[];

const project = (start: string, siteConditions: SiteConditionNote[]): ProjectInputs =>
  ({
    id: 'p', name: 'P', client: 'C', location: 'L',
    areaSft: t(50_000), contractStart: start, contractDurationCalDays: t(90),
    contractValue: t(80_000_000), bcsValue: null, milestones: [],
    boqPackages: packages, scheduleActivities: [],
    provided: { boq: true, contract: true, layout: true, drawings: true, day0Images: true, design3d: true, salesKt: true, makeList: true, paymentTerms: true },
    ldPercentPerWeek: null, ldCapPercent: null, dlpMonths: null,
    siteConditions, materialItems: [], scopeNotes: [], designRefs: [],
  }) as ProjectInputs;

const TODAY = '2026-08-29';

describe('site photographs cannot delete work from a job that has not started', () => {
  it('keeps the whole programme when the project starts today', () => {
    const bare = buildPlan(project(TODAY, []), cfg, TODAY);
    const read = buildPlan(project(TODAY, allComplete), cfg, TODAY);
    expect(read.modules.timeline.activities.length).toBe(bare.modules.timeline.activities.length);
    expect(read.modules.manpower.peak).toBe(bare.modules.manpower.peak);
  });

  it('says out loud that it refused the readings, naming the trades', () => {
    const read = buildPlan(project(TODAY, allComplete), cfg, TODAY);
    const note = read.assumptions.map((a) => a.text).join(' ');
    expect(note).toContain('does not start until');
    expect(note).toContain('NOT been allowed to remove work');
    expect(note).toContain('civil');
  });

  it('still lets them shape a job that is genuinely under way', () => {
    const running = buildPlan(project('2026-06-01', allComplete), cfg, TODAY);
    const bare = buildPlan(project('2026-06-01', []), cfg, TODAY);
    expect(running.modules.timeline.activities.length).toBeLessThan(bare.modules.timeline.activities.length);
  });

  it('a future start is not under way either', () => {
    const future = buildPlan(project('2026-10-01', allComplete), cfg, '2026-10-01');
    const bare = buildPlan(project('2026-10-01', []), cfg, '2026-10-01');
    expect(future.modules.timeline.activities.length).toBe(bare.modules.timeline.activities.length);
  });
});
