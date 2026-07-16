import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Briefcase, Trophy, FileText, Gauge, Download, Flame, CheckCircle2, Filter } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useMoveDeal, positionBetween } from '@/hooks/usePipelineMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt, initials, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WonDialog } from './WonDialog';
import { LostDialog } from './LostDialog';
import {
  PipelineFilters, EMPTY_FILTERS, filtersActiveCount, filtersFromParams, filtersToParams,
  type PipelineFilterState,
} from './PipelineFilters';

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
  const moveDeal = useMoveDeal();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<RangeKey>(() => (searchParams.get('range') as RangeKey) || 'all');
  const [filters, setFilters] = useState<PipelineFilterState>(() => filtersFromParams(searchParams));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingWon, setPendingWon] = useState<Account | null>(null);
  const [pendingLost, setPendingLost] = useState<Account | null>(null);

  // Sync range + filters into the URL so deep links restore the view.
  useEffect(() => {
    const p: Record<string, string> = { ...filtersToParams(filters) };
    if (range !== 'all') p.range = range;
    const next = new URLSearchParams(p);
    // Only setSearchParams if actually changed to avoid render loops.
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, filters]);

  const profilesById = useMemo(() => {
    const m = new Map<string, import('@/hooks/useUsersData').Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const activeAccounts = useMemo(() => (data ?? []).filter((a) => !a.merged_into), [data]);

  // Apply filter panel to the whole visible dataset. Everything downstream
  // (KPIs, column groups, totals) reads from `accounts`.
  const accounts = useMemo(() => {
    const min = filters.minAcv ? Number(filters.minAcv) : null;
    const max = filters.maxAcv ? Number(filters.maxAcv) : null;
    const from = filters.closeFrom ? new Date(filters.closeFrom).getTime() : null;
    const to = filters.closeTo ? new Date(filters.closeTo).getTime() + 86_400_000 - 1 : null;
    const ownersSet = new Set(filters.owners);
    const tempsSet = new Set(filters.temps);
    return activeAccounts.filter((a) => {
      if (ownersSet.size && !(a.owner_id && ownersSet.has(a.owner_id))) return false;
      if (tempsSet.size && !tempsSet.has(temperature(a))) return false;
      const v = a.deal_value || 0;
      if (min != null && v < min) return false;
      if (max != null && v > max) return false;
      if (from != null || to != null) {
        const closeIso = a.disqualified_at || null;
        if (!closeIso) return false;
        const t = new Date(closeIso).getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
      }
      return true;
    });
  }, [activeAccounts, filters]);

  // Range-scoped view for KPIs. Filters by created_at.
  const scoped = useMemo(() => {
    const start = rangeStart(range);
    if (!start) return accounts;
    const t = start.getTime();
    return accounts.filter((a) => new Date(a.created_at).getTime() >= t);
  }, [accounts, range]);

  // Kanban groups — sorted by board_position (asc). Nulls go last, then id.
  const groups = useMemo(() => {
    const m = new Map<string, Account[]>();
    COLUMNS.forEach((c) => m.set(c.key, []));
    accounts.forEach((a) => {
      const k = (a.stage || '').toLowerCase();
      if (m.has(k)) m.get(k)!.push(a);
    });
    m.forEach((arr) =>
      arr.sort((x, y) => {
        const xp = x.board_position;
        const yp = y.board_position;
        if (xp == null && yp == null) return x.id.localeCompare(y.id);
        if (xp == null) return 1;
        if (yp == null) return -1;
        return xp - yp;
      }),
    );
    return m;
  }, [accounts]);

  const openStages = new Set(['mql', 'sql', 'demo', 'proposal']);
  const openDeals = accounts.filter((a) => openStages.has((a.stage || '').toLowerCase()));
  const openPipeline = openDeals.reduce((s, a) => s + (a.deal_value || 0), 0);
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
    const acct = activeAccounts.find((a) => a.id === id);
    if (!acct) return;
    const curr = (acct.stage || '').toLowerCase();
    if (curr === nextStage) return;

    // Won / Lost drops require the confirmation dialog — the mutation runs
    // from inside the dialog, so we short-circuit here without moving.
    if (nextStage === 'won') { setPendingWon(acct); return; }
    if (nextStage === 'lost') { setPendingLost(acct); return; }

    // Regular move: place at the top of the target column (before the
    // current first card). Fractional positioning so we never renumber.
    const targetRows = groups.get(nextStage) ?? [];
    const firstPos = targetRows[0]?.board_position ?? null;
    const position = positionBetween(null, firstPos);
    moveDeal.mutate({ id, stage: nextStage, position });
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
          <button
            onClick={() => setFiltersOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border text-[13px] font-bold',
              filtersActiveCount(filters) > 0
                ? 'bg-accent-soft text-accent-ink border-accent-strong'
                : 'bg-surface border-border text-text hover:bg-surface-2',
            )}
          >
            <Filter size={13} /> Filters
            {filtersActiveCount(filters) > 0 && (
              <span className="ml-1 tnum inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-strong text-cg-900 text-[10px] font-black">
                {filtersActiveCount(filters)}
              </span>
            )}
          </button>
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

      <PipelineFilters
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onChange={setFilters}
        profiles={profilesQ.data ?? []}
      />

      {pendingWon && <WonDialog account={pendingWon} onClose={() => setPendingWon(null)} />}
      {pendingLost && <LostDialog account={pendingLost} onClose={() => setPendingLost(null)} />}
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

      <ColumnBody
        rows={rows}
        profilesById={profilesById}
        isLoading={isLoading}
      />

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

const PAGE = 30;
function ColumnBody({
  rows, profilesById, isLoading,
}: {
  rows: Account[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
}) {
  // Lightweight windowing — render PAGE cards at a time and let the user
  // reveal more. Auto-loads-more when they scroll near the bottom, so it
  // feels virtualized without pulling in react-window.
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => { setVisible(PAGE); }, [rows.length]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && visible < rows.length) {
      setVisible((v) => Math.min(v + PAGE, rows.length));
    }
  }

  return (
    <div
      onScroll={onScroll}
      className="p-3 space-y-2.5 max-h-[calc(100vh-410px)] overflow-y-auto sc flex-1"
    >
      {isLoading && [...Array(2)].map((_, i) => (
        <div key={i} className="h-32 bg-surface-2 rounded-xl animate-pulse" />
      ))}
      {!isLoading && rows.length === 0 && (
        <div className="py-8 text-center text-[11.5px] text-text-4">No deals</div>
      )}
      {rows.slice(0, visible).map((a) => (
        <Card key={a.id} a={a} owner={a.owner_id ? profilesById.get(a.owner_id) : undefined} />
      ))}
      {visible < rows.length && (
        <button
          onClick={() => setVisible((v) => Math.min(v + PAGE, rows.length))}
          className="w-full text-[11.5px] font-bold text-text-3 hover:text-accent-ink py-2 rounded-md hover:bg-surface-2"
        >
          Load {Math.min(PAGE, rows.length - visible)} more · {rows.length - visible} remaining
        </button>
      )}
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
          className="w-9 h-9 rounded-lg bg-cg-900 text-white text-[11px] font-black flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
          title="Drag to change stage"
        >
          {initials(a.name || a.domain)}
        </div>
        <Link to={`/companies/${a.id}`} className="min-w-0 flex-1 block">
          <div className="text-[13.5px] font-extrabold text-text truncate">{a.name || a.domain || '—'}</div>
        </Link>
        <TempPill kind={temp} />
      </div>

      <div className="mt-3 pt-3 border-t border-border/70 grid grid-cols-[46px_1fr] gap-y-1.5 text-[12px]">
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
      <span className="inline-flex items-center gap-1 h-[22px] pl-1.5 pr-2 rounded-full bg-warn-bg text-warn text-[10.5px] font-black tracking-wider">
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
