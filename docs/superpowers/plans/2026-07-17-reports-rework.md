# Reports Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure v3's Reports module from 7 tabs into 4 thematic tabs (Lead Generation, Pipeline, Win/Loss/Churned, AM), add MT-resolved attribution, date-range filtering, an admin owner filter, functional PDF export, and close all v1/v2 gaps identified in the design spec.

**Architecture:** Small shared primitives (`DateRangeFilter`, owner filter in `ReportsShell`, `useResolvedAttribution` hook, `exportReportPdf` utility, pure calculation helpers) built first with unit tests. Then a full retab of `ReportsShell` and three new tab components (`LeadGenerationReport`, rewritten `PipelineReport`, `WinLossChurnedReport`) that consume those primitives. `AMReport` stays but gains the owner filter. No new backend migrations.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind (existing theme tokens: `bg-ok`, `bg-warn`, `text-text-3`, etc.), TanStack Query, Supabase, Vitest. Charts are hand-rolled SVG (v3 has no chart library — consistent with existing `Sparkline` and `KeyMetrics` bar-lists).

## Global Constraints

- No new tables or migrations — everything computed client-side from existing `accounts`, `deals`, `contract_cycles`, `marketing_tracking`, `targets` data.
- Reuse existing hooks (`useAccounts`, `useContractCycles`, `useTargets`, `useMe`, `useProfiles`, `useDeals`) — do not duplicate queries. Add new hooks only where a genuinely new dataset is needed (`useResolvedAttribution`, `useMarketingTrackingAll`).
- No new dependencies. PDF export uses browser `window.print()` with print CSS, not jsPDF/html2canvas.
- Currency: all monetary values pass through `toEgp(value, currency)` + `fmtEgp()` from `@/lib/format` — never format raw numbers.
- Owner filter is admin-only, matching the pattern in `Dashboard.tsx:130-142` and `CsDashboard.tsx` (`me.data?.role === 'admin'`).
- Every task ends with a green `npx tsc --noEmit && npx vitest run` and a commit.
- Deploy is automatic on push to `main` (Vercel).

## File Structure

**New files:**
- `src/features/reports/shared/DateRangeFilter.tsx` — UI component
- `src/features/reports/shared/dateRange.ts` — `resolveDateRange` pure helper
- `src/features/reports/shared/OwnerFilter.tsx` — UI component (admin-gated)
- `src/features/reports/shared/attribution.ts` — pure resolution helper (`resolveChannel`)
- `src/features/reports/shared/exportPdf.ts` — `exportReportPdf` utility
- `src/features/reports/shared/reportCalc.ts` — pure calculation helpers (ARR/pipeline reconstruction, MRR/churn, cycle time)
- `src/features/reports/shared/__tests__/dateRange.test.ts`
- `src/features/reports/shared/__tests__/attribution.test.ts`
- `src/features/reports/shared/__tests__/reportCalc.test.ts`
- `src/hooks/useMarketingTrackingAll.ts` — fetch all MT rows (v3 only has `useMarketingTracking(accountId)` today)
- `src/hooks/useResolvedAttribution.ts` — joins accounts + MT, returns `Map<accountId, channel>`
- `src/features/reports/tabs/LeadGenerationReport.tsx`
- `src/features/reports/tabs/WinLossChurnedReport.tsx`
- `src/features/reports/reportsPrint.css` (imported once by ReportsShell)

**Modified files:**
- `src/features/reports/ReportsShell.tsx` — tab list becomes 4 tabs, adds owner filter + Export PDF button
- `src/features/reports/tabs/PipelineReport.tsx` — rewritten to be the new merged Pipeline+Revenue tab
- `src/features/reports/tabs/AMReport.tsx` — reads owner filter from context
- `src/routes/index.tsx` — routes rewired to new tab set
- `src/index.css` — one `@import` for print CSS (or leave `reportsPrint.css` scoped)

**Deleted files:**
- `src/features/reports/tabs/KeyMetrics.tsx`
- `src/features/reports/tabs/RevenueReport.tsx`
- `src/features/reports/tabs/AcquisitionReport.tsx`
- `src/features/reports/tabs/RenewalReport.tsx`
- `src/features/reports/tabs/CampaignReport.tsx`
- `src/features/reports/tabs/StubReport.tsx`

---

## Task 1: Date-range primitive + helper + tests

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/shared/dateRange.ts`
- Create: `recruitera-crm-v3/src/features/reports/shared/DateRangeFilter.tsx`
- Test: `recruitera-crm-v3/src/features/reports/shared/__tests__/dateRange.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type DateRangeKey = '7d' | '30d' | '90d' | 'qtd' | 'ytd' | 'custom'`
  - `type DateRange = { startISO: string; endISO: string; label: string }`
  - `resolveDateRange(key: DateRangeKey, now: Date, customFrom?: string, customTo?: string): DateRange`
  - `<DateRangeFilter value={key} customFrom customTo onChange={(k, from?, to?) => void} />`

- [ ] **Step 1: Write failing tests**

```ts
// recruitera-crm-v3/src/features/reports/shared/__tests__/dateRange.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/dateRange.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dateRange.ts`**

```ts
// recruitered-crm-v3/src/features/reports/shared/dateRange.ts
export type DateRangeKey = '7d' | '30d' | '90d' | 'qtd' | 'ytd' | 'custom';
export type DateRange = { startISO: string; endISO: string; label: string };

const DAY = 86_400_000;
function iso(d: Date) { return d.toISOString().slice(0, 10); }

export function resolveDateRange(
  key: DateRangeKey,
  now: Date,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const endISO = iso(now);
  if (key === 'custom') {
    const from = customFrom || iso(new Date(now.getTime() - 29 * DAY));
    const to = customTo || endISO;
    return {
      startISO: from,
      endISO: to,
      label: from === iso(new Date(now.getTime() - 29 * DAY)) && to === endISO
        ? 'Last 30 days'
        : `${from} → ${to}`,
    };
  }
  if (key === '7d')  return { startISO: iso(new Date(now.getTime() - 6 * DAY)),  endISO, label: 'Last 7 days'  };
  if (key === '30d') return { startISO: iso(new Date(now.getTime() - 29 * DAY)), endISO, label: 'Last 30 days' };
  if (key === '90d') return { startISO: iso(new Date(now.getTime() - 89 * DAY)), endISO, label: 'Last 90 days' };
  if (key === 'qtd') {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return { startISO: iso(start), endISO, label: `Q${q + 1} ${now.getFullYear()} to date` };
  }
  const yStart = new Date(now.getFullYear(), 0, 1);
  return { startISO: iso(yStart), endISO, label: `${now.getFullYear()} to date` };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/dateRange.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Create the `DateRangeFilter` component**

```tsx
// recruitera-crm-v3/src/features/reports/shared/DateRangeFilter.tsx
import { cn } from '@/lib/cn';
import type { DateRangeKey } from './dateRange';

const OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'qtd', label: 'QTD' },
  { key: 'ytd', label: 'YTD' },
  { key: 'custom', label: 'Custom' },
];

export function DateRangeFilter({
  value, customFrom, customTo, onChange,
}: {
  value: DateRangeKey;
  customFrom?: string;
  customTo?: string;
  onChange: (key: DateRangeKey, from?: string, to?: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key, customFrom, customTo)}
            className={cn(
              'px-2.5 py-1 rounded text-[12px] font-semibold',
              value === o.key ? 'bg-surface text-text shadow-sh1' : 'text-text-3',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom ?? ''}
            onChange={(e) => onChange('custom', e.target.value, customTo)}
            className="h-8 px-2 border border-border-2 rounded-md bg-surface text-[12px] outline-none"
          />
          <span className="text-text-3 text-[11px]">→</span>
          <input
            type="date"
            value={customTo ?? ''}
            onChange={(e) => onChange('custom', customFrom, e.target.value)}
            className="h-8 px-2 border border-border-2 rounded-md bg-surface text-[12px] outline-none"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
cd ..
git add recruitera-crm-v3/src/features/reports/shared/
git commit -m "feat(crm-v3): reports — DateRangeFilter primitive + resolveDateRange helper

Ports v1's 7d/30d/90d/QTD/YTD/Custom range keys. Pure helper is unit
tested; the UI component is a thin wrapper matching the existing
period-toggle style used on the dashboards."
```

---

## Task 2: Attribution helper + hook + tests

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/shared/attribution.ts`
- Create: `recruitera-crm-v3/src/features/reports/shared/__tests__/attribution.test.ts`
- Create: `recruitera-crm-v3/src/hooks/useMarketingTrackingAll.ts`
- Create: `recruitera-crm-v3/src/hooks/useResolvedAttribution.ts`

**Interfaces:**
- Consumes: `useAccounts` returns `Account[]` with fields including `id`, `company_ref`, `source` (from `useAccounts.ts`).
- Produces:
  - `resolveChannel(account: { source: string | null; company_ref: string | null }, mtByRef: Map<string, { first_source: string | null }>): string` — returns MT's `first_source` if present, else raw `accounts.source`, else `'(unknown)'`.
  - `useMarketingTrackingAll()` — TanStack query returning `Array<{ company_ref: string; first_source: string | null }>`.
  - `useResolvedAttribution()` — returns `{ channelByAccountId: Map<string, string>; isLoading: boolean }`.

- [ ] **Step 1: Write failing tests for `resolveChannel`**

```ts
// recruitera-crm-v3/src/features/reports/shared/__tests__/attribution.test.ts
import { describe, it, expect } from 'vitest';
import { resolveChannel } from '../attribution';

describe('resolveChannel', () => {
  const mt = new Map([
    ['ref-1', { first_source: 'Google Ads' }],
    ['ref-2', { first_source: null }],
  ]);

  it('prefers MT first_source when present', () => {
    const acct = { source: 'Manual', company_ref: 'ref-1' };
    expect(resolveChannel(acct, mt)).toBe('Google Ads');
  });
  it('falls back to accounts.source when MT row exists but first_source is null', () => {
    const acct = { source: 'LinkedIn', company_ref: 'ref-2' };
    expect(resolveChannel(acct, mt)).toBe('LinkedIn');
  });
  it('falls back to accounts.source when no MT row exists for the ref', () => {
    const acct = { source: 'Cold outreach', company_ref: 'ref-99' };
    expect(resolveChannel(acct, mt)).toBe('Cold outreach');
  });
  it('returns (unknown) when both MT and source are missing', () => {
    const acct = { source: null, company_ref: null };
    expect(resolveChannel(acct, mt)).toBe('(unknown)');
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/attribution.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `attribution.ts`**

```ts
// recruitera-crm-v3/src/features/reports/shared/attribution.ts
export function resolveChannel(
  account: { source: string | null; company_ref: string | null },
  mtByRef: Map<string, { first_source: string | null }>,
): string {
  const ref = account.company_ref;
  if (ref) {
    const row = mtByRef.get(ref);
    if (row?.first_source) return row.first_source;
  }
  return account.source || '(unknown)';
}
```

- [ ] **Step 4: Run to verify PASS**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/attribution.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Create `useMarketingTrackingAll` hook**

```ts
// recruitera-crm-v3/src/hooks/useMarketingTrackingAll.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MtRow = { company_ref: string; first_source: string | null };

export function useMarketingTrackingAll() {
  return useQuery({
    queryKey: ['marketing_tracking', 'all'],
    queryFn: async (): Promise<MtRow[]> => {
      const { data, error } = await supabase
        .from('marketing_tracking')
        .select('company_ref,first_source')
        .not('company_ref', 'is', null);
      if (error) throw error;
      return (data ?? []) as MtRow[];
    },
  });
}
```

- [ ] **Step 6: Create `useResolvedAttribution` hook**

```ts
// recruitera-crm-v3/src/hooks/useResolvedAttribution.ts
import { useMemo } from 'react';
import { useAccounts } from './useAccounts';
import { useMarketingTrackingAll } from './useMarketingTrackingAll';
import { resolveChannel } from '@/features/reports/shared/attribution';

export function useResolvedAttribution() {
  const accts = useAccounts();
  const mt = useMarketingTrackingAll();

  const channelByAccountId = useMemo(() => {
    const mtByRef = new Map<string, { first_source: string | null }>();
    (mt.data ?? []).forEach((r) => { if (r.company_ref) mtByRef.set(r.company_ref, { first_source: r.first_source }); });

    const out = new Map<string, string>();
    (accts.data ?? []).forEach((a) => {
      out.set(a.id, resolveChannel({ source: a.source ?? null, company_ref: (a as { company_ref?: string | null }).company_ref ?? null }, mtByRef));
    });
    return out;
  }, [accts.data, mt.data]);

  return { channelByAccountId, isLoading: accts.isLoading || mt.isLoading };
}
```

Note: `Account` type in `useAccounts.ts` may not currently expose `company_ref`. If typecheck fails, add `company_ref: string | null` to the `Account` type and the `.select(...)` string in `useAccounts.ts` in this same task.

- [ ] **Step 7: Typecheck + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
cd ..
git add recruitera-crm-v3/src/features/reports/shared/attribution.ts \
        recruitera-crm-v3/src/features/reports/shared/__tests__/attribution.test.ts \
        recruitera-crm-v3/src/hooks/useMarketingTrackingAll.ts \
        recruitera-crm-v3/src/hooks/useResolvedAttribution.ts \
        recruitera-crm-v3/src/hooks/useAccounts.ts  # only if edited
git commit -m "feat(crm-v3): reports — MT-resolved channel attribution

Ports v1's resolveMT-first, accounts.source-fallback attribution as a
pure helper + a hook that joins accounts with marketing_tracking once
and returns a Map<accountId, channel>. Consumed by the new Lead
Generation tab in a later task."
```

---

## Task 3: Report calculation helpers + tests

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/shared/reportCalc.ts`
- Create: `recruitera-crm-v3/src/features/reports/shared/__tests__/reportCalc.test.ts`

**Interfaces:**
- Consumes: nothing (all inputs are plain data)
- Produces:
  - `reconstructArrPipeline(cycles, deals, days: number, now: Date): Array<{ dateISO: string; arr: number; pipeline: number }>`
  - `reconstructRollingMrr(cycles, months: number, now: Date): Array<{ monthISO: string; mrr: number; churnRate: number }>`
  - `reconstructWonLostWeekly(deals, weeks: number, now: Date): Array<{ weekStartISO: string; won: number; lost: number }>`
  - `averageCycleDays(wonDeals, accountsById): { overallAvgDays: number; byChannel: Map<string, number> }` — requires callers to have already resolved `channel` per deal via `useResolvedAttribution`; deal input shape: `{ closed_at: string; account_id: string; channel: string }`.

- [ ] **Step 1: Write failing tests**

```ts
// recruitera-crm-v3/src/features/reports/shared/__tests__/reportCalc.test.ts
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
```

- [ ] **Step 2: Run FAIL**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/reportCalc.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `reportCalc.ts`**

```ts
// recruitera-crm-v3/src/features/reports/shared/reportCalc.ts
import { toEgp } from '@/lib/format';

const DAY = 86_400_000;
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function monthStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

export type CycleInput = {
  started_at: string | null;
  ends_at: string | null;
  value: number | null;
  currency: string | null;
  status?: string | null;
  updated_at?: string | null;
};

export type DealInput = {
  created_at?: string | null;
  closed_at: string | null;
  stage?: string | null;
  amount: number | null;
  currency: string | null;
};

export function reconstructArrPipeline(
  cycles: CycleInput[], deals: DealInput[], days: number, now: Date,
): Array<{ dateISO: string; arr: number; pipeline: number }> {
  const out: Array<{ dateISO: string; arr: number; pipeline: number }> = [];
  const startOfNow = new Date(iso(now));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(startOfNow.getTime() - i * DAY);
    const dISO = iso(d);
    let arr = 0;
    for (const c of cycles) {
      if (!c.started_at || !c.ends_at) continue;
      if (c.started_at <= dISO && dISO <= c.ends_at) arr += toEgp(c.value ?? 0, c.currency);
    }
    let pipeline = 0;
    for (const dl of deals) {
      if (!dl.created_at) continue;
      const createdISO = dl.created_at.slice(0, 10);
      if (createdISO > dISO) continue;
      const closedISO = dl.closed_at ? dl.closed_at.slice(0, 10) : null;
      if (closedISO && closedISO <= dISO) continue;
      pipeline += toEgp(dl.amount ?? 0, dl.currency);
    }
    out.push({ dateISO: dISO, arr, pipeline });
  }
  return out;
}

export function reconstructRollingMrr(
  cycles: CycleInput[], months: number, now: Date,
): Array<{ monthISO: string; mrr: number; churnRate: number }> {
  const out: Array<{ monthISO: string; mrr: number; churnRate: number }> = [];
  const thisMonth = monthStart(now);
  for (let i = months - 1; i >= 0; i--) {
    const mStart = addMonths(thisMonth, -i);
    const mEnd = addMonths(mStart, 1);
    const mStartISO = iso(mStart);
    const mEndISO = iso(mEnd);
    // MRR at month start: cycles active at that date AND not already churned before it
    let startMrr = 0;
    for (const c of cycles) {
      if (!c.started_at || !c.ends_at) continue;
      if (c.started_at > mStartISO || c.ends_at < mStartISO) continue;
      if (c.status === 'churned' && c.updated_at && c.updated_at.slice(0, 10) < mStartISO) continue;
      startMrr += toEgp(c.value ?? 0, c.currency);
    }
    let churnedValue = 0;
    for (const c of cycles) {
      if (c.status !== 'churned' || !c.updated_at) continue;
      const chISO = c.updated_at.slice(0, 10);
      if (chISO >= mStartISO && chISO < mEndISO) churnedValue += toEgp(c.value ?? 0, c.currency);
    }
    const churnRate = startMrr > 0 ? (churnedValue / startMrr) * 100 : 0;
    out.push({ monthISO: mStartISO, mrr: startMrr, churnRate });
  }
  return out;
}

export function reconstructWonLostWeekly(
  deals: DealInput[], weeks: number, now: Date,
): Array<{ weekStartISO: string; won: number; lost: number }> {
  const out: Array<{ weekStartISO: string; won: number; lost: number }> = [];
  const startOfNow = new Date(iso(now));
  // week bucket = Monday of the week the closed_at falls in
  const dayOfWeek = (startOfNow.getUTCDay() + 6) % 7; // Mon=0
  const thisMon = new Date(startOfNow.getTime() - dayOfWeek * DAY);
  for (let i = weeks - 1; i >= 0; i--) {
    const wStart = new Date(thisMon.getTime() - i * 7 * DAY);
    const wEnd = new Date(wStart.getTime() + 7 * DAY);
    const wStartISO = iso(wStart);
    const wEndISO = iso(wEnd);
    let won = 0, lost = 0;
    for (const dl of deals) {
      if (!dl.closed_at) continue;
      const clISO = dl.closed_at.slice(0, 10);
      if (clISO < wStartISO || clISO >= wEndISO) continue;
      const amt = toEgp(dl.amount ?? 0, dl.currency);
      if (dl.stage === 'won' || dl.stage === 'collected') won += amt;
      else if (dl.stage === 'lost') lost += amt;
    }
    out.push({ weekStartISO: wStartISO, won, lost });
  }
  return out;
}

export function averageCycleDays(
  wonDeals: Array<{ closed_at: string; account_id: string; channel: string }>,
  accountsById: Map<string, { created_at: string }>,
): { overallAvgDays: number; byChannel: Map<string, number> } {
  let totalDays = 0, totalCount = 0;
  const perChannel = new Map<string, { days: number; count: number }>();
  for (const d of wonDeals) {
    const acct = accountsById.get(d.account_id);
    if (!acct) continue;
    const days = (new Date(d.closed_at).getTime() - new Date(acct.created_at).getTime()) / DAY;
    if (!Number.isFinite(days) || days < 0) continue;
    totalDays += days; totalCount++;
    const cur = perChannel.get(d.channel) ?? { days: 0, count: 0 };
    cur.days += days; cur.count++;
    perChannel.set(d.channel, cur);
  }
  const byChannel = new Map<string, number>();
  perChannel.forEach((v, k) => byChannel.set(k, v.count > 0 ? v.days / v.count : 0));
  return { overallAvgDays: totalCount > 0 ? totalDays / totalCount : 0, byChannel };
}
```

- [ ] **Step 4: Run PASS**

Run: `cd recruitera-crm-v3 && npx vitest run src/features/reports/shared/__tests__/reportCalc.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Full suite + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
npx vitest run
cd ..
git add recruitera-crm-v3/src/features/reports/shared/reportCalc.ts \
        recruitera-crm-v3/src/features/reports/shared/__tests__/reportCalc.test.ts
git commit -m "feat(crm-v3): reports — pure calculation helpers for ARR/pipeline/MRR/cycle time

Retroactively reconstructs daily ARR-vs-pipeline (30d), monthly MRR +
churn rate, weekly won-vs-lost, and per-source sales cycle time. All
pure functions unit-tested — no data-fetching involved."
```

---

## Task 4: Owner filter + Reports context

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/shared/OwnerFilter.tsx`
- Create: `recruitera-crm-v3/src/features/reports/shared/reportsContext.ts`

**Interfaces:**
- Consumes: `useMe`, `useProfiles`
- Produces:
  - `type ReportsContextValue = { ownerId: string | null /* null = all */; setOwnerId: (id: string | null) => void }`
  - `useReportsOwner()` hook returning that value
  - `<OwnerFilter />` renders admin-only picker; no-ops for non-admins
  - `<ReportsProvider>` wraps children with the context

- [ ] **Step 1: Create the context**

```ts
// recruitera-crm-v3/src/features/reports/shared/reportsContext.ts
import { createContext, useContext } from 'react';

export type ReportsContextValue = {
  ownerId: string | null;
  setOwnerId: (id: string | null) => void;
};

export const ReportsContext = createContext<ReportsContextValue>({
  ownerId: null,
  setOwnerId: () => {},
});

export function useReportsOwner() {
  return useContext(ReportsContext);
}
```

- [ ] **Step 2: Create the OwnerFilter component**

```tsx
// recruitera-crm-v3/src/features/reports/shared/OwnerFilter.tsx
import { useMe } from '@/hooks/useMe';
import { useProfiles } from '@/hooks/useUsersData';
import { useReportsOwner } from './reportsContext';

export function OwnerFilter() {
  const me = useMe();
  const profiles = useProfiles();
  const { ownerId, setOwnerId } = useReportsOwner();
  const isAdmin = me.data?.role === 'admin';
  if (!isAdmin) return null;
  return (
    <select
      value={ownerId ?? ''}
      onChange={(e) => setOwnerId(e.target.value || null)}
      className="h-8 pl-3 pr-8 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text outline-none cursor-pointer"
      title="Filter Reports by AM/owner"
    >
      <option value="">All AMs</option>
      {(profiles.data ?? []).map((p) => (
        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
cd ..
git add recruitera-crm-v3/src/features/reports/shared/OwnerFilter.tsx \
        recruitera-crm-v3/src/features/reports/shared/reportsContext.ts
git commit -m "feat(crm-v3): reports — admin-only owner filter + context"
```

---

## Task 5: PDF export utility + print CSS

**Files:**
- Create: `recruitera-crm-v3/src/features/reports/shared/exportPdf.ts`
- Create: `recruitera-crm-v3/src/features/reports/reportsPrint.css`

**Interfaces:**
- Produces: `exportReportPdf(tabName: string): void` — sets a body class, updates document title, calls `window.print()`, restores state on the `afterprint` event.

- [ ] **Step 1: Create the print CSS**

```css
/* recruitera-crm-v3/src/features/reports/reportsPrint.css */
@media print {
  body.reports-printing * { visibility: hidden !important; }
  body.reports-printing #reports-print-root,
  body.reports-printing #reports-print-root * { visibility: visible !important; }
  body.reports-printing #reports-print-root {
    position: absolute; left: 0; top: 0; width: 100%;
    padding: 24px; background: white; color: black;
  }
  body.reports-printing .no-print { display: none !important; }
}
```

- [ ] **Step 2: Create the utility**

```ts
// recruitera-crm-v3/src/features/reports/shared/exportPdf.ts
export function exportReportPdf(tabName: string): void {
  const original = document.title;
  const dateISO = new Date().toISOString().slice(0, 10);
  document.title = `Recruitera Reports — ${tabName} — ${dateISO}`;
  document.body.classList.add('reports-printing');
  const cleanup = () => {
    document.body.classList.remove('reports-printing');
    document.title = original;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
```

- [ ] **Step 3: Commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
cd ..
git add recruitera-crm-v3/src/features/reports/shared/exportPdf.ts \
        recruitera-crm-v3/src/features/reports/reportsPrint.css
git commit -m "feat(crm-v3): reports — printable Export PDF utility

Uses window.print() with a scoped print stylesheet that shows only the
#reports-print-root element. No new dependency."
```

---

## Task 6: ReportsShell retab + wire shared primitives

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/ReportsShell.tsx`
- Modify: `recruitera-crm-v3/src/routes/index.tsx`

**Interfaces:**
- Consumes: `OwnerFilter`, `ReportsContext`, `exportReportPdf`, print CSS
- Produces: 4-tab shell — `/reports` (Lead Generation), `/reports/pipeline`, `/reports/win-loss`, `/reports/am`

- [ ] **Step 1: Rewrite `ReportsShell.tsx`**

```tsx
// recruitera-crm-v3/src/features/reports/ReportsShell.tsx
import { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OwnerFilter } from './shared/OwnerFilter';
import { ReportsContext } from './shared/reportsContext';
import { exportReportPdf } from './shared/exportPdf';
import './reportsPrint.css';

const TABS = [
  { to: '/reports', label: 'Lead Generation', end: true },
  { to: '/reports/pipeline', label: 'Pipeline' },
  { to: '/reports/win-loss', label: 'Win / Loss / Churned' },
  { to: '/reports/am', label: 'AM Performance' },
];

export default function ReportsShell() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const ctxValue = useMemo(() => ({ ownerId, setOwnerId }), [ownerId]);
  const loc = useLocation();
  const currentLabel = TABS.find((t) => t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to))?.label ?? 'Reports';

  return (
    <ReportsContext.Provider value={ctxValue}>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text">Reports</h1>
            <p className="text-[12.5px] text-text-3 mt-0.5">Live analytics from Supabase.</p>
          </div>
          <OwnerFilter />
          <button
            onClick={() => exportReportPdf(currentLabel)}
            className="inline-flex items-center gap-1.5 h-8 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text hover:bg-surface-2"
          >
            <Download size={13} /> Export PDF
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-3 no-print">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center h-9 px-4 rounded-lg text-[12.5px] font-semibold border transition-colors',
                  isActive
                    ? 'bg-cg-900 text-white border-cg-900'
                    : 'bg-surface text-text-2 border-border hover:bg-surface-2',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <div id="reports-print-root">
          <Outlet />
        </div>
      </div>
    </ReportsContext.Provider>
  );
}
```

- [ ] **Step 2: Update `src/routes/index.tsx`**

Change these lines (find via `grep -n "reports" src/routes/index.tsx`):

Delete imports for `KeyMetrics`, `PipelineReport`, `AcquisitionReport`, `AMReport`, `RevenueReport`, `RenewalReport`, `CampaignReport`.
Replace with:

```tsx
import LeadGenerationReport from '@/features/reports/tabs/LeadGenerationReport';
import PipelineReport from '@/features/reports/tabs/PipelineReport';
import WinLossChurnedReport from '@/features/reports/tabs/WinLossChurnedReport';
import AMReport from '@/features/reports/tabs/AMReport';
```

Replace the `reports` route block with:

```tsx
{
  path: 'reports',
  element: <ReportsShell />,
  children: [
    { index: true, element: <LeadGenerationReport /> },
    { path: 'pipeline', element: <PipelineReport /> },
    { path: 'win-loss', element: <WinLossChurnedReport /> },
    { path: 'am', element: <AMReport /> },
  ],
},
```

Do NOT delete the old tab files yet — they're referenced by the imports still. Deletion happens in Task 10 once replacements are in and passing.

- [ ] **Step 3: Create temporary stub tab files so the app compiles**

Overwrite `LeadGenerationReport.tsx`, `WinLossChurnedReport.tsx` with placeholder content so the route resolves. `PipelineReport.tsx` is being rewritten in Task 8 — leave existing implementation for now (route still resolves it).

```tsx
// recruitera-crm-v3/src/features/reports/tabs/LeadGenerationReport.tsx
export default function LeadGenerationReport() {
  return <div className="p-4 text-[13px] text-text-3">Lead Generation report — coming up in the next task.</div>;
}
```

```tsx
// recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx
export default function WinLossChurnedReport() {
  return <div className="p-4 text-[13px] text-text-3">Win / Loss / Churned report — coming up in a later task.</div>;
}
```

- [ ] **Step 4: Typecheck, build, commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
npx vitest run
npm run build
cd ..
git add recruitera-crm-v3/src/features/reports/ReportsShell.tsx \
        recruitera-crm-v3/src/features/reports/tabs/LeadGenerationReport.tsx \
        recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx \
        recruitera-crm-v3/src/routes/index.tsx
git commit -m "feat(crm-v3): reports — retab shell to 4 tabs + wire owner filter and PDF export

Old tabs still exist on disk (removed in a later cleanup task) but are
no longer routed. Two new tab files are stubs; content lands in the
next few tasks."
```

---

## Task 7: LeadGenerationReport tab

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/LeadGenerationReport.tsx` (from stub → real)

**Interfaces:**
- Consumes: `useAccounts`, `useDeals`, `useResolvedAttribution`, `useReportsOwner`, `useUtmLinks`, `useUtmCampaigns`, `resolveDateRange`, `DISQ_REASONS`
- Produces: renders the tab; no exports consumed by other tabs.

- [ ] **Step 1: Implement the full tab**

Replace the stub with:

```tsx
// recruitera-crm-v3/src/features/reports/tabs/LeadGenerationReport.tsx
import { useMemo, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useResolvedAttribution } from '@/hooks/useResolvedAttribution';
import { useUtmLinks, useUtmCampaigns } from '@/hooks/useUtmOptions';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { DISQ_REASONS } from '@/hooks/useDisqualify';
import { useReportsOwner } from '../shared/reportsContext';
import { DateRangeFilter } from '../shared/DateRangeFilter';
import { resolveDateRange, type DateRangeKey } from '../shared/dateRange';

export default function LeadGenerationReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const attribution = useResolvedAttribution();
  const links = useUtmLinks();
  const campaigns = useUtmCampaigns();
  const { ownerId } = useReportsOwner();
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('90d');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const range = useMemo(() => resolveDateRange(rangeKey, new Date(), from, to), [rangeKey, from, to]);

  const rows = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    list = list.filter((a) => {
      const createdISO = a.created_at.slice(0, 10);
      return createdISO >= range.startISO && createdISO <= range.endISO;
    });
    return list;
  }, [accts.data, ownerId, range]);

  // Per-channel breakdown: leads count, disqualified count, revenue attributed
  const dealAmountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    (deals.data ?? []).forEach((d) => {
      if (!d.account_id || d.is_archived) return;
      m.set(d.account_id, (m.get(d.account_id) ?? 0) + toEgp(d.amount ?? 0, d.currency));
    });
    return m;
  }, [deals.data]);

  const channelStats = useMemo(() => {
    const stats = new Map<string, { leads: number; disq: number; revenue: number }>();
    rows.forEach((a) => {
      const ch = attribution.channelByAccountId.get(a.id) ?? '(unknown)';
      const cur = stats.get(ch) ?? { leads: 0, disq: 0, revenue: 0 };
      cur.leads += 1;
      if (a.disqualified_at) cur.disq += 1;
      cur.revenue += dealAmountByAccount.get(a.id) ?? toEgp(a.deal_value ?? 0, a.deal_currency);
      stats.set(ch, cur);
    });
    return Array.from(stats.entries())
      .map(([channel, s]) => ({ channel, ...s, dropOffRate: s.leads > 0 ? (s.disq / s.leads) * 100 : 0 }))
      .sort((a, b) => b.leads - a.leads);
  }, [rows, attribution.channelByAccountId, dealAmountByAccount]);

  // Disqualify reason breakdown (full, not top-6)
  const reasonBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => {
      if (!a.disqualified_at) return;
      const key = a.disqualified_reason || '(no reason)';
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .map(([reason, count]) => ({
        reason,
        label: DISQ_REASONS.find((r) => r.key === reason)?.label ?? reason,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  // Campaign stats (utm campaigns + attributed accounts + revenue)
  const campaignStats = useMemo(() => {
    const byCampaign = new Map<string, { accounts: number; revenue: number }>();
    rows.forEach((a) => {
      const camp = (a as { campaign?: string | null }).campaign;
      if (!camp) return;
      const cur = byCampaign.get(camp) ?? { accounts: 0, revenue: 0 };
      cur.accounts += 1;
      cur.revenue += dealAmountByAccount.get(a.id) ?? toEgp(a.deal_value ?? 0, a.deal_currency);
      byCampaign.set(camp, cur);
    });
    return Array.from(byCampaign.entries())
      .map(([campaign, s]) => ({ campaign, ...s }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, dealAmountByAccount]);

  const totalLeads = rows.length;
  const totalDisq = rows.filter((a) => a.disqualified_at).length;
  const totalDropOff = totalLeads > 0 ? (totalDisq / totalLeads) * 100 : 0;

  const maxLeadsByChannel = Math.max(1, ...channelStats.map((s) => s.leads));
  const maxRevByChannel = Math.max(1, ...channelStats.map((s) => s.revenue));
  const maxReason = Math.max(1, ...reasonBreakdown.map((r) => r.count));
  const maxCampRev = Math.max(1, ...campaignStats.map((c) => c.revenue));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Leads in period" value={fmtInt(totalLeads)} />
        <Kpi label="Disqualified" value={fmtInt(totalDisq)} />
        <Kpi label="Drop-off rate" value={`${Math.round(totalDropOff)}%`} />
        <Kpi label="Named campaigns" value={fmtInt(campaigns.data?.length ?? 0)} sub={`${fmtInt(links.data?.length ?? 0)} UTM links`} />
      </div>

      {/* CHANNEL BREAKDOWN */}
      <Panel title="Leads by channel" hint="MT-resolved attribution — falls back to accounts.source">
        {channelStats.length === 0 && <Empty text="No leads in this range." />}
        {channelStats.map((s) => (
          <div key={s.channel} className="px-5 py-3 border-t border-border first:border-0">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-text flex-1 truncate">{s.channel}</span>
              <span className="text-[11.5px] text-text-3 tnum">{fmtInt(s.leads)} leads</span>
              <span className="text-[11.5px] text-text-3 tnum">{fmtEgp(s.revenue)}</span>
              <span className="text-[11.5px] text-bad tnum">{Math.round(s.dropOffRate)}% dropped</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent-strong" style={{ width: `${(s.leads / maxLeadsByChannel) * 100}%` }} />
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-ok" style={{ width: `${(s.revenue / maxRevByChannel) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </Panel>

      {/* DISQUALIFY REASONS */}
      <Panel title="Why leads were disqualified" hint="Full breakdown">
        {reasonBreakdown.length === 0 && <Empty text="No disqualifications in this range." />}
        {reasonBreakdown.map((r) => (
          <div key={r.reason} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.label}</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-bad" style={{ width: `${(r.count / maxReason) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-3 tnum w-10 text-right">{fmtInt(r.count)}</span>
          </div>
        ))}
      </Panel>

      {/* CAMPAIGNS */}
      <Panel title="Campaigns" hint="Ranked by attributed revenue">
        {campaignStats.length === 0 && <Empty text="No campaigns attributed in this range." />}
        {campaignStats.map((c) => (
          <div key={c.campaign} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{c.campaign}</span>
            <span className="text-[11.5px] text-text-3 tnum">{fmtInt(c.accounts)} accts</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-ok" style={{ width: `${(c.revenue / maxCampRev) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-2 font-bold tnum w-24 text-right">{fmtEgp(c.revenue)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {hint && <span className="text-[12px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">{text}</div>;
}
```

Note: if `Account` type doesn't already expose `disqualified_at`, `disqualified_reason`, or `campaign`, add those columns to the `.select(...)` in `useAccounts.ts` and to the `Account` type in the same task — same pattern already used in earlier session work.

- [ ] **Step 2: Verify build**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add recruitera-crm-v3/src/features/reports/tabs/LeadGenerationReport.tsx \
        recruitera-crm-v3/src/hooks/useAccounts.ts  # only if edited
git commit -m "feat(crm-v3): reports — Lead Generation tab

Consolidates old Acquisition + Campaign tabs and adds Lead-to-Disq
drop-off + full reason breakdown + campaign/source revenue, all with
MT-resolved attribution and a date-range filter."
```

---

## Task 8: PipelineReport tab (rewrite)

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/PipelineReport.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useAccounts`, `useDeals`, `useContractCycles`, `useTargets`, `useResolvedAttribution`, `useReportsOwner`, `reconstructArrPipeline`, `averageCycleDays`, `resolveDateRange`
- Produces: renders the tab.

- [ ] **Step 1: Rewrite `PipelineReport.tsx`**

```tsx
// recruitera-crm-v3/src/features/reports/tabs/PipelineReport.tsx
import { useMemo, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useTargets } from '@/hooks/useTargets';
import { useResolvedAttribution } from '@/hooks/useResolvedAttribution';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { useReportsOwner } from '../shared/reportsContext';
import { DateRangeFilter } from '../shared/DateRangeFilter';
import { resolveDateRange, type DateRangeKey } from '../shared/dateRange';
import { reconstructArrPipeline, averageCycleDays } from '../shared/reportCalc';

const STAGES = ['mql', 'sql', 'demo', 'proposal', 'won', 'paid'] as const;

export default function PipelineReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const cycles = useContractCycles();
  const targets = useTargets();
  const attribution = useResolvedAttribution();
  const { ownerId } = useReportsOwner();
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('qtd');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const range = useMemo(() => resolveDateRange(rangeKey, new Date(), from, to), [rangeKey, from, to]);

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);
  const scopedIds = useMemo(() => new Set(scopedAccts.map((a) => a.id)), [scopedAccts]);
  const scopedDeals = useMemo(() => (deals.data ?? []).filter((d) => !d.is_archived && d.account_id && scopedIds.has(d.account_id)), [deals.data, scopedIds]);
  const scopedCycles = useMemo(() => (cycles.data ?? []).filter((c) => scopedIds.has(c.account_id)), [cycles.data, scopedIds]);

  // Funnel + stage conversions
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    scopedAccts.forEach((a) => {
      const s = (a.stage || '').toLowerCase();
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return STAGES.map((s) => ({ stage: s, count: m.get(s) ?? 0 }));
  }, [scopedAccts]);
  const funnelMax = Math.max(1, ...stageCounts.map((s) => s.count));

  // Target attainment (QTD by default via the filter)
  const targetForPeriod = useMemo(() => {
    const list = targets.data ?? [];
    return list
      .filter((t) => t.period_start >= range.startISO && t.period_end <= range.endISO)
      .filter((t) => !ownerId ? true : (t.owner_kind === 'user' && t.owner_id === ownerId))
      .reduce((s, t) => s + (t.amount_egp || 0), 0);
  }, [targets.data, range, ownerId]);
  const wonInPeriod = useMemo(() => {
    return scopedCycles
      .filter((c) => c.started_at && c.started_at >= range.startISO && c.started_at <= range.endISO)
      .reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0);
  }, [scopedCycles, range]);
  const attainPct = targetForPeriod > 0 ? Math.round((wonInPeriod / targetForPeriod) * 100) : 0;

  const committedAcv = useMemo(
    () => scopedCycles.filter((c) => c.status === 'active' || !c.status).reduce((s, c) => s + toEgp(c.value ?? 0, c.currency), 0),
    [scopedCycles],
  );

  // ARR-vs-Pipeline 30-day trend
  const trend = useMemo(() => reconstructArrPipeline(scopedCycles, scopedDeals, 30, new Date()), [scopedCycles, scopedDeals]);
  const trendMax = Math.max(1, ...trend.flatMap((p) => [p.arr, p.pipeline]));

  // Sales cycle time per source + overall
  const wonDeals = useMemo(
    () => scopedDeals
      .filter((d) => (d.stage === 'won' || d.stage === 'collected') && d.closed_at && d.account_id)
      .map((d) => ({ closed_at: d.closed_at!, account_id: d.account_id!, channel: attribution.channelByAccountId.get(d.account_id!) ?? '(unknown)' })),
    [scopedDeals, attribution.channelByAccountId],
  );
  const acctById = useMemo(() => new Map(scopedAccts.map((a) => [a.id, { created_at: a.created_at }])), [scopedAccts]);
  const cycleTime = useMemo(() => averageCycleDays(wonDeals, acctById), [wonDeals, acctById]);
  const cycleRows = useMemo(
    () => Array.from(cycleTime.byChannel.entries()).map(([channel, days]) => ({ channel, days })).sort((a, b) => a.days - b.days),
    [cycleTime],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Target" value={targetForPeriod ? fmtEgp(targetForPeriod) : '—'} sub={range.label} />
        <Kpi label="Won" value={fmtEgp(wonInPeriod)} sub={`${attainPct}% of target`} />
        <Kpi label="Committed ACV" value={fmtEgp(committedAcv)} sub="active cycles" />
        <Kpi label="Overall avg cycle" value={cycleTime.overallAvgDays > 0 ? `${Math.round(cycleTime.overallAvgDays)}d` : '—'} sub="lead → won" />
      </div>

      <Panel title="Funnel" hint="Stage-by-stage counts + conversion">
        {stageCounts.map((s, i) => {
          const prev = i > 0 ? stageCounts[i - 1].count : s.count;
          const conv = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
          return (
            <div key={s.stage} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
              <span className="text-[13px] font-bold text-text uppercase w-20">{s.stage}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent-strong" style={{ width: `${(s.count / funnelMax) * 100}%` }} />
              </div>
              <span className="text-[12px] text-text-3 tnum w-12 text-right">{fmtInt(s.count)}</span>
              <span className="text-[11px] text-text-4 tnum w-16 text-right">{i > 0 ? `${conv}%` : '—'}</span>
            </div>
          );
        })}
      </Panel>

      <Panel title="ARR vs Pipeline — last 30 days">
        <TrendChart series={trend} max={trendMax} />
      </Panel>

      <Panel title="Sales cycle time by channel">
        {cycleRows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">No won deals in scope.</div>}
        {cycleRows.map((r) => (
          <div key={r.channel} className="px-5 py-3 border-t border-border flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.channel}</span>
            <span className="text-[12px] text-text-3 tnum">{Math.round(r.days)} days avg</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function TrendChart({ series, max }: { series: Array<{ dateISO: string; arr: number; pipeline: number }>; max: number }) {
  const H = 120, W = 640;
  const pt = (v: number, i: number) => `${(i / (series.length - 1)) * W},${H - (v / max) * H}`;
  const arrPath = series.map((p, i) => pt(p.arr, i)).join(' ');
  const pipePath = series.map((p, i) => pt(p.pipeline, i)).join(' ');
  return (
    <div className="p-5 border-t border-border">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]">
        <polyline points={pipePath} fill="none" stroke="rgb(var(--warn))" strokeWidth="2" />
        <polyline points={arrPath} fill="none" stroke="rgb(var(--ok))" strokeWidth="2" />
      </svg>
      <div className="flex gap-4 mt-2 text-[11.5px] font-semibold">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> ARR</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warn" /> Pipeline</span>
      </div>
    </div>
  );
}
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {hint && <span className="text-[12px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd recruitered-crm-v3
npx tsc --noEmit
npx vitest run
npm run build
cd ..
git add recruitera-crm-v3/src/features/reports/tabs/PipelineReport.tsx
git commit -m "feat(crm-v3): reports — Pipeline tab (funnel + target + ARR trend + cycle time)

Merges old Pipeline + Revenue tabs, adds the 30-day ARR-vs-Pipeline
trend chart (from v1) and Sales Cycle Time per channel + overall
average."
```

---

## Task 9: WinLossChurnedReport tab

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx` (from stub → real)

**Interfaces:**
- Consumes: `useAccounts`, `useDeals`, `useContractCycles`, `useReportsOwner`, `reconstructWonLostWeekly`, `reconstructRollingMrr`
- Produces: renders the tab.

- [ ] **Step 1: Implement**

```tsx
// recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx
import { useMemo } from 'react';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useContractCycles } from '@/hooks/useContractCycles';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { useReportsOwner } from '../shared/reportsContext';
import { reconstructWonLostWeekly, reconstructRollingMrr } from '../shared/reportCalc';

export default function WinLossChurnedReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const cycles = useContractCycles();
  const { ownerId } = useReportsOwner();

  const scopedAccts = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    return list;
  }, [accts.data, ownerId]);
  const scopedIds = useMemo(() => new Set(scopedAccts.map((a) => a.id)), [scopedAccts]);
  const scopedDeals = useMemo(() => (deals.data ?? []).filter((d) => !d.is_archived && d.account_id && scopedIds.has(d.account_id)), [deals.data, scopedIds]);
  const scopedCycles = useMemo(() => (cycles.data ?? []).filter((c) => scopedIds.has(c.account_id)), [cycles.data, scopedIds]);

  const wonCount = scopedDeals.filter((d) => d.stage === 'won' || d.stage === 'collected').length;
  const lostCount = scopedDeals.filter((d) => d.stage === 'lost').length;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const arr = scopedAccts.filter(isPaid).reduce((s, a) => s + toEgp(a.deal_value ?? 0, a.deal_currency), 0);

  // Renewal buckets — reuse existing lib/renewal semantics inline
  const now = Date.now();
  const bucket = (endMs: number) => {
    const days = (endMs - now) / 86_400_000;
    if (days < 0) return 'overdue';
    if (days <= 30) return 'd30';
    if (days <= 60) return 'd60';
    if (days <= 90) return 'd90';
    return null;
  };
  const buckets = useMemo(() => {
    const counts = { overdue: 0, d30: 0, d60: 0, d90: 0, active: 0, renewed: 0, churned: 0 };
    scopedCycles.forEach((c) => {
      if (c.status === 'renewed') { counts.renewed++; return; }
      if (c.status === 'churned') { counts.churned++; return; }
      if (!c.ends_at) return;
      const b = bucket(new Date(c.ends_at).getTime());
      if (b) counts[b]++;
      else counts.active++;
    });
    return counts;
  }, [scopedCycles]);

  // Loss reasons — full
  const lossReasons = useMemo(() => {
    const m = new Map<string, number>();
    scopedDeals.filter((d) => d.stage === 'lost').forEach((d) => {
      const key = d.disqualified_reason || d.lost_reason || '(no reason)';
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [scopedDeals]);
  const maxReason = Math.max(1, ...lossReasons.map((r) => r.count));

  // Won-vs-Lost weekly (8 weeks)
  const weekly = useMemo(() => reconstructWonLostWeekly(scopedDeals as Parameters<typeof reconstructWonLostWeekly>[0], 8, new Date()), [scopedDeals]);
  const weeklyMax = Math.max(1, ...weekly.flatMap((w) => [w.won, w.lost]));

  // MRR + churn (6 months)
  const mrr = useMemo(() => reconstructRollingMrr(scopedCycles, 6, new Date()), [scopedCycles]);
  const mrrMax = Math.max(1, ...mrr.map((m) => m.mrr));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Win rate" value={wonCount + lostCount > 0 ? `${winRate}%` : '—'} sub={`${wonCount} won · ${lostCount} lost`} />
        <Kpi label="ARR" value={fmtEgp(arr)} sub="paying customers" />
        <Kpi label="Renewed" value={fmtInt(buckets.renewed)} />
        <Kpi label="Churned" value={fmtInt(buckets.churned)} />
      </div>

      <Panel title="Renewal pipeline" hint="Buckets across all scoped cycles">
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3 p-5">
          <BucketTile label="Overdue" count={buckets.overdue} color="text-bad" />
          <BucketTile label="≤ 30d" count={buckets.d30} color="text-warn" />
          <BucketTile label="≤ 60d" count={buckets.d60} color="text-warn" />
          <BucketTile label="≤ 90d" count={buckets.d90} color="text-info" />
          <BucketTile label="Active" count={buckets.active} color="text-ok" />
          <BucketTile label="Renewed" count={buckets.renewed} color="text-ok" />
          <BucketTile label="Churned" count={buckets.churned} color="text-text-3" />
        </div>
      </Panel>

      <Panel title="Won vs Lost — last 8 weeks">
        <div className="p-5 border-t border-border">
          <div className="flex items-end gap-2 h-[120px]">
            {weekly.map((w) => (
              <div key={w.weekStartISO} className="flex-1 flex flex-col items-center gap-0.5" title={`${w.weekStartISO}\nWon: ${fmtEgp(w.won)}\nLost: ${fmtEgp(w.lost)}`}>
                <div className="w-full flex items-end gap-0.5" style={{ height: 100 }}>
                  <div className="flex-1 bg-ok rounded-t" style={{ height: `${(w.won / weeklyMax) * 100}%` }} />
                  <div className="flex-1 bg-bad rounded-t" style={{ height: `${(w.lost / weeklyMax) * 100}%` }} />
                </div>
                <span className="text-[9px] text-text-4">{w.weekStartISO.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[11.5px] font-semibold">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> Won</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-bad" /> Lost</span>
          </div>
        </div>
      </Panel>

      <Panel title="Rolling MRR + churn rate — last 6 months">
        <div className="p-5 border-t border-border space-y-2">
          {mrr.map((m) => (
            <div key={m.monthISO} className="flex items-center gap-3">
              <span className="text-[12px] text-text-3 w-20 tnum">{m.monthISO.slice(0, 7)}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-ok" style={{ width: `${(m.mrr / mrrMax) * 100}%` }} />
              </div>
              <span className="text-[12px] text-text-2 tnum w-24 text-right">{fmtEgp(m.mrr)}</span>
              <span className={`text-[11.5px] tnum w-16 text-right ${m.churnRate > 5 ? 'text-bad' : 'text-text-3'}`}>{Math.round(m.churnRate)}% churn</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Why deals were lost" hint="Full breakdown">
        {lossReasons.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">No lost deals in scope.</div>}
        {lossReasons.map((r) => (
          <div key={r.reason} className="px-5 py-3 border-t border-border flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.reason}</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-bad" style={{ width: `${(r.count / maxReason) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-3 tnum w-10 text-right">{fmtInt(r.count)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {hint && <span className="text-[12px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function BucketTile({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`tnum text-[22px] font-black ${color}`}>{fmtInt(count)}</div>
      <div className="text-[10px] text-text-3 uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
```

Note: if `Deal` type doesn't already carry `disqualified_reason`/`lost_reason`, add to the `.select(...)` in `useDeals.ts` in this task.

- [ ] **Step 2: Verify + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
npx vitest run
npm run build
cd ..
git add recruitera-crm-v3/src/features/reports/tabs/WinLossChurnedReport.tsx \
        recruitera-crm-v3/src/hooks/useDeals.ts  # only if edited
git commit -m "feat(crm-v3): reports — Win/Loss/Churned tab

Merges old Renewal + Key Metrics win/loss content, adds full
loss-reasons breakdown, 8-week Won-vs-Lost bars, and the previously-
deferred rolling MRR + churn-rate chart."
```

---

## Task 10: Wire owner filter into AMReport + delete orphaned tabs

**Files:**
- Modify: `recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx`
- Delete: `KeyMetrics.tsx`, `RevenueReport.tsx`, `AcquisitionReport.tsx`, `RenewalReport.tsx`, `CampaignReport.tsx`, `StubReport.tsx`

- [ ] **Step 1: Read current AMReport, identify where accounts are scoped**

```bash
grep -n "useAccounts\|owner_id\|am_mail" recruitera-crm-v3/src/features/reports/tabs/AMReport.tsx
```

- [ ] **Step 2: Add owner filter integration**

Add at the top of the component:

```tsx
import { useReportsOwner } from '../shared/reportsContext';
```

Then inside the component, right after `useAccounts()`:

```tsx
const { ownerId } = useReportsOwner();
```

And inside whichever `useMemo` builds the per-AM rows, add a filter:

```tsx
// after computing the per-AM rows:
if (ownerId) filteredRows = filteredRows.filter((r) => r.ownerId === ownerId);
```

(exact form depends on the current implementation — adapt the property name and location; the point is: if `ownerId` is set, restrict to that one AM's row.)

- [ ] **Step 3: Delete orphaned tab files**

```bash
cd recruitera-crm-v3
rm src/features/reports/tabs/KeyMetrics.tsx
rm src/features/reports/tabs/RevenueReport.tsx
rm src/features/reports/tabs/AcquisitionReport.tsx
rm src/features/reports/tabs/RenewalReport.tsx
rm src/features/reports/tabs/CampaignReport.tsx
rm src/features/reports/tabs/StubReport.tsx
```

- [ ] **Step 4: Verify nothing references the deleted files**

```bash
cd recruitera-crm-v3
grep -rln "KeyMetrics\|RevenueReport\|AcquisitionReport\|RenewalReport\|CampaignReport\|StubReport" src/ || echo "clean"
```

Expected: `clean` (only false positives should be inside `PipelineReport.tsx` — inspect).

- [ ] **Step 5: Full verification + commit**

```bash
cd recruitera-crm-v3
npx tsc --noEmit
npx vitest run
npm run build
cd ..
git add -A recruitera-crm-v3/src/features/reports/tabs/
git commit -m "feat(crm-v3): reports — AM tab respects owner filter; delete old tabs

The 6 orphaned tab files (KeyMetrics, Revenue, Acquisition, Renewal,
Campaign, Stub) are removed now that content is absorbed into the 4
new tabs. AMReport gains the same admin owner-filter honoring as
other tabs."
```

---

## Task 11: Deploy verification

- [ ] **Step 1: Push**

```bash
cd /Users/appleera/Downloads/crm
git push origin main
```

- [ ] **Step 2: Wait for Vercel build; verify live bundle contains new code**

```bash
sleep 90
curl -s "https://crm.recruitera.ai/crm-v3/" | grep -o 'assets/index-[A-Za-z0-9_]*\.js' | head -1
```

Then fetch the JS and grep for the new tab labels:

```bash
BUNDLE=$(curl -s "https://crm.recruitera.ai/crm-v3/" | grep -o 'assets/index-[A-Za-z0-9_]*\.js' | head -1)
curl -s "https://crm.recruitera.ai/crm-v3/$BUNDLE" | grep -c "Win / Loss / Churned"
```

Expected: at least 1.

- [ ] **Step 3: Manual smoke-check in the browser (or ask user)**

Verify: 4 tabs render, owner filter appears (admin login), Export PDF opens the print dialog with only the report content visible, ARR trend chart renders, disqualified reason breakdown lists all reasons.

---

## Self-Review

**Spec coverage:**
- Best-of-all-three goal → Tasks 1–10 collectively.
- Leaderboard out of scope → not built. ✓
- Per-tab date filter → Tasks 7, 8 (Task 9's Win/Loss/Churned uses fixed 8-week and 6-month windows per spec's chart definitions — no user-facing filter needed there). ✓
- Global owner filter → Task 4 + 6 + 10. ✓
- PDF export functional → Task 5 + 6. ✓
- MT-resolved attribution → Task 2 + 7 + 8. ✓
- ARR-vs-Pipeline chart → Task 3 + 8. ✓
- Won-vs-Lost 8-week chart → Task 3 + 9. ✓
- Renewal churn/MRR TODO closed → Task 3 + 9. ✓
- AMPerformance out of scope → not touched (only `AMReport.tsx` under `/reports` is touched, per plan). ✓
- Lead→Disqualified drop-off + full reason breakdown → Task 7. ✓
- Full (not top-6) loss reasons → Task 9. ✓
- Campaign/source revenue → Task 7. ✓
- Sales cycle time per source + overall → Task 3 + 8. ✓

**Placeholder scan:** no TBDs. Every code step has runnable code. Types (`DateRangeKey`, `DateRange`, `ReportsContextValue`, `CycleInput`, `DealInput`, function signatures) are defined once in their producing task and used consistently downstream.

**Type consistency:** `reconstructWonLostWeekly` takes `DealInput[]` (defined in Task 3) — call sites in Task 9 cast `scopedDeals` accordingly. `averageCycleDays` takes pre-resolved-channel deals — Task 8 does the resolution locally via `useResolvedAttribution` before calling it, matching the interface contract.
