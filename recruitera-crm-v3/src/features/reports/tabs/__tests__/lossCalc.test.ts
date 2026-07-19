import { describe, expect, it } from 'vitest';
import { computeLossMatrix } from '../__parts/lossCalc';

describe('computeLossMatrix', () => {
  it('groups by reason and lost_from_stage, sums totals', () => {
    const accounts = [
      { id:'a', stage:'lost', loss_reason:'no_budget',  lost_from_stage:'demo', lost_at:'2026-07-01' },
      { id:'b', stage:'lost', loss_reason:'no_budget',  lost_from_stage:'demo', lost_at:'2026-07-02' },
      { id:'c', stage:'lost', loss_reason:'no_response',lost_from_stage:'lead', lost_at:'2026-07-03' },
    ];
    const reopened = new Set<string>();
    const m = computeLossMatrix(accounts as any, reopened, '2026-07-01', '2026-07-31');
    expect(m.reasons).toContain('no_budget');
    expect(m.stages).toContain('demo');
    expect(m.cell('no_budget','demo').count).toBe(2);
    expect(m.cell('no_response','lead').count).toBe(1);
  });

  it('marks later-reopened accounts', () => {
    const accounts = [
      { id:'a', stage:'lost', loss_reason:'no_budget', lost_from_stage:'demo', lost_at:'2026-07-01' },
    ];
    const reopened = new Set(['a']);
    const m = computeLossMatrix(accounts as any, reopened, '2026-07-01', '2026-07-31');
    expect(m.cell('no_budget','demo').laterReopened).toBe(1);
  });
});
