// Google Drive scanning, behind a service interface.
//
// Three implementations:
//   LocalFolderDriveService — reads a folder off this machine (a Drive for Desktop mount,
//                             or a downloaded copy). No Google setup, real file bytes.
//   GoogleDriveService  — real Drive API via OAuth (needs a client ID, see README)
//   ManifestDriveService — consumes a manifest JSON produced outside the app
// The rest of the app only sees DriveService, so any of them works.

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  path: string;
  webViewLink: string | null;
}

export interface DriveScan {
  folderId: string;
  folderName: string;
  scannedAt: string;
  files: DriveFile[];
  /** folders that were seen but not descended into (permission or depth limit) */
  skipped: string[];
  /** things the user needs to know about this scan (e.g. unreadable placeholder files) */
  notes?: string[];
}

export interface DriveService {
  readonly kind: 'google' | 'manifest' | 'local';
  isConfigured(): boolean;
  scanFolder(folderIdOrUrl: string): Promise<DriveScan>;
  /** fetch the bytes of one file — only called after the user grants read permission */
  readFile(file: DriveFile): Promise<ArrayBuffer>;
}

export function folderIdFrom(input: string): string {
  const m = input.match(/\/folders\/([A-Za-z0-9_-]+)/) ?? input.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

// ------------------------------------------------------------------ Google

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/**
 * Google's raw errors are opaque ("Drive API 403: {...}"). These are the four failures
 * that actually happen during first-time setup, each with the fix attached.
 */
export function explainDriveApiError(status: number, body: string): string {
  if (status === 404)
    return 'Drive says that folder does not exist, or the signed-in Google account cannot see it. Check the link, and make sure the account you authorised with has access to the folder.';
  if (status === 403 && /accessNotConfigured|has not been used|disabled/i.test(body))
    return 'The Google Drive API is not enabled on your Cloud project. Open APIs & Services → Library → "Google Drive API" → Enable, wait a minute, then scan again.';
  if (status === 403)
    return 'Google refused the request (403). The account you authorised with most likely lacks access to this folder — open the link in a browser as that account to confirm.';
  if (status === 401)
    return 'The Drive authorisation expired. Scan again to sign in afresh.';
  return `Drive API ${status}: ${body.slice(0, 300)}`;
}

export function explainAuthError(error: string | undefined): string {
  if (!error) return 'Authorisation was cancelled.';
  if (/origin|idpiframe/i.test(error))
    return `Google rejected this app's origin. Add exactly ${typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin} to your OAuth client's "Authorised JavaScript origins", then reload. (Opening the app as a file:// page will always fail this check.)`;
  if (/access_denied/i.test(error))
    return 'Google denied access. If your OAuth consent screen is in Testing mode, add your own Google address under "Test users".';
  if (/popup/i.test(error))
    return 'The Google sign-in popup was blocked or closed. Allow popups for this page and try again.';
  return `Google authorisation failed: ${error}`;
}

interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
  callback: (r: { access_token?: string; error?: string }) => void;
}
interface GoogleGlobal {
  accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }) => TokenClient } };
}

export class GoogleDriveService implements DriveService {
  readonly kind = 'google' as const;
  private token: string | null = null;

  constructor(private readonly clientId: string) {}

  isConfigured() {
    return this.clientId.trim().length > 0;
  }

  private google(): GoogleGlobal | null {
    return (globalThis as unknown as { google?: GoogleGlobal }).google ?? null;
  }

  /** Load Google Identity Services on demand. */
  private async loadGis(): Promise<void> {
    if (this.google()) return;
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load Google Identity Services. Check your network or use the manifest fallback.'));
      document.head.appendChild(s);
    });
  }

  async authorise(): Promise<void> {
    if (this.token) return;
    if (!this.isConfigured()) throw new Error('No Google OAuth client ID configured — set one in Settings, or use the manifest fallback.');
    await this.loadGis();
    const g = this.google();
    if (!g) throw new Error('Google Identity Services unavailable.');
    this.token = await new Promise<string>((resolve, reject) => {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(explainAuthError(r.error)))),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  private async api<T>(path: string): Promise<T> {
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(explainDriveApiError(res.status, await res.text()));
    return (await res.json()) as T;
  }

  async scanFolder(folderIdOrUrl: string): Promise<DriveScan> {
    await this.authorise();
    const rootId = folderIdFrom(folderIdOrUrl);
    const meta = await this.api<{ name: string }>(`files/${rootId}?fields=name,id`);
    const files: DriveFile[] = [];
    const skipped: string[] = [];

    const walk = async (id: string, path: string, depth: number) => {
      if (depth > 4) {
        skipped.push(path);
        return;
      }
      let pageToken: string | undefined;
      do {
        const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
        const page: { files: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }[]; nextPageToken?: string } =
          await this.api(`files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`);
        for (const f of page.files) {
          if (f.mimeType === 'application/vnd.google-apps.folder') await walk(f.id, `${path}/${f.name}`, depth + 1);
          else if (f.name !== '.DS_Store')
            files.push({
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              sizeBytes: f.size ? Number(f.size) : null,
              modifiedTime: f.modifiedTime ?? null,
              path: `${path}/${f.name}`,
              webViewLink: f.webViewLink ?? null,
            });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    };

    await walk(rootId, meta.name, 0);
    return { folderId: rootId, folderName: meta.name, scannedAt: new Date().toISOString(), files, skipped };
  }

  async readFile(file: DriveFile): Promise<ArrayBuffer> {
    await this.authorise();
    const isNative = file.mimeType.startsWith('application/vnd.google-apps.');
    const url = isNative
      ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}`
      : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Could not read "${file.name}" (${res.status}).`);
    return res.arrayBuffer();
  }
}

// ------------------------------------------------------------- Local folder

/** Structural shape of a browser File — declared so this service is testable without a DOM. */
export interface PickedFile {
  name: string;
  size: number;
  lastModified: number;
  type: string;
  /** set by the browser when the input has `webkitdirectory`; the path within the picked folder */
  webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * Google Drive for Desktop mounts a Drive folder as a real directory. In "streaming" mode,
 * however, native Google Docs/Sheets/Slides are NOT downloaded — they are ~100-byte JSON
 * pointers with these extensions. Parsing one as a BOQ would silently produce nothing, so
 * they are excluded from the scan and reported instead.
 */
const GOOGLE_STUB = /\.(gdoc|gsheet|gslides|gdraw|gform|gmap|gsite|gtable|gjam|glink|gnote|gscript)$/i;
const IGNORED = /^(\.DS_Store|Thumbs\.db|desktop\.ini|Icon\r?)$/i;

const MIME_BY_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mpp: 'application/vnd.ms-project',
  dwg: 'image/vnd.dwg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

function mimeFor(f: PickedFile): string {
  if (f.type) return f.type;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Reads a project folder straight off this machine — no Google account, no API, no network.
 * Works against a Google Drive for Desktop mount (so the folder is the live Drive folder)
 * or against a plain downloaded copy. Unlike the manifest fallback, file contents are real,
 * so the BOQ is genuinely parsed.
 */
export class LocalFolderDriveService implements DriveService {
  readonly kind = 'local' as const;
  private scan: DriveScan | null = null;
  private blobs = new Map<string, PickedFile>();

  isConfigured() {
    return this.scan !== null;
  }

  /** Build a scan from the files a `<input webkitdirectory>` handed us. */
  loadFolder(picked: PickedFile[]): DriveScan {
    const stubs: string[] = [];
    const usable: PickedFile[] = [];
    for (const f of picked) {
      if (IGNORED.test(f.name) || f.name.startsWith('.')) continue;
      if (GOOGLE_STUB.test(f.name)) stubs.push(f.name);
      else usable.push(f);
    }
    if (!usable.length)
      throw new Error(
        stubs.length
          ? `Every file in that folder is a Google Drive placeholder (${stubs.length} of them), not a real document. In Drive for Desktop these only download on demand — right-click the folder → "Available offline", wait for it to sync, then pick it again. Or use File → Download from Drive in the browser.`
          : 'That folder has no readable files in it. Pick the project folder itself, not a parent.',
      );

    this.blobs.clear();
    const files: DriveFile[] = usable.map((f, i) => {
      const rel = f.webkitRelativePath || f.name;
      const id = `local-${i}`;
      this.blobs.set(id, f);
      return {
        id,
        name: f.name,
        mimeType: mimeFor(f),
        sizeBytes: f.size,
        modifiedTime: new Date(f.lastModified).toISOString(),
        path: rel,
        webViewLink: null,
      };
    });

    const first = files[0].path;
    const folderName = first.includes('/') ? first.split('/')[0] : 'Selected folder';
    const notes = stubs.length
      ? [
          `${stubs.length} file(s) are Google Drive placeholders and were skipped — they hold no content until downloaded: ${stubs.slice(0, 5).join(', ')}${stubs.length > 5 ? `, +${stubs.length - 5} more` : ''}. If your BOQ is a native Google Sheet, open it in Drive and File → Download → .xlsx first.`,
        ]
      : [];

    this.scan = {
      folderId: `local:${folderName}`,
      folderName,
      scannedAt: new Date().toISOString(),
      files,
      skipped: [],
      notes,
    };
    return this.scan;
  }

  async scanFolder(): Promise<DriveScan> {
    if (!this.scan) throw new Error('Pick a folder first.');
    return this.scan;
  }

  async readFile(file: DriveFile): Promise<ArrayBuffer> {
    const f = this.blobs.get(file.id);
    if (!f) throw new Error(`"${file.name}" is no longer available — pick the folder again.`);
    return f.arrayBuffer();
  }
}

// ---------------------------------------------------------------- Manifest

/**
 * Fallback for when OAuth is not set up: a manifest JSON listing the folder contents
 * (produced by whoever has Drive access) is imported, and files are supplied by hand.
 */
export class ManifestDriveService implements DriveService {
  readonly kind = 'manifest' as const;
  private scan: DriveScan | null = null;
  private blobs = new Map<string, ArrayBuffer>();

  isConfigured() {
    return this.scan !== null;
  }

  loadManifest(text: string): DriveScan {
    const raw = JSON.parse(text) as Partial<DriveScan>;
    if (!Array.isArray(raw.files)) throw new Error('Not a Drive manifest — expected a "files" array.');
    this.scan = {
      folderId: raw.folderId ?? 'manifest',
      folderName: raw.folderName ?? 'Imported manifest',
      scannedAt: raw.scannedAt ?? new Date().toISOString(),
      files: raw.files as DriveFile[],
      skipped: raw.skipped ?? [],
    };
    return this.scan;
  }

  attach(fileId: string, data: ArrayBuffer) {
    this.blobs.set(fileId, data);
  }

  async scanFolder(): Promise<DriveScan> {
    if (!this.scan) throw new Error('Import a Drive manifest first.');
    return this.scan;
  }

  async readFile(file: DriveFile): Promise<ArrayBuffer> {
    const b = this.blobs.get(file.id);
    if (!b) throw new Error(`"${file.name}" is listed in the manifest but its contents were not supplied. Upload it alongside the manifest.`);
    return b;
  }
}
