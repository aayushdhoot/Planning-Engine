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
import { DriveCoverage } from '../src/ui/DriveCoverage';
import App from '../src/App';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import { pendingKohler } from '../src/data/others';
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

  it('offers link scanning as the primary path, with no credential demanded up front', () => {
    const html = renderToString(<Intake clientId="" existingIds={[]} onCreate={() => {}} />);
    expect(html).toContain('Link a Google Drive folder');
    expect(html).toContain('Scan Drive folder');
    // the headline promise: a link-shared folder needs nothing from Google
    expect(html).toContain('needs no Google account, no OAuth client ID and');
    // OAuth is demoted to a collapsed fallback for private folders, not a precondition
    expect(html).toContain('Private folders');
    expect(html).toContain('not configured');
  });

  it('still spells out the one-time OAuth setup for private folders', () => {
    const html = renderToString(<Intake clientId="" existingIds={[]} onCreate={() => {}} />);
    expect(html).toContain('Google Drive API');
    expect(html).toContain('Authorised JavaScript origins');
    expect(html).toContain('drive.readonly');
  });

  it('with a client ID configured, says private folders are covered too', () => {
    const html = renderToString(<Intake clientId="123.apps.googleusercontent.com" existingIds={[]} onCreate={() => {}} />);
    expect(html).toContain('OAuth client ID configured');
    expect(html).toContain('(configured)');
  });

  it('the Drive coverage screen shows what was read and, crucially, what was not', () => {
    const file = (name: string, path: string) => ({ id: name, name, mimeType: '', sizeBytes: 2048, modifiedTime: null, path, webViewLink: null });
    const scan = {
      folderId: 'x',
      folderName: 'KOHLER OS',
      scannedAt: '2026-07-29T10:00:00.000Z',
      skipped: [],
      files: [
        file('KOHLER_PUNE_FS_26TH JUNE_V5.xlsx', 'KOHLER OS/Contract & scope/BOQ & Project Plan/KOHLER_PUNE_FS_26TH JUNE_V5.xlsx'),
        file('Signed agreement.pdf', 'KOHLER OS/Contract & scope/Contract/Signed agreement.pdf'),
      ],
    };
    const html = renderToString(
      <DriveCoverage
        scan={scan}
        states={{ 'Signed agreement.pdf': { state: 'logged', detail: 'Opened (2 KB).' } }}
        busy={null}
        onRead={() => {}}
        onPrepareByHand={() => {}}
        onDrop={() => {}}
        onUndrop={() => {}}
        onRescan={null}
        onContinue={() => {}}
        onBack={() => {}}
      />,
    );
    expect(html).toContain('What is in Drive');
    expect(html).toContain('Readable but never read');
    // the contract is present but yielded nothing — it must never read as READ
    expect(html).toContain('EVIDENCE ONLY');
    expect(html).toContain('Prepare by hand');
    expect(html).toContain('Drop reading');
    // a document that yielded nothing must still be re-readable — that is the whole point of
    // the control, and it used to be disabled for anything without a structural extractor
    expect(html).toContain('Re-read');
    expect(html).not.toContain('disabled=""');
  });

  it('a pending-input project renders its blocking banner rather than a broken page', () => {
    const plan = buildPlan(pendingKohler, cfg, TODAY);
    expect(plan.project.status).toBe('pending_inputs');
    expect(renderToString(<Gantt plan={plan} />)).toBe('');
  });

  it('Emirates renders with its real data', () => {
    const plan = buildPlan(emirates, cfg, TODAY);
    expect(plan.modules.timeline.activities.length).toBeGreaterThan(200);
    expect(renderToString(<Gantt plan={plan} />)).toContain('<svg');
  });
});
