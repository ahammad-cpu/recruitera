import { describe, it, expect } from 'vitest';
import { quarterStartISO, yearStartISO, defaultFilters, resetFilters, EMPTY_FILTERS } from './PipelineFilters';

describe('quarterStartISO', () => {
  it('returns Jan 1 for a date in Q1', () => {
    expect(quarterStartISO(new Date(2026, 0, 15))).toBe('2026-01-01');
    expect(quarterStartISO(new Date(2026, 2, 31))).toBe('2026-01-01');
  });
  it('returns Apr 1 for a date in Q2', () => {
    expect(quarterStartISO(new Date(2026, 3, 1))).toBe('2026-04-01');
    expect(quarterStartISO(new Date(2026, 5, 30))).toBe('2026-04-01');
  });
  it('returns Jul 1 for a date in Q3', () => {
    expect(quarterStartISO(new Date(2026, 6, 16))).toBe('2026-07-01');
    expect(quarterStartISO(new Date(2026, 8, 30))).toBe('2026-07-01');
  });
  it('returns Oct 1 for a date in Q4', () => {
    expect(quarterStartISO(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(quarterStartISO(new Date(2026, 11, 31))).toBe('2026-10-01');
  });
});

describe('yearStartISO', () => {
  it('returns Jan 1 for any month of the given year', () => {
    expect(yearStartISO(new Date(2026, 5, 15))).toBe('2026-01-01');
    expect(yearStartISO(new Date(2026, 11, 31))).toBe('2026-01-01');
  });
});

describe('defaultFilters', () => {
  it('is EMPTY_FILTERS but with closeFrom pre-set to the quarter start', () => {
    const d = defaultFilters();
    expect(d.owners).toEqual(EMPTY_FILTERS.owners);
    expect(d.temps).toEqual(EMPTY_FILTERS.temps);
    expect(d.minAcv).toBe('');
    expect(d.maxAcv).toBe('');
    expect(d.closeTo).toBe('');
    // yyyy-mm-01 for month index 0/3/6/9
    expect(d.closeFrom).toMatch(/^\d{4}-(01|04|07|10)-01$/);
  });
});

describe('resetFilters', () => {
  it('is EMPTY_FILTERS but with closeFrom pre-set to the year start (Jan 1)', () => {
    const r = resetFilters();
    expect(r.owners).toEqual([]);
    expect(r.temps).toEqual([]);
    expect(r.minAcv).toBe('');
    expect(r.maxAcv).toBe('');
    expect(r.closeTo).toBe('');
    expect(r.closeFrom).toMatch(/^\d{4}-01-01$/);
  });
});
