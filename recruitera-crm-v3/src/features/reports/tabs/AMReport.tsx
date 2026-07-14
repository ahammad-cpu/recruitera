import { useMemo } from 'react';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { fmtInt } from '@/lib/format';

export default function AMReport() {
  const { data, isLoading } = useAccounts();
  const rows = data ?? [];

  const perAM = useMemo(() => {
    const map = new Map<string, { total: number; open: number; won: number; paid: number; lost: number }>();
    rows.forEach((a) => {
      const k = a.am_mail || '— unassigned';
      const rec = map.get(k) ?? { total: 0, open: 0, won: 0, paid: 0, lost: 0 };
      rec.total++;
      const s = (a.stage || '').toLowerCase();
      if (['mql', 'sql', 'demo', 'proposal'].includes(s)) rec.open++;
      if (s === 'won') rec.won++;
      if (isPaid(a)) rec.paid++;
      if (s === 'lost') rec.lost++;
      map.set(k, rec);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className="grid grid-cols-[1fr_repeat(5,80px)_100px] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3">
        <div>Account manager</div>
        <div className="text-right">Total</div>
        <div className="text-right">Open</div>
        <div className="text-right">Won</div>
        <div className="text-right">Paid</div>
        <div className="text-right">Lost</div>
        <div className="text-right">Win rate</div>
      </div>
      {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {perAM.map(([am, r]) => {
        const wr = r.won + r.lost > 0 ? (r.won / (r.won + r.lost)) * 100 : 0;
        return (
          <div key={am} className="grid grid-cols-[1fr_repeat(5,80px)_100px] px-4 py-2.5 border-t border-border hover:bg-surface-2 text-[13px]">
            <div className="text-text truncate font-semibold" title={am}>{am}</div>
            <div className="text-right tnum font-bold">{fmtInt(r.total)}</div>
            <div className="text-right tnum text-info">{fmtInt(r.open)}</div>
            <div className="text-right tnum text-ok">{fmtInt(r.won)}</div>
            <div className="text-right tnum text-accent-ink">{fmtInt(r.paid)}</div>
            <div className="text-right tnum text-bad">{fmtInt(r.lost)}</div>
            <div className="text-right tnum font-bold">{wr.toFixed(0)}%</div>
          </div>
        );
      })}
    </div>
  );
}
