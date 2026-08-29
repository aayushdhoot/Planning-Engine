// The server-side Drive download (api/drive/download.ts).
//
// This exists because two BOQ documents in a folder of 178 reported "Could not read: Failed to
// fetch" — a bare browser TypeError with no status and no reason, which told nobody anything.
// Both of the states behind it are things Drive tells you in HTML rather than in a status code,
// so they are what these tests pin: the large-file confirmation form, and a refusal page.
import { describe, expect, it } from 'vitest';
import { confirmRequestFrom, looksLikeHtml, refusalReasonFrom } from '../api/drive/download';
import { isSpaShell } from '../src/services/drive';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

// Drive's virus-scan interstitial, in the shape it serves today: the confirmation is a real
// form, and the `uuid` is minted per request. Appending "&confirm=t" by hand — which is what
// every stale snippet on the internet still says to do — comes back as this same page forever.
const INTERSTITIAL = `<!DOCTYPE html><html><head><title>Google Drive - Virus scan warning</title></head><body>
<form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
<input type="hidden" name="id" value="1AbCdEfGhIjK">
<input type="hidden" name="export" value="download">
<input type="hidden" name="confirm" value="t">
<input type="hidden" name="uuid" value="9f0c1d2e-3a4b-5c6d-7e8f-90a1b2c3d4e5">
</form>
<p>Final BOQ - 30 Dec 2025_8.75Cr.pdf (142M) is too large for Google to scan for viruses.</p>
</body></html>`;

describe('looksLikeHtml', () => {
  it('tells a web page apart from file bytes', () => {
    expect(looksLikeHtml(bytes(INTERSTITIAL))).toBe(true);
    expect(looksLikeHtml(bytes('<html><body>hi</body></html>'))).toBe(true);
    expect(looksLikeHtml(bytes('%PDF-1.7\n%âãÏÓ'))).toBe(false);
    expect(looksLikeHtml(bytes('PK'))).toBe(false); // xlsx
  });
});

describe('confirmRequestFrom — the large-file confirmation', () => {
  it('reads the form Drive actually serves, uuid and all', () => {
    const req = confirmRequestFrom(INTERSTITIAL);
    expect(req).not.toBeNull();
    expect(req!.url).toBe('https://drive.usercontent.google.com/download');
    expect(req!.params).toMatchObject({
      id: '1AbCdEfGhIjK',
      export: 'download',
      confirm: 't',
      uuid: '9f0c1d2e-3a4b-5c6d-7e8f-90a1b2c3d4e5',
    });
  });

  it('handles the attribute order reversed and the entity-escaped action', () => {
    const html = '<form action="https://drive.usercontent.google.com/download?x=1&amp;y=2"><input value="abc" name="id"><input value="t" name="confirm"></form>';
    const req = confirmRequestFrom(html)!;
    expect(req.url).toBe('https://drive.usercontent.google.com/download?x=1&y=2');
    expect(req.params).toMatchObject({ id: 'abc', confirm: 't' });
  });

  it('returns null for a page that is not that form, so a refusal is never retried as one', () => {
    expect(confirmRequestFrom('<html><body>Request access</body></html>')).toBeNull();
    expect(confirmRequestFrom('<form id="search"><input name="q" value=""></form>')).toBeNull();
  });
});

describe('refusalReasonFrom — saying what Drive actually refused', () => {
  it('names the quota refusal, which clears on its own', () => {
    const why = refusalReasonFrom("<html>Sorry, you can't view or download this file at this time.</html>");
    expect(why).toMatch(/rate-limiting/i);
  });

  it('names a folder shared by link that holds a file which is not', () => {
    expect(refusalReasonFrom('<html>You need permission. Request access</html>')).toMatch(/not actually shared/i);
  });

  it('says nothing rather than guessing at an unfamiliar page', () => {
    expect(refusalReasonFrom('<html>something else entirely</html>')).toBeNull();
  });
});

describe('isSpaShell — "no route is serving this", not "the file is broken"', () => {
  it('recognises the dev server answering an unknown path with the app itself', () => {
    expect(isSpaShell(bytes('<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>'))).toBe(true);
  });

  it('does not mistake real file bytes for it', () => {
    expect(isSpaShell(bytes('%PDF-1.7'))).toBe(false);
    expect(isSpaShell(bytes(INTERSTITIAL))).toBe(false);
  });
});
