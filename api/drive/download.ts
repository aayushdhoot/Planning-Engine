// GET /api/drive/download?id=<fileId>[&name=<fileName>]
//
// Downloads one link-shared Drive file SERVER-SIDE and hands the bytes back on this app's own
// origin. It exists because the browser cannot do this itself, and the two ways it failed are
// both invisible from the browser's side of the wire:
//
//   1. `drive.google.com/uc?export=download` answers 303 to drive.usercontent.google.com — a
//      different host, with no CORS headers. Any hop that leaks that redirect to the browser
//      rather than following it server-side surfaces as a bare `TypeError: Failed to fetch`:
//      no status, no body, nothing to tell the user. That is the exact message the two BOQ
//      documents in the Keppel (Pune) folder came back with.
//   2. Above roughly 100 MB, and for every native Google Sheet/Doc/Slide, Drive answers that
//      second host with an HTML confirmation page instead of file bytes. The confirmation is a
//      real form carrying a `confirm` token and a per-request `uuid`; submitting it returns the
//      file. A priced BOQ — a workbook, or a long PDF — is precisely the kind of document in a
//      project folder big enough to land here, which is why 96 site photographs read fine and
//      the two documents that actually feed the plan did not.
//
// So: follow every redirect here, submit the confirmation form here, fall back to the native
// Google export endpoints here, and report a real reason when none of that works.
export const config = { runtime: 'edge' };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const UC = 'https://drive.google.com/uc';
const USERCONTENT = 'https://drive.usercontent.google.com/download';
const DOCS = 'https://docs.google.com';

export function looksLikeHtml(bytes: ArrayBuffer): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 400)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<meta');
}

/**
 * Pull the confirmation form out of Drive's virus-scan interstitial.
 *
 * Parsed, not guessed: the old trick of appending `&confirm=t` stopped working once Drive began
 * minting a per-request `uuid`, and a request missing it comes back as the same interstitial
 * forever. Returns null when the page is not that form — an access refusal, say, which must not
 * be retried as though it were.
 */
export function confirmRequestFrom(html: string): { url: string; params: Record<string, string> } | null {
  const form =
    html.match(/<form[^>]*\bid="download-form"[^>]*>[\s\S]*?<\/form>/i) ??
    html.match(/<form[^>]*action="[^"]*usercontent[^"]*"[^>]*>[\s\S]*?<\/form>/i);
  if (!form) return null;

  const action = form[0].match(/action="([^"]+)"/i);
  const url = (action ? action[1] : USERCONTENT).replace(/&amp;/g, '&');

  const params: Record<string, string> = {};
  for (const [, name, value] of form[0].matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi))
    params[name] = value.replace(/&amp;/g, '&');
  // Some variants order the two attributes the other way round.
  for (const [, value, name] of form[0].matchAll(/<input[^>]*value="([^"]*)"[^>]*name="([^"]+)"/gi))
    params[name] ??= value.replace(/&amp;/g, '&');

  return Object.keys(params).length ? { url, params } : null;
}

/** The plain-English reason Drive gave, when it served a page rather than a file. */
export function refusalReasonFrom(html: string): string | null {
  if (/you can.t view or download this file at this time|too many people have (viewed|downloaded)/i.test(html))
    return 'Drive is rate-limiting this file ("too many people have viewed or downloaded it recently"). That clears on its own — try again in a few minutes.';
  if (/request access|need permission|accounts\.google\.com\/(signin|ServiceLogin)/i.test(html))
    return 'Drive asked for a sign-in, so this file is not actually shared with "Anyone with the link" even though the folder is.';
  if (/not found|no longer exists|has been moved to the trash/i.test(html))
    return 'Drive says this file no longer exists.';
  return null;
}

/**
 * Every request here is bounded. A folder scan reads its documents one after another, so a
 * single request left hanging on Drive stalls the rest of the folder behind it — the failure
 * mode this whole route exists to end. The download itself gets a generous ceiling because a
 * priced BOQ is genuinely large; the export probes get a short one because they are guesses.
 */
const DOWNLOAD_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 20_000;

function get(url: string, timeoutMs = DOWNLOAD_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
}

export interface DriveDownload {
  bytes: ArrayBuffer;
  contentType: string;
  /** which of the routes below actually produced the bytes — surfaced as a response header so a
   * puzzling read can be diagnosed without re-running the whole scan */
  via: string;
}

/** Native Google formats hold no stored bytes at all — they exist only through an export. */
async function exportNative(id: string): Promise<DriveDownload | null> {
  const attempts = [
    { url: `${DOCS}/spreadsheets/d/${encodeURIComponent(id)}/export?format=xlsx`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', via: 'google-sheet-export-xlsx' },
    { url: `${DOCS}/document/d/${encodeURIComponent(id)}/export?format=pdf`, contentType: 'application/pdf', via: 'google-doc-export-pdf' },
    { url: `${DOCS}/presentation/d/${encodeURIComponent(id)}/export/pdf`, contentType: 'application/pdf', via: 'google-slides-export-pdf' },
  ];
  for (const a of attempts) {
    const res = await get(a.url, PROBE_TIMEOUT_MS).catch(() => null);
    if (!res?.ok) continue;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || looksLikeHtml(bytes)) continue;
    return { bytes, contentType: a.contentType, via: a.via };
  }
  return null;
}

/** The whole download, kept a plain function so the route and a test can both drive it. */
export async function downloadDriveFile(id: string): Promise<DriveDownload> {
  const first = await get(`${UC}?export=download&id=${encodeURIComponent(id)}`);
  if (!first.ok) {
    const native = await exportNative(id);
    if (native) return native;
    throw new Error(`Drive answered ${first.status} for this file.`);
  }

  const bytes = await first.arrayBuffer();
  const contentType = first.headers.get('content-type') ?? 'application/octet-stream';

  if (bytes.byteLength && !looksLikeHtml(bytes)) return { bytes, contentType, via: 'uc-download' };

  if (looksLikeHtml(bytes)) {
    const html = new TextDecoder().decode(bytes);

    const confirm = confirmRequestFrom(html);
    if (confirm) {
      const res = await get(`${confirm.url}?${new URLSearchParams({ ...confirm.params, id }).toString()}`);
      const confirmed = await res.arrayBuffer();
      if (res.ok && confirmed.byteLength && !looksLikeHtml(confirmed))
        return { bytes: confirmed, contentType: res.headers.get('content-type') ?? 'application/octet-stream', via: 'uc-download-confirmed' };
      if (confirmed.byteLength && looksLikeHtml(confirmed)) {
        const why = refusalReasonFrom(new TextDecoder().decode(confirmed));
        if (why) throw new Error(why);
      }
    }

    // No confirmation form: either a native Google file (nothing to download) or a refusal page.
    // Try the export endpoints before reporting the refusal — a BOQ kept as a Google Sheet is
    // the ordinary case in a project folder, not an edge case.
    const native = await exportNative(id);
    if (native) return native;

    throw new Error(
      refusalReasonFrom(html) ??
        'Drive served a web page instead of this file, and it is not a native Google Sheet/Doc/Slide either. Open it in Drive and check it is shared with "Anyone with the link".',
    );
  }

  const native = await exportNative(id);
  if (native) return native;
  throw new Error('Drive returned an empty response for this file.');
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const name = url.searchParams.get('name') ?? 'file';
  if (!id)
    return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const { bytes, contentType, via } = await downloadDriveFile(id);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${name.replace(/"/g, '')}"`,
        'X-Drive-Read-Via': via,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `Could not download "${name}" from Drive — ${message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
