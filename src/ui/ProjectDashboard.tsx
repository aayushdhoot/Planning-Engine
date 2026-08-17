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
          const pending = !p.provided.boq || !p.provided.contract;

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
    <svg className="dash-logo" viewBox="0 0 360 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Three overlapping yellow triangles — the Flipspaces geometric mark */}
      <polygon points="8,40 20,6 32,40" fill="#FFD600" />
      <polygon points="16,40 28,6 40,40" fill="#FFD600" opacity="0.75" />
      <polygon points="24,40 36,6 48,40" fill="#FFD600" opacity="0.55" />
      <text x="58" y="33" fontFamily="'Arial Black', 'Helvetica Neue', Arial, sans-serif" fontSize="28" fontWeight="900" letterSpacing="1.5" fill="#1a1a1a">FLIPSPACES</text>
      <text x="296" y="18" fontFamily="Arial, sans-serif" fontSize="10" fill="#1a1a1a">®</text>
    </svg>
  );
}
