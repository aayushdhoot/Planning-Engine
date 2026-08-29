// Admin: the people and the projects, across the organisation.
//
// Everything here lives on this machine. There is no server, so two people running the engine
// do not see each other's changes — that is stated in the UI rather than left to be discovered.
import { useMemo, useRef, useState } from 'react';
import {
  PROJECT_LIFECYCLE,
  isAssignable,
  summariseDirectory,
  type Employee,
  type OrgState,
  type ProjectLifecycle,
} from '../domain/org';
import { parseEmployeeFile } from '../services/employee-directory';

export function Admin({
  org,
  setOrg,
  projects,
  builtInIds,
  onDeleteProject,
}: {
  org: OrgState;
  setOrg: (o: OrgState) => void;
  projects: { id: string; name: string; client: string }[];
  builtInIds: string[];
  onDeleteProject: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const summary = useMemo(() => summariseDirectory(org.employees), [org.employees]);

  const importCsv = async (f: File) => {
    setError(null);
    try {
      const r = await parseEmployeeFile(f);
      setOrg({ ...org, employees: r.employees, importedAt: new Date().toISOString() });
      setNotes([`Imported ${r.employees.length} people from ${f.name}.`, ...r.warnings]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = org.employees.filter((e) => {
    const q = query.trim().toLowerCase();
    return !q || `${e.name} ${e.designation} ${e.department} ${e.location} ${e.email}`.toLowerCase().includes(q);
  });

  const addUser = () => {
    const name = newName.trim();
    if (!name) return;
    const e: Employee = {
      code: `manual-${Date.now()}`,
      name,
      designation: newRole.trim(),
      department: '—',
      location: '—',
      email: '',
      sbu: '—',
      status: 'Current',
      reportingTo: '',
    };
    setOrg({ ...org, employees: [...org.employees, e] });
    setNewName('');
    setNewRole('');
  };

  const removeUser = (code: string) =>
    setOrg({
      ...org,
      employees: org.employees.filter((e) => e.code !== code),
      // drop them from every project team too, or the team shows a dangling slot
      teams: Object.fromEntries(
        Object.entries(org.teams).map(([pid, team]) => [pid, team.map((m) => (m.employeeCode === code ? { ...m, employeeCode: null } : m))]),
      ),
    });

  const setLifecycle = (pid: string, v: ProjectLifecycle) => setOrg({ ...org, lifecycle: { ...org.lifecycle, [pid]: v } });
  const toggleArchive = (pid: string) =>
    setOrg({ ...org, archived: org.archived.includes(pid) ? org.archived.filter((x) => x !== pid) : [...org.archived, pid] });

  return (
    <>
      <div className="banner info" style={{ marginBottom: 14 }}>
        <strong>Local to this machine.</strong> There is no shared server, so users, teams and project statuses set
        here are not visible to anyone else running the engine. The employee directory is imported from a file and
        held locally — it is never committed to the repository.
      </div>
      {error && <div className="banner">{error}</div>}
      {notes.length > 0 && (
        <div className="banner ok" style={{ marginBottom: 14 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}

      <div className="cards">
        <div className="card"><div className="k">People</div><div className="v">{summary.total}</div><div className="s">{summary.assignable} assignable</div></div>
        <div className="card"><div className="k">Projects</div><div className="v">{projects.length}</div><div className="s">{org.archived.length} archived</div></div>
        <div className="card"><div className="k">Departments</div><div className="v">{summary.byDepartment.length}</div><div className="s">{summary.byDepartment[0]?.department ?? '—'}</div></div>
        <div className="card"><div className="k">Directory imported</div><div className="v" style={{ fontSize: 14 }}>{org.importedAt ? new Date(org.importedAt).toLocaleDateString() : 'never'}</div><div className="s">re-import to refresh</div></div>
      </div>

      <h2>Projects</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Team assigned</th><th style={{ textAlign: 'right' }}>Do</th></tr></thead>
          <tbody>{projects.map((p) => {
            const team = (org.teams[p.id] ?? []).filter((m) => m.employeeCode).length;
            const archived = org.archived.includes(p.id);
            return (
              <tr key={p.id} style={archived ? { opacity: 0.5 } : undefined}>
                <td><strong>{p.name}</strong><div className="faint" style={{ fontSize: 11 }}>{p.id}</div></td>
                <td className="muted">{p.client}</td>
                <td>
                  <select value={org.lifecycle[p.id] ?? 'Planning'} onChange={(e) => setLifecycle(p.id, e.target.value as ProjectLifecycle)}>
                    {PROJECT_LIFECYCLE.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="mono">{team} role{team === 1 ? '' : 's'}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => toggleArchive(p.id)}>{archived ? 'Restore' : 'Archive'}</button>
                    {/* The confirm is asked because there is nowhere to get it back from: a
                        project's inputs live only in the workspace file, and the tracking engine
                        keeps rendered modules, not inputs. This used to delete on one click. */}
                    {!builtInIds.includes(p.id) && (
                      <button
                        title="Remove this project entirely"
                        onClick={() => {
                          if (confirm(`Delete “${p.name}”?\n\nThis removes the project and everything set up for it — the Drive link, the answered intake questions and the BOQ figures the plan is computed from. It cannot be undone.`))
                            onDeleteProject(p.id);
                        }}
                      >Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Archiving hides a project from the switcher and leaves its data intact. The three reference projects cannot be
        deleted — they are the engine's own fixtures.
      </p>

      <h2 style={{ marginTop: 26 }}>People</h2>
      <div className="row">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importCsv(f); }}
        />
        <button className="primary" onClick={() => fileRef.current?.click()}>Import employee directory (CSV or Excel)</button>
        <div className="field" style={{ minWidth: 260 }}>
          <label>Search</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, role, department, location" />
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{shown.length} of {org.employees.length}</span>
      </div>
      <p className="muted" style={{ fontSize: 12, maxWidth: 820 }}>
        Expects the employee master sheet, as <strong>.xlsx, .xls or .csv</strong> — in a workbook it finds the sheet
        with an “Employee Name” column, whichever tab that is. <strong>Mobile numbers, joining dates and pay grades are read and
        discarded</strong> — staffing a project needs a name, a role and a work address, nothing more.
      </p>

      <div className="row" style={{ margin: '10px 0' }}>
        <div className="field"><label>Add a person</label><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" /></div>
        <div className="field"><label>Designation</label><input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Site Engineer" /></div>
        <button onClick={addUser} disabled={!newName.trim()}>Add</button>
      </div>

      {org.employees.length === 0 ? (
        <p className="muted">No directory imported yet. Import the employee master CSV, or add people one at a time.</p>
      ) : (
        <div className="tblwrap">
          <table>
            <thead><tr><th>Name</th><th>Designation</th><th>Department</th><th>Location</th><th>Work email</th><th>Status</th><th /></tr></thead>
            <tbody>{shown.slice(0, 200).map((e) => (
              <tr key={e.code} style={isAssignable(e) ? undefined : { opacity: 0.5 }}>
                <td><strong>{e.name}</strong></td>
                <td className="muted">{e.designation}</td>
                <td className="muted">{e.department}</td>
                <td className="muted">{e.location}</td>
                <td className="faint" style={{ fontSize: 11.5 }}>{e.email}</td>
                <td><span className={`tag ${isAssignable(e) ? 'ok' : ''}`}>{e.status}</span></td>
                <td><button title="Remove from the directory" onClick={() => removeUser(e.code)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {shown.length > 200 && <p className="muted" style={{ fontSize: 12 }}>Showing the first 200 — narrow the search to see the rest.</p>}
    </>
  );
}
