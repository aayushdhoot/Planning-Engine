// Persistence is behind a service interface so the store (file, IndexedDB, API)
// can change without touching the engine or the UI.
import type { EngineConfig, ProjectInputs } from '../domain/types';
import { canonicalJson } from '../engine/schema';

export interface Workspace {
  savedAt: string;
  normsVersion: string;
  projects: ProjectInputs[];
  config: EngineConfig;
}

export interface PersistenceService {
  save(w: Workspace): Promise<void>;
  load(): Promise<Workspace | null>;
  list(): Promise<string[]>;
}

/** In-memory store — used by tests and as the default session store. */
export class MemoryPersistence implements PersistenceService {
  private store: Workspace | null = null;
  async save(w: Workspace) {
    this.store = JSON.parse(canonicalJson(w));
  }
  async load() {
    return this.store;
  }
  async list() {
    return this.store ? [`workspace @ ${this.store.savedAt}`] : [];
  }
}

/**
 * File-based store: saving downloads a canonical JSON workspace, loading reads one back.
 * No browser storage APIs are used.
 */
export class FilePersistence implements PersistenceService {
  private pending: Workspace | null = null;
  constructor(private readonly filename = 'planning-engine-workspace.json') {}

  async save(w: Workspace) {
    const text = canonicalJson(w);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = this.filename;
    a.click();
    URL.revokeObjectURL(url);
    this.pending = w;
  }

  /** Accept a workspace file the user picked. */
  async ingest(text: string): Promise<Workspace> {
    const w = JSON.parse(text) as Workspace;
    if (!Array.isArray(w.projects)) throw new Error('Not a planning-engine workspace file.');
    this.pending = w;
    return w;
  }

  async load() {
    return this.pending;
  }
  async list() {
    return this.pending ? this.pending.projects.map((p) => p.name) : [];
  }
}
