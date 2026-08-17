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
}: {
  projects: ProjectInputs[];
  org: OrgState;
  onSelect: (id: string) => void;
  onNewProject: () => void;
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
          const pending = p.status === 'pending_inputs';

          return (
            <button
              key={p.id}
              className="dash-card"
              style={{ animationDelay: `${i * 60}ms` }}
              onClick={() => onSelect(p.id)}
            >
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
            </button>
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
    <svg className="dash-logo" viewBox="0 0 200 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="0,32 14,4 28,32" fill="#d4e80e" />
      <polygon points="18,32 32,4 46,32" fill="#d4e80e" opacity="0.65" />
      <text x="54" y="27" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" fontSize="22" fontWeight="700" letterSpacing="2" fill="currentColor">FLIPSPACES</text>
    </svg>
  );
}
