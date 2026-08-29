import { describe, expect, it } from 'vitest';
import { parseMilestones } from '../src/engine/intake';

describe('parseMilestones — the typed billing schedule reaches the plan', () => {
  it('reads the format the prefill itself writes, so a confirmed prefill round-trips', () => {
    const { milestones } = parseMilestones(
      'RA1: 20% at day 0 (on mobilisation); RA2: 30% at day 30 (civil complete); RA3: 50% at day 90 (handover)',
      90,
    );
    expect(milestones).toHaveLength(3);
    expect(milestones.map((m) => m.code)).toEqual(['RA1', 'RA2', 'RA3']);
    expect(milestones.map((m) => m.percent)).toEqual([20, 30, 50]);
    expect(milestones.map((m) => m.dayOffset)).toEqual([0, 30, 90]);
    expect(milestones[0].description).toBe('on mobilisation');
  });

  it('reads how a person actually writes them — no codes, no day numbers', () => {
    const { milestones } = parseMilestones('20% advance\n30% on flooring\n50% on handover', 100);
    expect(milestones.map((m) => m.code)).toEqual(['RA1', 'RA2', 'RA3']);
    expect(milestones.map((m) => m.percent)).toEqual([20, 30, 50]);
    // placed at cumulative share of the window: 20%, 50%, 100% of 100 days
    expect(milestones.map((m) => m.dayOffset)).toEqual([20, 50, 100]);
  });

  it('says so when it placed a date itself, rather than printing it as agreed', () => {
    const { milestones } = parseMilestones('50% on handover', 60);
    expect(milestones[0].description).toContain('date not stated');
    expect(milestones[0].description).toContain('60-day contract');
  });

  it('does not split a description that merely contains a comma', () => {
    const { milestones } = parseMilestones('30% on completion of civil works, including screed', 90);
    expect(milestones).toHaveLength(1);
    expect(milestones[0].description).toMatch(/^on completion of civil works, including screed\b/);
  });

  it('splits on commas when that is the only separator between several milestones', () => {
    const { milestones } = parseMilestones('RA1 40% on mobilisation, RA2 60% on handover', 90);
    expect(milestones.map((m) => m.percent)).toEqual([40, 60]);
  });

  it('ignores a line with no percentage rather than inventing a milestone from it', () => {
    const { milestones } = parseMilestones('Payment within 30 days of invoice\n100% on handover', 90);
    expect(milestones).toHaveLength(1);
    expect(milestones[0].percent).toBe(100);
  });

  it('flags a schedule that does not add up to 100%', () => {
    const { notes } = parseMilestones('20% advance; 30% on flooring', 90);
    expect(notes.join(' ')).toContain('50%');
  });

  it('an answer with no percentages at all produces nothing, and says why', () => {
    const { milestones, notes } = parseMilestones('to be agreed with the client', 90);
    expect(milestones).toEqual([]);
    expect(notes.join(' ')).toContain('no percentages');
  });

  it('an empty answer is silent — the question simply was not answered', () => {
    expect(parseMilestones('', 90)).toEqual({ milestones: [], notes: [] });
  });
});
