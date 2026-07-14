import { useMemo } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { fmtInt } from '@/lib/format';

const FUNNEL = ['mql', 'sql', 'demo', 'proposal', 'won', 'paid'];

export default function PipelineReport() {
  const { data, isLoading } = useAccounts();
  const rows = data ?? [];

  const funnel = useMemo(() => {
    return FUNNEL.map((k) => ({
      stage: k,
      count: rows.filter((a) => (a.stage || '').toLowerCase() === k).length,
    }));
  }, [rows]);

  const max = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-4">Funnel by stage</div>
        <div className="space-y-2">
          {funnel.map((f, i) => {
            const pct = Math.max(6, Math.round((f.count / max) * 100));
            const next = funnel[i + 1];
            const conv = next && f.count > 0 ? ((next.count / f.count) * 100).toFixed(0) : null;
            return (
              <div key={f.stage}>
                <div className="flex items-center gap-3">
                  <div className="w-20 text-[11px] font-bold uppercase tracking-wider text-text-3">{f.stage}</div>
                  <div className="flex-1 h-6 bg-surface-2 rounded-lg overflow-hidden">
                    <div className="h-full bg-accent-strong flex items-center px-2 text-[11px] font-bold text-accent-ink" style={{ width: `${pct}%` }}>
                      {isLoading ? '…' : fmtInt(f.count)}
                    </div>
                  </div>
                </div>
                {conv && (
                  <div className="ml-24 mt-0.5 text-[10.5px] text-text-3">↓ {conv}% converts to {next!.stage}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-4">Stage counts</div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text-3">
              <th className="text-left pb-2 font-bold">Stage</th>
              <th className="text-right pb-2 font-bold">Accounts</th>
              <th className="text-right pb-2 font-bold">% of total</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((f) => (
              <tr key={f.stage} className="border-t border-border">
                <td className="py-2 uppercase text-text-2 text-[12px] font-semibold">{f.stage}</td>
                <td className="py-2 text-right tnum font-bold">{fmtInt(f.count)}</td>
                <td className="py-2 text-right tnum text-text-3">
                  {rows.length ? ((f.count / rows.length) * 100).toFixed(1) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
