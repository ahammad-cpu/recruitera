import { describe, expect, it } from 'vitest';
import { computeRequalificationEffectiveness } from '../__parts/requalificationEffectivenessCalc';

const rules = [
  { id: 'r1', name: '60-day nudge', enabled: true },
  { id: 'r2', name: 'disabled rule', enabled: false },
];

describe('computeRequalificationEffectiveness', () => {
  it('counts fires, task completion, and reopens per enabled rule', () => {
    const fires = [
      { rule_id: 'r1', account_id: 'a', task_id: 't1', fired_at: '2026-07-01T00:00:00Z' },
      { rule_id: 'r1', account_id: 'b', task_id: 't2', fired_at: '2026-07-05T00:00:00Z' },
      { rule_id: 'r1', account_id: 'c', task_id: null, fired_at: '2026-07-06T00:00:00Z' },
    ];
    const tasksById = new Map([
      ['t1', { id: 't1', task_done: true }],
      ['t2', { id: 't2', task_done: false }],
    ]);
    const stageHistory = [
      { account_id: 'a', from_stage: 'lost', changed_at: '2026-07-10T00:00:00Z' }, // after fire -> reopened
      { account_id: 'b', from_stage: 'lost', changed_at: '2026-07-01T00:00:00Z' }, // before fire -> not counted
    ];
    const rows = computeRequalificationEffectiveness(rules, fires, tasksById, stageHistory, '2026-07-01', '2026-07-31');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ ruleId: 'r1', ruleName: '60-day nudge', fires: 3, tasksWithTask: 2, tasksDone: 1, reopened: 1 });
  });

  it('excludes fires for disabled or deleted rules', () => {
    const fires = [
      { rule_id: 'r2', account_id: 'a', task_id: null, fired_at: '2026-07-01T00:00:00Z' },
      { rule_id: 'r3', account_id: 'a', task_id: null, fired_at: '2026-07-01T00:00:00Z' },
    ];
    const rows = computeRequalificationEffectiveness(rules, fires, new Map(), [], '2026-07-01', '2026-07-31');
    expect(rows).toHaveLength(0);
  });

  it('excludes fires outside the date range', () => {
    const fires = [
      { rule_id: 'r1', account_id: 'a', task_id: null, fired_at: '2026-06-01T00:00:00Z' },
    ];
    const rows = computeRequalificationEffectiveness(rules, fires, new Map(), [], '2026-07-01', '2026-07-31');
    expect(rows).toHaveLength(0);
  });

  it('returns empty array with no fires', () => {
    const rows = computeRequalificationEffectiveness(rules, [], new Map(), [], '2026-07-01', '2026-07-31');
    expect(rows).toEqual([]);
  });
});
