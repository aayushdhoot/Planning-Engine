// POST /api/replan/preview
// Body: { projectInputs: ProjectInputs, engineConfig: EngineConfig, today: string, query: string }
// Stateless by design — matches src/services/replan/browser-client.ts, which already holds the
// active project's ProjectInputs/EngineConfig in the React app's memory and posts them directly.
// No Supabase round-trip needed for a live editing session; Supabase persistence (api/projects/
// create.ts, api/replan/approve.ts) is a separate, optional durability layer, not a prerequisite.
import { buildReplanPreview } from '../../src/services/replan/apply';
import type { EngineConfig, ProjectInputs } from '../../src/domain/types';
import type { ExternalDelay } from '../../src/engine/planner';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }), { status: 500 });
// ...

  let body: { projectInputs?: ProjectInputs; engineConfig?: EngineConfig; today?: string; query?: string; appliedDelays?: ExternalDelay[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { projectInputs, engineConfig, today, query, appliedDelays } = body;
  if (!projectInputs || !engineConfig || !today || !query) {
    return new Response(
      JSON.stringify({ error: 'projectInputs, engineConfig, today, and query are all required' }),
      { status: 400 },
    );
  }

  try {
    const preview = await buildReplanPreview(
      projectInputs, engineConfig, today, query,
      { apiKey, model: process.env.GEMINI_REPLAN_MODEL ?? 'gemini-2.0-flash' },
      Array.isArray(appliedDelays) ? appliedDelays : [],
    );
    return new Response(JSON.stringify(preview), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 502 });
  }
}