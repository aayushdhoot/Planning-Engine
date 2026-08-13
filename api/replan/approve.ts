// POST /api/replan/approve
// Body: { projectId: string, query: string }
// Re-runs the exact same query -> agent -> revised plan flow as /preview (never trusts a
// client-submitted plan blob — the server is the only thing allowed to decide what the revised
// plan actually is), then persists it to project_plan. This is the explicit, separate action
// the person takes after reviewing a preview — never automatic.
import { buildReplanPreview } from '../../src/services/replan/apply';
import { getSupabaseServerClient } from '../../src/services/supabase-server';
import { loadProjectInputs, savePlan } from '../../src/services/supabase-persistence';
import type { EngineConfig } from '../../src/domain/types';
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

  const apiKey = process.env.GROQ_QA_API_KEY;
   if (!apiKey) return new Response(JSON.stringify({ error: 'GROQ_QA_API_KEY is not set' }), { status: 500 });

  let body: { projectId?: string; query?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { projectId, query } = body;
  if (!projectId || !query) {
    return new Response(JSON.stringify({ error: 'projectId and query are both required' }), { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const projectInputs = await loadProjectInputs(supabase, projectId);
    if (!projectInputs) {
      return new Response(JSON.stringify({ error: `No project found for id ${projectId}` }), { status: 404 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const preview = await buildReplanPreview(projectInputs, DEFAULT_CFG, today, query, {
      apiKey,
      model: process.env.GROQ_REPLAN_MODEL ?? 'gemini',
    });

    if (!preview.applicable || !preview.revised) {
      return new Response(
        JSON.stringify({ error: 'Nothing to approve — the query was not applicable or needs clarification', preview }),
        { status: 409 },
      );
    }

    const saved = await savePlan(supabase, projectId, preview.revised);
    if (!saved.ok) {
      return new Response(JSON.stringify({ error: `Plan computed but failed to save: ${saved.error}` }), { status: 502 });
    }

    return new Response(
      JSON.stringify({ ok: true, projectId, changedActivities: preview.changedActivities, internalEndAfter: preview.internalEndAfter }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 502 });
  }
}