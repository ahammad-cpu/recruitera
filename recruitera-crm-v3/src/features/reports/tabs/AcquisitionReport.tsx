import { useMemo } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { fmtInt } from '@/lib/format';

export default function AcquisitionReport() {
  const { data, isLoading } = useAccounts();
  const rows = data ?? [];

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => { const k = a.source || '—'; m.set(k, (m.get(k) ?? 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => {
      const d = new Date(a.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [rows]);

  const maxSrc = Math.max(1, ...bySource.map((s) => s[1]));
  const maxMonth = Math.max(1, ...byMonth.map((m) => m[1]));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-4">All sources</div>
        <div className="space-y-2 max-h-96 overflow-y-auto sc pr-2">
          {isLoading && <div className="text-[12px] text-text-3">Loading…</div>}
          {bySource.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <div className="w-40 text-[12px] text-text-2 truncate" title={k}>{k}</div>
              <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-accent-strong" style={{ width: `${Math.max(3, (v / maxSrc) * 100)}%` }} />
              </div>
              <div className="tnum text-[12px] font-bold text-text-2 w-10 text-right">{fmtInt(v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
        <div className="text-[13px] font-bold text-text mb-4">New accounts / month (last 12)</div>
        <div className="flex items-end gap-1.5 h-40">
          {byMonth.map(([k, v]) => (
            <div key={k} className="flex-1 flex flex-col items-center gap-1" title={`${k}: ${v}`}>
              <div className="w-full bg-accent-strong rounded-t" style={{ height: `${Math.max(4, (v / maxMonth) * 100)}%` }} />
              <div className="text-[9px] text-text-3">{k.slice(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
