import { describe, it, expect } from 'vitest';
import { resolveDateRange } from '../dateRange';

const NOW = new Date('2026-07-17T12:00:00Z'); // Fri, Q3

describe('resolveDateRange', () => {
  it('7d returns the last 7 calendar days ending today', () => {
    const r = resolveDateRange('7d', NOW);
    expect(r.startISO).toBe('2026-07-11');
    expect(r.endISO).toBe('2026-07-17');
    expect(r.label).toBe('Last 7 days');
  });
  it('30d returns the last 30 days', () => {
    const r = resolveDateRange('30d', NOW);
    expect(r.startISO).toBe('2026-06-18');
    expect(r.endISO).toBe('2026-07-17');
  });
  it('90d returns the last 90 days', () => {
    const r = resolveDateRange('90d', NOW);
    expect(r.startISO).toBe('2026-04-19');
    expect(r.endISO).toBe('2026-07-17');
  });
  it('qtd starts at the beginning of the current calendar quarter', () => {
    const r = resolveDateRange('qtd', NOW);
    expect(r.startISO).toBe('2026-07-01');
    expect(r.endISO).toBe('2026-07-17');
    expect(r.label).toBe('Q3 2026 to date');
  });
  it('ytd starts on Jan 1', () => {
    const r = resolveDateRange('ytd', NOW);
    expect(r.startISO).toBe('2026-01-01');
    expect(r.endISO).toBe('2026-07-17');
    expect(r.label).toBe('2026 to date');
  });
  it('custom passes through provided ISO strings', () => {
    const r = resolveDateRange('custom', NOW, '2026-03-01', '2026-05-15');
    expect(r.startISO).toBe('2026-03-01');
    expect(r.endISO).toBe('2026-05-15');
    expect(r.label).toBe('2026-03-01 → 2026-05-15');
  });
  it('custom without from/to falls back to a sensible default (last 30d)', () => {
    const r = resolveDateRange('custom', NOW);
    expect(r.startISO).toBe('2026-06-18');
    expect(r.endISO).toBe('2026-07-17');
  });
});
