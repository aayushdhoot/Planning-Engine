// Canonical JSON: key-sorted deterministic serialization (T1-DETERMINISM),
// schema validation (T1-SCHEMA) and traceability audit (T1-TRACE).
import type { Plan } from './planner';

/** Deterministic, key-sorted JSON serialization. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k]);
    return out;
  }
  return v;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const REQUIRED_TOP = ['audience', 'engine', 'project', 'calendar', 'buffer', 'internal', 'external', 'ieInvariant', 'modules', 'assumptions', 'confidence', 'missingInputs'] as const;
const REQUIRED_MODULES = ['timeline', 'manpower', 'resources', 'procurement', 'materials', 'design', 'todos', 'dependencies', 'raMilestones'] as const;

/** Validate a plan object against the canonical schema (SPEC §7). */
export function validatePlan(plan: Plan): ValidationResult {
  const errors: string[] = [];
  const p = plan as unknown as Record<string, unknown>;
  for (const k of REQUIRED_TOP) if (!(k in p)) errors.push(`missing top-level key: ${k}`);
  const mods = p.modules as Record<string, unknown> | undefined;
  if (mods) for (const k of REQUIRED_MODULES) if (!(k in mods)) errors.push(`missing module: ${k}`);
  const proj = p.project as Record<string, unknown> | undefined;
  if (proj) {
    for (const k of ['id', 'name', 'client', 'status']) if (!(k in proj)) errors.push(`missing project.${k}`);
    if (proj.status === 'planned') {
      // internal documents must carry the CPM baseline; client documents must NOT
      if (plan.audience === 'internal' && !p.internal) errors.push('internal plan must have internal timeline');
      if (plan.audience === 'client' && p.internal) errors.push('client plan must not expose the internal timeline');
      if (!p.external) errors.push('planned project must have external timeline');
    }
  }
  if (plan.audience !== 'internal' && plan.audience !== 'client') errors.push('audience must be internal|client');
  if (plan.audience === 'client') {
    if (plan.margin !== null) errors.push('client plan must not expose margin');
    if (plan.modules.raMilestones.some((m) => m.checkpoints.some((c) => c.responsibility || c.remarks || c.activityId)))
      errors.push('client plan must not expose internal RA checkpoint working');
    if (plan.modules.procurement.some((x) => x.vendor || x.remarks)) errors.push('client plan must not expose vendor or internal procurement remarks');
    // the site material register is an internal document; only the client's own free issue survives
    if (plan.modules.materials.rows.some((m) => m.supply !== 'client'))
      errors.push('client plan must not expose the site material register beyond client free-issue items');
    if (plan.modules.materials.rows.some((m) => m.vendor || m.poNumber || m.remarks || m.storage))
      errors.push('client plan must not expose material vendors, POs, storage or internal remarks');
    if (plan.modules.manpower.days.length) errors.push('client plan must not expose manpower loading');
    if (plan.assumptions.some((a) => a.internalOnly)) errors.push('client plan must not expose internal-only assumptions');
    if (plan.modules.timeline.activities.some((a) => a.totalFloat !== 0 || a.critical)) errors.push('client plan must not expose float / critical flags');
  }
  const eng = p.engine as Record<string, unknown> | undefined;
  if (eng) for (const k of ['name', 'version', 'normsVersion']) if (!(k in eng)) errors.push(`missing engine.${k}`);
  const conf = p.confidence as Record<string, unknown> | undefined;
  if (!conf || typeof conf.score !== 'number') errors.push('missing confidence.score');
  // An overrun is a finding, not malformed output — but it must never be silent.
  // The schema therefore requires that a breached invariant is both flagged and explained.
  if (plan.internal && plan.external && plan.external.end < plan.internal.end) {
    if (plan.ieInvariant.holds) errors.push(`I/E invariant breached (external ${plan.external.end} < internal ${plan.internal.end}) but ieInvariant.holds is true`);
    if (!plan.assumptions.some((a) => a.area === 'schedule')) errors.push('I/E invariant breached without a schedule assumption explaining it');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Traceability audit (T1-TRACE): walk the object graph; every node shaped like a
 * quantitative leaf must be a valid Traced (value + provenance + non-empty source).
 * Also asserts the plan actually contains traced values (guards against silent stripping).
 */
export function auditTrace(plan: Plan): { ok: boolean; tracedCount: number; orphans: string[] } {
  const orphans: string[] = [];
  let tracedCount = 0;
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('provenance' in o || ('value' in o && 'source' in o)) {
        tracedCount++;
        const provOk = o.provenance === 'input' || o.provenance === 'norm' || o.provenance === 'computed';
        const srcOk = typeof o.source === 'string' && o.source.length > 0;
        if (!provOk || !srcOk || !('value' in o)) orphans.push(`${path}: invalid Traced (${JSON.stringify(o).slice(0, 80)})`);
        return;
      }
      for (const [k, x] of Object.entries(o)) walk(x, `${path}.${k}`);
    }
  };
  walk(plan as unknown, '$');
  if (plan.project.status === 'planned' && tracedCount === 0) orphans.push('$: planned project contains no traced values');
  return { ok: orphans.length === 0, tracedCount, orphans };
}
