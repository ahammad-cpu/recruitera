import { describe, it, expect } from 'vitest';
import { isOpen, isClosed, isStale, isOverdue, OPEN_STAGES, CLOSED_STAGES, type Deal } from './useDeals';

const base: Pick<Deal, 'stage' | 'last_activity_at' | 'expected_close_date'> = {
  stage: 'mql', last_activity_at: new Date().toISOString(), expected_close_date: null,
};

describe('OPEN_STAGES / CLOSED_STAGES', () => {
  it('never overlap', () => {
    const all = new Set([...OPEN_STAGES, ...CLOSED_STAGES]);
    expect(all.size).toBe(OPEN_STAGES.length + CLOSED_STAGES.length);
  });
  it('open covers MQL through PROPOSAL (NEGOTIATION intentionally excluded from board)', () => {
    expect(OPEN_STAGES).toEqual(['mql', 'sql', 'demo', 'proposal']);
  });
  it('closed covers won / collected / lost', () => {
    expect(CLOSED_STAGES).toEqual(['won', 'collected', 'lost']);
  });
});

describe('isOpen / isClosed', () => {
  it('classifies discovery + proposal stages as open', () => {
    for (const s of OPEN_STAGES) expect(isOpen({ ...base, stage: s })).toBe(true);
  });
  it('classifies won / collected / lost as closed', () => {
    for (const s of CLOSED_STAGES) expect(isClosed({ ...base, stage: s })).toBe(true);
  });
});

describe('isStale', () => {
  it('flags an open deal untouched for 31 days', () => {
    const iso = new Date(Date.now() - 31 * 86_400_000).toISOString();
    expect(isStale({ stage: 'sql', last_activity_at: iso })).toBe(true);
  });
  it('does not flag a fresh open deal', () => {
    expect(isStale({ stage: 'sql', last_activity_at: new Date().toISOString() })).toBe(false);
  });
  it('never flags a closed deal, even if very old', () => {
    const iso = new Date(Date.now() - 365 * 86_400_000).toISOString();
    expect(isStale({ stage: 'won', last_activity_at: iso })).toBe(false);
    expect(isStale({ stage: 'lost', last_activity_at: iso })).toBe(false);
  });
});

describe('isOverdue', () => {
  it('flags open deals with a past close date', () => {
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    expect(isOverdue({ stage: 'proposal', expected_close_date: past })).toBe(true);
  });
  it('does not flag deals without a close date', () => {
    expect(isOverdue({ stage: 'proposal', expected_close_date: null })).toBe(false);
  });
  it('does not flag closed deals even if the date is past', () => {
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    expect(isOverdue({ stage: 'lost', expected_close_date: past })).toBe(false);
  });
});
