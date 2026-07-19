import { describe, expect, it } from 'vitest';
import { computeAmCrossAttribution } from '../__parts/amCrossAttribution';

describe('computeAmCrossAttribution', () => {
  it('gives revenue to AC2 when AC1 loses and AC2 later wins', () => {
    const stageHistory = [
      { account_id: 'x', from_stage: 'sql', to_stage: 'lost', changed_by: 'ac1', changed_at: '2026-07-01' },
      { account_id: 'x', from_stage: 'lost', to_stage: 'sql', changed_by: 'ac2', changed_at: '2026-07-22', reason_code: 'budget_approved' },
      { account_id: 'x', from_stage: 'sql', to_stage: 'won', changed_by: 'ac2', changed_at: '2026-08-08' },
    ];
    const cycles = [{ account_id: 'x', value: 40000, currency: 'EGP', started_at: '2026-08-08' }];
    const period = { from: '2026-07-01', to: '2026-08-31' };
    const result = computeAmCrossAttribution(stageHistory as any, cycles as any, period);
    expect(result.get('ac1')?.recoveredByOthers).toBe(1);
    expect(result.get('ac1')?.wonRev).toBe(0);
    expect(result.get('ac2')?.wins).toBe(1);
    expect(result.get('ac2')?.wonRev).toBe(40000);
    expect(result.get('ac2')?.reopensAttempted).toBe(1);
    expect(result.get('ac2')?.reopensWon).toBe(1);
  });

  it('returns an empty map when stage history or cycles are empty', () => {
    expect(computeAmCrossAttribution([], [{ account_id: 'x', value: 1, currency: 'EGP', started_at: '2026-01-01' }], { from: '2026-01-01', to: '2026-12-31' }).size).toBe(0);
    expect(computeAmCrossAttribution([{ account_id: 'x', from_stage: 'sql', to_stage: 'won', changed_by: 'ac1', changed_at: '2026-01-01' }], [], { from: '2026-01-01', to: '2026-12-31' }).size).toBe(0);
  });
});
