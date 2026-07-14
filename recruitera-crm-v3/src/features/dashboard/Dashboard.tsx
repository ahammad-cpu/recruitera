import { useMemo } from 'react';
import { Building2, TrendingUp, CheckCircle2, XCircle, RefreshCw, Users } from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { KpiCard } from '@/components/shared/KpiCard';
import { fmtInt } from '@/lib/format';

const OPEN_STAGES = new Set(['mql', 'sql', 'demo', 'proposal']);

export default function Dashboard() {
  const { data: accounts, isLoading, error } = useAccounts();

  const kpis = useMemo(() => {
    const rows: Account[] = accounts ?? [];
    const total = rows.length;
    const open = rows.filter((a) => a.stage && OPEN_STAGES.has(a.stage.toLowerCase())).length;
    const won = rows.filter((a) => a.stage === 'won').length;
    const paid = rows.filter(isPaid).length;
    const lost = rows.filter((a) => a.stage === 'lost').length;
    const trials = rows.filter((a) => a.has_trial).length;
    return { total, open, won, paid, lost, trials };
  }, [accounts]);

  const byStage = useMemo(() => {
    const map = new Map<string, number>();
    (accounts ?? []).forEach((a) => {
      const k = (a.stage || 'unknown').toLowerCase();
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [accounts]);

  const byOwner = useMemo(() => {
    const map = new Map<string, number>();
    (accounts ?? []).forEach((a) => {
      const k = a.am_mail || '— unassigned';
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [accounts]);

  if (error) return <ErrorState message={String((error as Error).message)} />;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text">Dashboard</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">Live snapshot of every account synced from Supabase.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total accounts" value={isLoading ? '…' : fmtInt(kpis.total)} icon={<Building2 size={16} />} />
        <KpiCard label="Open pipeline" value={isLoading ? '…' : fmtInt(kpis.open)} icon={<TrendingUp size={16} />} accent="info" />
        <KpiCard label="Won" value={isLoading ? '…' : fmtInt(kpis.won)} icon={<CheckCircle2 size={16} />} accent="ok" />
        <KpiCard label="Paid" value={isLoading ? '…' : fmtInt(kpis.paid)} icon={<CheckCircle2 size={16} />} accent="accent" />
        <KpiCard label="Trials" value={isLoading ? '…' : fmtInt(kpis.trials)} icon={<RefreshCw size={16} />} accent="warn" />
        <KpiCard label="Lost" value={isLoading ? '…' : fmtInt(kpis.lost)} icon={<XCircle size={16} />} accent="bad" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Accounts by stage">
          {isLoading ? <Skeleton /> : (
            <div className="space-y-2">
              {byStage.map(([k, v]) => (
                <BarRow key={k} label={k} value={v} max={byStage[0]?.[1] ?? 1} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Top account managers" subtitle="By owned accounts">
          {isLoading ? <Skeleton /> : (
            <div className="space-y-2">
              {byOwner.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-cg-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    <Users size={12} />
                  </div>
                  <div className="min-w-0 flex-1 truncate text-[12.5px] text-text">{k}</div>
                  <div className="tnum text-[12.5px] font-bold text-text-2">{fmtInt(v)}</div>
                </div>
              ))}
            </div>
          )}
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
      {children}
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 text-[11px] font-bold uppercase tracking-wider text-text-3 flex-shrink-0">{label}</div>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-accent-strong rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="tnum text-[12.5px] font-bold text-text-2 w-10 text-right">{fmtInt(value)}</div>
    </div>
  );
}

function Skeleton() {
  return <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-surface-2 rounded-full animate-pulse" />)}</div>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="bg-bad-bg border border-bad/30 text-bad rounded-xl p-4 text-[13px]">
        <div className="font-bold mb-1">Couldn't load accounts</div>
        <div className="opacity-80">{message}</div>
      </div>
    </div>
  );
}
