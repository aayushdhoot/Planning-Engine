// The local-folder path is what makes a new project possible without any Google setup,
// so it carries the same weight as the Drive API path and is tested the same way.
import { describe, expect, it } from 'vitest';
import { LocalFolderDriveService, explainAuthError, explainDriveApiError, folderIdFrom, type PickedFile } from '../src/services/drive';
import { buildInventory } from '../src/engine/intake';

const picked = (path: string, bytes = 'x', type = ''): PickedFile => ({
  name: path.split('/').pop()!,
  size: bytes.length,
  lastModified: Date.UTC(2026, 6, 1),
  type,
  webkitRelativePath: path,
  arrayBuffer: async () => new TextEncoder().encode(bytes).buffer as ArrayBuffer,
});

describe('LocalFolderDriveService', () => {
  it('builds a scan from a picked directory, preserving nested paths', async () => {
    const svc = new LocalFolderDriveService();
    const scan = svc.loadFolder([
      picked('Acme Project/BOQ_BCS Final.xlsx'),
      picked('Acme Project/Contract/Signed agreement.pdf'),
      picked('Acme Project/Drawings/GFC-01.pdf'),
    ]);

    expect(scan.folderName).toBe('Acme Project');
    expect(scan.files).toHaveLength(3);
    expect(scan.files.map((f) => f.path)).toContain('Acme Project/Drawings/GFC-01.pdf');
    // extension-derived mime, since a picked file often has an empty type
    expect(scan.files[0].mimeType).toMatch(/spreadsheetml/);
    expect(svc.isConfigured()).toBe(true);
  });

  it('returns real bytes for an approved file', async () => {
    const svc = new LocalFolderDriveService();
    const scan = svc.loadFolder([picked('P/notes.csv', 'a,b,c')]);
    const buf = await svc.readFile(scan.files[0]);
    expect(new TextDecoder().decode(buf)).toBe('a,b,c');
  });

  it('feeds the same inventory the Drive path does', () => {
    const svc = new LocalFolderDriveService();
    const scan = svc.loadFolder([
      picked('P/Priced BOQ.xlsx'),
      picked('P/Furniture layout.pdf'),
      picked('P/Site photos day 0.jpg'),
    ]);
    const inv = buildInventory(scan);
    expect(inv.slots.find((s) => s.slot.key === 'boq')!.present).toBe(true);
    expect(inv.slots.find((s) => s.slot.key === 'layout')!.present).toBe(true);
    expect(inv.mandatoryMissing.length).toBeGreaterThan(0); // honest about what is absent
  });

  it('skips OS noise and dotfiles', () => {
    const svc = new LocalFolderDriveService();
    const scan = svc.loadFolder([picked('P/.DS_Store'), picked('P/real.xlsx'), picked('P/.hidden')]);
    expect(scan.files.map((f) => f.name)).toEqual(['real.xlsx']);
  });

  it('excludes Drive for Desktop placeholders and says so, rather than parsing 100 bytes of JSON as a BOQ', () => {
    const svc = new LocalFolderDriveService();
    const scan = svc.loadFolder([picked('P/BOQ.gsheet'), picked('P/Contract.pdf')]);
    expect(scan.files.map((f) => f.name)).toEqual(['Contract.pdf']);
    expect(scan.notes!.join(' ')).toMatch(/placeholder/i);
    expect(scan.notes!.join(' ')).toMatch(/BOQ\.gsheet/);
  });

  it('explains what to do when every file is a placeholder', () => {
    const svc = new LocalFolderDriveService();
    expect(() => svc.loadFolder([picked('P/BOQ.gsheet'), picked('P/Deck.gslides')])).toThrow(/available offline/i);
  });

  it('rejects an empty folder without inventing a project', () => {
    const svc = new LocalFolderDriveService();
    expect(() => svc.loadFolder([])).toThrow(/no readable files/i);
  });

  it('refuses to read before a folder is picked', async () => {
    await expect(new LocalFolderDriveService().scanFolder()).rejects.toThrow(/pick a folder/i);
  });
});

describe('Drive error messages carry the fix, not the status code', () => {
  it('names the un-enabled Drive API', () => {
    expect(explainDriveApiError(403, '{"error":{"message":"Google Drive API has not been used in project 123"}}')).toMatch(/Library.*Enable/s);
  });
  it('distinguishes a missing folder from a permission problem', () => {
    expect(explainDriveApiError(404, '')).toMatch(/cannot see it/i);
    expect(explainDriveApiError(403, '{"error":"forbidden"}')).toMatch(/lacks access/i);
  });
  it('turns an origin rejection into the exact console fix', () => {
    expect(explainAuthError('idpiframe_initialization_failed')).toMatch(/Authorised JavaScript origins/);
  });
  it('points test-mode users at the test-users list', () => {
    expect(explainAuthError('access_denied')).toMatch(/Test users/);
  });
});

describe('folderIdFrom', () => {
  it('pulls the id out of the link shapes Drive actually produces', () => {
    expect(folderIdFrom('https://drive.google.com/drive/folders/1NVFok5Gk4prjzu-yghgQL')).toBe('1NVFok5Gk4prjzu-yghgQL');
    expect(folderIdFrom('https://drive.google.com/open?id=abc_123')).toBe('abc_123');
    expect(folderIdFrom('  bare-id  ')).toBe('bare-id');
  });
});
