// Orchestrates one replan query: baseline plan -> agent parses query -> revised plan -> diff.
// This module never writes anywhere — it's a pure function of (ProjectInputs, cfg, today,
// query) to a preview. Persisting an approved replan is the caller's job (the API route or
// whatever the UI wires up next), matching the approve-before-save flow agreed earlier.
import type { EngineConfig, ProjectInputs } from '../../domain/types';
import { buildPlan, type ExternalDelay, type Plan } from '../../engine/planner';
import { parseReplanQuery, type ReplanAgentConfig } from './groq-agent';
import type { ProposedDelay } from './types';

export interface ActivityDateChange {
  id: string;
  name: string;
  trade: string;
  startBefore: string;
  startAfter: string;
  deltaWorkingDays: number;
}

export interface ReplanPreview {
  applicable: boolean;
  summary: string;
  clarifyingQuestion?: string;
  delays: ProposedDelay[];
  /** resolved per-activity floors, ready to pass straight into buildPlan()'s externalDelays —
   * exposed so the caller (e.g. the browser UI) can apply an approved replan without
   * recomputing the match/resolve step itself and risking drift from what was actually previewed */
  resolvedDelays: ExternalDelay[];
  baseline: Plan;
  revised: Plan | null;
  /** every activity whose start date actually moved — the thing a person needs to see before
   * approving, not the full before/after plan JSON */
  changedActivities: ActivityDateChange[];
  internalEndBefore: string | null;
  internalEndAfter: string | null;
  ieInvariantHoldsAfter: boolean | null;
}

/**
 * Turns the agent's relative delays ("flooring, +15 working days") into absolute per-activity
 * floors against the BASELINE schedule — "15 days later than it would otherwise start", not "no
 * earlier than absolute working day 15". Matching (substring on name, exact on trade) happens
 * here, against the baseline's already-computed activities, where the natural start date is
 * actually known; planner.ts only ever sees the resolved absolute floor.
 */
function resolveDelays(proposed: ProposedDelay[], baseline: Plan): ExternalDelay[] {
  const resolved: ExternalDelay[] = [];
  for (const d of proposed) {
    if (!d.match || typeof d.delayWorkingDays !== 'number' || !Number.isFinite(d.delayWorkingDays)) continue;
    const matches = baseline.modules.timeline.activities.filter(
      (a) => a.name.toLowerCase().includes(d.match.toLowerCase()) || a.trade.toLowerCase() === d.match.toLowerCase(),
    );
    for (const a of matches) {
      resolved.push({ activityId: a.id, minStartWorkingDay: a.es + d.delayWorkingDays, reason: d.reason });
    }
  }
  return resolved;
}

export async function buildReplanPreview(
  p: ProjectInputs,
  cfg: EngineConfig,
  today: string,
  query: string,
  agentCfg: ReplanAgentConfig,
): Promise<ReplanPreview> {
  const baseline = buildPlan(p, cfg, today);

  const activityContext = baseline.modules.timeline.activities.map((a) => ({ name: a.name, trade: a.trade, startDate: a.startDate }));
  const agentResult = await parseReplanQuery(query, activityContext, agentCfg);

  if (!agentResult.applicable || !agentResult.delays.length) {
    return {
      applicable: agentResult.applicable,
      summary: agentResult.summary,
      clarifyingQuestion: agentResult.clarifyingQuestion,
      delays: [],
      resolvedDelays: [],
      baseline,
      revised: null,
      changedActivities: [],
      internalEndBefore: baseline.internal?.end ?? null,
      internalEndAfter: null,
      ieInvariantHoldsAfter: null,
    };
  }

  const resolvedDelays = resolveDelays(agentResult.delays, baseline);
  const revised = buildPlan(p, cfg, today, resolvedDelays);

  const beforeById = new Map(baseline.modules.timeline.activities.map((a) => [a.id, a]));
  const changedActivities: ActivityDateChange[] = [];
  for (const after of revised.modules.timeline.activities) {
    const before = beforeById.get(after.id);
    if (!before || before.startDate === after.startDate) continue;
    changedActivities.push({
      id: after.id, name: after.name, trade: after.trade,
      startBefore: before.startDate, startAfter: after.startDate,
      deltaWorkingDays: after.es - before.es,
    });
  }

  return {
    applicable: true,
    summary: agentResult.summary,
    delays: agentResult.delays,
    resolvedDelays,
    baseline,
    revised,
    changedActivities,
    internalEndBefore: baseline.internal?.end ?? null,
    internalEndAfter: revised.internal?.end ?? null,
    ieInvariantHoldsAfter: revised.ieInvariant.holds,
  };
}