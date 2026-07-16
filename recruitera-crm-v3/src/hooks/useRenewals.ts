import { useMemo } from 'react';
import { useAccounts, type Account } from './useAccounts';
import { useContractCycles, type Cycle } from './useContractCycles';
import { computeRenewalBucket, RENEWAL_COLUMNS, type RenewalBucket } from '@/lib/renewal';
import { toEgp } from '@/lib/format';

export type RenewalRow = {
  account: Account;
  cycle: Cycle;
  bucket: RenewalBucket;
  value: number;
};

/** Shared by the sidebar badge and the Renewal page so their counts always agree. */
export function useRenewalBoard() {
  const accountsQ = useAccounts();
  const cyclesQ = useContractCycles();

  const latestCycleByAccount = useMemo(() => {
    const m = new Map<string, Cycle>();
    for (const c of cyclesQ.data ?? []) {
      if (c.account_id && !m.has(c.account_id)) m.set(c.account_id, c);
    }
    return m;
  }, [cyclesQ.data]);

  const rows = useMemo(() => {
    const now = Date.now();
    const out: RenewalRow[] = [];
    for (const a of accountsQ.data ?? []) {
      if (a.merged_into) continue;
      const cycle = latestCycleByAccount.get(a.id);
      if (!cycle) continue;
      const bucket = computeRenewalBucket(cycle, a, now);
      if (!bucket) continue;
      const value = a.deal_value || toEgp(cycle.value, cycle.currency) || 0;
      out.push({ account: a, cycle, bucket, value });
    }
    return out;
  }, [accountsQ.data, latestCycleByAccount]);

  const rowsByBucket = useMemo(() => {
    const m = new Map<RenewalBucket, RenewalRow[]>();
    RENEWAL_COLUMNS.forEach((c) => m.set(c.key, []));
    rows.forEach((r) => m.get(r.bucket)!.push(r));
    return m;
  }, [rows]);

  return {
    rows,
    rowsByBucket,
    isLoading: accountsQ.isLoading || cyclesQ.isLoading,
    error: accountsQ.error || cyclesQ.error,
    refetch: () => { accountsQ.refetch(); cyclesQ.refetch(); },
  };
}
