import { describe, it, expect } from 'vitest';
import { reconstructArrPipeline, reconstructRollingMrr, reconstructWonLostWeekly, averageCycleDays } from '../reportCalc';

const NOW = new Date('2026-07-17T00:00:00Z');

describe('reconstructArrPipeline', () => {
  it('sums active cycles per day and open deal amounts per day', () => {
    const cycles = [
      { started_at: '2026-06-01', ends_at: '2026-12-31', value: 1000, currency: 'EGP' },
      { started_at: '2026-07-15', ends_at: '2027-01-15', value: 500,  currency: 'EGP' },
    ];
    const deals = [
      { created_at: '2026-07-10T00:00:00Z', closed_at: null, amount: 200, currency: 'EGP' },
      { created_at: '2026-07-16T00:00:00Z', closed_at: null, amount: 100, currency: 'EGP' },
    ];
    const out = reconstructArrPipeline(cycles, deals, 3, NOW);
    expect(out).toHaveLength(3);
    expect(out[0].dateISO).toBe('2026-07-15');
    expect(out[0].arr).toBe(1500);       // both cycles active
    expect(out[0].pipeline).toBe(200);   // only first deal created
    expect(out[2].dateISO).toBe('2026-07-17');
    expect(out[2].arr).toBe(1500);
    expect(out[2].pipeline).toBe(300);   // both deals open
  });
});

describe('reconstructRollingMrr', () => {
  it('MRR = active-cycle value at month start; churn = churned-during ÷ starting MRR', () => {
    const cycles = [
      { started_at: '2026-01-01', ends_at: '2026-12-31', value: 1000, currency: 'EGP', status: 'active' },
      { started_at: '2026-01-01', ends_at: '2026-12-31', value: 500,  currency: 'EGP', status: 'churned', updated_at: '2026-06-10T00:00:00Z' },
    ];
    const out = reconstructRollingMrr(cycles, 3, NOW);
    // months returned oldest->newest, last is current month
    expect(out).toHaveLength(3);
    expect(out[2].monthISO).toBe('2026-07-01');
    // At start of July, the churned cycle is already churned (June 10), so July MRR = 1000
    expect(out[2].mrr).toBe(1000);
    expect(out[2].churnRate).toBe(0);
    // June: started at 1500 (both active), churned 500 during month → 33%
    const june = out.find((r) => r.monthISO === '2026-06-01')!;
    expect(june.mrr).toBe(1500);
    expect(Math.round(june.churnRate)).toBe(33);
  });
});

describe('reconstructWonLostWeekly', () => {
  it('groups won and lost deal amounts into week buckets', () => {
    const deals = [
      { closed_at: '2026-07-15T00:00:00Z', stage: 'won',  amount: 1000, currency: 'EGP' },
      { closed_at: '2026-07-14T00:00:00Z', stage: 'lost', amount: 200,  currency: 'EGP' },
      { closed_at: '2026-07-08T00:00:00Z', stage: 'won',  amount: 500,  currency: 'EGP' },
    ];
    const out = reconstructWonLostWeekly(deals, 2, NOW);
    expect(out).toHaveLength(2);
    const current = out[1];
    expect(current.won).toBe(1000);
    expect(current.lost).toBe(200);
    const prev = out[0];
    expect(prev.won).toBe(500);
    expect(prev.lost).toBe(0);
  });
});

describe('averageCycleDays', () => {
  it('averages closed_at - accounts.created_at, overall and per channel', () => {
    const accountsById = new Map([
      ['a', { created_at: '2026-05-01T00:00:00Z' }],
      ['b', { created_at: '2026-06-01T00:00:00Z' }],
      ['c', { created_at: '2026-06-15T00:00:00Z' }],
    ]);
    const wonDeals = [
      { closed_at: '2026-06-01T00:00:00Z', account_id: 'a', channel: 'Google Ads' },
      { closed_at: '2026-07-01T00:00:00Z', account_id: 'b', channel: 'Google Ads' },
      { closed_at: '2026-06-30T00:00:00Z', account_id: 'c', channel: 'LinkedIn' },
    ];
    const out = averageCycleDays(wonDeals, accountsById);
    // a: 31d, b: 30d, c: 15d → overall avg = 25.33
    expect(Math.round(out.overallAvgDays)).toBe(25);
    expect(Math.round(out.byChannel.get('Google Ads')!)).toBe(31); // (31+30)/2 = 30.5 → 31
    expect(out.byChannel.get('LinkedIn')).toBe(15);
  });
});
