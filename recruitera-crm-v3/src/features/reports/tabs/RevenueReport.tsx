import { useMemo } from 'react';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useTargets } from '@/hooks/useTargets';
import { KpiCard } from '@/components/shared/KpiCard';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';

export default function RevenueReport() {
  const cycles = useContractCycles();
  const targets = useTargets();

  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  const qStart = new Date(now.getFullYear(), quarter * 3, 1).toISOString().slice(0, 10);
  const qEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0).toISOString().slice(0, 10);

  const actualQtd = useMemo(() => {
    return (cycles.data ?? [])
      .filter((c) => c.started_at && c.started_at >= qStart && c.started_at <= qEnd)
      .reduce((sum, c) => sum + toEgp(c.value ?? 0, c.currency), 0);
  }, [cycles.data, qStart, qEnd]);

  const activeAcv = useMemo(() => {
    return (cycles.data ?? [])
      .filter((c) => c.status === 'active' || !c.status)
      .reduce((sum, c) => sum + toEgp(c.value ?? 0, c.currency), 0);
  }, [cycles.data]);

  const targetQtd = useMemo(() => {
    return (targets.data ?? [])
      .filter((t) => t.category === 'revenue' && t.period_start <= qEnd && t.period_end >= qStart)
      .reduce((sum, t) => sum + (t.amount_egp || 0), 0);
  }, [targets.data, qStart, qEnd]);

  const pct = targetQtd > 0 ? (actualQtd / targetQtd) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label={`Actual this quarter (${qStart.slice(0, 7)})`} value={cycles.isLoading ? '…' : fmtEgp(actualQtd)} accent="accent" />
        <KpiCard label="Quarter target" value={targets.isLoading ? '…' : (targetQtd ? fmtEgp(targetQtd) : 'Not set')} />
        <KpiCard label="Attainment" value={targets.isLoading || !targetQtd ? '—' : `${pct.toFixed(1)}%`} accent={pct >= 100 ? 'ok' : pct >= 70 ? 'warn' : 'bad'} />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text">Committed ACV (all active cycles)</div>
        <div className="mt-2 text-2xl font-bold text-text tnum">{fmtEgp(activeAcv)}</div>
        <div className="text-[11.5px] text-text-3 mt-1">
          Sum of `contract_cycles.value` (converted to EGP via FX table) where `status = 'active'`.
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-3">Targets on file</div>
        {(targets.data?.length ?? 0) === 0 && <div className="text-[12px] text-text-3">No targets yet — create some in Members → set Q target.</div>}
        {targets.data?.map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_100px_120px_140px] py-2 border-t border-border text-[12.5px]">
            <div className="text-text">{t.category} · {t.owner_kind}</div>
            <div className="tnum font-bold">{fmtInt(t.amount_egp)} EGP</div>
            <div className="text-text-3">{t.period_kind}</div>
            <div className="text-text-3">{t.period_start} → {t.period_end}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
