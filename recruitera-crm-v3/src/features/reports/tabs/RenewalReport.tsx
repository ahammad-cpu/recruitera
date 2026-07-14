import { useMemo } from 'react';
import { useContractCycles } from '@/hooks/useContractCycles';
import { KpiCard } from '@/components/shared/KpiCard';
import { fmtInt } from '@/lib/format';

export default function RenewalReport() {
  const { data, isLoading } = useContractCycles();

  const buckets = useMemo(() => {
    const now = Date.now();
    const day = 86400_000;
    const b = { d30: 0, d60: 0, d90: 0, overdue: 0, renewed: 0, churned: 0, active: 0 };
    (data ?? []).forEach((c) => {
      if (c.status === 'renewed') b.renewed++;
      if (c.status === 'churned') b.churned++;
      if (c.status === 'active' || !c.status) b.active++;
      const end = c.renewal_due_date || c.ends_at;
      if (!end) return;
      const diff = (new Date(end).getTime() - now) / day;
      if (diff < 0) b.overdue++;
      else if (diff <= 30) b.d30++;
      else if (diff <= 60) b.d60++;
      else if (diff <= 90) b.d90++;
    });
    return b;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Overdue" value={isLoading ? '…' : fmtInt(buckets.overdue)} accent="bad" />
        <KpiCard label="Due ≤30d" value={isLoading ? '…' : fmtInt(buckets.d30)} accent="warn" />
        <KpiCard label="Due ≤60d" value={isLoading ? '…' : fmtInt(buckets.d60)} accent="warn" />
        <KpiCard label="Due ≤90d" value={isLoading ? '…' : fmtInt(buckets.d90)} accent="info" />
        <KpiCard label="Active" value={isLoading ? '…' : fmtInt(buckets.active)} accent="accent" />
        <KpiCard label="Renewed" value={isLoading ? '…' : fmtInt(buckets.renewed)} accent="ok" />
        <KpiCard label="Churned" value={isLoading ? '…' : fmtInt(buckets.churned)} accent="bad" />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-2">Method</div>
        <ul className="text-[12.5px] text-text-3 space-y-1 list-disc list-inside">
          <li>Buckets computed from `renewal_due_date` (fallback: `ends_at`) vs today.</li>
          <li>Renewed / Churned reflect `contract_cycles.status`.</li>
          <li>Churn rate + rolling MRR chart land in Phase 5.</li>
        </ul>
      </div>
    </div>
  );
}
