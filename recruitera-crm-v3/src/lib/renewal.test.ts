import { describe, it, expect } from 'vitest';
import { computeRenewalBucket } from './renewal';

const NOW = Date.parse('2026-07-16T00:00:00Z');
const daysFromNow = (n: number) => new Date(NOW + n * 86_400_000).toISOString();
const paidActive = { paid_status: 'Paid', activation_status: 'Active' };

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

  it('buckets by days remaining for currently paid+active customers: d30/d60/d90', () => {
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(15) }, paidActive, NOW)).toBe('d30');
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(45) }, paidActive, NOW)).toBe('d60');
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(75) }, paidActive, NOW)).toBe('d90');
  });

  it('buckets paid+active cycles > 90 days out into Healthy', () => {
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(120) }, paidActive, NOW)).toBe('healthy');
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(400) }, paidActive, NOW)).toBe('healthy');
  });

  it('drops future-dated cycles from the board when the account is no longer paid+active', () => {
    // The "why 322" bug: stale cycles on unpaid/cancelled accounts must not
    // balloon the Healthy column. Only currently paid+active accounts count.
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(120) }, {}, NOW)).toBeNull();
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(45) }, { paid_status: 'Not Paid' }, NOW)).toBeNull();
    expect(computeRenewalBucket({ status: 'active', ends_at: daysFromNow(45) }, { paid_status: 'Paid', activation_status: 'Expired' }, NOW)).toBeNull();
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
