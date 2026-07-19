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
import { ReportPanel, ReportKpi, HeaderPill, FunnelChart, BarList, type BarRow, type FunnelRow } from '../shared/ReportUI';
import { useFeatureFlag } from '@/lib/flags';

const STAGES = ['mql', 'sql', 'demo', 'proposal', 'won', 'paid'] as const;
const STAGE_FILL: Record<string, string> = {
  mql:      'bg-info/25',
  sql:      'bg-purple/25',
  demo:     'bg-cyan/20',
  proposal: 'bg-warn/25',
  won:      'bg-accent-strong/40',
  paid:     'bg-ok/30',
};

/**
 * "Reached" order — lower index = earlier stage. An account currently at a
 * later stage is counted as also having reached every earlier stage.
 * A Lead → SQL jump therefore still counts toward MQL, since logically it
 * had to pass through it. Loss/disqualified stages aren't in this order —
 * a lost account drops out of the funnel entirely.
 */
const STAGE_ORDER: readonly string[] = ['lead', 'mql', 'sql', 'demo', 'proposal', 'won', 'paid'];
function stageRank(stage: string | null | undefined): number {
  return STAGE_ORDER.indexOf((stage || '').toLowerCase());
}

export default function PipelineReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const cycles = useContractCycles();
  const targets = useTargets();
  const attribution = useResolvedAttribution();
  const { ownerId } = useReportsOwner();
  const newReports = useFeatureFlag('use_new_reports');
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

  const funnelRows: FunnelRow[] = useMemo(() => {
    // Cumulative counting: for each funnel stage, count every account that
    // has reached it OR any downstream stage. So SQL includes SQL + Demo +
    // Proposal + Won + Paid — capturing accounts that skipped stages on
    // the way (e.g. Lead → SQL directly still counts toward MQL).
    // Terminal negative stages (lost / disqualified) aren't in STAGE_ORDER,
    // so they naturally drop out of the funnel.
    const total = Math.max(1, scopedAccts.filter((a) => stageRank(a.stage) >= 0).length);
    return STAGES.map((s) => {
      const targetRank = stageRank(s);
      const reached = scopedAccts.filter((a) => stageRank(a.stage) >= targetRank).length;
      return {
        key: s,
        label: s.toUpperCase(),
        count: reached,
        pctOfTotal: (reached / total) * 100,
        fillClass: STAGE_FILL[s],
      };
    });
  }, [scopedAccts]);
  const closeRate = useMemo(() => {
    // "Close rate" now = won-or-later ÷ ever-in-funnel, matching v1's semantics.
    const start = scopedAccts.filter((a) => stageRank(a.stage) >= 0).length;
    const won = scopedAccts.filter((a) => stageRank(a.stage) >= stageRank('won')).length;
    return start > 0 ? Math.round((won / start) * 100) : 0;
  }, [scopedAccts]);

  const targetForPeriod = useMemo(() => {
    const list = targets.data ?? [];
    return list
      .filter((t) => t.period_start >= range.startISO && t.period_end <= range.endISO)
      .filter((t) => !ownerId ? true : (t.owner_kind === 'user' && t.owner_id === ownerId))
      .reduce((s, t) => s + (t.amount_egp || 0), 0);
  }, [targets.data, range, ownerId]);
  const wonInPeriod = useMemo(() => scopedCycles
    .filter((c) => c.started_at && c.started_at >= range.startISO && c.started_at <= range.endISO)
    .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0),
  [scopedCycles, range]);
  const attainPct = targetForPeriod > 0 ? Math.round((wonInPeriod / targetForPeriod) * 100) : 0;

  const committedAcv = useMemo(
    () => scopedCycles.filter((c) => c.status === 'active' || !c.status).reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0),
    [scopedCycles],
  );

  const trend = useMemo(() => reconstructArrPipeline(scopedCycles, scopedDeals, 30, new Date()), [scopedCycles, scopedDeals]);
  const trendMax = Math.max(1, ...trend.flatMap((p) => [p.arr, p.pipeline]));

  const wonDeals = useMemo(
    () => scopedDeals
      .filter((d) => (d.stage === 'won' || d.stage === 'collected') && d.closed_at && d.account_id)
      .map((d) => ({ closed_at: d.closed_at!, account_id: d.account_id!, channel: attribution.channelByAccountId.get(d.account_id!) ?? '(unknown)' })),
    [scopedDeals, attribution.channelByAccountId],
  );
  const acctById = useMemo(() => new Map(scopedAccts.map((a) => [a.id, { created_at: a.created_at }])), [scopedAccts]);
  const cycleTime = useMemo(() => averageCycleDays(wonDeals, acctById), [wonDeals, acctById]);

  const reopenTeaser = useMemo(() => {
    const cohort = scopedAccts.filter((a) => a.created_at >= range.startISO && a.created_at <= range.endISO);
    const lostInCohort = cohort.filter((a) => a.stage === 'lost' || (a.reopen_count ?? 0) > 0);
    const reopenedFromCohort = cohort.filter((a) => (a.reopen_count ?? 0) > 0);
    const pct = Math.round((100 * reopenedFromCohort.length) / Math.max(lostInCohort.length, 1));
    return { cohortSize: cohort.length, lostInCohort: lostInCohort.length, reopenedFromCohort: reopenedFromCohort.length, pct };
  }, [scopedAccts, range]);

  const cycleBars: BarRow[] = useMemo(
    () => Array.from(cycleTime.byChannel.entries())
      .map(([channel, days]) => ({
        key: channel,
        label: channel,
        value: days,
        displayValue: `${Math.round(days)}d`,
      }))
      .sort((a, b) => a.value - b.value),
    [cycleTime],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <span className="text-[12px] font-semibold text-text-2">Leads created</span>
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ReportKpi label="Target" value={targetForPeriod ? fmtEgp(targetForPeriod) : '—'} sub={range.label} accent />
        <ReportKpi
          label="Won"
          value={fmtEgp(wonInPeriod)}
          sub={targetForPeriod ? `${attainPct}% of target` : 'no target set'}
          tone={attainPct >= 70 ? 'ok' : attainPct >= 40 ? 'warn' : targetForPeriod ? 'bad' : undefined}
        />
        <ReportKpi label="Committed ACV" value={fmtEgp(committedAcv)} sub="active cycles" tone="info" />
        <ReportKpi
          label="Avg sales cycle"
          value={cycleTime.overallAvgDays > 0 ? `${Math.round(cycleTime.overallAvgDays)}d` : '—'}
          sub="lead → won"
        />
      </div>

      <ReportPanel
        title="Conversion funnel"
        subtitle="Lead → Deal Won"
        headerRight={<HeaderPill tone="ok">{closeRate}% close rate</HeaderPill>}
      >
        <FunnelChart rows={funnelRows} />
      </ReportPanel>

      <ReportPanel
        title="ARR vs Pipeline"
        subtitle="Last 30 days"
        headerRight={<HeaderPill>{fmtEgp(trend[trend.length - 1]?.arr ?? 0)} ARR today</HeaderPill>}
      >
        <TrendChart series={trend} max={trendMax} />
      </ReportPanel>

      <ReportPanel
        title="Cycle by source"
        subtitle="Average cycle by acquisition source"
        headerRight={cycleTime.overallAvgDays > 0
          ? <HeaderPill>avg {Math.round(cycleTime.overallAvgDays)}d</HeaderPill>
          : undefined}
      >
        <BarList rows={cycleBars} variant="raw" emptyText="No won deals in scope." autoColor />
      </ReportPanel>

      {newReports && reopenTeaser.cohortSize > 0 && (
        <div className="text-[11.5px] text-text-3 px-1">
          of {reopenTeaser.lostInCohort} lost cohort accounts, {reopenTeaser.reopenedFromCohort} were later reopened ({reopenTeaser.pct}%)
        </div>
      )}
    </div>
  );
}

function TrendChart({ series, max }: { series: Array<{ dateISO: string; arr: number; pipeline: number }>; max: number }) {
  const H = 140, W = 720, PAD = 8;
  const innerH = H - PAD * 2, innerW = W;
  const pt = (v: number, i: number) => `${(i / Math.max(1, series.length - 1)) * innerW},${PAD + innerH - (v / max) * innerH}`;
  const arrPath = series.map((p, i) => pt(p.arr, i)).join(' ');
  const pipePath = series.map((p, i) => pt(p.pipeline, i)).join(' ');
  const arrArea = `${pt(0, 0)} ${arrPath} ${pt(0, series.length - 1)} 0,${H}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[140px]" preserveAspectRatio="none">
        <polygon points={arrArea} fill="rgb(var(--ok) / 0.12)" />
        <polyline points={pipePath} fill="none" stroke="rgb(var(--warn))" strokeWidth="2" />
        <polyline points={arrPath} fill="none" stroke="rgb(var(--ok))" strokeWidth="2.5" />
      </svg>
      <div className="flex gap-4 mt-2 text-[11.5px] font-semibold">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> ARR</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warn" /> Pipeline</span>
      </div>
    </div>
  );
}
