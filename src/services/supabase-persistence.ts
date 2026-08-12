// Shared Supabase read/write logic for a single project. This is the reusable core of what
// migrate-to-supabase.ts does per-project — refactored out so the migration script AND the new
// api/ routes call the same code path instead of two copies drifting apart.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineConfig, ProjectInputs } from '../domain/types';
import { buildPlan, type Plan } from '../engine/planner';

export interface CreateProjectResult {
  ok: boolean;
  projectId: string | null;
  failures: string[];
}

/**
 * Creates a project end-to-end: projects row, project_inputs (with the full canonical
 * ProjectInputs in inputs_json — see the migration note in the repo root for the SQL that adds
 * this column), the computed plan, and the derived milestones/todos/dependencies/materials rows
 * migrate-to-supabase.ts already populates for the three seed projects.
 */
export async function createProjectInSupabase(
  supabase: SupabaseClient,
  project: ProjectInputs,
  cfg: EngineConfig,
  today: string,
): Promise<CreateProjectResult> {
  const failures: string[] = [];

  const { data: insertedProject, error: projectError } = await supabase
    .from('projects')
    .insert([{
      name: project.name,
      client: project.client,
      location: project.location,
      area_sqft: project.areaSft?.value ?? null,
      contract_value: project.contractValue?.value ?? null,
    }])
    .select();

  if (projectError || !insertedProject) {
    failures.push(`projects insert failed: ${projectError?.message}`);
    return { ok: false, projectId: null, failures };
  }
  const projectId = insertedProject[0].id;

  const { error: inputsError } = await supabase.from('project_inputs').insert([{
    project_id: projectId,
    boq: project.boqPackages,
    contract: project.milestones,
    schedule: project.scheduleActivities,
    inputs_json: project, // canonical, complete ProjectInputs — everything else in this table is now a derived convenience column
  }]);
  if (inputsError) {
    failures.push(`project_inputs insert failed: ${inputsError.message}`);
  }

  const plan = buildPlan(project, cfg, today);
  const { error: planError } = await supabase.from('project_plan').insert([{ project_id: projectId, data: plan }]);
  if (planError) failures.push(`project_plan insert failed: ${planError.message}`);

  if (plan.external?.milestones?.length) {
    const { error: milestonesError } = await supabase.from('milestones').insert(
      plan.external.milestones.map((m) => ({
        project_id: projectId,
        name: m.description,
        date: m.date,
        amount: project.contractValue?.value != null ? (project.contractValue.value * m.percent) / 100 : null,
      })),
    );
    if (milestonesError) failures.push(`milestones insert failed: ${milestonesError.message}`);
  }

  const activities = plan.modules.timeline.activities;
  const idMap = new Map<string, string>();
  for (const act of activities) {
    const { data: inserted, error: todoError } = await supabase
      .from('todos')
      .insert([{
        project_id: projectId, description: act.name, responsibility: act.trade,
        status: act.critical ? 'critical' : 'pending', start_date: act.startDate, end_date: act.endDate,
      }])
      .select();
    if (todoError || !inserted) {
      failures.push(`todo insert failed for activity ${act.id}: ${todoError?.message}`);
      continue;
    }
    idMap.set(act.id, inserted[0].id);
  }

  const depRows: { project_id: string; predecessor_id: string; successor_id: string }[] = [];
  for (const act of activities) {
    const successorUuid = idMap.get(act.id);
    if (!successorUuid) continue;
    for (const dep of act.deps) {
      const predecessorUuid = idMap.get(dep.pred);
      if (!predecessorUuid) continue;
      depRows.push({ project_id: projectId, predecessor_id: predecessorUuid, successor_id: successorUuid });
    }
  }
  if (depRows.length) {
    const { error: depsError } = await supabase.from('dependencies').insert(depRows);
    if (depsError) failures.push(`dependencies insert failed: ${depsError.message}`);
  }

  const materialRows = plan.modules.materials.rows;
  if (materialRows.length) {
    const { error: materialsError } = await supabase.from('materials').insert(
      materialRows.map((m) => ({ project_id: projectId, name: m.item, quantity: null, unit: m.unit })),
    );
    if (materialsError) failures.push(`materials insert failed: ${materialsError.message}`);
  }

  return { ok: failures.length === 0, projectId, failures };
}

/** Loads the canonical ProjectInputs for a project — the whole point of the inputs_json column. */
export async function loadProjectInputs(supabase: SupabaseClient, projectId: string): Promise<ProjectInputs | null> {
  const { data, error } = await supabase
    .from('project_inputs')
    .select('inputs_json')
    .eq('project_id', projectId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.inputs_json) return null;
  return data.inputs_json as ProjectInputs;
}

/** Overwrites the project's stored plan — used after an approved replan. The revised plan
 * becomes the new "current view" for the project until the next full recompute from source
 * documents. Uses upsert on project_id so repeated approvals don't accumulate rows. */
export async function savePlan(supabase: SupabaseClient, projectId: string, plan: Plan): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('project_plan').upsert([{ project_id: projectId, data: plan }], { onConflict: 'project_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}