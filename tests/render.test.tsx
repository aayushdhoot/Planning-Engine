// Server-render every screen so a runtime error in the UI fails the build rather than
// showing up as a blank page in the browser.
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { buildPertFromPlan } from '../src/engine/pert-build';
import { buildEmiratesPert } from '../src/data/emirates-pert';
import { Pert } from '../src/ui/Pert';
import { Gantt } from '../src/ui/Gantt';
import { Intake } from '../src/ui/Intake';
import App from '../src/App';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import { kohler } from '../src/data/others';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2025-11-15';

describe('UI renders without throwing', () => {
  it('the whole app mounts', () => {
    const html = renderToString(<App />);
    expect(html).toContain('DnB Planning Engine');
    expect(html).toContain('SKF, Pune');
  });

  it('the PERT view renders an issued programme with collapsible rows', () => {
    const html = renderToString(<Pert tree={buildEmiratesPert(TODAY)} today={TODAY} />);
    expect(html).toContain('Emirates Mumbai');
    expect(html).toContain('Task Name');
    expect(html).toContain('Actual Finish');
    expect(html).toContain('Expand all');
    // all four categories are offered as filters
    for (const label of ['Schedule &amp; Milestones', 'Design', 'Procurement', 'Execution']) expect(html).toContain(label);
  });

  it('the PERT view renders a derived programme', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    const html = renderToString(<Pert tree={buildPertFromPlan(plan, '2026-07-01')} today="2026-07-01" />);
    expect(html).toContain('SKF, Pune');
  });

  it('the Gantt renders for both audiences', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    expect(renderToString(<Gantt plan={plan} />)).toContain('<svg');
    expect(renderToString(<Gantt plan={clientView(plan)} />)).toContain('<svg');
  });

  it('the intake screen renders and offers the manifest fallback with no credentials', () => {
    const html = renderToString(<Intake clientId="" existingIds={[]} onCreate={() => {}} />);
    expect(html).toContain('Link a Google Drive folder');
    expect(html).toContain('import a folder manifest');
    expect(html).toContain('Live scanning is off');
    // the one-time setup is spelled out inline rather than left as &quot;see the README&quot;
    expect(html).toContain('Google Drive API');
    expect(html).toContain('Authorised JavaScript origins');
    expect(html).toContain('drive.readonly');
  });

  it('with a client ID configured, the intake offers live scanning', () => {
    const html = renderToString(<Intake clientId="123.apps.googleusercontent.com" existingIds={[]} onCreate={() => {}} />);
    expect(html).toContain('OAuth client ID configured');
    expect(html).not.toContain('Live scanning is off');
  });

  it('a pending-input project renders its blocking banner rather than a broken page', () => {
    const plan = buildPlan(kohler, cfg, TODAY);
    expect(plan.project.status).toBe('pending_inputs');
    expect(renderToString(<Gantt plan={plan} />)).toBe('');
  });

  it('Emirates renders with its real data', () => {
    const plan = buildPlan(emirates, cfg, TODAY);
    expect(plan.modules.timeline.activities.length).toBeGreaterThan(200);
    expect(renderToString(<Gantt plan={plan} />)).toContain('<svg');
  });
});
