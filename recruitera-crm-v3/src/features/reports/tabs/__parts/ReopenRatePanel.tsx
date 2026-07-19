import { useMemo } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useReopenEvents } from '@/hooks/useReopenEvents';
import { fmtInt } from '@/lib/format';
import { ReportPanel, ReportKpi, HeaderPill, BarList, type BarRow } from '../../shared/ReportUI';
import {
  computeReopenSummary,
  computeReopenReasonBreakdown,
  computeOriginalReasonReopenRates,
  computeReopenOutcomes,
  type ReopenOutcome,
} from './reopenCalc';

const OUTCOME_LABEL: Record<ReopenOutcome, string> = { won: 'Won', open: 'Still open', 're-lost': 'Re-lost' };
const OUTCOME_FILL: Record<ReopenOutcome, string> = { won: 'bg-ok', open: 'bg-info', 're-lost': 'bg-bad' };

/**
 * Reopen Rate panel — sits next to LossBreakdownMatrix (Task 20) on the
 * Win/Loss/Churned report, sharing the same date range + owner scope.
 * Shows: how many accounts came back from `lost` this period, which reasons
 * they were reopened for, which original loss reasons are most "reversible",
 * and where the reopened accounts stand today.
 */
export function ReopenRatePanel({
  from, to, ownerId,
}: {
  from: string;
  to: string;
  ownerId: string | null;
}) {
  const accts = useAccounts();
  const reopensQuery = useReopenEvents(from, to);

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);
  const scopedIds = useMemo(() => new Set(scopedAccts.map((a) => a.id)), [scopedAccts]);

  const scopedReopens = useMemo(
    () => (reopensQuery.data ?? []).filter((r) => scopedIds.has(r.account_id)),
    [reopensQuery.data, scopedIds],
  );
  const reopenedIds = useMemo(() => new Set(scopedReopens.map((r) => r.account_id)), [scopedReopens]);

  const lostInPeriodCount = useMemo(() => {
    const inRange = (iso: string | null) => !!iso && iso >= from && iso <= to;
    return scopedAccts.filter((a) => a.stage === 'lost' && inRange(a.lost_at)).length;
  }, [scopedAccts, from, to]);

  const summary = useMemo(
    () => computeReopenSummary(scopedReopens, lostInPeriodCount),
    [scopedReopens, lostInPeriodCount],
  );

  const reasonBars: BarRow[] = useMemo(
    () => computeReopenReasonBreakdown(scopedReopens).map((r) => ({
      key: r.reason,
      label: r.reason,
      value: r.count,
      displayValue: fmtInt(r.count),
      rightHint: `${Math.round((r.count / Math.max(1, scopedReopens.length)) * 100)}%`,
      fillClass: 'bg-info',
    })),
    [scopedReopens],
  );

  const originalReasonBars: BarRow[] = useMemo(
    () => computeOriginalReasonReopenRates(scopedAccts, reopenedIds, from, to).map((r) => ({
      key: r.reason,
      label: r.reason,
      value: r.ratePct,
      displayValue: `${Math.round(r.ratePct)}%`,
      rightHint: `${r.reopenedCount}/${r.lostCount}`,
      fillClass: 'bg-warn',
    })),
    [scopedAccts, reopenedIds, from, to],
  );

  const outcomeBars: BarRow[] = useMemo(() => {
    if (reopenedIds.size === 0) return [];
    return computeReopenOutcomes(scopedAccts, reopenedIds).map((o) => ({
      key: o.outcome,
      label: OUTCOME_LABEL[o.outcome],
      value: o.count,
      displayValue: fmtInt(o.count),
      rightHint: `${Math.round((o.count / Math.max(1, reopenedIds.size)) * 100)}%`,
      fillClass: OUTCOME_FILL[o.outcome],
    }));
  }, [scopedAccts, reopenedIds]);

  return (
    <ReportPanel
      title="Reopen rate"
      subtitle="Accounts that came back from lost"
      headerRight={<HeaderPill tone={summary.reopenCount > 0 ? 'warn' : 'muted'}>{fmtInt(summary.reopenCount)} reopened</HeaderPill>}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ReportKpi
          label="Reopens this period"
          value={fmtInt(summary.reopenCount)}
          sub={`${fmtInt(summary.reopenedAccountCount)} distinct accounts`}
        />
        <ReportKpi
          label="% of period losses"
          value={summary.pctOfPeriodLosses !== null ? `${Math.round(summary.pctOfPeriodLosses)}%` : '—'}
          sub={`${fmtInt(lostInPeriodCount)} lost in period`}
          tone={summary.pctOfPeriodLosses !== null && summary.pctOfPeriodLosses > 30 ? 'warn' : undefined}
        />
        <ReportKpi
          label="Multi-reopens"
          value={fmtInt(summary.multiReopenCount)}
          sub="reopened more than once"
          tone={summary.multiReopenCount > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-text-3 mb-3">Reopen reasons</div>
          <BarList rows={reasonBars} variant="raw" emptyText="No reopens in scope." />
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-text-3 mb-3">Reopen % by original loss reason</div>
          <BarList rows={originalReasonBars} variant="full" emptyText="No lost accounts in scope." />
        </div>
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-text-3 mb-3">Where they ended up</div>
          <BarList rows={outcomeBars} variant="raw" emptyText="No reopens in scope." />
        </div>
      </div>
    </ReportPanel>
  );
}
