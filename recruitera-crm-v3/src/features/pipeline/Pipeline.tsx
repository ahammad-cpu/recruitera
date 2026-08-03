import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Download, RotateCcw, GripVertical, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useDeals, isStale, isOverdue, type Deal, type DealStage } from '@/hooks/useDeals';
import { useMoveDeal, useReopenDeal, positionBetween } from '@/hooks/useDealMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { useAllAccountTags, useTags, useAttachTag, useDetachTag, useCreateTag, type Tag } from '@/hooks/useTags';
import { TagPickerPopover } from '@/components/shared/TagPickerPopover';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WonDialog } from './WonDialog';
import { LostDialog } from './LostDialog';
import { ProposalDialog } from './ProposalDialog';
import {
  defaultFilters, filtersFromParams, filtersToParams,
  type PipelineFilterState,
} from './PipelineFilters';
import { PipelineFilterBar } from './PipelineFilterBar';

type ColMeta = { key: DealStage; label: string; dot: string; bar: string; badge: string; weight: number; slim?: boolean };

// HubSpot-style board: each stage is a solid colour-coded badge, and every
// stage carries a win-probability used for the column's Weighted amount.
// Lost + Collected render slim (240px) as end-of-funnel storage — reps rarely
// browse them, but they must remain drop targets. Active columns stay 288px.
const COLUMNS: ColMeta[] = [
  { key: 'mql',       label: 'MQL',       dot: 'bg-accent-strong', bar: 'border-accent-strong', badge: '#0091ae', weight: 0.20 },
  { key: 'sql',       label: 'SQL',       dot: 'bg-violet',        bar: 'border-violet',        badge: '#c2410c', weight: 0.40 },
  { key: 'demo',      label: 'Demo',      dot: 'bg-purple',        bar: 'border-purple',        badge: '#b02a91', weight: 0.60 },
  { key: 'proposal',  label: 'Proposal',  dot: 'bg-warn',          bar: 'border-warn',          badge: '#c98a00', weight: 0.80 },
  { key: 'won',       label: 'Won',       dot: 'bg-ok',            bar: 'border-ok',            badge: '#00875a', weight: 1.00 },
  { key: 'collected', label: 'Collected', dot: 'bg-accent',        bar: 'border-accent',        badge: '#0d8a8a', weight: 1.00, slim: true },
  { key: 'lost',      label: 'Lost',      dot: 'bg-bad',           bar: 'border-bad',           badge: '#d64545', weight: 0.00, slim: true },
];

// Short US-style date for card property rows (HubSpot uses MM/DD/YYYY).
function mdY(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}
const AMT_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });


const EGP_FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmtEgpShort = (n: number) => `${EGP_FMT.format(Math.round(n))} EGP`;

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
  const totalLeads = deals.filter((d) => openStages.has(d.stage)).length;

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

function Column({
  col, rows, profilesById, isLoading, onReopen, isCollapsed, onToggleCollapsed,
}: {
  col: ColMeta;
  rows: Deal[];
  profilesById: Map<string, import('@/hooks/useUsersData').Profile>;
  isLoading: boolean;
  onReopen: (id: string) => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  const total = useMemo(() => rows.reduce((s, d) => s + (d.amount || 0), 0), [rows]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 12px' }}>
        <span
          className="truncate"
          style={{
            display: 'inline-flex', alignItems: 'center',
            height: 22, padding: '0 10px', borderRadius: 999,
            background: col.badge, color: '#fff',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
          }}
        >{col.label}</span>
        <span
          className="tnum"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'rgb(91, 107, 95)',
            background: 'rgb(238, 241, 234)',
            borderRadius: 999,
            minWidth: 22, height: 20,
            display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 7px',
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

      {/* Column footer — HubSpot-style: Total amount, then Weighted amount
          (total × stage win-probability) with the % shown inline. */}
      <div style={{ padding: '10px 6px 2px', borderTop: '1px solid rgb(238, 241, 234)', marginTop: 4 }}>
        <div className="tnum" style={{ fontSize: 12.5, color: 'rgb(26, 43, 40)' }}>
          <span style={{ fontWeight: 700 }}>{fmtEgpShort(total)}</span>
          <span style={{ color: 'rgb(138, 151, 143)', fontWeight: 500 }}> | Total amount</span>
        </div>
        <div className="tnum" style={{ fontSize: 12.5, color: 'rgb(26, 43, 40)', marginTop: 3 }}>
          <span style={{ fontWeight: 700 }}>{fmtEgpShort(Math.round(total * col.weight))}</span>
          <span style={{ color: 'rgb(138, 151, 143)', fontWeight: 500 }}>
            {' '}({Math.round(col.weight * 100)}%) | Weighted amount
          </span>
        </div>
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

// Tag chips + "Add tag" picker on a pipeline card. Uses the SAME account_tags
// store as the company profile, so a tag added here appears there instantly
// (and vice-versa). The picker is portalled to <body> so the card's overflow
// clipping and drag listeners don't interfere.
function CardTags({ accountId }: { accountId: string }) {
  const allAcctTags = useAllAccountTags();
  const allTags = useTags();
  const attach = useAttachTag(accountId);
  const detach = useDetachTag(accountId);
  const create = useCreateTag();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const tags: Tag[] = allAcctTags.data?.get(accountId) ?? [];
  const attachedIds = new Set(tags.map((t) => t.id));

  function openPicker(e: React.MouseEvent) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.min(r.left, window.innerWidth - 312), top: r.bottom });
    setOpen(true);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {tags.map((t) => (
        <span
          key={t.id}
          className="truncate"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            maxWidth: 140, height: 20, padding: '0 8px', borderRadius: 999,
            background: 'rgb(238, 241, 234)', color: 'rgb(26, 43, 40)',
            fontSize: 11, fontWeight: 600,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: t.color || 'rgb(var(--accent))', flex: '0 0 auto' }} />
          <span className="truncate">{t.label}</span>
        </span>
      ))}
      <button
        ref={btnRef}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openPicker}
        title="Add tag"
        className="inline-flex items-center gap-1"
        style={{
          height: 20, padding: tags.length ? '0 6px' : '0 8px', borderRadius: 999,
          border: '1px dashed rgb(200, 208, 198)', background: 'transparent',
          color: 'rgb(107, 122, 116)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}
      >
        <Plus size={11} />{tags.length ? '' : ' Add tag'}
      </button>

      {open && pos && createPortal(
        <div style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 200 }}>
          <TagPickerPopover
            allTags={allTags.data ?? []}
            attachedIds={attachedIds}
            onAttach={(id) => attach.mutate(id)}
            onDetach={(id) => detach.mutate(id)}
            onCreate={(label) => create.mutateAsync(label)}
            onClose={() => setOpen(false)}
            placement="bottom"
            align="left"
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

function PropRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontSize: 12.5, lineHeight: 1.35 }}>
      <span style={{ color: 'rgb(138, 151, 143)', flex: '0 0 auto' }}>{label}:</span>
      <span className="truncate tnum" style={{ color: 'rgb(26, 43, 40)', fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function Card({
  d, owner, isLost, onReopen, isOverlay,
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
      <div className={cn(isDragging && !isOverlay && 'invisible')} style={{ padding: '12px 14px 10px' }}>
        {/* Title — the deal name as an accent link (HubSpot card header). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingRight: 16 }}>
          <Link
            to={`/companies/${d.account_id}`}
            state={{ from: 'pipeline' }}
            onPointerDown={(e) => e.stopPropagation()}
            className="truncate hover:underline"
            style={{ fontWeight: 700, fontSize: 14, color: 'rgb(15, 118, 110)' }}
          >{d.title || name}</Link>
          {overdue && (
            <span className="tnum" style={{ fontSize: 10, fontWeight: 700, color: 'rgb(196, 61, 61)', border: '1px solid rgb(240, 205, 205)', background: 'rgb(251, 237, 237)', borderRadius: 5, padding: '1px 6px', flex: '0 0 auto' }}>Overdue</span>
          )}
          {!overdue && stale && (
            <span className="tnum" style={{ fontSize: 10, fontWeight: 700, color: 'rgb(163, 121, 27)', border: '1px solid rgb(238, 220, 178)', background: 'rgb(253, 246, 227)', borderRadius: 5, padding: '1px 6px', flex: '0 0 auto' }}>Stale</span>
          )}
        </div>

        {/* Property rows — label: value, HubSpot's default card layout. */}
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <PropRow label="Create date" value={mdY(d.created_at)} />
          <PropRow label="Close date" value={mdY(d.expected_close_date)} />
          <PropRow label="Amount" value={(d.amount ?? 0) > 0 ? `${AMT_FMT.format(d.amount!)} ${d.currency || 'EGP'}` : '—'} strong />
          <PropRow label="Deal owner" value={owner?.full_name || owner?.email || d.company?.am_mail || 'Unassigned'} />
        </div>

        {/* Tags — same picker + store as the company profile, so a tag added
            here shows there (and vice-versa). */}
        {!isOverlay && d.account_id && (
          <div style={{ borderTop: '1px solid rgb(241, 243, 236)', marginTop: 10, paddingTop: 2 }}>
            <CardTags accountId={d.account_id} />
          </div>
        )}

        {isLost && (
          <button
            onClick={(e) => { e.stopPropagation(); onReopen(d.id); }}
            title="Reopen deal — sends it back to MQL"
            className="inline-flex items-center gap-1"
            style={{
              marginTop: 9, height: 24, padding: '0 8px', borderRadius: 6,
              border: '1px solid rgb(230, 233, 225)', background: 'rgb(255, 255, 255)',
              color: 'rgb(91, 107, 95)', fontSize: 10.5, fontWeight: 700,
            }}
          >
            <RotateCcw size={11} /> Reopen
          </button>
        )}
      </div>
    </div>
  );
}

export { EMPTY_FILTERS, defaultFilters } from './PipelineFilters';
