// POST /api/projects/create
// Body: { projectInputs: ProjectInputs, engineConfig?: EngineConfig }
// Creates the project in Supabase (projects, project_inputs w/ inputs_json, project_plan, and
// the derived milestones/todos/dependencies/materials rows), same code path
// migrate-to-supabase.ts uses for the three seed projects.
import { getSupabaseServerClient } from '../../src/services/supabase-server';
import { createProjectInSupabase } from '../../src/services/supabase-persistence';
import type { EngineConfig, ProjectInputs } from '../../src/domain/types';
import norms from '../../src/norms/norms-v1.json';

export const config = { runtime: 'edge' };

const DEFAULT_CFG: EngineConfig = {
  calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 },
  buffer: {
    internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays,
    min: norms.bufferPolicy.min,
    max: norms.bufferPolicy.max,
  },
  normsVersion: norms.version,
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let body: { projectInputs?: ProjectInputs; engineConfig?: EngineConfig };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.projectInputs) {
    return new Response(JSON.stringify({ error: 'projectInputs is required' }), { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const today = new Date().toISOString().slice(0, 10);
    const result = await createProjectInSupabase(supabase, body.projectInputs, body.engineConfig ?? DEFAULT_CFG, today);

    if (!result.projectId) {
      return new Response(JSON.stringify({ error: 'Project creation failed', failures: result.failures }), { status: 502 });
    }
    // Partial failures (e.g. one derived table insert failed) still return the projectId —
    // the project exists and is usable, so the caller should see the id plus what went wrong,
    // not a hard failure that would leave the person unable to proceed at all.
    return new Response(
      JSON.stringify({ projectId: result.projectId, ok: result.ok, failures: result.failures }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}