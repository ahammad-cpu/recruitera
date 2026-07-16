import { useMemo, useState } from 'react';
import { Search, Plus, MoreVertical } from 'lucide-react';
import { useProfiles, useRoles, useTeams, type Role } from '@/hooks/useUsersData';
import { useToggleRoleModule, useCreateRole, MODULE_CATALOG } from '@/hooks/useRoleMutations';
import { useInviteUser } from '@/hooks/useInviteUser';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';

type Tab = 'members' | 'roles' | 'teams';

export default function Users() {
  const [tab, setTab] = useState<Tab>('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const profiles = useProfiles();
  const roles = useRoles();
  const teams = useTeams();

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
  const [q, setQ] = useState('');
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter((p) =>
      (p.full_name || '').toLowerCase().includes(term) || (p.email || '').toLowerCase().includes(term));
  }, [data, q]);

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
        <div className="grid grid-cols-[2fr_2.4fr_1fr_80px] gap-4 px-6 py-3.5 border-b border-border text-[13px] font-black text-text">
          <span>Name</span><span>Email Address</span><span>Role</span><span className="text-right">Options</span>
        </div>
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No users found.</div>}
        {rows.map((p) => (
          <div key={p.id} className="grid grid-cols-[2fr_2.4fr_1fr_80px] gap-4 px-6 py-3.5 border-b border-border last:border-0 items-center hover:bg-surface-2">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-cg-800 text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0">
                {initials(p.full_name || p.email)}
              </div>
              <span className="text-[14.5px] font-bold text-text truncate">{p.full_name || '—'}</span>
            </div>
            <span className="text-[14px] text-text-2 font-medium truncate">{p.email || '—'}</span>
            <span className="text-[14px] text-text-2 font-semibold truncate">{roleName(p.role_id)}</span>
            <div className="flex justify-end">
              <button className="w-9 h-9 grid place-items-center rounded-lg text-text-3 hover:bg-surface-2" title="More">
                <MoreVertical size={16} />
              </button>
            </div>
          </div>
        ))}
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
          <div className="grid grid-cols-2 gap-3">
            {MODULE_CATALOG.map(({ key, label }) => {
              const isOn = !!selRole.module_access?.[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleModule.mutate({ role: selRole, key })}
                  title={isOn ? 'Click to disable' : 'Click to enable'}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-surface-2 border border-border rounded-lg select-none"
                >
                  <span className="text-[12.5px] font-semibold text-text">{label}</span>
                  <span className={cn('w-8 h-[18px] rounded-full relative transition-colors', isOn ? 'bg-accent' : 'bg-border-2')}>
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
