import { useEffect, useState } from 'react';
import type { ProjectInputs } from '../domain/types';
import type { OrgState, ProjectLifecycle } from '../domain/org';
import { siteFor, teamFor } from '../domain/org';

const LIFECYCLE_CLASS: Record<ProjectLifecycle, string> = {
  Planning: 'info',
  WIP: 'ok',
  'On hold': 'warn',
  'Handed over': 'ext',
  Closed: '',
};

export function ProjectDashboard({
  projects,
  org,
  onSelect,
  onNewProject,
  onDelete,
  onArchive,
  builtInIds,
}: {
  projects: ProjectInputs[];
  org: OrgState;
  onSelect: (id: string) => void;
  onNewProject: () => void;
  /** remove a project made in this app, permanently */
  onDelete: (id: string) => void;
  /** hide a project that ships with the app. The seed data is re-created on every load, so a
   * built-in cannot be deleted — only put away, which is what the control offers instead. */
  onArchive: (id: string) => void;
  builtInIds: string[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  /**
   * Search across everything ON the card, not just the name.
   *
   * A project is looked for by whatever the person happens to remember about it,
   * and that is often not what it is called — the client, the city, or that it is
   * one of the jobs still on hold. Matching the name alone would answer "no
   * projects" to a search for "Pune" while two Pune projects sat behind it.
   */
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = !q ? projects : projects.filter((p) => {
    const site = siteFor(org, p.id);
    return [
      p.name, p.client, p.location, site.city,
      org.lifecycle[p.id] ?? 'Planning',
      p.areaSft ? `${p.areaSft.value}` : '',
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  return (
    <div className={`dashboard ${mounted ? 'dash-in' : ''}`}>
      <div className="dash-header">
        <FlipspacesLogo />
        <div className="dash-subtitle">Planning Engine</div>
      </div>

      <div className="dash-search">
        <svg className="dash-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Escape clears rather than blurs: the field is the only thing standing
          // between the reader and the full list, so the key that means "never
          // mind" should put the list back.
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setQuery(''); } }}
          placeholder="Search projects — name, client, city or status"
          aria-label="Search projects"
        />
        {q && (
          <span className="dash-search-count">
            {shown.length} of {projects.length}
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search">Clear</button>
          </span>
        )}
      </div>

      <div className="dash-grid">
        {shown.map((p, i) => {
          const site = siteFor(org, p.id);
          const lifecycle = org.lifecycle[p.id] ?? 'Planning';
          const teamCount = teamFor(org, p.id).filter((m) => m.employeeCode).length;
          const pending = !p.provided.boq || !p.provided.contract;

          const builtIn = builtInIds.includes(p.id);
          return (
            // A div, not a button. The delete control is a real button and one cannot nest
            // inside another — so the card carries the role and the keyboard handling itself,
            // and the control inside it stops the click from also opening the project.
            <div
              key={p.id}
              className="dash-card"
              role="button"
              tabIndex={0}
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); }
              }}
            >
              <button
                className="dash-card-del"
                title={builtIn
                  ? 'Archive — this project ships with the app, so it cannot be deleted'
                  : 'Delete this project'}
                aria-label={`${builtIn ? 'Archive' : 'Delete'} ${p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (builtIn) { onArchive(p.id); return; }
                  // Asked, because there is nowhere to get it back from. The inputs live only in
                  // the workspace file; the tracking engine keeps rendered modules, not inputs.
                  const sure = confirm(
                    `Delete “${p.name}”?\n\nThis removes the project and everything set up for it — the Drive link, the answered intake questions and the BOQ figures the plan is computed from. It cannot be undone.`,
                  );
                  if (sure) onDelete(p.id);
                }}
              >
                {builtIn ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                )}
              </button>
              <div className="dash-card-inner">
                <div className="dash-card-top">
                  <span className={`tag ${LIFECYCLE_CLASS[lifecycle]}`}>{lifecycle}</span>
                  {pending && <span className="tag warn">Pending inputs</span>}
                </div>
                <div className="dash-card-name">{p.name}</div>
                <div className="dash-card-client">{p.client}</div>
                <div className="dash-card-meta">
                  <span>{site.city || p.location?.split(',').pop()?.trim() || '—'}</span>
                  <span className="dash-dot" />
                  <span>{p.areaSft ? `${p.areaSft.value.toLocaleString('en-IN')} sft` : '—'}</span>
                  <span className="dash-dot" />
                  <span>{teamCount} team</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Hidden while searching. "New Project" is not a search result, and
            leaving it sitting alone under a query that matched nothing reads as
            though it were the one thing that did match. */}
        {!q && (
          <button className="dash-card dash-card-new" style={{ animationDelay: `${projects.length * 60}ms` }} onClick={onNewProject}>
            <div className="dash-card-inner">
              <div className="dash-new-icon">+</div>
              <div className="dash-card-name">New Project</div>
              <div className="dash-card-client">Link a Drive folder and set up inputs</div>
            </div>
          </button>
        )}
      </div>

      {q && shown.length === 0 && (
        <p className="dash-empty muted">
          No project matches “{query}”. Searched name, client, city, status and area.
        </p>
      )}
    </div>
  );
}

/**
 * The Flipspaces mark: two hollow triangles, the left pointing up and the right
 * inverted, overlapping through the middle.
 *
 * Drawn rather than linked. It is two triangles and a colour, so a path renders
 * it exactly, stays sharp on any display at any size, adds no file to load, and
 * cannot go missing the way an <img> whose asset was not copied across does —
 * which on the very first screen of the app would be the worst place for it.
 *
 * `evenodd` is what hollows each triangle: the second sub-path in each `d` is the
 * inner cut-out, and the fill rule turns the overlap into a hole rather than more
 * yellow. Both are drawn in one path so the pair overlaps as a single shape and
 * no seam shows where they cross.
 */
function FlipspacesLogo() {
  return (
    <div className="dash-brand">
      <FlipspacesMark />
      {/* THE WORDMARK IS REAL TEXT, not a <text> inside the SVG.
          Set in the SVG it would have to be positioned by guessed font metrics —
          and the ® sits at the end of the word, so the moment Arial Black is not
          installed and the fallback measures differently, the symbol lands either
          inside the final S or adrift of it. As text it is laid out by the
          browser, so the ® goes where it belongs on every machine, and the name
          can be selected and read by a screen reader. */}
      <span className="dash-wordmark">Flipspaces<sup>®</sup></span>
    </div>
  );
}

function FlipspacesMark() {
  return (
    <svg className="dash-mark" viewBox="0 0 120 96" fill="none" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label="Flipspaces">
      {/* left triangle, apex up — outer edge then the inner cut-out. The cut-out
          is held well inside the outer edge: the mark reads as three heavy bands,
          not as a thin outline, and a hairline version of it disappears entirely
          at the 64px this is actually drawn at. */}
      <path fillRule="evenodd" clipRule="evenodd"
        d="M38 10 L72 88 L4 88 Z M38 42 L57 75 L19 75 Z" fill="#F5E400" />
      {/* right triangle, apex down, crossing the first */}
      <path fillRule="evenodd" clipRule="evenodd"
        d="M48 8 L116 8 L82 86 Z M62 21 L102 21 L82 58 Z" fill="#F5E400" />
    </svg>
  );
}
