import { useMemo, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useTargets } from '@/hooks/useTargets';
import { useResolvedAttribution } from '@/hooks/useResolvedAttribution';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { useReportsOwner } from '../shared/reportsContext';
import { DateRangeFilter } from '../shared/DateRangeFilter';
import { resolveDateRange, type DateRangeKey } from '../shared/dateRange';
import { reconstructArrPipeline, averageCycleDays } from '../shared/reportCalc';

const STAGES = ['mql', 'sql', 'demo', 'proposal', 'won', 'paid'] as const;

export default function PipelineReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const cycles = useContractCycles();
  const targets = useTargets();
  const attribution = useResolvedAttribution();
  const { ownerId } = useReportsOwner();
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('qtd');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const range = useMemo(() => resolveDateRange(rangeKey, new Date(), from, to), [rangeKey, from, to]);

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);
  const scopedIds = useMemo(() => new Set(scopedAccts.map((a) => a.id)), [scopedAccts]);
  const scopedDeals = useMemo(() => (deals.data ?? []).filter((d) => !d.is_archived && d.account_id && scopedIds.has(d.account_id)), [deals.data, scopedIds]);
  const scopedCycles = useMemo(() => (cycles.data ?? []).filter((c) => scopedIds.has(c.account_id)), [cycles.data, scopedIds]);

  // Funnel + stage conversions
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    scopedAccts.forEach((a) => {
      const s = (a.stage || '').toLowerCase();
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return STAGES.map((s) => ({ stage: s, count: m.get(s) ?? 0 }));
  }, [scopedAccts]);
  const funnelMax = Math.max(1, ...stageCounts.map((s) => s.count));

  // Target attainment (QTD by default via the filter)
  const targetForPeriod = useMemo(() => {
    const list = targets.data ?? [];
    return list
      .filter((t) => t.period_start >= range.startISO && t.period_end <= range.endISO)
      .filter((t) => !ownerId ? true : (t.owner_kind === 'user' && t.owner_id === ownerId))
      .reduce((s, t) => s + (t.amount_egp || 0), 0);
  }, [targets.data, range, ownerId]);
  const wonInPeriod = useMemo(() => {
    return scopedCycles
      .filter((c) => c.started_at && c.started_at >= range.startISO && c.started_at <= range.endISO)
      .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);
  }, [scopedCycles, range]);
  const attainPct = targetForPeriod > 0 ? Math.round((wonInPeriod / targetForPeriod) * 100) : 0;

  const committedAcv = useMemo(
    () => scopedCycles.filter((c) => c.status === 'active' || !c.status).reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0),
    [scopedCycles],
  );

  // ARR-vs-Pipeline 30-day trend
  const trend = useMemo(() => reconstructArrPipeline(scopedCycles, scopedDeals, 30, new Date()), [scopedCycles, scopedDeals]);
  const trendMax = Math.max(1, ...trend.flatMap((p) => [p.arr, p.pipeline]));

  // Sales cycle time per source + overall
  const wonDeals = useMemo(
    () => scopedDeals
      .filter((d) => (d.stage === 'won' || d.stage === 'collected') && d.closed_at && d.account_id)
      .map((d) => ({ closed_at: d.closed_at!, account_id: d.account_id!, channel: attribution.channelByAccountId.get(d.account_id!) ?? '(unknown)' })),
    [scopedDeals, attribution.channelByAccountId],
  );
  const acctById = useMemo(() => new Map(scopedAccts.map((a) => [a.id, { created_at: a.created_at }])), [scopedAccts]);
  const cycleTime = useMemo(() => averageCycleDays(wonDeals, acctById), [wonDeals, acctById]);
  const cycleRows = useMemo(
    () => Array.from(cycleTime.byChannel.entries()).map(([channel, days]) => ({ channel, days })).sort((a, b) => a.days - b.days),
    [cycleTime],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Target" value={targetForPeriod ? fmtEgp(targetForPeriod) : '—'} sub={range.label} />
        <Kpi label="Won" value={fmtEgp(wonInPeriod)} sub={`${attainPct}% of target`} />
        <Kpi label="Committed ACV" value={fmtEgp(committedAcv)} sub="active cycles" />
        <Kpi label="Overall avg cycle" value={cycleTime.overallAvgDays > 0 ? `${Math.round(cycleTime.overallAvgDays)}d` : '—'} sub="lead → won" />
      </div>

      <Panel title="Funnel" hint="Stage-by-stage counts + conversion">
        {stageCounts.map((s, i) => {
          const prev = i > 0 ? stageCounts[i - 1].count : s.count;
          const conv = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
          return (
            <div key={s.stage} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
              <span className="text-[13px] font-bold text-text uppercase w-20">{s.stage}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent-strong" style={{ width: `${(s.count / funnelMax) * 100}%` }} />
              </div>
              <span className="text-[12px] text-text-3 tnum w-12 text-right">{fmtInt(s.count)}</span>
              <span className="text-[11px] text-text-4 tnum w-16 text-right">{i > 0 ? `${conv}%` : '—'}</span>
            </div>
          );
        })}
      </Panel>

      <Panel title="ARR vs Pipeline — last 30 days">
        <TrendChart series={trend} max={trendMax} />
      </Panel>

      <Panel title="Sales cycle time by channel">
        {cycleRows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">No won deals in scope.</div>}
        {cycleRows.map((r) => (
          <div key={r.channel} className="px-5 py-3 border-t border-border flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.channel}</span>
            <span className="text-[12px] text-text-3 tnum">{Math.round(r.days)} days avg</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function TrendChart({ series, max }: { series: Array<{ dateISO: string; arr: number; pipeline: number }>; max: number }) {
  const H = 120, W = 640;
  const pt = (v: number, i: number) => `${(i / (series.length - 1)) * W},${H - (v / max) * H}`;
  const arrPath = series.map((p, i) => pt(p.arr, i)).join(' ');
  const pipePath = series.map((p, i) => pt(p.pipeline, i)).join(' ');
  return (
    <div className="p-5 border-t border-border">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]">
        <polyline points={pipePath} fill="none" stroke="rgb(var(--warn))" strokeWidth="2" />
        <polyline points={arrPath} fill="none" stroke="rgb(var(--ok))" strokeWidth="2" />
      </svg>
      <div className="flex gap-4 mt-2 text-[11.5px] font-semibold">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> ARR</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warn" /> Pipeline</span>
      </div>
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
