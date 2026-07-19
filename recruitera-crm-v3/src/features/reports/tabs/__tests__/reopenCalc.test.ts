import { describe, expect, it } from 'vitest';
import {
  computeReopenSummary,
  computeReopenReasonBreakdown,
  computeOriginalReasonReopenRates,
  computeReopenOutcomes,
} from '../__parts/reopenCalc';

describe('computeReopenSummary', () => {
  it('counts events, distinct accounts, and multi-reopens', () => {
    const reopens = [
      { account_id: 'a', from_stage: 'lost', to_stage: 'sql', changed_at: '2026-07-05', reason_code: 'budget_approved' },
      { account_id: 'a', from_stage: 'lost', to_stage: 'demo', changed_at: '2026-07-10', reason_code: 'timing_changed' },
      { account_id: 'b', from_stage: 'lost', to_stage: 'lead', changed_at: '2026-07-08', reason_code: 'customer_returned' },
    ];
    const s = computeReopenSummary(reopens as any, 10);
    expect(s.reopenCount).toBe(3);
    expect(s.reopenedAccountCount).toBe(2);
    expect(s.multiReopenCount).toBe(1);
    expect(s.pctOfPeriodLosses).toBe(30);
  });

  it('handles zero period losses without dividing by zero', () => {
    const s = computeReopenSummary([], 0);
    expect(s.pctOfPeriodLosses).toBeNull();
  });
});

describe('computeReopenReasonBreakdown', () => {
  it('groups by reason_code, defaulting missing to (no reason)', () => {
    const reopens = [
      { account_id: 'a', from_stage: 'lost', to_stage: 'sql', changed_at: '2026-07-05', reason_code: 'budget_approved' },
      { account_id: 'b', from_stage: 'lost', to_stage: 'lead', changed_at: '2026-07-08', reason_code: 'budget_approved' },
      { account_id: 'c', from_stage: 'lost', to_stage: 'lead', changed_at: '2026-07-08', reason_code: null },
    ];
    const rows = computeReopenReasonBreakdown(reopens as any);
    expect(rows[0]).toEqual({ reason: 'budget_approved', count: 2 });
    expect(rows.find((r) => r.reason === '(no reason)')?.count).toBe(1);
  });
});

describe('computeOriginalReasonReopenRates', () => {
  it('aggregates loss-matrix cells across stages per reason', () => {
    const accounts = [
      { id: 'a', stage: 'lost', loss_reason: 'no_budget', lost_from_stage: 'demo', lost_at: '2026-07-01' },
      { id: 'b', stage: 'lost', loss_reason: 'no_budget', lost_from_stage: 'proposal', lost_at: '2026-07-02' },
      { id: 'c', stage: 'lost', loss_reason: 'no_response', lost_from_stage: 'lead', lost_at: '2026-07-03' },
    ];
    const reopened = new Set(['a']);
    const rows = computeOriginalReasonReopenRates(accounts as any, reopened, '2026-07-01', '2026-07-31');
    const noBudget = rows.find((r) => r.reason === 'no_budget')!;
    expect(noBudget.lostCount).toBe(2);
    expect(noBudget.reopenedCount).toBe(1);
    expect(noBudget.ratePct).toBe(50);
    const noResponse = rows.find((r) => r.reason === 'no_response')!;
    expect(noResponse.ratePct).toBe(0);
  });
});

describe('computeReopenOutcomes', () => {
  it('buckets reopened accounts by current stage', () => {
    const accounts = [
      { id: 'a', stage: 'won' },
      { id: 'b', stage: 'lost' },
      { id: 'c', stage: 'demo' },
      { id: 'd', stage: 'sql' },
    ];
    const reopened = new Set(['a', 'b', 'c']);
    const rows = computeReopenOutcomes(accounts as any, reopened);
    expect(rows.find((r) => r.outcome === 'won')?.count).toBe(1);
    expect(rows.find((r) => r.outcome === 're-lost')?.count).toBe(1);
    expect(rows.find((r) => r.outcome === 'open')?.count).toBe(1);
  });
});
