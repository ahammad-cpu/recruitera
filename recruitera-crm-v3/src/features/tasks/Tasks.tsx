import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSquare, Square } from 'lucide-react';
import { useTasks, type Task } from '@/hooks/useTasks';
import { useAccounts } from '@/hooks/useAccounts';
import { useProfiles, useRoles, type Profile } from '@/hooks/useUsersData';
import { useMe } from '@/hooks/useMe';
import { useToggleTaskDone } from '@/hooks/useActivityMutations';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { cn } from '@/lib/cn';

const DAY = 86_400_000;

type TabKey = 'all' | 'overdue' | 'past3';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All tasks' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'past3', label: 'Past 3 days' },
];

type RangeKey = 'all' | 'today' | 'week' | 'nextweek' | 'later' | 'done';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'nextweek', label: 'Next week' },
  { key: 'later', label: 'Later' },
  { key: 'done', label: 'Done' },
];

type TaskSource = 'onboarding' | 'won_followup' | 'automation' | 'manual';

function taskSource(task: Task): TaskSource {
  if (task.onboarding_plan_id) return 'onboarding';
  const t = (task.title || '').toLowerCase();
  if (!task.author_id && (t.includes('invoice') || t.includes('payment'))) return 'won_followup';
  if (!task.author_id) return 'automation';
  return 'manual';
}

const SOURCE_PILL: Record<TaskSource, { label: string; cls: string }> = {
  onboarding:   { label: 'Onboarding',    cls: 'bg-ok-bg text-ok' },
  won_followup: { label: 'Won follow-up', cls: 'bg-info-bg text-info' },
  automation:   { label: 'Automation',    cls: 'bg-warn-bg text-warn' },
  manual:       { label: 'Manual',        cls: 'bg-surface-2 text-text-2 border border-border' },
};

function fmtWhen(iso: string | null, now: number): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayMs = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  const diffDays = Math.round((dayMs - todayMs) / DAY);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays < 0) return 'Overdue';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${date} · ${time}`;
}

export default function Tasks() {
  const { data, isLoading, error } = useTasks();
  const accounts = useAccounts();
  const profiles = useProfiles();
  const roles = useRoles();
  const me = useMe();
  const toggle = useToggleTaskDone();
  const [tab, setTab] = useState<TabKey>('all');
  const [range, setRange] = useState<RangeKey>('all');

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    (accounts.data ?? []).forEach((a) => m.set(a.id, a.name || a.domain || '—'));
    return m;
  }, [accounts.data]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    (profiles.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles.data]);

  // Admins and Team Leads see every task (Team Leads: their own + everyone
  // who reports to them — team_id isn't populated yet, reports_to is the
  // real hierarchy signal already used for escalation). Everyone else only
  // sees tasks they're assigned to or created themselves.
  const myId = me.data?.id;
  const myRole = (roles.data ?? []).find((r) => r.id === me.data?.role_id);
  const isAdmin = myRole?.type === 'admin' || me.data?.role === 'admin';
  const isTeamLead = myRole?.type === 'team_lead';
  const teamIds = useMemo(() => {
    if (!isTeamLead || !myId) return null;
    const ids = new Set<string>([myId]);
    (profiles.data ?? []).forEach((p) => { if (p.reports_to === myId) ids.add(p.id); });
    return ids;
  }, [isTeamLead, myId, profiles.data]);

  const roleScoped = useMemo(() => {
    const all = data ?? [];
    if (isAdmin || !myId) return all;
    if (isTeamLead && teamIds) {
      return all.filter((t) => (t.assigned_to && teamIds.has(t.assigned_to)) || (t.author_id && teamIds.has(t.author_id)));
    }
    return all.filter((t) => t.assigned_to === myId || t.author_id === myId);
  }, [data, isAdmin, isTeamLead, teamIds, myId]);

  // Only worth showing a person filter when the role-scoped set can contain
  // more than one person's tasks (admins, team leads) — a plain member's
  // list is already just their own.
  const [personId, setPersonId] = useState('all');
  const responsibleOptions = useMemo(() => {
    const ids = new Set<string>();
    roleScoped.forEach((t) => { if (t.assigned_to) ids.add(t.assigned_to); });
    return Array.from(ids)
      .map((id) => profileById.get(id))
      .filter((p): p is Profile => !!p)
      .sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
  }, [roleScoped, profileById]);
  const showPersonFilter = isAdmin || isTeamLead;

  const rows = useMemo(() => {
    if (personId === 'all') return roleScoped;
    return roleScoped.filter((t) => t.assigned_to === personId);
  }, [roleScoped, personId]);
  const now = Date.now();

  const byTab = useMemo(() => {
    if (tab === 'overdue') {
      return rows.filter((t) => !t.task_done && t.task_due_date && new Date(t.task_due_date).getTime() < now);
    }
    if (tab === 'past3') {
      return rows.filter((t) => {
        if (!t.task_due_date) return false;
        const d = new Date(t.task_due_date).getTime();
        return d < now && d >= now - 3 * DAY;
      });
    }
    return rows;
  }, [rows, tab, now]);

  const startOfToday = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);
  const endOfToday = startOfToday + DAY;
  const endOfWeek = startOfToday + 7 * DAY;
  const endOfNextWeek = startOfToday + 14 * DAY;

  const filtered = useMemo(() => {
    if (range === 'done') return byTab.filter((t) => t.task_done);
    const open = byTab.filter((t) => !t.task_done);
    if (range === 'all') return open;
    return open.filter((t) => {
      if (!t.task_due_date) return range === 'later';
      const d = new Date(t.task_due_date).getTime();
      if (range === 'today') return d >= startOfToday && d < endOfToday;
      if (range === 'week') return d >= startOfToday && d < endOfWeek;
      if (range === 'nextweek') return d >= endOfWeek && d < endOfNextWeek;
      if (range === 'later') return d >= endOfNextWeek;
      return true;
    });
  }, [byTab, range, startOfToday, endOfToday, endOfWeek, endOfNextWeek]);

  const overdueCount = useMemo(
    () => rows.filter((t) => !t.task_done && t.task_due_date && new Date(t.task_due_date).getTime() < now).length,
    [rows, now],
  );
  const past3Count = useMemo(
    () => rows.filter((t) => {
      if (!t.task_due_date) return false;
      const d = new Date(t.task_due_date).getTime();
      return d < now && d >= now - 3 * DAY;
    }).length,
    [rows, now],
  );

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">Tasks</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          {isLoading ? 'Loading…' : `${rows.filter((t) => !t.task_done).length} open · ${rows.filter((t) => t.task_done).length} done`}
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="flex items-center gap-0 px-5 border-b border-border">
          {TABS.map((t) => {
            const count = t.key === 'all' ? rows.length : t.key === 'overdue' ? overdueCount : past3Count;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'text-[13px] font-bold py-3.5 mr-5 border-b-2 -mb-px transition-colors',
                  active ? 'text-text border-cg-900' : 'text-text-3 border-transparent hover:text-text-2',
                )}
              >
                {t.label}{t.key === 'all' && ` ${count}`}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-wrap">
          {showPersonFilter && (
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="h-8 pl-3 pr-8 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text outline-none cursor-pointer"
            >
              <option value="all">Everyone</option>
              {responsibleOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          )}
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  'h-8 px-3.5 rounded-lg text-[13px] font-semibold border transition-colors',
                  active ? 'bg-cg-900 text-white border-cg-900' : 'bg-surface text-text-2 border-border hover:bg-surface-2',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto sc">
          <table className="w-full text-left" style={{ minWidth: 900 }}>
            <thead>
              <tr className="bg-surface-2 text-[10.5px] font-bold uppercase tracking-wider text-text-3">
                <Th>Date / time</Th>
                <Th>Company</Th>
                <Th>Type</Th>
                <Th>Description</Th>
                <Th>Responsible</Th>
                <Th>Created by</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="p-4 text-[12.5px] text-text-3">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-[12.5px] text-text-3">No tasks here.</td></tr>
              )}
              {!isLoading && filtered.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  now={now}
                  companyName={t.account_id ? accountNameById.get(t.account_id) : undefined}
                  responsible={profileById.get(t.assigned_to || t.author_id || '')}
                  author={profileById.get(t.author_id || '')}
                  onToggle={(done) => toggle.mutate({ id: t.id, done })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2.5 whitespace-nowrap">{children}</th>;
}

function TaskRow({
  task, now, companyName, responsible, author, onToggle,
}: {
  task: Task;
  now: number;
  companyName: string | undefined;
  responsible: Profile | undefined;
  author: Profile | undefined;
  onToggle: (done: boolean) => void;
}) {
  return (
    <tr className={cn('border-t border-border hover:bg-surface-2/60 transition-colors', task.task_done && 'opacity-50')}>
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(!task.task_done)}
            title={task.task_done ? 'Mark open' : 'Mark done'}
            className="hover:opacity-70 flex-shrink-0"
          >
            {task.task_done ? <CheckSquare size={15} className="text-ok" /> : <Square size={15} className="text-text-3" />}
          </button>
          <span className="tnum text-[12px] text-text-3 whitespace-nowrap">{fmtWhen(task.task_due_date, now)}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        {task.account_id ? (
          <Link to={`/companies/${task.account_id}`} className="text-[13px] font-bold text-accent-ink hover:underline">
            {companyName || '—'}
          </Link>
        ) : (
          <span className="text-[13px] text-text-3">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-middle">
        {(() => {
          const s = SOURCE_PILL[taskSource(task)];
          return (
            <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-black tracking-wide', s.cls)}>
              {s.label}
            </span>
          );
        })()}
      </td>
      <td className="px-4 py-3 align-middle text-[13px] text-text max-w-[320px] truncate" title={task.title || task.text || ''}>
        {task.title || task.text || '(untitled)'}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center gap-2">
          <OwnerAvatar profile={responsible} size={24} />
          <span className="text-[12.5px] font-semibold text-text">{responsible?.full_name || responsible?.email || '—'}</span>
        </div>
      </td>
      <td className="px-4 py-3 align-middle text-[12.5px] text-text-2">{author?.full_name || author?.email || '—'}</td>
    </tr>
  );
}
