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

  return (
    <div className={`dashboard ${mounted ? 'dash-in' : ''}`}>
      <div className="dash-header">
        <FlipspacesLogo />
        <div className="dash-subtitle">Planning Engine</div>
      </div>

      <div className="dash-grid">
        {projects.map((p, i) => {
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

        <button className="dash-card dash-card-new" style={{ animationDelay: `${projects.length * 60}ms` }} onClick={onNewProject}>
          <div className="dash-card-inner">
            <div className="dash-new-icon">+</div>
            <div className="dash-card-name">New Project</div>
            <div className="dash-card-client">Link a Drive folder and set up inputs</div>
          </div>
        </button>
      </div>
    </div>
  );
}

function FlipspacesLogo() {
  return (
    <svg className="dash-logo" viewBox="0 0 380 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Two hollow overlapping triangles forming the Flipspaces chevron mark */}
      {/* Left hollow triangle */}
      <path fillRule="evenodd" d="M22,4 L6,42 L38,42Z M22,14 L14,38 L30,38Z" fill="#FFD600" />
      {/* Right hollow triangle, overlapping */}
      <path fillRule="evenodd" d="M38,4 L22,42 L54,42Z M38,14 L30,38 L46,38Z" fill="#FFD600" />
      <text x="66" y="36" fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontSize="30" fontWeight="900" letterSpacing="2" fill="#1a1a1a">FLIPSPACES</text>
      <text x="355" y="20" fontFamily="Arial, sans-serif" fontSize="11" fill="#1a1a1a">®</text>
    </svg>
  );
}
