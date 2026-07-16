import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Briefcase, Trophy, FileText, Gauge, Download, Flame, CheckCircle2 } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useChangeStage } from '@/hooks/useAccountMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt, initials, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

type ColMeta = {
  key: string;
  label: string;
  dot: string;   // bg color for the dot
  bar: string;   // border-t color
};

const COLUMNS: ColMeta[] = [
  { key: 'mql',      label: 'MQL',      dot: 'bg-accent-strong',       bar: 'border-accent-strong' },
  { key: 'sql',      label: 'SQL',      dot: 'bg-[#392396]',           bar: 'border-[#392396]' },
  { key: 'demo',     label: 'DEMO',     dot: 'bg-[#5B3AC7]',           bar: 'border-[#5B3AC7]' },
  { key: 'proposal', label: 'PROPOSAL', dot: 'bg-[#B8761A]',           bar: 'border-[#B8761A]' },
  { key: 'won',      label: 'WON',      dot: 'bg-ok',                  bar: 'border-ok' },
  { key: 'paid',     label: 'PAID',     dot: 'bg-accent',              bar: 'border-accent' },
  { key: 'lost',     label: 'LOST',     dot: 'bg-bad',                 bar: 'border-bad' },
];

type RangeKey = 'all' | 'week' | 'month' | 'quarter' | 'year';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'all',     label: 'All time' },
  { key: 'week',    label: 'This week' },
  { key: 'month',   label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year',    label: 'This year' },
];

function rangeStart(key: RangeKey): Date | null {
  if (key === 'all') return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (key === 'week') { d.setDate(d.getDate() - d.getDay()); return d; }
  if (key === 'month')   { d.setDate(1); return d; }
  if (key === 'quarter') { const q = Math.floor(d.getMonth() / 3) * 3; d.setMonth(q, 1); return d; }
  if (key === 'year')    { d.setMonth(0, 1); return d; }
  return null;
}

const EGP_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtEgpShort = (n: number) => `${EGP_FMT.format(Math.round(n))} EGP`;
function fmtEgpCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M EGP`;
  if (n >= 10_000)    return `${Math.round(n / 1000)}k EGP`;
  return fmtEgpShort(n);
}

function temperature(a: Account): 'hot' | 'warm' | 'cold' {
  // Missing score → Warm by default (matches v2 behavior).
  const s = a.funnel_score;
  if (s == null) return 'warm';
  if (s >= 80) return 'hot';
  if (s >= 30) return 'warm';
  return 'cold';
}

export default function Pipeline() {
  const { data, isLoading, error } = useAccounts();
  const profilesQ = useProfiles();
  const changeStage = useChangeStage();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [range, setRange] = useState<RangeKey>('all');

  const profilesById = useMemo(() => {
    const m = new Map<string, import('@/hooks/useUsersData').Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const accounts = useMemo(() => (data ?? []).filter((a) => !a.merged_into), [data]);

  // Range-scoped view for KPIs. Filters by created_at.
  const scoped = useMemo(() => {
    const start = rangeStart(range);
    if (!start) return accounts;
    const t = start.getTime();
    return accounts.filter((a) => new Date(a.created_at).getTime() >= t);
  }, [accounts, range]);

  // Kanban groups (unaffected by range; pipeline shows current state)
  const groups = useMemo(() => {
    const m = new Map<string, Account[]>();
    COLUMNS.forEach((c) => m.set(c.key, []));
    accounts.forEach((a) => {
      const k = (a.stage || '').toLowerCase();
      if (m.has(k)) m.get(k)!.push(a);
    });
    return m;
  }, [accounts]);

  const openStages = new Set(['mql', 'sql', 'demo', 'proposal']);
  const openDeals = accounts.filter((a) => openStages.has((a.stage || '').toLowerCase()));
  const openPipeline = openDeals.reduce((s, a) => s + (a.deal_value || 0), 0);
  // Denominator for per-column % — sum across every column so percentages add to 100.
  const boardTotal = accounts.reduce((s, a) => s + (a.deal_value || 0), 0);
  const wonQtd = scoped.filter((a) => (a.stage || '').toLowerCase() === 'won').reduce((s, a) => s + (a.deal_value || 0), 0);
  const proposalsLive = accounts.filter((a) => (a.stage || '').toLowerCase() === 'proposal').length;
  const dealsWithValue = openDeals.filter((a) => (a.deal_value || 0) > 0);
  const avgDeal = dealsWithValue.length ? openPipeline / dealsWithValue.length : 0;
  const totalLeads = openDeals.length;

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const nextStage = e.over?.id ? String(e.over.id) : null;
    if (!nextStage) return;
    const acct = accounts.find((a) => a.id === id);
    if (!acct || (acct.stage || '').toLowerCase() === nextStage) return;
    changeStage.mutate({ id, stage: nextStage });
  }

  function exportCsv() {
    const header = ['stage', 'company', 'owner_email', 'deal_value', 'currency', 'temperature', 'created_at'];
    const rows = accounts.map((a) => [
      a.stage || '',
      a.name || '',
      a.am_mail || '',
      String(a.deal_value ?? ''),
      a.deal_currency || 'EGP',
      temperature(a),
      a.created_at,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-4">
      {/* HEADER */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[26px] font-black tracking-tight text-text">Sales Pipeline</h1>
        <span className="inline-flex items-center h-7 px-3 rounded-full bg-surface-2 border border-border text-text-2 text-[12px] font-bold">
          {isLoading ? '…' : `${fmtInt(totalLeads)} leads`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="pipeline-range">Time range</label>
          <select
            id="pipeline-range"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="h-10 pl-3.5 pr-8 border border-border-2 rounded-lg bg-surface text-[13px] font-bold text-text outline-none focus:border-accent-strong appearance-none"
          >
            {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-border bg-surface text-text text-[13px] font-bold hover:bg-surface-2"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon={<Briefcase size={18} />} iconBg="bg-accent-soft" iconColor="text-accent-ink"
          barColor="bg-accent-strong"
          label="Open pipeline" value={fmtEgpCompact(openPipeline)} sub="Active new-business"
        />
        <KpiCard
          icon={<Trophy size={18} />} iconBg="bg-warn-bg" iconColor="text-warn"
          barColor="bg-warn"
          label="Won QTD" value={fmtEgpCompact(wonQtd)} sub="Closed revenue"
        />
        <KpiCard
          icon={<FileText size={18} />} iconBg="bg-info-bg" iconColor="text-info"
          barColor="bg-info"
          label="Proposals live" value={fmtInt(proposalsLive)} sub="Awaiting decision"
        />
        <KpiCard
          icon={<Gauge size={18} />} iconBg="bg-ok-bg" iconColor="text-ok"
          barColor="bg-ok"
          label="Avg deal size" value={fmtEgpCompact(avgDeal)} sub="Open pipeline"
        />
      </div>

      {/* BOARD */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto sc pb-4 -mx-6 px-6">
          <div className="flex gap-4" style={{ minWidth: `${COLUMNS.length * 300}px` }}>
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                rows={groups.get(col.key) ?? []}
                profilesById={profilesById}
                isLoading={isLoading}
                boardTotal={boardTotal}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function KpiCard({
  icon, iconBg, iconColor, barColor, label, value, sub,
}: {
  icon: React.ReactNode; iconBg: string; iconColor: string; barColor: string;
  label: string; value: string; sub: string;
}) {
  return (
    <div className="relative bg-surface border border-border rounded-2xl p-5 pt-6 shadow-sh1 overflow-hidden">
      <div className={cn('absolute top-0 left-0 right-0 h-1', barColor)} />
      <div className="flex items-center gap-3 mb-3.5">
        <div className={cn('w-10 h-10 rounded-xl grid place-items-center', iconBg, iconColor)}>{icon}</div>
        <div className="text-[10px] font-black tracking-[0.14em] uppercase text-text-3">{label}</div>
      </div>
      <div className="tnum text-[28px] font-black tracking-tight text-text leading-none">{value}</div>
      <div className="text-[11.5px] text-text-3 font-semibold mt-2">{sub}</div>
    </div>
  );
}

function Column({
  col, rows, profilesById, isLoading,
}: {
  col: ColMeta;
  rows: Account[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  boardTotal: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = rows.reduce((s, a) => s + (a.deal_value || 0), 0);
  const withValue = rows.filter((a) => (a.deal_value || 0) > 0);
  const avg = withValue.length ? Math.round(total / withValue.length) : 0;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[320px] flex-shrink-0 bg-surface rounded-2xl border-t-[3px] border border-border shadow-sh1 flex flex-col transition-colors',
        col.bar,
        isOver && 'ring-2 ring-accent',
      )}
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/60">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', col.dot)} />
        <span className="text-[11px] font-black tracking-widest uppercase text-text">{col.label}</span>
        <span className="tnum text-[11px] font-bold text-text-3 bg-surface-2 border border-border px-2 py-0.5 rounded-full">
          {isLoading ? '…' : fmtInt(rows.length)}
        </span>
        <span className="tnum ml-auto text-[11.5px] font-bold text-text-3">
          {total > 0 ? fmtEgpCompact(total) : '0 EGP'}
        </span>
      </div>

      <div className="p-3 space-y-2.5 max-h-[calc(100vh-410px)] overflow-y-auto sc flex-1">
        {isLoading && [...Array(2)].map((_, i) => (
          <div key={i} className="h-32 bg-surface-2 rounded-xl animate-pulse" />
        ))}
        {!isLoading && rows.length === 0 && (
          <div className="py-8 text-center text-[11.5px] text-text-4">No deals</div>
        )}
        {rows.slice(0, 60).map((a) => (
          <Card key={a.id} a={a} owner={a.owner_id ? profilesById.get(a.owner_id) : undefined} />
        ))}
        {rows.length > 60 && (
          <div className="text-[10.5px] text-text-4 text-center py-1">+{rows.length - 60} more</div>
        )}
      </div>

      {/* TOTAL / AVG footer — matches v2 layout */}
      <div className="px-4 py-3 border-t border-border bg-surface-2/60 rounded-b-2xl">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-black tracking-widest uppercase text-text-3">Total</div>
          <div className="tnum text-[12.5px] font-black text-text">
            {total > 0 ? fmtEgpShort(total) : '0 EGP'}
          </div>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <div className="text-[10px] font-black tracking-widest uppercase text-text-3">Avg</div>
          <div className="tnum text-[12.5px] font-bold text-text-2">
            {avg > 0 ? fmtEgpShort(avg) : '0 EGP'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ a, owner }: { a: Account; owner: import('@/hooks/useUsersData').Profile | undefined }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: a.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  const temp = temperature(a);
  const dealValue = (a.deal_value ?? 0);
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-surface border border-border rounded-xl p-3.5 transition-shadow',
        'hover:shadow-sh2 hover:border-border-2',
        isDragging && 'shadow-sh3 opacity-90',
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          {...attributes}
          {...listeners}
          className="w-9 h-9 rounded-full bg-surface-2 border border-border text-text-2 text-[11px] font-black flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
          title="Drag to change stage"
        >
          {initials(a.name || a.domain)}
        </div>
        <Link to={`/companies/${a.id}`} className="min-w-0 flex-1 block">
          <div className="text-[13.5px] font-extrabold text-text truncate">{a.name || a.domain || '—'}</div>
        </Link>
        <TempPill kind={temp} />
      </div>

      <div className="mt-3 grid grid-cols-[46px_1fr] gap-y-1.5 text-[12px]">
        <div className="text-text-3 font-bold uppercase tracking-wider text-[10px] leading-[18px]">ACV</div>
        <div className="tnum font-extrabold text-text">
          {dealValue > 0 ? fmtEgpShort(dealValue) : <span className="text-text-4 font-bold">0 EGP</span>}
        </div>
        <div className="text-text-3 font-bold uppercase tracking-wider text-[10px] leading-[18px]">Close</div>
        <div className="tnum text-text-3 font-bold">
          {a.disqualified_at ? fmtDate(a.disqualified_at) : <span className="text-text-4">—</span>}
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-border/70 flex items-center gap-2 min-w-0">
        <OwnerAvatar profile={owner} size={22} fallback={a.am_mail ?? undefined} />
        <span className="text-[11.5px] font-bold text-text-2 truncate">
          {owner?.full_name || owner?.email || a.am_mail || 'Unassigned'}
        </span>
      </div>
    </div>
  );
}

function TempPill({ kind }: { kind: 'hot' | 'warm' | 'cold' }) {
  if (kind === 'hot') {
    return (
      <span className="inline-flex items-center gap-1 h-[22px] pl-1.5 pr-2 rounded-full bg-bad-bg text-bad text-[10.5px] font-black tracking-wider">
        <Flame size={11} /> Hot
      </span>
    );
  }
  if (kind === 'warm') {
    return (
      <span className="inline-flex items-center gap-1 h-[22px] pl-1.5 pr-2 rounded-full bg-ok-bg text-ok text-[10.5px] font-black tracking-wider">
        <CheckCircle2 size={11} /> Warm
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-surface-2 border border-border text-text-3 text-[10.5px] font-black tracking-wider">
      Cold
    </span>
  );
}
