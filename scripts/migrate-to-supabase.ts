import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import { kohler } from '../src/data/kohler';
import { buildPlan } from '../src/engine/planner';
import type { ProjectInputs, EngineConfig } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY — check your .env file.');
  process.exit(1);
}
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const cfg: EngineConfig = {
  calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 },
  buffer: {
    internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays,
    min: norms.bufferPolicy.min,
    max: norms.bufferPolicy.max,
  },
  normsVersion: norms.version,
};
const TODAY = new Date().toISOString().slice(0, 10);

// Collects every failure across every project/table so nothing gets silently swallowed.
const failures: string[] = [];

async function migrateProject(project: ProjectInputs): Promise<boolean> {
  let ok = true;

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
    failures.push(`[${project.name}] projects insert failed: ${projectError?.message}`);
    return false; // nothing else can proceed without a project_id
  }
  const projectId = insertedProject[0].id;

  const { error: inputsError } = await supabase.from('project_inputs').insert([{
    project_id: projectId,
    boq: project.boqPackages,
    contract: project.milestones,
    schedule: project.scheduleActivities,
  }]);
  if (inputsError) {
    failures.push(`[${project.name}] project_inputs insert failed: ${inputsError.message}`);
    ok = false;
  }

  const plan = buildPlan(project, cfg, TODAY);
  const { error: planError } = await supabase.from('project_plan').insert([{ project_id: projectId, data: plan }]);
  if (planError) {
    failures.push(`[${project.name}] project_plan insert failed: ${planError.message}`);
    ok = false;
  }

  // --- milestones ---
  if (plan.external?.milestones?.length) {
    const { error: milestonesError } = await supabase.from('milestones').insert(
      plan.external.milestones.map(m => ({
        project_id: projectId,
        name: m.description,
        date: m.date,
        amount: project.contractValue?.value != null ? (project.contractValue.value * m.percent) / 100 : null,
      }))
    );
    if (milestonesError) {
      failures.push(`[${project.name}] milestones insert failed: ${milestonesError.message}`);
      ok = false;
    }
  }

  // --- todos, from the real scheduled activities ---
  const activities = plan.modules.timeline.activities;
  const idMap = new Map<string, string>(); // original activity id -> new todo UUID

  for (const act of activities) {
    const { data: inserted, error: todoError } = await supabase
      .from('todos')
      .insert([{
        project_id: projectId,
        description: act.name,
        responsibility: act.trade,
        status: act.critical ? 'critical' : 'pending',
        start_date: act.startDate,
        end_date: act.endDate,
      }])
      .select();
    if (todoError || !inserted) {
      failures.push(`[${project.name}] todo insert failed for activity ${act.id}: ${todoError?.message}`);
      ok = false;
      continue;
    }
    idMap.set(act.id, inserted[0].id);
  }

  // --- dependencies, resolved against the id map built above ---
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
    if (depsError) {
      failures.push(`[${project.name}] dependencies insert failed: ${depsError.message}`);
      ok = false;
    }
  }

  // --- materials ---
  const materialRows = plan.modules.materials.rows;
  if (materialRows.length) {
    const { error: materialsError } = await supabase.from('materials').insert(
      materialRows.map(m => ({
        project_id: projectId,
        name: m.item,
        quantity: null,
        unit: m.unit,
      }))
    );
    if (materialsError) {
      failures.push(`[${project.name}] materials insert failed: ${materialsError.message}`);
      ok = false;
    }
  }

  console.log(`${ok ? '✅' : '⚠️ '} ${project.name} (id: ${projectId})${ok ? '' : ' — completed with errors, see summary'}`);
  return ok;
}

async function migrateData() {
  const projects: { data: ProjectInputs; label: string }[] = [
    { data: skf, label: 'SKF' },
    { data: emirates, label: 'Emirates' },
    { data: kohler, label: 'Kohler' },
  ];

  const results = await Promise.all(projects.map(p => migrateProject(p.data)));
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} projects migrated without errors.`);

  console.log('\n--- Migration summary ---');
  if (failures.length === 0) {
    console.log('All projects and related tables migrated successfully.');
  } else {
    console.log(`${failures.length} error(s) occurred:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exitCode = 1; // makes failure visible in CI / terminal exit code too
  }
}

migrateData();