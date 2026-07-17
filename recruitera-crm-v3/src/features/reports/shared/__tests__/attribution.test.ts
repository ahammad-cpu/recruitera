import { describe, it, expect } from 'vitest';
import { resolveChannel } from '../attribution';

describe('resolveChannel', () => {
  const mt = new Map([
    ['ref-1', { first_source: 'Google Ads' }],
    ['ref-2', { first_source: null }],
  ]);

  it('prefers MT first_source when present', () => {
    expect(resolveChannel({ source: 'Manual', company_ref: 'ref-1' }, mt)).toBe('Google Ads');
  });
  it('falls back to accounts.source when MT row exists but first_source is null', () => {
    expect(resolveChannel({ source: 'LinkedIn', company_ref: 'ref-2' }, mt)).toBe('LinkedIn');
  });
  it('falls back to accounts.source when no MT row exists for the ref', () => {
    expect(resolveChannel({ source: 'Cold outreach', company_ref: 'ref-99' }, mt)).toBe('Cold outreach');
  });
  it('returns (unknown) when both MT and source are missing', () => {
    expect(resolveChannel({ source: null, company_ref: null }, mt)).toBe('(unknown)');
  });
});
