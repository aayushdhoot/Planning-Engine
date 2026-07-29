import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { buildDeck } from '../src/reports/deck';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/others';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2026-07-28';

/**
 * Read a deck back by actually decompressing the .pptx zip and concatenating the slide XML.
 * (Searching the raw buffer would silently pass every "does not contain" assertion, because
 * the parts are deflate-compressed.)
 */
async function deckText(pptx: ReturnType<typeof buildDeck>): Promise<{ text: string; slides: number }> {
  const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  expect(buf.subarray(0, 2).toString()).toBe('PK'); // it is a zip
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const parts = await Promise.all(names.map((n) => zip.files[n].async('string')));
  const xml = parts.join('\n');
  // strip tags so text split across runs is still matched
  return { text: xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), slides: names.length };
}

describe('PPTX decks — client and internal are different documents', () => {
  const internal = buildPlan(skf, cfg, TODAY);
  const client = clientView(internal);

  it('both decks generate as valid non-trivial files', async () => {
    const i = await deckText(buildDeck(internal, 'internal'));
    const c = await deckText(buildDeck(client, 'client'));
    expect(i.slides).toBeGreaterThan(5);
    expect(c.slides).toBeGreaterThan(2);
    expect(i.text).toContain('SKF, Pune');
    expect(c.text).toContain('SKF, Pune');
  });

  it('the internal deck is materially deeper than the client deck', async () => {
    const i = await deckText(buildDeck(internal, 'internal'));
    const c = await deckText(buildDeck(client, 'client'));
    expect(i.slides).toBeGreaterThan(c.slides * 1.5);
    expect(i.text.length).toBeGreaterThan(c.text.length * 2);
  });

  it('the client deck carries no internal cost, margin, float or buffer data', async () => {
    const { text } = await deckText(buildDeck(client, 'client'));
    const lower = text.toLowerCase();
    for (const forbidden of ['bcs', 'margin', 'float', 'buffer', 'internal only', 'not for client', 'critical path']) {
      expect({ forbidden, present: lower.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
    // the BCS total must not appear in any number format
    expect(text).not.toContain(String(skf.bcsValue!.value));
    expect(text).not.toContain(skf.bcsValue!.value.toLocaleString('en-IN'));
  });

  it('the internal deck does carry them, and is marked not for issue', async () => {
    const lower = (await deckText(buildDeck(internal, 'internal'))).text.toLowerCase();
    for (const expected of ['not for client issue', 'bcs', 'buffer', 'margin', 'critical path', 'float']) {
      expect({ expected, present: lower.includes(expected) }).toEqual({ expected, present: true });
    }
  });

  it('the client deck contains the client-facing sections', async () => {
    const { text } = await deckText(buildDeck(client, 'client'));
    expect(text).toContain('CLIENT ISSUE');
    expect(text).toContain('Payment milestones');
    expect(text).toContain('What we need from you');
    expect(text).toContain('Billing milestones');
  });

  it('pending-input projects still produce a coherent deck rather than crashing', async () => {
    const p = buildPlan(emirates, cfg, TODAY);
    const { text, slides } = await deckText(buildDeck(p, 'internal'));
    expect(slides).toBeGreaterThan(0);
    expect(text.replace(/<[^>]+>/g, '')).toContain('Pending inputs');
  });
});
