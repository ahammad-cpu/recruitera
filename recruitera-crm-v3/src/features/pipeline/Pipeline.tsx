import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Briefcase, Trophy, FileText, Gauge, Download, Clock, RotateCcw, AlertTriangle, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDeals, isStale, isOverdue, type Deal, type DealStage } from '@/hooks/useDeals';
import { useMoveDeal, useReopenDeal, positionBetween } from '@/hooks/useDealMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WonDialog } from './WonDialog';
import { LostDialog } from './LostDialog';
import { ProposalDialog } from './ProposalDialog';
import { DEAL_TYPES } from '@/hooks/useDeals';
import {
  defaultFilters, filtersFromParams, filtersToParams,
  type PipelineFilterState,
} from './PipelineFilters';
import { PipelineFilterBar } from './PipelineFilterBar';

type ColMeta = { key: DealStage; label: string; dot: string; bar: string; slim?: boolean };

// Lost + Collected render slim (240px) as end-of-funnel storage — reps rarely
// browse them, but they must remain drop targets. Active columns stay 320px.
const COLUMNS: ColMeta[] = [
  { key: 'mql',       label: 'MQL',       dot: 'bg-accent-strong', bar: 'border-accent-strong' },
  { key: 'sql',       label: 'SQL',       dot: 'bg-violet',        bar: 'border-violet' },
  { key: 'demo',      label: 'DEMO',      dot: 'bg-purple',        bar: 'border-purple' },
  { key: 'proposal',  label: 'PROPOSAL',  dot: 'bg-warn',          bar: 'border-warn' },
  { key: 'won',       label: 'WON',       dot: 'bg-ok',            bar: 'border-ok' },
  { key: 'collected', label: 'COLLECTED', dot: 'bg-accent',        bar: 'border-accent', slim: true },
  { key: 'lost',      label: 'LOST',      dot: 'bg-bad',           bar: 'border-bad',    slim: true },
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
  const [pendingProposal, setPendingProposal] = useState<Deal | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  // Which stage columns are collapsed to a narrow strip. Persisted in
  // localStorage so a rep's board layout survives page refreshes.
  const [collapsed, setCollapsed] = useState<Set<DealStage>>(() => {
    try {
      const raw = localStorage.getItem('pipeline.collapsed');
      return raw ? new Set(JSON.parse(raw) as DealStage[]) : new Set();
    } catch { return new Set(); }
  });
  const toggleCollapsed = (k: DealStage) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      try { localStorage.setItem('pipeline.collapsed', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

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
        // Created between — the moment the deal was opened. Every deal has
        // this so there's no missing-data landmine.
        const t = new Date(d.created_at).getTime();
        if (from != null && t < from) return false;
        if (to != null && t > to) return false;
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
  const wonQtd = deals.filter((d) => d.stage === 'won' || d.stage === 'collected').reduce((s, d) => s + (d.amount || 0), 0);
  const proposalsLive = deals.filter((d) => d.stage === 'proposal').length;
  const dealsWithValue = openDeals.filter((d) => (d.amount || 0) > 0);
  const avgDeal = dealsWithValue.length ? openPipeline / dealsWithValue.length : 0;
  const totalLeads = openDeals.length;

  function handleDragStart(e: DragStartEvent) {
    setActiveDeal(allDeals.find((d) => d.id === String(e.active.id)) ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDeal(null);
    const id = String(e.active.id);
    const nextStage = e.over?.id ? String(e.over.id) as DealStage : null;
    if (!nextStage) return;
    const deal = allDeals.find((d) => d.id === id);
    if (!deal || deal.stage === nextStage) return;

    if (nextStage === 'won') { setPendingWon(deal); return; }
    if (nextStage === 'lost') { setPendingLost(deal); return; }
    // Moving to Proposal must capture value + expected close so the number
    // shows up on the card + on the company Deals section.
    if (nextStage === 'proposal') { setPendingProposal(deal); return; }

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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto sc pb-4 -mx-6 px-6" style={{ overflowY: 'hidden' }}>
          <div
            className="flex"
            style={{
              gap: 16,
              alignItems: 'stretch',
              minWidth: `${COLUMNS.reduce((s, c) => {
                const w = collapsed.has(c.key) ? 52 : (c.slim ? 240 : 288);
                return s + w + 16;
              }, -16)}px`,
            }}
          >
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                rows={groups.get(col.key) ?? []}
                profilesById={profilesById}
                isLoading={isLoading}
                pctDenom={openPipeline}
                onReopen={(id) => reopen.mutate({ id })}
                isCollapsed={collapsed.has(col.key)}
                onToggleCollapsed={() => toggleCollapsed(col.key)}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDeal && (
            <div className="rotate-2" style={{ width: 264 }}>
              <Card
                d={activeDeal}
                owner={activeDeal.owner_id ? profilesById.get(activeDeal.owner_id) : undefined}
                isLost={false}
                onReopen={() => {}}
                isOverlay
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {pendingWon && <WonDialog deal={pendingWon} onClose={() => setPendingWon(null)} />}
      {pendingLost && <LostDialog deal={pendingLost} onClose={() => setPendingLost(null)} />}
      {pendingProposal && <ProposalDialog deal={pendingProposal} onClose={() => setPendingProposal(null)} />}
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
  col, rows, profilesById, isLoading, pctDenom, onReopen, isCollapsed, onToggleCollapsed,
}: {
  col: ColMeta;
  rows: Deal[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  // Denominator for the stage-share %. Open pipeline (not board total) so
  // MQL/SQL/etc. read as "share of active work", not diluted by Lost.
  pctDenom: number;
  onReopen: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = useMemo(() => rows.reduce((s, d) => s + (d.amount || 0), 0), [rows]);
  const avg = useMemo(() => {
    const withValue = rows.filter((d) => (d.amount || 0) > 0);
    return withValue.length ? Math.round(total / withValue.length) : 0;
  }, [rows, total]);
  const pct = pctDenom > 0 ? Math.round((total / pctDenom) * 100) : 0;
  const isOpenStage = col.key === 'mql' || col.key === 'sql' || col.key === 'demo' || col.key === 'proposal';

  // Collapsed rail — narrow vertical strip with count + rotated label, click
  // anywhere to expand. Still a drop target so reps can drag cards into a
  // collapsed stage without expanding it first.
  if (isCollapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={onToggleCollapsed}
        title={`Expand ${col.label}`}
        className={cn('flex-shrink-0 cursor-pointer transition-colors', isOver && 'ring-2 ring-accent')}
        style={{
          width: 52,
          background: 'linear-gradient(rgb(247, 248, 249) 0%, rgba(247, 248, 249, 0) 95%)',
          border: '1px solid rgb(230, 233, 225)',
          borderRadius: 14,
          padding: '14px 0 16px',
          minHeight: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <ChevronRight size={15} color="rgb(107, 122, 116)" />
        <span
          className="tnum"
          style={{
            fontSize: 12, fontWeight: 700,
            color: 'rgb(91, 107, 95)', background: 'rgb(238, 241, 234)',
            borderRadius: 6, minWidth: 24, height: 20,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
          }}
        >{isLoading ? '…' : fmtInt(rows.length)}</span>
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 14, fontWeight: 600,
            color: 'rgb(26, 43, 40)',
            whiteSpace: 'nowrap',
            marginTop: 4,
          }}
        >{col.label}</span>
        <span className={cn('flex-shrink-0', col.dot)} style={{ width: 9, height: 9, borderRadius: 999 }} />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/col flex-shrink-0 flex flex-col transition-colors',
        col.slim ? 'w-[240px]' : 'w-[288px]',
        isOver && 'ring-2 ring-accent',
      )}
      style={{
        // Framed column shell — subtle border + gradient top-fade so each
        // stage reads as its own container instead of a loose card stack.
        background: 'linear-gradient(rgb(247, 248, 249) 0%, rgba(247, 248, 249, 0) 95%)',
        border: '1px solid rgb(230, 233, 225)',
        borderRadius: 14,
        padding: '14px 12px 12px',
        minHeight: 420,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 4px 12px' }}>
        <span
          className={cn('flex-shrink-0', col.dot)}
          style={{ width: 9, height: 9, borderRadius: 999, display: 'inline-block' }}
        />
        <span
          className="truncate"
          style={{ fontSize: 14, fontWeight: 600, color: 'rgb(26, 43, 40)' }}
        >{col.label}</span>
        <span
          className="tnum"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'rgb(91, 107, 95)',
            background: 'rgb(238, 241, 234)',
            borderRadius: 6,
            height: 19,
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0 8px',
            marginLeft: 'auto',
          }}
        >
          {isLoading ? '…' : fmtInt(rows.length)}
        </span>
        <button
          onClick={onToggleCollapsed}
          title={`Collapse ${col.label}`}
          className="opacity-0 group-hover/col:opacity-100 focus:opacity-100 transition-opacity"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6,
            color: 'rgb(107, 122, 116)', background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      <ColumnBody rows={rows} profilesById={profilesById} isLoading={isLoading} isLost={col.key === 'lost'} slim={!!col.slim} onReopen={onReopen} />

      {/* Column footer — kept from the original layout (Total + Avg) but
          restyled to sit lightly inside the gradient column rather than
          the old bordered strip. Same data, muted chrome. */}
      <div style={{ padding: '10px 6px 2px' }}>
        <div className="flex items-baseline justify-between">
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgb(138, 151, 143)' }}>
            Total {isOpenStage && pct > 0 && <span className="tnum" style={{ fontWeight: 700, color: 'rgb(138, 151, 143)' }}>· {pct}%</span>}
          </div>
          <div className="tnum" style={{ fontSize: 12.5, fontWeight: 700, color: 'rgb(26, 43, 40)' }}>{total > 0 ? fmtEgpShort(total) : '0 EGP'}</div>
        </div>
        {!col.slim && (
          <div className="flex items-baseline justify-between" style={{ marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgb(138, 151, 143)' }}>Avg</div>
            <div className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: 'rgb(91, 107, 95)' }}>{avg > 0 ? fmtEgpShort(avg) : '0 EGP'}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE = 30;
function ColumnBody({
  rows, profilesById, isLoading, isLost, slim, onReopen,
}: {
  rows: Deal[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  isLost: boolean;
  slim: boolean;
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

  const remaining = rows.length - visible;

  return (
    <div
      onScroll={onScroll}
      className="max-h-[calc(100vh-410px)] overflow-y-auto sc flex-1"
      style={{ padding: '0 0 2px', minHeight: 0 }}
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
          slim={slim}
          onReopen={onReopen}
        />
      ))}
      {remaining > 0 && (
        <div className="pt-1 pb-2 text-center text-[10.5px] font-bold text-text-4 tnum">
          Scroll for {remaining} more
        </div>
      )}
    </div>
  );
}

function Card({
  d, owner, isLost, slim, onReopen, isOverlay,
}: {
  d: Deal;
  owner: import('@/hooks/useUsersData').Profile | undefined;
  isLost: boolean;
  slim?: boolean;
  onReopen: (id: string) => void;
  isOverlay?: boolean;
}) {
  // The DragOverlay clone is a plain visual copy — it must not itself be
  // draggable/droppable, only the source card in the column is.
  const drag = useDraggable({ id: d.id, disabled: isOverlay });
  const { attributes, listeners, setNodeRef, isDragging } = drag;
  const stale = isStale(d);
  const overdue = isOverdue(d);
  const name = d.company?.name || d.title || '—';

  // Company initials for the reference-style avatar chip in the card top.
  const initials = (name || '—')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase() || '—';

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={cn('group relative cursor-grab active:cursor-grabbing', isOverlay && 'scale-[1.03]')}
      style={{
        background: 'rgb(255, 255, 255)',
        border: '1px solid rgb(230, 233, 225)',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
        transition: 'background 0.12s, border-color 0.12s',
        boxShadow: isOverlay ? '0 8px 24px rgba(0,0,0,0.12)' : undefined,
      }}
    >
      {/* Hover affordance so new reps discover cards are draggable.
          Hidden while dragging (the ghost handles that visual). */}
      {!isDragging && !isOverlay && (
        <GripVertical
          size={13}
          aria-hidden
          className="absolute top-2 right-2 text-text-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        />
      )}
      {/* While dragging, the source card becomes an empty dashed "ghost"
          slot (content hidden but space preserved) — the DragOverlay clone
          is what actually follows the pointer. */}
      {isDragging && !isOverlay && (
        <div
          className="absolute inset-0"
          style={{ border: '2px dashed rgb(230, 233, 225)', background: 'rgba(238, 241, 234, 0.4)', borderRadius: 12 }}
        />
      )}
      <div className={cn(isDragging && !isOverlay && 'invisible')}>
        {/* Card top — mirrors the reference: initials-avatar + name + a
            metadata row of small pastel chips. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px 11px' }}>
          <span
            className="tnum"
            style={{
              width: 24, height: 24, borderRadius: 999,
              background: 'rgb(0, 36, 39)', color: 'rgb(255, 255, 255)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 10, flex: '0 0 auto',
            }}
          >{initials}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingRight: 16 }}>
              <Link
                to={`/companies/${d.account_id}`}
                onPointerDown={(e) => e.stopPropagation()}
                className="truncate"
                style={{ fontWeight: 600, fontSize: 14, color: 'rgb(26, 43, 40)' }}
              >{name}</Link>
              {overdue && (
                <span
                  className="tnum"
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                    color: 'rgb(196, 61, 61)',
                    border: '1px solid rgb(240, 205, 205)',
                    background: 'rgb(251, 237, 237)',
                    borderRadius: 5, padding: '2px 6px', flex: '0 0 auto',
                  }}
                >Overdue</span>
              )}
              {!overdue && stale && (
                <span
                  className="tnum"
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.02em',
                    color: 'rgb(163, 121, 27)',
                    border: '1px solid rgb(238, 220, 178)',
                    background: 'rgb(253, 246, 227)',
                    borderRadius: 5, padding: '2px 6px', flex: '0 0 auto',
                  }}
                >Stale</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
              {(d.amount ?? 0) > 0 && (
                <span
                  className="tnum"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                    color: 'rgb(91, 107, 95)', background: 'rgb(238, 241, 234)',
                    borderRadius: 4, padding: '2px 6px',
                  }}
                >
                  VALUE
                  <span style={{ color: 'rgb(26, 43, 40)', fontSize: 10 }}>
                    {new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(d.amount!)} {d.currency || 'EGP'}
                  </span>
                </span>
              )}
              {d.deal_type && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                    color: 'rgb(91, 107, 95)', background: 'rgb(238, 241, 234)',
                    borderRadius: 4, padding: '2px 6px',
                  }}
                  title="Deal type"
                >
                  {DEAL_TYPES.find((t) => t.key === d.deal_type)?.label ?? d.deal_type}
                </span>
              )}
              {d.company?.industry && !slim && (
                <span style={{ fontSize: 12.5, color: 'rgb(138, 151, 143)' }} className="truncate">
                  {d.company.industry}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card footer — owner + optional Reopen action, styled like the
            reference "location" footer strip. */}
        <div
          style={{
            borderTop: '1px solid rgb(241, 243, 236)',
            padding: '9px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: 'rgb(91, 107, 95)',
          }}
        >
          <OwnerAvatar profile={owner} size={18} fallback={d.company?.am_mail ?? undefined} />
          <span className="truncate" style={{ color: 'rgb(138, 151, 143)', flex: 1 }}>
            {owner?.full_name || owner?.email || d.company?.am_mail || 'Unassigned'}
          </span>
          {isLost && (
            <button
              onClick={(e) => { e.stopPropagation(); onReopen(d.id); }}
              title="Reopen deal — sends it back to MQL"
              className="inline-flex items-center gap-1"
              style={{
                height: 22, padding: '0 8px', borderRadius: 6,
                border: '1px solid rgb(230, 233, 225)', background: 'rgb(255, 255, 255)',
                color: 'rgb(91, 107, 95)', fontSize: 10.5, fontWeight: 700,
              }}
            >
              <RotateCcw size={11} /> Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export { EMPTY_FILTERS, defaultFilters } from './PipelineFilters';
