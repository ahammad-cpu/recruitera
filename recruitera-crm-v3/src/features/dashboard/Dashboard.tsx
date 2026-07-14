import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useTargets } from '@/hooks/useTargets';
import { useTasks } from '@/hooks/useTasks';
import { useContractCycles } from '@/hooks/useContractCycles';
import { fmtEgp, fmtInt, toEgp, initials, fmtDate } from '@/lib/format';
import { StagePill } from '@/components/shared/StagePill';

const OPEN = new Set(['mql', 'sql', 'demo', 'proposal']);

export default function Dashboard() {
  const { data: accounts, isLoading } = useAccounts();
  const targets = useTargets();
  const tasks = useTasks();
  const cycles = useContractCycles();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEndT = monthEnd.getTime();
  const daysLeft = Math.max(0, Math.ceil((monthEndT - now.getTime()) / 86400000));
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthStartISO = monthStart.toISOString().slice(0, 10);

  const rows: Account[] = accounts ?? [];

  const pipelineVal = rows
    .filter((a) => OPEN.has((a.stage || '').toLowerCase()))
    .reduce((s, a) => s + toEgp(a.deal_value ?? 0, a.deal_currency), 0);

  const collectedVal = (cycles.data ?? [])
    .filter((c) => c.status === 'active' || !c.status)
    .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  const activePaid = rows.filter(isPaid).length;
  const openLeads = rows.filter((a) => OPEN.has((a.stage || '').toLowerCase())).length;
  const wonRows = rows.filter((a) => a.stage === 'won').length;
  const lostRows = rows.filter((a) => a.stage === 'lost').length;
  const winRate = wonRows + lostRows > 0 ? Math.round((wonRows / (wonRows + lostRows)) * 100) : 0;

  const renewals30 = (cycles.data ?? []).filter((c) => {
    const end = c.renewal_due_date || c.ends_at;
    if (!end) return false;
    const diff = (new Date(end).getTime() - now.getTime()) / 86400000;
    return diff >= -1 && diff <= 30;
  });
  const renewals30Val = renewals30.reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  // Team-wide target for current month
  const teamTarget = useMemo(
    () =>
      (targets.data ?? [])
        .filter((t) => t.period_kind === 'month' && t.period_start === monthStartISO)
        .reduce((s, t) => s + (t.amount_egp || 0), 0),
    [targets.data, monthStartISO],
  );

  const wonThisMonth = (cycles.data ?? [])
    .filter((c) => c.started_at && c.started_at >= monthStartISO && c.started_at <= monthEnd.toISOString().slice(0, 10))
    .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);

  const attain = teamTarget > 0 ? Math.round((wonThisMonth / teamTarget) * 100) : 0;
  const remaining = Math.max(0, teamTarget - wonThisMonth);
  const barPct = Math.min(100, attain);
  const barColor = attain >= 70 ? '#22C55E' : attain >= 40 ? '#B8761A' : '#B83A3A';

  const myCompanies = rows.slice(0, 5);
  const openTasks = (tasks.data ?? []).filter((t) => !t.task_done).slice(0, 5);

  return (
    <div className="px-7 pt-6 pb-14 max-w-[1400px] space-y-5">
      {/* TARGET BANNER */}
      <div className="relative overflow-hidden bg-surface border border-border rounded-2xl shadow-sh1 p-6">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#22C55E] to-[#A8D800]" />
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-3">Team target</span>
          <span className="text-[12px] text-text-3 font-medium">· {monthLabel} · Whole team</span>
          <div className="flex-1" />
          <span
            className="inline-flex items-center h-6 px-2.5 rounded-full text-[10.5px] font-bold"
            style={{
              background: teamTarget ? (attain >= 70 ? '#E5F4EC' : attain >= 40 ? '#FBF1DE' : '#F7E3E3') : '#F2F4F7',
              color: teamTarget ? (attain >= 70 ? '#2F8F5C' : attain >= 40 ? '#B8761A' : '#B83A3A') : '#81878E',
            }}
          >
            {teamTarget ? `${attain}% attained` : 'No target'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_2fr] gap-7 items-center">
          <BannerStat label="Target" value={teamTarget ? fmtEgp(teamTarget) : '—'} hint={monthLabel} />
          <BannerStat label="Won" value={fmtEgp(wonThisMonth)} hint="team · this month" color="#22C55E" />
          <BannerStat label="Remaining" value={teamTarget ? fmtEgp(remaining) : '—'} hint={`${daysLeft} day${daysLeft === 1 ? '' : 's'} left`} muted />
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="flex-1 h-3.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
              </div>
              <span className="tnum text-[16px] font-extrabold" style={{ color: barColor }}>
                {teamTarget ? `${attain}%` : '—'}
              </span>
            </div>
            <div className="flex gap-4 text-[11.5px] font-semibold">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: barColor }} /><span className="text-text-2">Won {fmtEgp(wonThisMonth)}</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-2 border border-border-2" /><span className="text-text-3">Remaining {teamTarget ? fmtEgp(remaining) : '—'}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Pipeline value" value={isLoading ? '…' : fmtEgp(pipelineVal)} sub={`${fmtInt(openLeads)} open · new business`} accent />
        <Kpi label="Collected" value={cycles.isLoading ? '…' : fmtEgp(collectedVal)} sub="active cycles" />
        <Kpi label="Active customers" value={isLoading ? '…' : fmtInt(activePaid)} sub="paying employers" />
        <Kpi label="Renewals 30d" value={cycles.isLoading ? '…' : fmtInt(renewals30.length)} sub={renewals30.length ? `${fmtEgp(renewals30Val)} at risk` : 'no risk'} />
        <Kpi label="Win rate" value={isLoading ? '…' : wonRows + lostRows > 0 ? `${winRate}%` : '—'} sub={wonRows + lostRows > 0 ? `${wonRows + lostRows} closes` : 'no closes yet'} />
      </div>

      {/* 2-COL: My companies + My tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="My companies"
          badge={fmtInt(rows.length)}
          hint={`${openLeads} open`}
          action={<Link to="/companies" className="text-[13px] text-accent-ink font-bold">View all</Link>}
        >
          {isLoading && <div className="p-5 text-[12.5px] text-text-3">Loading…</div>}
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
          badge={openTasks.length ? String(openTasks.length) : '0'}
          badgeAccent="warn"
          action={<Link to="/tasks" className="text-[13px] text-accent-ink font-bold">View all</Link>}
        >
          {tasks.isLoading && <div className="p-5 text-[12.5px] text-text-3">Loading…</div>}
          {!tasks.isLoading && openTasks.length === 0 && (
            <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">Inbox zero.</div>
          )}
          {openTasks.map((t) => {
            const due = t.task_due_date ? new Date(t.task_due_date) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isToday = due && due.getTime() === today.getTime();
            return (
              <div key={t.id} className="flex items-start gap-3.5 px-5 py-3.5 border-t border-border">
                <div className="w-[18px] h-[18px] rounded-md border-2 border-border-2 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-text">{t.title || t.text || '(untitled)'}</div>
                  {t.text && t.title && <div className="text-[12px] text-text-3 mt-0.5">{t.text}</div>}
                </div>
                <span
                  className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-bold"
                  style={{
                    background: isToday ? '#F7E3E3' : '#F2F4F7',
                    color: isToday ? '#B83A3A' : '#81878E',
                  }}
                >
                  {due ? fmtDate(due) : '—'}
                </span>
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

function BannerStat({ label, value, hint, color, muted }: { label: string; value: React.ReactNode; hint?: string; color?: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3 mb-2">{label}</div>
      <div className="tnum text-[30px] font-black tracking-tight" style={{ color: color ?? (muted ? '#575F69' : '#2D3844') }}>{value}</div>
      {hint && <div className="text-[11.5px] text-text-3 font-medium mt-1">{hint}</div>}
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className="relative overflow-hidden bg-surface border border-border rounded-xl p-4 shadow-sh1">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" />}
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
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
