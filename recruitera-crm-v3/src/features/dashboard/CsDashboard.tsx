import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useTargets } from '@/hooks/useTargets';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useRenewalBoard } from '@/hooks/useRenewals';
import { useMe } from '@/hooks/useMe';
import { useProfiles } from '@/hooks/useUsersData';
import { fmtEgp, fmtInt, initials, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { BannerStat, Kpi, Panel } from './shared';

/**
 * Renewal-pipeline KPIs (target/renewed/rate/churn/upcoming/expiring) are
 * real, computed from contract_cycles via the same bucket logic as the
 * Renewal board. Health Score and Onboarding sections have no backing data
 * yet — those need a scoring engine and an onboarding-workflow schema
 * (separate follow-up phases) — so they're shown as explicit "Coming soon"
 * panels rather than fabricated numbers.
 */
export default function CsDashboard() {
  const { data: accounts, isLoading } = useAccounts();
  const targets = useTargets();
  const cycles = useContractCycles();
  const board = useRenewalBoard();
  const me = useMe();
  const profiles = useProfiles();
  const [ownerId, setOwnerId] = useState<string>('');

  useEffect(() => {
    if (!ownerId && me.data?.id) setOwnerId(me.data.id);
  }, [me.data?.id, ownerId]);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const monthStartISO = monthStart.toISOString().slice(0, 10);
  const meId = me.data?.id;
  const scopeId = ownerId || meId;
  const isTeam = scopeId === 'all';
  const isAdmin = (me.data?.role || '').toLowerCase() === 'admin';

  const rows: Account[] = accounts ?? [];
  const scopedAcctIds = useMemo(() => {
    if (isTeam) return null;
    const ids = new Set(rows.filter((a) => a.owner_id === scopeId).map((a) => a.id));
    return ids;
  }, [rows, scopeId, isTeam]);

  const myRenewalRows = useMemo(
    () => board.rows.filter((r) => isTeam || scopedAcctIds?.has(r.account.id)),
    [board.rows, isTeam, scopedAcctIds],
  );

  const upcoming = myRenewalRows
    .filter((r) => r.bucket === 'd90' || r.bucket === 'd60' || r.bucket === 'd30')
    .sort((a, b) => new Date(a.cycle.ends_at || 0).getTime() - new Date(b.cycle.ends_at || 0).getTime());
  const expiring60 = myRenewalRows.filter((r) => r.bucket === 'd60' || r.bucket === 'd30');
  const renewedRows = myRenewalRows.filter((r) => r.bucket === 'renewed');
  const churnedRows = myRenewalRows.filter((r) => r.bucket === 'churned');
  const overdueRows = myRenewalRows.filter((r) => r.bucket === 'overdue');
  const decidedCount = renewedRows.length + churnedRows.length;
  const renewalRate = decidedCount > 0 ? Math.round((renewedRows.length / decidedCount) * 100) : 0;
  const churnRate = decidedCount > 0 ? Math.round((churnedRows.length / decidedCount) * 100) : 0;
  const renewedValue = renewedRows.reduce((s, r) => s + r.value, 0);

  const renewalTarget = useMemo(() => {
    const list = targets.data ?? [];
    if (isTeam) {
      return list
        .filter((t) => t.category === 'renewal' && t.period_kind === 'month' && t.period_start === monthStartISO)
        .reduce((s, t) => s + (t.amount_egp || 0), 0);
    }
    if (!scopeId) return 0;
    const row = list.find(
      (t) => t.category === 'renewal' && t.owner_kind === 'user' && t.owner_id === scopeId
        && t.period_kind === 'month' && t.period_start === monthStartISO,
    );
    return row?.amount_egp ?? 0;
  }, [targets.data, scopeId, isTeam, monthStartISO]);

  const attain = renewalTarget > 0 ? Math.round((renewedValue / renewalTarget) * 100) : 0;
  const remaining = Math.max(0, renewalTarget - renewedValue);
  const barPct = Math.min(100, attain);
  const barBgClass = attain >= 70 ? 'bg-ok' : attain >= 40 ? 'bg-warn' : 'bg-bad';
  const barTextClass = attain >= 70 ? 'text-ok' : attain >= 40 ? 'text-warn' : 'text-bad';
  const barBadgeClass = !renewalTarget ? 'bg-surface-2 text-text-3'
    : attain >= 70 ? 'bg-ok-bg text-ok'
    : attain >= 40 ? 'bg-warn-bg text-warn'
    : 'bg-bad-bg text-bad';

  const currentOwner = isTeam
    ? { full_name: 'Whole team', id: 'all' }
    : (profiles.data ?? []).find((p) => p.id === scopeId) ?? me.data;
  const displayName = currentOwner?.full_name || 'You';

  return (
    <div className="px-7 pt-6 pb-14 max-w-[1400px] space-y-5">
      {/* RENEWAL TARGET BANNER */}
      <div className="relative overflow-hidden bg-surface border border-border rounded-2xl shadow-sh1 p-6">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ok to-accent-strong" />
        <div className="flex items-center gap-2 flex-wrap mb-5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">
            {isTeam ? 'Team renewal target' : 'My renewal target'}
          </span>
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
            {renewalTarget ? `${attain}% attained` : 'No target'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_2fr] gap-7 items-center">
          <BannerStat label="Renewal target" value={renewalTarget ? fmtEgp(renewalTarget) : '—'} hint={monthLabel} />
          <BannerStat label="Renewed" value={fmtEgp(renewedValue)} hint={`${fmtInt(renewedRows.length)} companies`} colorClass="text-ok" />
          <BannerStat label="Remaining" value={renewalTarget ? fmtEgp(remaining) : '—'} hint="to hit target" muted />
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="flex-1 h-3.5 rounded-full bg-surface-2 overflow-hidden">
                <div className={cn('h-full rounded-full', barBgClass)} style={{ width: `${barPct}%` }} />
              </div>
              <span className={cn('tnum text-[16px] font-extrabold', barTextClass)}>
                {renewalTarget ? `${attain}%` : '—'}
              </span>
            </div>
            <div className="flex gap-4 text-[11.5px] font-semibold">
              <span className="flex items-center gap-1.5"><span className={cn('w-2.5 h-2.5 rounded-sm', barBgClass)} /><span className="text-text-2">Renewed {fmtEgp(renewedValue)}</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-surface-2 border border-border-2" /><span className="text-text-3">Remaining {renewalTarget ? fmtEgp(remaining) : '—'}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Kpi label="Renewal rate" value={isLoading ? '…' : decidedCount ? `${renewalRate}%` : '—'} sub={decidedCount ? `${decidedCount} decided` : 'no closes yet'} accent seed={3} />
        <Kpi label="Churn rate" value={isLoading ? '…' : decidedCount ? `${churnRate}%` : '—'} sub={churnedRows.length ? `${churnedRows.length} churned` : 'none churned'} seed={9} />
        <Kpi label="Upcoming renewals" value={isLoading ? '…' : fmtInt(upcoming.length)} sub="next 90 days" seed={14} />
        <Kpi label="Expiring within 60d" value={isLoading ? '…' : fmtInt(expiring60.length)} sub={overdueRows.length ? `+${overdueRows.length} overdue` : 'none overdue'} seed={21} />
      </div>

      {/* UPCOMING RENEWALS */}
      <Panel
        title="Upcoming Renewals"
        badge={fmtInt(upcoming.length)}
        action={<Link to="/renewal" className="text-[13px] text-accent-ink font-bold">View renewal board</Link>}
      >
        {isLoading && <div className="p-5 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && upcoming.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">Nothing expiring in the next 90 days.</div>
        )}
        {upcoming.slice(0, 8).map((r) => {
          const owner = (profiles.data ?? []).find((p) => p.id === r.account.owner_id);
          const days = Math.ceil((new Date(r.cycle.ends_at || 0).getTime() - now.getTime()) / 86400000);
          const urgent = days <= 30;
          return (
            <Link
              key={r.account.id}
              to={`/companies/${r.account.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 border-t border-border hover:bg-surface-2 transition-colors"
            >
              <div className="w-[34px] h-[34px] rounded-lg bg-cg-800 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {initials(r.account.name || r.account.domain)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-text truncate">{r.account.name || r.account.domain || '—'}</div>
                <div className="text-[12px] text-text-3 mt-0.5 truncate">{owner?.full_name || owner?.email || '—'}</div>
              </div>
              <div className="tnum text-[13px] font-bold text-text min-w-[80px] text-right">{fmtEgp(r.value)}</div>
              <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-bold', urgent ? 'bg-bad-bg text-bad' : 'bg-surface-2 text-text-3')}>
                {days <= 0 ? 'Expired' : `${days}d left`}
              </span>
            </Link>
          );
        })}
      </Panel>

      {/* HEALTH SCORE + ONBOARDING — not yet backed by real data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ComingSoonPanel
          title="Company Health Score"
          hint="Needs a scoring engine (usage, support, payment, CSAT)"
        />
        <ComingSoonPanel
          title="Onboarding Progress"
          hint="Needs the 10-day onboarding workflow + tasks schema"
        />
      </div>
    </div>
  );
}

function ComingSoonPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
      </div>
      <div className="p-8 text-center border-t border-border flex flex-col items-center gap-2">
        <AlertTriangle size={18} className="text-text-3" />
        <div className="text-[12.5px] font-semibold text-text-2">Coming soon</div>
        <div className="text-[11.5px] text-text-3 max-w-xs">{hint}</div>
      </div>
    </div>
  );
}
