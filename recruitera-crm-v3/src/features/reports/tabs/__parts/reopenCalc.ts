import type { Account } from '@/hooks/useAccounts';
import type { ReopenEvent } from '@/hooks/useReopenEvents';
import { computeLossMatrix } from './lossCalc';

export type ReopenSummary = {
  reopenCount: number;           // total reopen events in period
  reopenedAccountCount: number;  // distinct accounts reopened in period
  multiReopenCount: number;      // accounts reopened more than once in period
  pctOfPeriodLosses: number | null; // reopenCount / lostInPeriodCount * 100
};

/**
 * Headline stats for the Reopen Rate panel: how many reopen events happened
 * in the period, how many distinct accounts that covers, how many of those
 * bounced back and forth more than once, and what share that is of the
 * period's total losses.
 */
export function computeReopenSummary(reopens: ReopenEvent[], lostInPeriodCount: number): ReopenSummary {
  const perAccount = new Map<string, number>();
  reopens.forEach((r) => perAccount.set(r.account_id, (perAccount.get(r.account_id) ?? 0) + 1));
  const multiReopenCount = Array.from(perAccount.values()).filter((n) => n > 1).length;
  return {
    reopenCount: reopens.length,
    reopenedAccountCount: perAccount.size,
    multiReopenCount,
    pctOfPeriodLosses: lostInPeriodCount > 0 ? (reopens.length / lostInPeriodCount) * 100 : null,
  };
}

/** Groups reopen events by `reason_code` (the reason given when reopening). */
export function computeReopenReasonBreakdown(reopens: ReopenEvent[]): { reason: string; count: number }[] {
  const m = new Map<string, number>();
  reopens.forEach((r) => {
    const key = r.reason_code || '(no reason)';
    m.set(key, (m.get(key) ?? 0) + 1);
  });
  return Array.from(m.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export type OriginalReasonRate = { reason: string; lostCount: number; reopenedCount: number; ratePct: number };

/**
 * For each loss reason, of the accounts currently at stage='lost' with
 * lost_at in [fromISO, toISO], what share have since been reopened at least
 * once (per `reopenedIds`, sourced from stage_history)? Reuses
 * computeLossMatrix's reason x stage grouping (Task 20) and sums the cells
 * across stages so the result is keyed by reason only.
 */
export function computeOriginalReasonReopenRates(
  accounts: Account[],
  reopenedIds: Set<string>,
  fromISO: string,
  toISO: string,
): OriginalReasonRate[] {
  const matrix = computeLossMatrix(accounts, reopenedIds, fromISO, toISO);
  return matrix.reasons
    .map((reason) => {
      const totals = matrix.stages.reduce(
        (acc, stage) => {
          const c = matrix.cell(reason, stage);
          acc.lostCount += c.count;
          acc.reopenedCount += c.laterReopened;
          return acc;
        },
        { lostCount: 0, reopenedCount: 0 },
      );
      return {
        reason,
        lostCount: totals.lostCount,
        reopenedCount: totals.reopenedCount,
        ratePct: totals.lostCount > 0 ? (totals.reopenedCount / totals.lostCount) * 100 : 0,
      };
    })
    .filter((r) => r.lostCount > 0)
    .sort((a, b) => b.ratePct - a.ratePct);
}

export type ReopenOutcome = 'won' | 'open' | 're-lost';

/**
 * Buckets every account reopened in the period (per `reopenedAccountIds`) by
 * where it currently stands: back to `won`, still open somewhere in the
 * pipeline, or re-lost.
 */
export function computeReopenOutcomes(
  accounts: Account[],
  reopenedAccountIds: Set<string>,
): { outcome: ReopenOutcome; count: number }[] {
  const counts: Record<ReopenOutcome, number> = { won: 0, open: 0, 're-lost': 0 };
  accounts.forEach((a) => {
    if (!reopenedAccountIds.has(a.id)) return;
    if (a.stage === 'won') counts.won += 1;
    else if (a.stage === 'lost') counts['re-lost'] += 1;
    else counts.open += 1;
  });
  return (['won', 'open', 're-lost'] as ReopenOutcome[]).map((outcome) => ({ outcome, count: counts[outcome] }));
}
