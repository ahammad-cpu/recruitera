import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Search, Plus, MoreVertical, ChevronDown, ChevronRight, Users2, Eye, KeyRound, Trash2, Copy, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useImpersonation } from '@/lib/impersonation';
import { useRealMe } from '@/hooks/useMe';
import { useProfiles, useRoles, useTeams, type Role, type Profile } from '@/hooks/useUsersData';
import { useToggleRoleModule, useCreateRole, MODULE_CATALOG, MODULE_SECTIONS } from '@/hooks/useRoleMutations';
import { useUpdateProfileFields } from '@/hooks/useProfileMutations';
import { useInviteUser } from '@/hooks/useInviteUser';
import { useResetUserPassword, useDeleteUser } from '@/hooks/useManageUser';
import { toast } from 'sonner';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';

type Tab = 'members' | 'roles' | 'teams';

export default function Users() {
  const [tab, setTab] = useState<Tab>('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const profiles = useProfiles();
  const roles = useRoles();
  const teams = useTeams();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Admin-only page. Uses the canonical isAdmin check (both legacy text
  // role AND role_id → roles.type) so a stale profiles.role field can't
  // sneak a non-admin past the gate. Sidebar hides the entry for
  // non-admins; this handles direct-URL and bookmark cases.
  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="text-[22px] font-black tracking-tight text-text">Users &amp; Permissions</h1>
          <p className="text-[13px] text-text-3 font-medium mt-1">
            Roles decide what a person can <i>do</i>. Each person reports to a lead — a Team Lead or Admin sees every account owned by anyone reporting to them.
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13.5px] font-bold hover:bg-accent-strong"
        >
          <Plus size={14} strokeWidth={2.5} /> Invite User
        </button>
      </div>

      <div className="flex items-center gap-8 border-b border-border">
        <TabBtn active={tab === 'members'} onClick={() => setTab('members')}>All Team Members</TabBtn>
        <TabBtn active={tab === 'roles'} onClick={() => setTab('roles')}>Hiring Roles and Permissions</TabBtn>
        <TabBtn active={tab === 'teams'} onClick={() => setTab('teams')}>Teams</TabBtn>
      </div>

      {tab === 'members' && <MembersTab onInvite={() => setInviteOpen(true)} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'teams' && <TeamsTab />}

      {inviteOpen && <InviteUserModal onClose={() => setInviteOpen(false)} roles={roles.data ?? []} teams={teams.data ?? []} profiles={profiles.data ?? []} />}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[14px] py-3.5 -mb-px border-b-2 transition-colors',
        active ? 'font-black text-text border-cg-900' : 'font-semibold text-text-3 border-transparent hover:text-text-2',
      )}
    >
      {children}
    </button>
  );
}

function MembersTab({ onInvite }: { onInvite: () => void }) {
  const { data, isLoading } = useProfiles();
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const updateFields = useUpdateProfileFields();
  const { startImpersonation } = useImpersonation();
  const realMe = useRealMe();
  const navigate = useNavigate();
  const resetPw = useResetUserPassword();
  const delUser = useDeleteUser();
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);
  const [delTarget, setDelTarget] = useState<Profile | null>(null);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name ?? '—';

  // Who manages whom — powers the "leads under them" expand + the reports-to
  // picker (excluding self to avoid a trivial 1-node cycle).
  const reportsByManager = useMemo(() => {
    const m = new Map<string, Profile[]>();
    (data ?? []).forEach((p) => {
      if (!p.reports_to) return;
      const arr = m.get(p.reports_to) ?? [];
      arr.push(p);
      m.set(p.reports_to, arr);
    });
    return m;
  }, [data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((p) =>
      (p.full_name || '').toLowerCase().includes(term) || (p.email || '').toLowerCase().includes(term));
  }, [data, q]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1 h-11 px-4 bg-surface border border-border rounded-xl shadow-sh1">
          <Search size={16} className="text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for Users"
            className="flex-1 bg-transparent outline-none text-[14px] text-text placeholder:text-text-3"
          />
        </div>
        <button
          onClick={onInvite}
          className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-accent text-cg-900 border border-accent-strong text-[14px] font-bold hover:bg-accent-strong"
        >
          <Plus size={15} strokeWidth={2.5} /> Add User
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="grid grid-cols-[1.8fr_1.4fr_1fr_1fr_44px] gap-3 px-6 py-3.5 border-b border-border text-[12px] font-black uppercase tracking-wider text-text-3">
          <span>Name</span><span>Role</span><span>Team</span><span>Reports to</span><span />
        </div>
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No users found.</div>}
        {rows.map((p) => {
          const reports = reportsByManager.get(p.id) ?? [];
          const isExpanded = expanded.has(p.id);
          const isAdmin = p.role === 'admin';
          return (
            <div key={p.id} className="border-b border-border last:border-0">
              <div className="grid grid-cols-[1.8fr_1.4fr_1fr_1fr_44px] gap-3 px-6 py-3 items-center hover:bg-surface-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-cg-800 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                    {initials(p.full_name || p.email)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-text truncate">{p.full_name || '—'}</div>
                    <div className="text-[11.5px] text-text-3 truncate">{p.email}</div>
                  </div>
                </div>

                <select
                  value={p.role_id || ''}
                  onChange={(e) => updateFields.mutate({ id: p.id, role_id: e.target.value || null })}
                  className="h-8 px-2 border border-border rounded-md bg-surface text-[12.5px] font-semibold text-text outline-none focus:border-accent-strong"
                >
                  <option value="">No role</option>
                  {roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                <select
                  value={p.team_id || ''}
                  onChange={(e) => updateFields.mutate({ id: p.id, team_id: e.target.value || null })}
                  className="h-8 px-2 border border-border rounded-md bg-surface text-[12.5px] font-semibold text-text outline-none focus:border-accent-strong"
                >
                  <option value="">No team</option>
                  {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>

                <select
                  value={p.reports_to || ''}
                  onChange={(e) => updateFields.mutate({ id: p.id, reports_to: e.target.value || null })}
                  disabled={isAdmin}
                  title={isAdmin ? 'Admins never report to anyone' : undefined}
                  className="h-8 px-2 border border-border rounded-md bg-surface text-[12.5px] font-semibold text-text outline-none focus:border-accent-strong disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">No lead</option>
                  {data?.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.full_name || x.email}</option>)}
                </select>

                <div className="flex justify-end items-center gap-1">
                  {/* View-as: admins only, never yourself. Swaps the app's
                      effective identity so you see this user's nav + gating. */}
                  {realMe.data?.id !== p.id && (
                    <button
                      onClick={() => { startImpersonation(p.id); navigate('/'); }}
                      title={`View the app as ${p.full_name || p.email}`}
                      className="w-8 h-8 grid place-items-center rounded-md text-text-3 hover:text-accent-ink hover:bg-surface-2"
                    >
                      <Eye size={15} />
                    </button>
                  )}
                  {reports.length > 0 && (
                    <button
                      onClick={() => toggleExpand(p.id)}
                      title={`${reports.length} direct report${reports.length === 1 ? '' : 's'}`}
                      className="inline-flex items-center gap-1 h-8 px-2 rounded-md text-text-2 hover:bg-surface-2 tnum text-[12px] font-bold"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {reports.length}
                    </button>
                  )}
                  <RowMenu
                    isSelf={realMe.data?.id === p.id}
                    onReset={() => resetPw.mutate(p.id, {
                      onSuccess: (d) => setTempPw({ name: p.full_name || p.email, pw: d.temp_password }),
                    })}
                    onDelete={() => setDelTarget(p)}
                  />
                </div>
              </div>

              {isExpanded && reports.length > 0 && (
                <div className="bg-surface-2/60 border-t border-border px-6 py-3 pl-[4.5rem] space-y-2">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-widest text-text-3 mb-1">
                    <Users2 size={12} /> Reports to {p.full_name || p.email}
                  </div>
                  {reports.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 py-1">
                      <div className="w-7 h-7 rounded-full bg-cg-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {initials(r.full_name || r.email)}
                      </div>
                      <span className="text-[13px] font-semibold text-text">{r.full_name || r.email}</span>
                      <span className="text-[11.5px] text-text-3">{roleName(r.role_id)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tempPw && <TempPasswordModal name={tempPw.name} pw={tempPw.pw} onClose={() => setTempPw(null)} />}
      {delTarget && (
        <DeleteUserModal
          profile={delTarget}
          pending={delUser.isPending}
          onClose={() => setDelTarget(null)}
          onConfirm={() => delUser.mutate(delTarget.id, { onSuccess: () => setDelTarget(null) })}
        />
      )}
    </div>
  );
}

function RowMenu({ isSelf, onReset, onDelete }: { isSelf: boolean; onReset: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 grid place-items-center rounded-md text-text-3 hover:bg-surface-2"
        title="More"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-48 bg-surface border border-border rounded-lg shadow-sh3 py-1">
          <button
            onClick={() => { setOpen(false); onReset(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-text hover:bg-surface-2"
          >
            <KeyRound size={14} /> Reset password
          </button>
          <button
            disabled={isSelf}
            onClick={() => { setOpen(false); onDelete(); }}
            title={isSelf ? "You can't delete your own account" : undefined}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-bad hover:bg-bad-bg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 size={14} /> Delete user
          </button>
        </div>
      )}
    </div>
  );
}

function TempPasswordModal({ name, pw, onClose }: { name: string; pw: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-accent-soft text-accent-ink grid place-items-center flex-shrink-0"><KeyRound size={17} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold text-text">Temporary password</div>
            <div className="text-[12px] text-text-3 truncate">for {name}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>
        <div className="p-6 space-y-3">
          <div className="flex items-center gap-2 p-3 border-2 border-border-2 rounded-lg bg-surface-2">
            <code className="flex-1 font-mono text-[15px] font-bold text-text tracking-wide select-all break-all">{pw}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(pw).then(() => toast.success('Copied')); }}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-accent text-cg-900 text-[12px] font-black border border-accent-strong hover:bg-accent-strong flex-shrink-0"
            >
              <Copy size={13} /> Copy
            </button>
          </div>
          <div className="text-[12px] text-text-2 bg-warn-bg/60 border border-warn/30 rounded-lg px-3 py-2">
            This is shown <b>once</b>. Share it with the user over a secure channel and ask them to change it on first login.
          </div>
        </div>
        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex justify-end">
          <button onClick={onClose} className="h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-black hover:opacity-90">Done</button>
        </footer>
      </div>
    </div>
  );
}

function DeleteUserModal({ profile, pending, onClose, onConfirm }: { profile: Profile; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const label = profile.full_name || profile.email;
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-lg bg-bad-bg text-bad grid place-items-center flex-shrink-0"><Trash2 size={17} /></div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-extrabold text-text">Delete user</div>
            <div className="text-[12px] text-text-3 truncate">{label}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>
        <div className="p-6 space-y-3 text-[13px] text-text-2">
          <p>This permanently removes <b className="text-text">{label}</b>'s login and profile. This <b>can't be undone.</b></p>
          <ul className="list-disc pl-5 space-y-1 text-[12.5px]">
            <li>Their companies become <b>unassigned</b> (no owner) — nothing is deleted.</li>
            <li>Open tasks assigned to them become unassigned.</li>
            <li>Their past notes/activity stay, shown without an author.</li>
          </ul>
        </div>
        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-bad text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RolesTab() {
  const { data: roles, isLoading } = useRoles();
  const { data: profiles } = useProfiles();
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const toggleModule = useToggleRoleModule();
  const createRole = useCreateRole();

  const memberCount = (roleId: string) => (profiles ?? []).filter((p) => p.role_id === roleId).length;
  const selRole = roles?.find((r) => r.id === selId) ?? roles?.[0];

  function submitCreate() {
    if (!newName.trim()) return;
    createRole.mutate(newName, {
      onSuccess: (role) => { setSelId(role.id); setCreating(false); setNewName(''); },
    });
  }

  return (
    <div className="grid grid-cols-[300px_1fr] gap-4 items-start">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-border">
          <span className="text-[10.5px] font-black tracking-widest uppercase text-text-3">Roles</span>
          <button
            onClick={() => setCreating((v) => !v)}
            className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-md border border-border-2 bg-surface text-text-2 text-[11.5px] font-bold hover:bg-surface-2"
          >
            + Add
          </button>
        </div>

        {creating && (
          <div className="flex items-center gap-1.5 p-2 border-b border-border bg-surface-2/50">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="New role name…"
              className="flex-1 h-8 px-2.5 rounded-md border border-border-2 bg-surface text-[12.5px] outline-none focus:border-accent-strong"
            />
            <button
              onClick={submitCreate}
              disabled={!newName.trim() || createRole.isPending}
              className="h-8 px-2.5 rounded-md bg-accent text-cg-900 text-[11.5px] font-bold disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        {isLoading && <div className="p-8 text-center text-[12.5px] text-text-3">Loading roles…</div>}
        {!isLoading && (roles?.length ?? 0) === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No roles yet.</div>}
        <div className="p-2 flex flex-col gap-1">
          {roles?.map((r) => {
            const active = selRole?.id === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setSelId(r.id)}
                className={cn('flex items-center gap-2.5 px-3 py-3 rounded-lg text-left', active ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-black text-text truncate">{r.name}</span>
                    {r.is_system && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[9.5px] tracking-wider font-black bg-surface-2 text-text-3 border border-border flex-shrink-0">SYS</span>
                    )}
                  </div>
                  {r.description && <div className="text-[11px] text-text-3 font-semibold mt-0.5 line-clamp-2">{r.description}</div>}
                </div>
                <span className="tnum text-[13px] font-black text-text-2 flex-shrink-0">{memberCount(r.id)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selRole ? (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <h3 className="text-[17px] font-black tracking-tight text-text">{selRole.name}</h3>
            {selRole.is_system && (
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-black bg-surface-2 text-text-3 border border-border">SYSTEM ROLE</span>
            )}
            <span className="tnum ml-auto text-[11px] font-bold text-text-3">
              {memberCount(selRole.id)} member{memberCount(selRole.id) === 1 ? '' : 's'}
            </span>
          </div>
          <div className="text-[13px] text-text-2 font-medium leading-relaxed mb-5">{selRole.description || 'No description.'}</div>
          <div className="text-[10.5px] font-black tracking-widest uppercase text-text-3 mb-2.5">Module access</div>
          {MODULE_SECTIONS.map((section) => {
            const items = MODULE_CATALOG.filter((m) => m.section === section.key);
            if (items.length === 0) return null;
            return (
              <div key={section.key} className="mb-5 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-black tracking-widest uppercase text-text-2">{section.label}</span>
                  <span className="tnum text-[10.5px] font-bold text-text-4">
                    {items.filter((m) => selRole.module_access?.[m.key]).length}/{items.filter((m) => !m.legacy).length}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {items.map(({ key, label, hint, legacy }) => {
                    const isOn = !!selRole.module_access?.[key];
                    return (
                      <button
                        key={key}
                        onClick={() => toggleModule.mutate({ role: selRole, key })}
                        title={hint ? `${hint} — click to ${isOn ? 'disable' : 'enable'}` : (isOn ? 'Click to disable' : 'Click to enable')}
                        className={cn(
                          'flex items-start gap-3 px-3.5 py-2.5 border rounded-lg select-none text-left transition-colors',
                          legacy ? 'bg-surface border-border/60 opacity-70' : 'bg-surface-2 border-border hover:bg-surface-2/80',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-bold text-text truncate">{label}</div>
                          {hint && <div className="text-[10.5px] text-text-3 mt-0.5 leading-snug line-clamp-2">{hint}</div>}
                        </div>
                        <span className={cn('w-8 h-[18px] rounded-full relative transition-colors flex-shrink-0 mt-0.5', isOn ? 'bg-accent' : 'bg-border-2')}>
                          <span className={cn(
                            'absolute w-3.5 h-3.5 rounded-full bg-white top-[2px] transition-all',
                            isOn ? 'right-[2px]' : 'left-[2px]',
                          )} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center text-[13px] text-text-3 shadow-sh1">
          Pick a role to see its permissions.
        </div>
      )}
    </div>
  );
}

function TeamsTab() {
  const { data, isLoading } = useTeams();
  const { data: profiles } = useProfiles();
  const teamSize = (id: string) => (profiles ?? []).filter((p) => p.team_id === id).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {isLoading && <div className="text-[12.5px] text-text-3">Loading…</div>}
      {data?.map((t) => (
        <div key={t.id} className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
          <div className="flex items-center justify-between">
            <div className="text-[15px] font-bold text-text">{t.name}</div>
            <span className="text-[11px] text-text-3 tnum">{teamSize(t.id)} members</span>
          </div>
          {t.description && <div className="text-[12.5px] text-text-3 mt-1">{t.description}</div>}
        </div>
      ))}
    </div>
  );
}

function InviteUserModal({
  onClose, roles, teams, profiles,
}: {
  onClose: () => void;
  roles: Role[];
  teams: ReturnType<typeof useTeams>['data'] extends infer T ? NonNullable<T> : never;
  profiles: ReturnType<typeof useProfiles>['data'] extends infer T ? NonNullable<T> : never;
}) {
  const invite = useInviteUser();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [roleId, setRoleId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [reportsTo, setReportsTo] = useState('');
  const [result, setResult] = useState<{ email: string; temp_password: string } | null>(null);

  function submit() {
    if (!email.trim()) return;
    invite.mutate(
      { email: email.trim(), full_name: fullName.trim(), role_id: roleId || null, team_id: teamId || null, reports_to: reportsTo || null },
      { onSuccess: (r) => setResult({ email: r.email, temp_password: r.temp_password }) },
    );
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[16px] font-black text-text">Invite User</div>
        </div>

        {result ? (
          <div className="p-5 space-y-3">
            <div className="text-[13px] text-text-2">
              Created <span className="font-bold text-text">{result.email}</span>. Share this temporary password — they should reset it on first login.
            </div>
            <div className="bg-surface-2 border border-border rounded-lg px-3 py-2.5 tnum text-[13px] font-bold text-text">
              {result.temp_password}
            </div>
            <button onClick={onClose} className="w-full h-10 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13px] font-bold hover:bg-accent-strong">
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@company.com"
                     className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong" />
            </Field>
            <Field label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe"
                     className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong" />
            </Field>
            <Field label="Role">
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)}
                      className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong">
                <option value="">No role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Team">
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
                      className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong">
                <option value="">No team</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Reports to">
              <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)}
                      className="w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong">
                <option value="">No lead</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!email.trim() || invite.isPending}
                className="h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12.5px] font-bold hover:bg-accent-strong disabled:opacity-50"
              >
                {invite.isPending ? 'Inviting…' : 'Send invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
