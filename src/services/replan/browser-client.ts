// Browser-side replan client. Calls YOUR OWN /api/replan/preview route (served via `vercel
// dev`) — the browser never talks to Groq directly, keeping GROQ_API_KEY server-side.
import type { EngineConfig, ProjectInputs } from '../../domain/types';
import type { ReplanPreview } from './apply';

export class ReplanClientError extends Error {}

export async function fetchReplanPreview(
  projectInputs: ProjectInputs,
  engineConfig: EngineConfig,
  today: string,
  query: string,
): Promise<ReplanPreview> {
  let res: Response;
  try {
    res = await fetch('/api/replan/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectInputs, engineConfig, today, query }),
    });
  } catch (err) {
    throw new ReplanClientError(
      `Could not reach /api/replan/preview — are you running "vercel dev" instead of "npm run dev"? (${err instanceof Error ? err.message : err})`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReplanClientError(body.error ?? res.statusText);
  }

  return (await res.json()) as ReplanPreview;
}