import { useMemo } from 'react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { KpiCard } from '@/components/shared/KpiCard';
import { fmtInt, fmtEgp, toEgp } from '@/lib/format';

export default function KeyMetrics() {
  const { data, isLoading } = useAccounts();
  const rows: Account[] = data ?? [];

  const kpi = useMemo(() => {
    const paid = rows.filter(isPaid);
    const arr = paid.reduce((sum, a) => sum + toEgp(a.deal_value ?? 0, a.currency), 0);
    const open = rows.filter((a) => ['mql', 'sql', 'demo', 'proposal'].includes((a.stage || '').toLowerCase())).length;
    const won = rows.filter((a) => a.stage === 'won').length;
    const lost = rows.filter((a) => a.stage === 'lost').length;
    const trials = rows.filter((a) => a.has_trial).length;
    const winRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
    return { total: rows.length, arr, open, won, paid: paid.length, lost, trials, winRate };
  }, [rows]);

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => { const k = a.source || '—'; m.set(k, (m.get(k) ?? 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [rows]);

  const lostReasons = useMemo(() => {
    const m = new Map<string, number>();
    rows.filter((a) => a.stage === 'lost').forEach((a) => {
      const k = a.disq_stage || 'Unspecified';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* ARR banner */}
      <div className="bg-cg-900 text-white rounded-2xl p-5 flex items-center justify-between shadow-sh2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Committed ARR (paid × deal value → EGP)</div>
          <div className="text-3xl font-bold tnum mt-1">{isLoading ? '…' : fmtEgp(kpi.arr)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Active paid</div>
          <div className="text-2xl font-bold tnum mt-1">{isLoading ? '…' : fmtInt(kpi.paid)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Accounts" value={isLoading ? '…' : fmtInt(kpi.total)} />
        <KpiCard label="Open pipeline" value={isLoading ? '…' : fmtInt(kpi.open)} accent="info" />
        <KpiCard label="Won" value={isLoading ? '…' : fmtInt(kpi.won)} accent="ok" />
        <KpiCard label="Paid" value={isLoading ? '…' : fmtInt(kpi.paid)} accent="accent" />
        <KpiCard label="Trials" value={isLoading ? '…' : fmtInt(kpi.trials)} accent="warn" />
        <KpiCard label="Lost" value={isLoading ? '…' : fmtInt(kpi.lost)} accent="bad" />
        <KpiCard label="Win rate" value={isLoading ? '…' : `${kpi.winRate.toFixed(1)}%`} accent="ok" />
        <KpiCard label="Trial→Paid" value={isLoading || !kpi.trials ? '…' : `${((kpi.paid / kpi.trials) * 100).toFixed(0)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Acquisition sources" subtitle="Top 8 by account count">
          {bySource.map(([k, v]) => (
            <BarRow key={k} label={k} value={v} max={bySource[0]?.[1] ?? 1} />
          ))}
          {!bySource.length && <Empty />}
        </Panel>
        <Panel title="Lost reasons" subtitle="Disqualified stages">
          {lostReasons.map(([k, v]) => (
            <BarRow key={k} label={k} value={v} max={lostReasons[0]?.[1] ?? 1} accent="bad" />
          ))}
          {!lostReasons.length && <Empty />}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      <div className="mb-4">
        <div className="text-[13px] font-bold text-text">{title}</div>
        {subtitle && <div className="text-[11px] text-text-3 mt-0.5">{subtitle}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BarRow({ label, value, max, accent }: { label: string; value: number; max: number; accent?: 'bad' }) {
  const pct = Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-[11.5px] text-text-2 truncate flex-shrink-0" title={label}>{label}</div>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${accent === 'bad' ? 'bg-bad' : 'bg-accent-strong'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="tnum text-[12px] font-bold text-text-2 w-10 text-right">{fmtInt(value)}</div>
    </div>
  );
}

function Empty() { return <div className="text-[12px] text-text-3 py-4 text-center">No data.</div>; }
