import type { Cycle } from '@/hooks/useContractCycles';

export type RenewalBucket = 'd90' | 'd60' | 'd30' | 'overdue' | 'renewed' | 'churned';

export const RENEWAL_COLUMNS: Array<{ key: RenewalBucket; label: string; dot: string; chip: string }> = [
  { key: 'd90',     label: '90 days', dot: 'bg-ok',     chip: 'bg-ok-bg text-ok' },
  { key: 'd60',     label: '60 days', dot: 'bg-info',   chip: 'bg-info-bg text-info' },
  { key: 'd30',     label: '30 days', dot: 'bg-warn',   chip: 'bg-warn-bg text-warn' },
  { key: 'overdue', label: 'Overdue', dot: 'bg-bad',    chip: 'bg-bad-bg text-bad' },
  { key: 'renewed', label: 'Renewed', dot: 'bg-accent-strong', chip: 'bg-accent-soft text-accent-ink' },
  { key: 'churned', label: 'Churned', dot: 'bg-text-4', chip: 'bg-surface-2 text-text-3' },
];

/**
 * Ports the v2 renewal-bucket rule verbatim: an account only enters the
 * renewal pipeline once it has a contract cycle with a real end date —
 * everything else (leads, still-open deals, expired trials) stays out.
 * Cycle.status wins when set (churned/renewed); otherwise the bucket is
 * derived from days remaining until ends_at, with a churn/overdue split
 * for cycles that already ended without a renewal record.
 */
export function computeRenewalBucket(
  cycle: Pick<Cycle, 'status' | 'ends_at'> | null | undefined,
  account: { paid_status?: string | null; activation_status?: string | null },
  nowMs: number,
): RenewalBucket | null {
  if (!cycle || !cycle.ends_at) return null;
  const endMs = Date.parse(cycle.ends_at);
  if (Number.isNaN(endMs)) return null;

  if (cycle.status === 'churned') return 'churned';
  if (cycle.status === 'renewed') return 'renewed';

  const days = (endMs - nowMs) / 86_400_000;
  const wasPaid = account.paid_status === 'Paid' || account.paid_status === 'Without Charge';

  if (days < 0) {
    if (!wasPaid || account.activation_status === 'Expired') return 'churned';
    return 'overdue';
  }
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return null;
}
