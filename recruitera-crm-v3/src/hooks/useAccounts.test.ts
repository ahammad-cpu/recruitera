import { describe, it, expect } from 'vitest';
import { isPaid, type Account } from './useAccounts';

const base: Account = {
  id: '1', bubble_id: null, name: 'x', domain: null, stage: 'paid', source: null,
  am_mail: null, paid_status: null, activation_status: null, has_trial: null,
  deal_value: null, deal_currency: null, owner_id: null, disq_stage: null, merged_into: null,
  created_at: '2026-01-01', bubble_created_at: null,
};

describe('isPaid', () => {
  it('true for Paid + Active', () => {
    expect(isPaid({ ...base, paid_status: 'Paid', activation_status: 'Active' })).toBe(true);
  });
  it('true for Without Charge + Active', () => {
    expect(isPaid({ ...base, paid_status: 'Without Charge', activation_status: 'Active' })).toBe(true);
  });
  it('false when paid but inactive', () => {
    expect(isPaid({ ...base, paid_status: 'Paid', activation_status: 'Churned' })).toBe(false);
  });
  it('false when not paid', () => {
    expect(isPaid({ ...base, paid_status: 'Trial', activation_status: 'Active' })).toBe(false);
  });
});
