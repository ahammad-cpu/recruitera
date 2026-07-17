import { useMemo } from 'react';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useContractCycles } from '@/hooks/useContractCycles';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useReportsOwner } from '../shared/reportsContext';
import { reconstructWonLostWeekly, reconstructRollingMrr } from '../shared/reportCalc';
import { ReportPanel, ReportKpi, HeaderPill, BarList, type BarRow } from '../shared/ReportUI';

export default function WinLossChurnedReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const cycles = useContractCycles();
  const { ownerId } = useReportsOwner();

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);
  const scopedIds = useMemo(() => new Set(scopedAccts.map((a) => a.id)), [scopedAccts]);
  const scopedDeals = useMemo(() => (deals.data ?? []).filter((d) => !d.is_archived && d.account_id && scopedIds.has(d.account_id)), [deals.data, scopedIds]);
  const scopedCycles = useMemo(() => (cycles.data ?? []).filter((c) => scopedIds.has(c.account_id)), [cycles.data, scopedIds]);

  const wonCount = scopedDeals.filter((d) => d.stage === 'won' || d.stage === 'collected').length;
  const lostCount = scopedDeals.filter((d) => d.stage === 'lost').length;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const arr = scopedAccts.filter(isPaid).reduce((s, a) => s + toEgp(a.deal_value ?? 0, a.deal_currency), 0);

  const now = Date.now();
  const bucket = (endMs: number) => {
    const days = (endMs - now) / 86_400_000;
    if (days < 0) return 'overdue';
    if (days <= 30) return 'd30';
    if (days <= 60) return 'd60';
    if (days <= 90) return 'd90';
    return null;
  };
  const buckets = useMemo(() => {
    const counts = { overdue: 0, d30: 0, d60: 0, d90: 0, active: 0, renewed: 0, churned: 0 };
    scopedCycles.forEach((c) => {
      if (c.status === 'renewed') { counts.renewed++; return; }
      if (c.status === 'churned') { counts.churned++; return; }
      if (!c.ends_at) return;
      const b = bucket(new Date(c.ends_at).getTime());
      if (b) counts[b]++;
      else counts.active++;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedCycles]);

  const lossReasons = useMemo(() => {
    const m = new Map<string, number>();
    scopedDeals.filter((d) => d.stage === 'lost').forEach((d) => {
      const key = d.disqualified_reason || '(no reason)';
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [scopedDeals]);

  const weekly = useMemo(() => reconstructWonLostWeekly(scopedDeals as Parameters<typeof reconstructWonLostWeekly>[0], 8, new Date()), [scopedDeals]);
  const weeklyMax = Math.max(1, ...weekly.flatMap((w) => [w.won, w.lost]));

  const mrr = useMemo(() => reconstructRollingMrr(scopedCycles, 6, new Date()), [scopedCycles]);
  const mrrMax = Math.max(1, ...mrr.map((m) => m.mrr));

  const lossBars: BarRow[] = lossReasons.map((r) => ({
    key: r.reason,
    label: r.reason,
    value: r.count,
    displayValue: fmtInt(r.count),
    rightHint: `${Math.round((r.count / Math.max(1, lostCount)) * 100)}%`,
    fillClass: 'bg-bad',
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ReportKpi
          label="Win rate"
          value={wonCount + lostCount > 0 ? `${winRate}%` : '—'}
          sub={`${wonCount} won · ${lostCount} lost`}
          accent
          tone={winRate >= 60 ? 'ok' : winRate >= 40 ? 'warn' : wonCount + lostCount > 0 ? 'bad' : undefined}
        />
        <ReportKpi label="ARR" value={fmtEgp(arr)} sub="paying customers" tone="ok" />
        <ReportKpi label="Renewed" value={fmtInt(buckets.renewed)} tone="ok" />
        <ReportKpi label="Churned" value={fmtInt(buckets.churned)} tone={buckets.churned > 0 ? 'bad' : undefined} />
      </div>

      <ReportPanel
        title="Renewal pipeline"
        subtitle="All contract cycles in scope"
        headerRight={<HeaderPill tone={buckets.overdue > 0 ? 'bad' : 'muted'}>{fmtInt(buckets.overdue)} overdue</HeaderPill>}
      >
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
          <BucketTile label="Overdue" count={buckets.overdue} tone="bad" />
          <BucketTile label="≤ 30d" count={buckets.d30} tone="warn" />
          <BucketTile label="≤ 60d" count={buckets.d60} tone="warn" />
          <BucketTile label="≤ 90d" count={buckets.d90} tone="info" />
          <BucketTile label="Active" count={buckets.active} tone="ok" />
          <BucketTile label="Renewed" count={buckets.renewed} tone="ok" />
          <BucketTile label="Churned" count={buckets.churned} tone="muted" />
        </div>
      </ReportPanel>

      <ReportPanel
        title="Won vs Lost"
        subtitle="Last 8 weeks — deal value"
        headerRight={<HeaderPill tone="ok">{fmtEgp(weekly.reduce((s, w) => s + w.won, 0))} won</HeaderPill>}
      >
        <div className="flex items-end gap-2 h-[140px]">
          {weekly.map((w) => (
            <div key={w.weekStartISO} className="flex-1 flex flex-col items-center gap-1" title={`Week of ${w.weekStartISO}\nWon: ${fmtEgp(w.won)}\nLost: ${fmtEgp(w.lost)}`}>
              <div className="w-full flex items-end justify-center gap-1" style={{ height: 110 }}>
                <div className="w-1/2 bg-ok rounded-t-md" style={{ height: `${Math.max(2, (w.won / weeklyMax) * 100)}%` }} />
                <div className="w-1/2 bg-bad rounded-t-md" style={{ height: `${Math.max(2, (w.lost / weeklyMax) * 100)}%` }} />
              </div>
              <span className="text-[10px] text-text-3 tnum">{w.weekStartISO.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3 text-[11.5px] font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> Won</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bad" /> Lost</span>
        </div>
      </ReportPanel>

      <ReportPanel
        title="Rolling MRR + churn"
        subtitle="Last 6 months"
      >
        <div className="space-y-4">
          {mrr.map((m) => (
            <div key={m.monthISO}>
              <div className="flex items-baseline gap-3 mb-1.5">
                <div className="text-[13.5px] font-extrabold text-text w-20">{m.monthISO.slice(0, 7)}</div>
                <div className="flex-1" />
                <div className="tnum text-[14px] font-black text-text">{fmtEgp(m.mrr)}</div>
                <div className={cn('tnum text-[11.5px] font-bold w-24 text-right', m.churnRate > 5 ? 'text-bad' : 'text-text-3')}>
                  {Math.round(m.churnRate)}% churn
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(2, (m.mrr / mrrMax) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </ReportPanel>

      <ReportPanel
        title="Loss reasons"
        subtitle="Why deals were lost"
        headerRight={<HeaderPill tone={lostCount > 0 ? 'bad' : 'muted'}>{fmtInt(lostCount)} lost</HeaderPill>}
      >
        <BarList rows={lossBars} variant="raw" emptyText="No lost deals in scope." />
      </ReportPanel>
    </div>
  );
}

function BucketTile({ label, count, tone }: { label: string; count: number; tone: 'bad' | 'warn' | 'info' | 'ok' | 'muted' }) {
  const bgClass = tone === 'bad' ? 'bg-bad-bg' : tone === 'warn' ? 'bg-warn-bg' : tone === 'info' ? 'bg-info-bg' : tone === 'ok' ? 'bg-ok-bg' : 'bg-surface-2';
  const textClass = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : tone === 'ok' ? 'text-ok' : 'text-text-3';
  return (
    <div className={cn('rounded-xl p-3 text-center', bgClass)}>
      <div className={cn('tnum text-[24px] font-black leading-none', textClass)}>{fmtInt(count)}</div>
      <div className="text-[10px] text-text-3 uppercase tracking-widest mt-1.5 font-bold">{label}</div>
    </div>
  );
}
