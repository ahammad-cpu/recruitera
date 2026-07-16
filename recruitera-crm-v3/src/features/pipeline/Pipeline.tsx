import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Briefcase, Trophy, FileText, Gauge, Download, Flame, CheckCircle2, Clock, RotateCcw, AlertTriangle } from 'lucide-react';
import { useDeals, isStale, isOverdue, type Deal, type DealStage } from '@/hooks/useDeals';
import { useMoveDeal, useReopenDeal, positionBetween } from '@/hooks/useDealMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WonDialog } from './WonDialog';
import { LostDialog } from './LostDialog';
import {
  defaultFilters, filtersFromParams, filtersToParams,
  type PipelineFilterState,
} from './PipelineFilters';
import { PipelineFilterBar } from './PipelineFilterBar';

type ColMeta = { key: DealStage; label: string; dot: string; bar: string };

const COLUMNS: ColMeta[] = [
  { key: 'mql',       label: 'MQL',       dot: 'bg-accent-strong', bar: 'border-accent-strong' },
  { key: 'sql',       label: 'SQL',       dot: 'bg-[#392396]',     bar: 'border-[#392396]' },
  { key: 'demo',      label: 'DEMO',      dot: 'bg-[#5B3AC7]',     bar: 'border-[#5B3AC7]' },
  { key: 'proposal',  label: 'PROPOSAL',  dot: 'bg-[#B8761A]',     bar: 'border-[#B8761A]' },
  { key: 'won',       label: 'WON',       dot: 'bg-ok',            bar: 'border-ok' },
  { key: 'collected', label: 'COLLECTED', dot: 'bg-accent',        bar: 'border-accent' },
  { key: 'lost',      label: 'LOST',      dot: 'bg-bad',           bar: 'border-bad' },
];


const EGP_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtEgpShort = (n: number) => `${EGP_FMT.format(Math.round(n))} EGP`;
function fmtEgpCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M EGP`;
  if (n >= 10_000)    return `${Math.round(n / 1000)}k EGP`;
  return fmtEgpShort(n);
}

function temperature(d: Deal): 'hot' | 'warm' | 'cold' {
  if (d.temperature) return d.temperature;
  return 'warm'; // default when unset
}

export default function Pipeline() {
  const { data, isLoading, error } = useDeals();
  const profilesQ = useProfiles();
  const moveDeal = useMoveDeal();
  const reopen = useReopenDeal();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [searchParams, setSearchParams] = useSearchParams();
  // Default Close-Date From to the start of the current quarter unless the
  // URL already specifies a filter (deep link / user reset).
  const [filters, setFilters] = useState<PipelineFilterState>(() => {
    const fromUrl = filtersFromParams(searchParams);
    const anySet = Object.values(fromUrl).some((v) => Array.isArray(v) ? v.length : !!v);
    return anySet ? fromUrl : defaultFilters();
  });
  const [pendingWon, setPendingWon] = useState<Deal | null>(null);
  const [pendingLost, setPendingLost] = useState<Deal | null>(null);

  useEffect(() => {
    const p: Record<string, string> = { ...filtersToParams(filters) };
    const next = new URLSearchParams(p);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const profilesById = useMemo(() => {
    const m = new Map<string, import('@/hooks/useUsersData').Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const allDeals = data ?? [];

  // Apply inline filter bar.
  const deals = useMemo(() => {
    const min = filters.minAcv ? Number(filters.minAcv) : null;
    const max = filters.maxAcv ? Number(filters.maxAcv) : null;
    const from = filters.closeFrom ? new Date(filters.closeFrom).getTime() : null;
    const to = filters.closeTo ? new Date(filters.closeTo).getTime() + 86_400_000 - 1 : null;
    const ownersSet = new Set(filters.owners);
    const tempsSet = new Set(filters.temps);
    return allDeals.filter((d) => {
      if (ownersSet.size && !(d.owner_id && ownersSet.has(d.owner_id))) return false;
      if (tempsSet.size && !tempsSet.has(temperature(d))) return false;
      const v = d.amount || 0;
      if (min != null && v < min) return false;
      if (max != null && v > max) return false;
      if (from != null || to != null) {
        // Date range only limits CLOSED deals — open deals always show so
        // the funnel always reflects current state. Reps ask "what's the
        // pipeline now" + "what closed recently" as two questions; the date
        // filter answers the second one without hiding the first.
        const isClosedDeal = d.stage === 'won' || d.stage === 'collected' || d.stage === 'lost';
        if (isClosedDeal) {
          const closeIso = d.closed_at || d.created_at;
          const t = new Date(closeIso).getTime();
          if (from != null && t < from) return false;
          if (to != null && t > to) return false;
        }
      }
      return true;
    });
  }, [allDeals, filters]);

  const groups = useMemo(() => {
    const m = new Map<DealStage, Deal[]>();
    COLUMNS.forEach((c) => m.set(c.key, []));
    deals.forEach((d) => { if (m.has(d.stage)) m.get(d.stage)!.push(d); });
    m.forEach((arr) =>
      arr.sort((x, y) => {
        const xp = x.board_position, yp = y.board_position;
        if (xp == null && yp == null) return x.id.localeCompare(y.id);
        if (xp == null) return 1;
        if (yp == null) return -1;
        return xp - yp;
      }),
    );
    return m;
  }, [deals]);

  const openStages = new Set<DealStage>(['mql', 'sql', 'demo', 'proposal']);
  const openDeals = deals.filter((d) => openStages.has(d.stage));
  const openPipeline = openDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const boardTotal = deals.reduce((s, d) => s + (d.amount || 0), 0);
  const wonQtd = deals.filter((d) => d.stage === 'won' || d.stage === 'collected').reduce((s, d) => s + (d.amount || 0), 0);
  const proposalsLive = deals.filter((d) => d.stage === 'proposal').length;
  const dealsWithValue = openDeals.filter((d) => (d.amount || 0) > 0);
  const avgDeal = dealsWithValue.length ? openPipeline / dealsWithValue.length : 0;
  const totalLeads = openDeals.length;

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const nextStage = e.over?.id ? String(e.over.id) as DealStage : null;
    if (!nextStage) return;
    const deal = allDeals.find((d) => d.id === id);
    if (!deal || deal.stage === nextStage) return;

    if (nextStage === 'won') { setPendingWon(deal); return; }
    if (nextStage === 'lost') { setPendingLost(deal); return; }

    const targetRows = groups.get(nextStage) ?? [];
    const firstPos = targetRows[0]?.board_position ?? null;
    const position = positionBetween(null, firstPos);
    moveDeal.mutate({ id, stage: nextStage, position });
  }

  function exportCsv() {
    const header = ['stage', 'company', 'owner_email', 'amount', 'currency', 'temperature', 'created_at'];
    const rows = deals.map((d) => [
      d.stage,
      d.company?.name || '',
      profilesById.get(d.owner_id || '')?.email || '',
      String(d.amount ?? ''),
      d.currency || 'EGP',
      temperature(d),
      d.created_at,
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
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[26px] font-black tracking-tight text-text">Sales Pipeline</h1>
        <span className="inline-flex items-center h-7 px-3 rounded-full bg-surface-2 border border-border text-text-2 text-[12px] font-bold">
          {isLoading ? '…' : `${fmtInt(totalLeads)} leads`}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-lg border border-border bg-surface text-text text-[13px] font-bold hover:bg-surface-2"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={<Briefcase size={18} />} iconBg="bg-accent-soft" iconColor="text-accent-ink" barColor="bg-accent-strong"
                 label="Open pipeline" value={fmtEgpCompact(openPipeline)} sub="Active new-business" />
        <KpiCard icon={<Trophy size={18} />} iconBg="bg-warn-bg" iconColor="text-warn" barColor="bg-warn"
                 label="Won QTD" value={fmtEgpCompact(wonQtd)} sub="Closed revenue" />
        <KpiCard icon={<FileText size={18} />} iconBg="bg-info-bg" iconColor="text-info" barColor="bg-info"
                 label="Proposals live" value={fmtInt(proposalsLive)} sub="Awaiting decision" />
        <KpiCard icon={<Gauge size={18} />} iconBg="bg-ok-bg" iconColor="text-ok" barColor="bg-ok"
                 label="Avg deal size" value={fmtEgpCompact(avgDeal)} sub="Open pipeline" />
      </div>

      <PipelineFilterBar value={filters} onChange={setFilters} profiles={profilesQ.data ?? []} />

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
                onReopen={(id) => reopen.mutate({ id })}
              />
            ))}
          </div>
        </div>
      </DndContext>

      {pendingWon && <WonDialog deal={pendingWon} onClose={() => setPendingWon(null)} />}
      {pendingLost && <LostDialog deal={pendingLost} onClose={() => setPendingLost(null)} />}
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
    <div className="relative bg-surface border border-border rounded-xl p-3.5 pt-4 shadow-sh1 overflow-hidden">
      <div className={cn('absolute top-0 left-0 right-0 h-[3px]', barColor)} />
      <div className="flex items-center gap-2.5">
        <div className={cn('w-8 h-8 rounded-lg grid place-items-center flex-shrink-0', iconBg, iconColor)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] font-black tracking-[0.14em] uppercase text-text-3">{label}</div>
          <div className="tnum text-[18px] font-black tracking-tight text-text leading-none mt-0.5">{value}</div>
        </div>
      </div>
      <div className="text-[10.5px] text-text-3 font-semibold mt-1.5">{sub}</div>
    </div>
  );
}

function Column({
  col, rows, profilesById, isLoading, boardTotal, onReopen,
}: {
  col: ColMeta;
  rows: Deal[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  boardTotal: number;
  onReopen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = rows.reduce((s, d) => s + (d.amount || 0), 0);
  const withValue = rows.filter((d) => (d.amount || 0) > 0);
  const avg = withValue.length ? Math.round(total / withValue.length) : 0;
  const pct = boardTotal > 0 ? Math.round((total / boardTotal) * 100) : 0;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[320px] flex-shrink-0 bg-surface rounded-2xl border-t-[3px] border border-border shadow-sh1 flex flex-col transition-colors',
        col.bar,
        isOver && 'ring-2 ring-accent',
      )}
    >
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', col.dot)} />
        <span className="text-[11px] font-black tracking-widest uppercase text-text">{col.label}</span>
        <span className="tnum text-[11px] font-bold text-text-3 bg-surface-2 border border-border px-2 py-0.5 rounded-full">
          {isLoading ? '…' : fmtInt(rows.length)}
        </span>
        <span className="tnum ml-auto text-[11.5px] font-bold text-text-3">
          {total > 0 ? fmtEgpCompact(total) : '0 EGP'}
        </span>
      </div>

      <div className="px-4 pb-3 border-b border-border/60 text-[11px] italic text-text-3">
        Total Stage Amount:{' '}
        <span className="tnum font-semibold text-text-2 not-italic">
          {total > 0 ? fmtEgpShort(total) : '0 EGP'}
        </span>{' '}
        <span className="tnum">({pct}%)</span>
      </div>

      <ColumnBody rows={rows} profilesById={profilesById} isLoading={isLoading} isLost={col.key === 'lost'} onReopen={onReopen} />

      <div className="px-4 py-3 border-t border-border bg-surface-2/60 rounded-b-2xl">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-black tracking-widest uppercase text-text-3">Total</div>
          <div className="tnum text-[12.5px] font-black text-text">{total > 0 ? fmtEgpShort(total) : '0 EGP'}</div>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <div className="text-[10px] font-black tracking-widest uppercase text-text-3">Avg</div>
          <div className="tnum text-[12.5px] font-bold text-text-2">{avg > 0 ? fmtEgpShort(avg) : '0 EGP'}</div>
        </div>
      </div>
    </div>
  );
}

const PAGE = 30;
function ColumnBody({
  rows, profilesById, isLoading, isLost, onReopen,
}: {
  rows: Deal[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  isLost: boolean;
  onReopen: (id: string) => void;
}) {
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
      {rows.slice(0, visible).map((d) => (
        <Card
          key={d.id}
          d={d}
          owner={d.owner_id ? profilesById.get(d.owner_id) : undefined}
          isLost={isLost}
          onReopen={onReopen}
        />
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

function Card({
  d, owner, isLost, onReopen,
}: {
  d: Deal;
  owner: import('@/hooks/useUsersData').Profile | undefined;
  isLost: boolean;
  onReopen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: d.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  const temp = temperature(d);
  const stale = isStale(d);
  const overdue = isOverdue(d);
  const name = d.company?.name || d.title || '—';

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        'bg-surface border border-border rounded-xl p-3.5 transition-shadow cursor-grab active:cursor-grabbing',
        'hover:shadow-sh2 hover:border-border-2',
        isDragging && 'shadow-sh3 opacity-90',
      )}
    >
      <div className="flex items-start gap-2">
        <Link
          to={`/companies/${d.account_id}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 block"
        >
          <div className="text-[15px] font-black text-text truncate leading-tight">{name}</div>
          {d.company?.industry && (
            <div className="text-[11.5px] text-text-3 truncate mt-0.5">{d.company.industry}</div>
          )}
        </Link>
        <TempPill kind={temp} />
      </div>

      {(stale || overdue) && (
        <div className="mt-2 flex items-center gap-1.5">
          {overdue && (
            <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-full bg-bad-bg text-bad text-[10.5px] font-black tracking-wider">
              <AlertTriangle size={10} /> Overdue
            </span>
          )}
          {stale && (
            <span className="inline-flex items-center gap-1 h-[20px] px-2 rounded-full bg-warn-bg text-warn text-[10.5px] font-black tracking-wider">
              <Clock size={10} /> Stale
            </span>
          )}
        </div>
      )}

      {/* ACV row intentionally removed — reps don't need it visible per card;
          Won dialog + column totals surface the numbers when they matter. */}

      <div className="mt-3 pt-2.5 border-t border-border/70 flex items-center gap-2 min-w-0">
        <OwnerAvatar profile={owner} size={22} fallback={d.company?.am_mail ?? undefined} />
        <span className="text-[11.5px] font-bold text-text-2 truncate flex-1">
          {owner?.full_name || owner?.email || d.company?.am_mail || 'Unassigned'}
        </span>
        {isLost && (
          <button
            onClick={(e) => { e.stopPropagation(); onReopen(d.id); }}
            title="Reopen deal — sends it back to MQL"
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border bg-surface text-text-3 hover:text-accent-ink hover:border-accent-strong text-[10.5px] font-black"
          >
            <RotateCcw size={11} /> Reopen
          </button>
        )}
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

export { EMPTY_FILTERS, defaultFilters } from './PipelineFilters';
