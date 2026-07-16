import { describe, it, expect } from 'vitest';
import { computeRenewalBucket } from './renewal';

const NOW = Date.parse('2026-07-16T00:00:00Z');
const daysFromNow = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe('computeRenewalBucket', () => {
  it('returns null when there is no cycle or no end date', () => {
    expect(computeRenewalBucket(null, {}, NOW)).toBeNull();
    expect(computeRenewalBucket({ status: 'active', ends_at: null }, {}, NOW)).toBeNull();
  });

  it('returns null for an unparsable end date', () => {
    expect(computeRenewalBucket({ status: 'active', ends_at: 'not-a-date' }, {}, NOW)).toBeNull();
  });

  it('honors an explicit churned/renewed cycle status regardless of dates', () => {
    expect(computeRenewalBucket({ status: 'churned', ends_at: daysFromNow(100) }, {}, NOW)).toBe('churned');
    expect(computeRenewalBucket({ status: 'renewed', ends_at: daysFromNow(-100) }, {}, NOW)).toBe('renewed');
  });

  it('buckets by days remaining: d30/d60/d90', () => {
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(15) }, {}, NOW)).toBe('d30');
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(45) }, {}, NOW)).toBe('d60');
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(75) }, {}, NOW)).toBe('d90');
  });

  it('drops out of the pipeline past 90 days', () => {
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(120) }, {}, NOW)).toBeNull();
  });

  it('sends a still-paying customer past its end date to overdue', () => {
    const account = { paid_status: 'Paid', activation_status: 'Active' };
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(-5) }, account, NOW)).toBe('overdue');
  });

  it('churns an ended cycle when the customer already stopped paying', () => {
    const account = { paid_status: 'Not Paid', activation_status: 'Active' };
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(-5) }, account, NOW)).toBe('churned');
  });

  it('churns an ended cycle when activation expired even if still marked paid', () => {
    const account = { paid_status: 'Paid', activation_status: 'Expired' };
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(-5) }, account, NOW)).toBe('churned');
  });
});
