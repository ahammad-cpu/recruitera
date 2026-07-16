import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useTargets } from '@/hooks/useTargets';
import { useTasks } from '@/hooks/useTasks';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useMe } from '@/hooks/useMe';
import { useProfiles } from '@/hooks/useUsersData';
import { fmtEgp, fmtInt, toEgp, initials, fmtDate } from '@/lib/format';
import { StagePill } from '@/components/shared/StagePill';
import { Sparkline } from '@/components/shared/Sparkline';
import { cn } from '@/lib/cn';

const OPEN = new Set(['mql', 'sql', 'demo', 'proposal']);

export default function Dashboard() {
  const { data: accounts, isLoading } = useAccounts();
  const targets = useTargets();
  const tasks = useTasks();
  const cycles = useContractCycles();
  const me = useMe();
  const profiles = useProfiles();
  const [ownerId, setOwnerId] = useState<string>('');

  // default owner = signed-in user, once me loads
  useEffect(() => {
    if (!ownerId && me.data?.id) setOwnerId(me.data.id);
  }, [me.data?.id, ownerId]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEndT = monthEnd.getTime();
  const daysLeft = Math.max(0, Math.ceil((monthEndT - now.getTime()) / 86400000));
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const meId = me.data?.id;
  const scopeId = ownerId || meId;
  const isTeam = scopeId === 'all';

  const rows: Account[] = accounts ?? [];
  const myAccts = isTeam ? rows : scopeId ? rows.filter((a) => a.owner_id === scopeId) : rows;

  const pipelineVal = myAccts
    .filter((a) => OPEN.has((a.stage || '').toLowerCase()))
    .reduce((s, a) => s + toEgp(a.deal_value ?? 0, a.deal_currency), 0);

  const collectedVal = (cycles.data ?? [])
    .filter((c) => c.status === 'active' || !c.status)
    .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  const activePaid = myAccts.filter(isPaid).length;
  const openLeads = myAccts.filter((a) => OPEN.has((a.stage || '').toLowerCase())).length;
  const wonRows = myAccts.filter((a) => a.stage === 'won').length;
  const lostRows = myAccts.filter((a) => a.stage === 'lost').length;
  const winRate = wonRows + lostRows > 0 ? Math.round((wonRows / (wonRows + lostRows)) * 100) : 0;

  const renewals30 = (cycles.data ?? []).filter((c) => {
    const end = c.renewal_due_date || c.ends_at;
    if (!end) return false;
    const diff = (new Date(end).getTime() - now.getTime()) / 86400000;
    return diff >= -1 && diff <= 30;
  });
  const renewals30Val = renewals30.reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  const myTarget = useMemo(() => {
    const list = targets.data ?? [];
    if (isTeam) {
      return list
        .filter((t) => t.period_kind === 'month' && t.period_start === monthStartISO)
        .reduce((s, t) => s + (t.amount_egp || 0), 0);
    }
    if (!scopeId) return 0;
    const row = list.find(
      (t) => t.owner_kind === 'user' && t.owner_id === scopeId && t.period_kind === 'month' && t.period_start === monthStartISO,
    );
    return row?.amount_egp ?? 0;
  }, [targets.data, scopeId, isTeam, monthStartISO]);

  const wonThisMonth = (cycles.data ?? [])
    .filter((c) => c.started_at && c.started_at >= monthStartISO && c.started_at <= monthEnd.toISOString().slice(0, 10))
    .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  const attain = myTarget > 0 ? Math.round((wonThisMonth / myTarget) * 100) : 0;
  const remaining = Math.max(0, myTarget - wonThisMonth);
  const barPct = Math.min(100, attain);
  // Theme-token classes, not raw hex — written as full literal class names
  // (not template-concatenated) so Tailwind's content scanner can see them;
  // a `bg-${tier}` string wouldn't survive a production build's CSS purge.
  const barBgClass = attain >= 70 ? 'bg-ok' : attain >= 40 ? 'bg-warn' : 'bg-bad';
  const barTextClass = attain >= 70 ? 'text-ok' : attain >= 40 ? 'text-warn' : 'text-bad';
  const barBadgeClass = !myTarget ? 'bg-surface-2 text-text-3'
    : attain >= 70 ? 'bg-ok-bg text-ok'
    : attain >= 40 ? 'bg-warn-bg text-warn'
    : 'bg-bad-bg text-bad';

  const myCompanies = myAccts.slice(0, 5);
  const myCoOpen = myAccts.filter((a) => OPEN.has((a.stage || '').toLowerCase())).length;
  const scopedAcctIds = new Set(myAccts.map((a) => a.id));
  const openTasksAll = (tasks.data ?? []).filter((t) => {
    if (t.task_done) return false;
    if (isTeam) return true;
    // Task is in scope if assigned to the picked owner OR the task's account
    // belongs to the picked owner.
    if (t.assigned_to && t.assigned_to === scopeId) return true;
    if (t.account_id && scopedAcctIds.has(t.account_id)) return true;
    return false;
  });
  const myOpenTasks = openTasksAll.slice(0, 5);
  const isAdmin = (me.data?.role || '').toLowerCase() === 'admin';
  const currentOwner = isTeam
    ? { full_name: 'Whole team', id: 'all' }
    : (profiles.data ?? []).find((p) => p.id === scopeId) ?? me.data;
  const displayName = currentOwner?.full_name || 'You';
  const bannerLabel = isTeam ? 'Team target' : 'My target';

  return (
    <div className="px-7 pt-6 pb-14 max-w-[1400px] space-y-5">
      {/* MY TARGET BANNER */}
      <div className="relative overflow-hidden bg-surface border border-border rounded-2xl shadow-sh1 p-6">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ok to-accent-strong" />
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{bannerLabel}</span>
          <span className="text-[12px] text-text-3 font-medium">· {monthLabel} · {displayName}</span>
          <div className="flex-1" />
          {isAdmin && (
            <select
              value={scopeId ?? ''}
              onChange={(e) => setOwnerId(e.target.value)}
              className="h-8 pl-3 pr-8 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text outline-none cursor-pointer"
              title="Filter dashboard by owner (admin)"
            >
              <option value="all">Whole team</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
              ))}
            </select>
          )}
          <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[10.5px] font-bold', barBadgeClass)}>
            {myTarget ? `${attain}% attained` : 'No target'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_2fr] gap-7 items-center">
          <BannerStat label="Target" value={myTarget ? fmtEgp(myTarget) : '—'} hint={monthLabel} />
          <BannerStat label="Won" value={fmtEgp(wonThisMonth)} hint="own book · this month" colorClass="text-ok" />
          <BannerStat label="Remaining" value={myTarget ? fmtEgp(remaining) : '—'} hint={`${daysLeft} day${daysLeft === 1 ? '' : 's'} left`} muted />
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="flex-1 h-3.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={cn('h-full rounded-full', barBgClass)} style={{ width: `${barPct}%` }} />
              </div>
              <span className={cn('tnum text-[16px] font-extrabold', barTextClass)}>
                {myTarget ? `${attain}%` : '—'}
              </span>
            </div>
            <div className="flex gap-4 text-[11.5px] font-semibold">
              <span className="flex items-center gap-1.5"><span className={cn('w-2.5 h-2.5 rounded-sm', barBgClass)} /><span className="text-text-2">Won {fmtEgp(wonThisMonth)}</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-2 border border-border-2" /><span className="text-text-3">Remaining {myTarget ? fmtEgp(remaining) : '—'}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI STRIP with sparklines */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Pipeline value" value={isLoading ? '…' : fmtEgp(pipelineVal)} sub={`${fmtInt(openLeads)} open · new business`} accent seed={7} />
        <Kpi label="Collected" value={cycles.isLoading ? '…' : fmtEgp(collectedVal)} sub="active cycles" seed={10} />
        <Kpi label="Active customers" value={isLoading ? '…' : fmtInt(activePaid)} sub="paying employers" seed={13} />
        <Kpi label="Renewals 30d" value={cycles.isLoading ? '…' : fmtInt(renewals30.length)} sub={renewals30.length ? `${fmtEgp(renewals30Val)} at risk` : 'no risk'} seed={16} />
        <Kpi label="Win rate" value={isLoading ? '…' : wonRows + lostRows > 0 ? `${winRate}%` : '—'} sub={wonRows + lostRows > 0 ? `${wonRows + lostRows} closes` : 'no closes yet'} seed={19} />
      </div>

      {/* 2-COL: My companies + My tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="My companies"
          badge={fmtInt(myAccts.length)}
          hint={`${myCoOpen} open`}
          action={<Link to="/companies" className="text-[13px] text-accent-ink font-bold">View all</Link>}
        >
          {isLoading && <div className="p-5 text-[12.5px] text-text-3">Loading…</div>}
          {!isLoading && myCompanies.length === 0 && (
            <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">No companies assigned to you yet.</div>
          )}
          {!isLoading && myCompanies.map((a) => (
            <Link
              key={a.id}
              to={`/companies/${a.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 border-t border-border hover:bg-surface-2 transition-colors"
            >
              <div className="w-[34px] h-[34px] rounded-lg bg-cg-800 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {initials(a.name || a.domain)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-text truncate">{a.name || a.domain || '—'}</div>
                <div className="text-[12px] text-text-3 mt-0.5 truncate">{a.domain || a.am_mail || '—'}</div>
              </div>
              <StagePill stage={a.stage} />
              <div className="tnum text-[14px] font-bold text-text min-w-[80px] text-right">
                {a.deal_value ? fmtEgp(toEgp(a.deal_value, a.deal_currency)) : '—'}
              </div>
            </Link>
          ))}
        </Panel>

        <Panel
          title="My tasks"
          badge={openTasksAll.length ? String(openTasksAll.length) : '0'}
          badgeAccent="warn"
          action={<Link to="/tasks" className="text-[13px] text-accent-ink font-bold">View all</Link>}
        >
          {tasks.isLoading && <div className="p-5 text-[12.5px] text-text-3">Loading…</div>}
          {!tasks.isLoading && myOpenTasks.length === 0 && (
            <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">Inbox zero.</div>
          )}
          {myOpenTasks.map((t) => {
            const acct = t.account_id ? rows.find((a) => a.id === t.account_id) : null;
            const due = t.task_due_date ? new Date(t.task_due_date) : null;
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const overdue = due != null && due.getTime() < today.getTime();
            const isToday = due != null && due.getTime() === today.getTime();
            const chipLabel = overdue ? 'Overdue' : isToday ? 'Today' : due ? fmtDate(due) : '—';
            const chipClass = overdue || isToday ? 'bg-bad-bg text-bad' : 'bg-surface-2 text-text-3';
            return (
              <div key={t.id} className="flex items-start gap-3.5 px-5 py-3.5 border-t border-border">
                <div className="w-[18px] h-[18px] rounded-md border-2 border-border-2 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-text">{t.title || t.text || '(untitled)'}</div>
                  <div className="text-[12px] text-text-3 mt-0.5 truncate">
                    {acct ? (acct.name || acct.domain) : (t.text && t.title ? t.text : 'No company')}
                  </div>
                </div>
                <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-bold', chipClass)}>
                  {chipLabel}
                </span>
              </div>
            );
          })}
        </Panel>
      </div>

      {/* Today's calls & meetings — pulled from activities */}
      <TodayMeetings />
    </div>
  );
}

function TodayMeetings() {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <Phone size={14} className="text-text-2" />
        <span className="text-[15px] font-extrabold tracking-tight">Today's calls &amp; meetings</span>
        <span className="tnum inline-flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full bg-accent-soft text-accent-ink text-[12px] font-bold">0</span>
        <div className="flex-1" />
        <div className="flex gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
          {['All', 'Upcoming', 'Done'].map((k, i) => (
            <div key={k} className={'px-2.5 py-1 rounded text-[12px] font-semibold ' + (i === 0 ? 'bg-surface text-text shadow-sh1' : 'text-text-3')}>{k}</div>
          ))}
        </div>
      </div>
      <div className="p-10 text-center text-[13px] text-text-3 font-semibold">
        Nothing on the calendar today. Log a meeting from a company profile to populate this.
      </div>
    </div>
  );
}

function BannerStat({ label, value, hint, colorClass, muted }: { label: string; value: React.ReactNode; hint?: string; colorClass?: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3 mb-2">{label}</div>
      <div className={cn('tnum text-[30px] font-black tracking-tight', colorClass ?? (muted ? 'text-text-2' : 'text-text'))}>{value}</div>
      {hint && <div className="text-[11.5px] text-text-3 font-medium mt-1">{hint}</div>}
    </div>
  );
}

function Kpi({ label, value, sub, accent, seed }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean; seed: number }) {
  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-xl p-4 shadow-sh1">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" />}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
      <Sparkline seed={seed} accent={accent} />
    </div>
  );
}

function Panel({
  title, badge, badgeAccent, hint, action, children,
}: {
  title: string;
  badge?: string;
  badgeAccent?: 'warn';
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {badge && (
          <span
            className={
              'tnum inline-flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full border text-[12px] font-bold ' +
              (badgeAccent === 'warn' ? 'bg-warn-bg border-warn/30 text-warn' : 'bg-surface-2 border-border text-text')
            }
          >
            {badge}
          </span>
        )}
        {hint && <span className="text-[13px] text-text-3 font-medium">{hint}</span>}
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}
