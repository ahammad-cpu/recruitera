import { useState } from 'react';
import { useProfiles, useRoles, useTeams } from '@/hooks/useUsersData';
import { fmtInt, initials } from '@/lib/format';
import { cn } from '@/lib/cn';

type Tab = 'members' | 'roles' | 'teams';

export default function Users() {
  const [tab, setTab] = useState<Tab>('members');
  const profiles = useProfiles();
  const roles = useRoles();
  const teams = useTeams();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">Users & Permissions</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">Members, role-based access, and teams.</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-3">
        {[
          { k: 'members', label: 'Members', n: profiles.data?.length ?? 0 },
          { k: 'roles', label: 'Roles', n: roles.data?.length ?? 0 },
          { k: 'teams', label: 'Teams', n: teams.data?.length ?? 0 },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as Tab)}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[12.5px] font-semibold border',
              tab === t.k ? 'bg-cg-900 text-white border-cg-900' : 'bg-surface text-text-2 border-border hover:bg-surface-2',
            )}
          >
            {t.label}
            <span className={cn('tnum text-[11px] font-bold px-1.5 py-0.5 rounded-md', tab === t.k ? 'bg-white/20 text-white' : 'bg-surface-2 text-text-3')}>
              {fmtInt(t.n)}
            </span>
          </button>
        ))}
      </div>

      {tab === 'members' && <MembersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'teams' && <TeamsTab />}
    </div>
  );
}

function MembersTab() {
  const { data, isLoading } = useProfiles();
  const { data: roles } = useRoles();
  const { data: teams } = useTeams();
  const roleName = (id: string | null) => roles?.find((r) => r.id === id)?.name ?? '—';
  const teamName = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? '—';

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className="grid grid-cols-[1fr_140px_140px_100px_100px] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3">
        <div>Member</div><div>Role</div><div>Team</div><div className="text-right">Q target</div><div className="text-right">Status</div>
      </div>
      {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {data?.map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_140px_140px_100px_100px] px-4 py-2.5 border-t border-border hover:bg-surface-2 text-[13px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-cg-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {initials(p.full_name || p.email)}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-text truncate">{p.full_name || '—'}</div>
              <div className="text-[11px] text-text-3 truncate">{p.email}</div>
            </div>
          </div>
          <div className="self-center text-[12px] text-text-2 truncate" title={roleName(p.role_id)}>{roleName(p.role_id)}</div>
          <div className="self-center text-[12px] text-text-2 truncate" title={teamName(p.team_id)}>{teamName(p.team_id)}</div>
          <div className="self-center text-right tnum text-[12px] text-text-2">
            {p.quarterly_target_egp ? fmtInt(p.quarterly_target_egp) : '—'}
          </div>
          <div className="self-center text-right">
            <span className={cn(
              'inline-flex h-5 items-center px-2 rounded-full text-[10.5px] font-bold',
              p.active === false ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok',
            )}>
              {p.active === false ? 'Inactive' : 'Active'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RolesTab() {
  const { data, isLoading } = useRoles();

  return (
    <div className="space-y-3">
      {isLoading && <div className="text-[12.5px] text-text-3">Loading…</div>}
      {data?.map((r) => {
        const modules = r.module_access ? Object.entries(r.module_access) : [];
        const enabled = modules.filter(([, v]) => v).length;
        return (
          <div key={r.id} className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[15px] font-bold text-text">{r.name}</div>
              {r.is_system && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">SYSTEM</span>
              )}
              <span className="ml-auto text-[11px] text-text-3 tnum">{enabled}/{modules.length} modules</span>
            </div>
            {r.description && <div className="text-[12.5px] text-text-3 mt-1">{r.description}</div>}
            {modules.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {modules.map(([k, v]) => (
                  <span key={k} className={cn(
                    'text-[10.5px] font-bold px-2 py-0.5 rounded-md border',
                    v ? 'bg-ok-bg text-ok border-ok/30' : 'bg-surface-2 text-text-4 border-border',
                  )}>{k}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="text-[11px] text-text-3 text-center py-2">Toggle editing lands in Phase 5 — writes to `roles.module_access`.</div>
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
