import { useMemo } from 'react';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useContractCycles } from '@/hooks/useContractCycles';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { useReportsOwner } from '../shared/reportsContext';
import { reconstructWonLostWeekly, reconstructRollingMrr } from '../shared/reportCalc';

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

  // Renewal buckets — reuse existing lib/renewal semantics inline
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

  // Loss reasons — full
  const lossReasons = useMemo(() => {
    const m = new Map<string, number>();
    scopedDeals.filter((d) => d.stage === 'lost').forEach((d) => {
      const key = d.disqualified_reason || '(no reason)';
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [scopedDeals]);
  const maxReason = Math.max(1, ...lossReasons.map((r) => r.count));

  // Won-vs-Lost weekly (8 weeks)
  const weekly = useMemo(() => reconstructWonLostWeekly(scopedDeals as Parameters<typeof reconstructWonLostWeekly>[0], 8, new Date()), [scopedDeals]);
  const weeklyMax = Math.max(1, ...weekly.flatMap((w) => [w.won, w.lost]));

  // MRR + churn (6 months)
  const mrr = useMemo(() => reconstructRollingMrr(scopedCycles, 6, new Date()), [scopedCycles]);
  const mrrMax = Math.max(1, ...mrr.map((m) => m.mrr));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Win rate" value={wonCount + lostCount > 0 ? `${winRate}%` : '—'} sub={`${wonCount} won · ${lostCount} lost`} />
        <Kpi label="ARR" value={fmtEgp(arr)} sub="paying customers" />
        <Kpi label="Renewed" value={fmtInt(buckets.renewed)} />
        <Kpi label="Churned" value={fmtInt(buckets.churned)} />
      </div>

      <Panel title="Renewal pipeline" hint="Buckets across all scoped cycles">
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3 p-5">
          <BucketTile label="Overdue" count={buckets.overdue} color="text-bad" />
          <BucketTile label="≤ 30d" count={buckets.d30} color="text-warn" />
          <BucketTile label="≤ 60d" count={buckets.d60} color="text-warn" />
          <BucketTile label="≤ 90d" count={buckets.d90} color="text-info" />
          <BucketTile label="Active" count={buckets.active} color="text-ok" />
          <BucketTile label="Renewed" count={buckets.renewed} color="text-ok" />
          <BucketTile label="Churned" count={buckets.churned} color="text-text-3" />
        </div>
      </Panel>

      <Panel title="Won vs Lost — last 8 weeks">
        <div className="p-5 border-t border-border">
          <div className="flex items-end gap-2 h-[120px]">
            {weekly.map((w) => (
              <div key={w.weekStartISO} className="flex-1 flex flex-col items-center gap-0.5" title={`${w.weekStartISO}\nWon: ${fmtEgp(w.won)}\nLost: ${fmtEgp(w.lost)}`}>
                <div className="w-full flex items-end gap-0.5" style={{ height: 100 }}>
                  <div className="flex-1 bg-ok rounded-t" style={{ height: `${(w.won / weeklyMax) * 100}%` }} />
                  <div className="flex-1 bg-bad rounded-t" style={{ height: `${(w.lost / weeklyMax) * 100}%` }} />
                </div>
                <span className="text-[9px] text-text-4">{w.weekStartISO.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[11.5px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> Won</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bad" /> Lost</span>
          </div>
        </div>
      </Panel>

      <Panel title="Rolling MRR + churn rate — last 6 months">
        <div className="p-5 border-t border-border space-y-2">
          {mrr.map((m) => (
            <div key={m.monthISO} className="flex items-center gap-3">
              <span className="text-[12px] text-text-3 w-20 tnum">{m.monthISO.slice(0, 7)}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-ok" style={{ width: `${(m.mrr / mrrMax) * 100}%` }} />
              </div>
              <span className="text-[12px] text-text-2 tnum w-24 text-right">{fmtEgp(m.mrr)}</span>
              <span className={`text-[11.5px] tnum w-16 text-right ${m.churnRate > 5 ? 'text-bad' : 'text-text-3'}`}>{Math.round(m.churnRate)}% churn</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Why deals were lost" hint="Full breakdown">
        {lossReasons.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">No lost deals in scope.</div>}
        {lossReasons.map((r) => (
          <div key={r.reason} className="px-5 py-3 border-t border-border flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.reason}</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-bad" style={{ width: `${(r.count / maxReason) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-3 tnum w-10 text-right">{fmtInt(r.count)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {hint && <span className="text-[12px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function BucketTile({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`tnum text-[22px] font-black ${color}`}>{fmtInt(count)}</div>
      <div className="text-[10px] text-text-3 uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
