import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { useRenewalBoard, type RenewalRow } from '@/hooks/useRenewals';
import { useUpdateCycleStatus } from '@/hooks/useCycleMutations';
import { RENEWAL_COLUMNS, type RenewalBucket } from '@/lib/renewal';
import { fmtInt, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

// Only these two columns are a real, settable status on the contract cycle.
// The day-count buckets (90/60/30/Overdue) are always derived from ends_at
// and can't be dragged into — dropping there is a no-op with an explanation.
const SETTABLE_COLUMNS = new Set<RenewalBucket>(['renewed', 'churned']);

export default function Renewal() {
  const { rowsByBucket, isLoading, error, refetch } = useRenewalBoard();
  const updateStatus = useUpdateCycleStatus();
  const [activeRow, setActiveRow] = useState<RenewalRow | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    for (const rows of rowsByBucket.values()) {
      const found = rows.find((r) => r.cycle.id === id);
      if (found) { setActiveRow(found); return; }
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveRow(null);
    const cycleId = String(e.active.id);
    const target = e.over?.id ? String(e.over.id) as RenewalBucket : null;
    if (!target) return;

    const row = [...rowsByBucket.values()].flat().find((r) => r.cycle.id === cycleId);
    if (!row || row.bucket === target) return;

    if (!SETTABLE_COLUMNS.has(target)) {
      toast.info('That column is automatic — drag to Renewed or Churned to update status.');
      return;
    }
    updateStatus.mutate({ id: cycleId, status: target as 'renewed' | 'churned' });
  }

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-text">Renewal Pipeline</h1>
          <p className="text-[13px] text-text-3 font-medium mt-1">
            Active contracts, bucketed by days remaining until renewal. Drag a card into Renewed or Churned to update it.
          </p>
        </div>
        <div className="flex-1" />
        <button
          onClick={refetch}
          className="inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-lg border border-border-2 bg-surface text-[13px] font-semibold text-text-2 hover:bg-surface-2"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto sc pb-2">
          <div className="flex gap-3" style={{ minWidth: `${RENEWAL_COLUMNS.length * 260}px` }}>
            {RENEWAL_COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                rows={rowsByBucket.get(col.key) ?? []}
                isLoading={isLoading}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeRow && (
            <div className="w-[232px] rotate-2">
              <RenewalCard row={activeRow} chipClass={RENEWAL_COLUMNS.find((c) => c.key === activeRow.bucket)!.chip} label={RENEWAL_COLUMNS.find((c) => c.key === activeRow.bucket)!.label} isOverlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  col, rows, isLoading,
}: {
  col: typeof RENEWAL_COLUMNS[number];
  rows: RenewalRow[];
  isLoading: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[260px] flex-shrink-0 flex flex-col bg-surface-2 border border-border rounded-2xl overflow-hidden min-h-[520px] transition-colors',
        isOver && 'ring-2 ring-accent',
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 bg-surface">
        <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dot)} />
        <span className="text-[14px] font-black tracking-tight text-text">{col.label}</span>
        <div className="flex-1" />
        <span className="tnum bg-surface-2 border border-border text-text-2 text-[12px] font-black px-2.5 py-0.5 rounded-full">
          {isLoading ? '…' : rows.length}
        </span>
      </div>

      <div className="flex-1 p-3 space-y-2.5 overflow-y-auto sc">
        {isLoading && [...Array(2)].map((_, i) => (
          <div key={i} className="h-24 bg-surface rounded-xl animate-pulse" />
        ))}
        {!isLoading && rows.length === 0 && (
          <div className="py-8 text-center text-[12.5px] font-semibold text-text-4">No customers here</div>
        )}
        {!isLoading && rows.map((r) => (
          <RenewalCard key={r.cycle.id} row={r} chipClass={col.chip} label={col.label} />
        ))}
      </div>
    </div>
  );
}

function RenewalCard({
  row, chipClass, label, isOverlay,
}: {
  row: RenewalRow; chipClass: string; label: string; isOverlay?: boolean;
}) {
  const { account, cycle, bucket } = row;
  const drag = useDraggable({ id: cycle.id, disabled: isOverlay });
  const { attributes, listeners, setNodeRef, isDragging } = drag;
  const name = account.name || account.domain || '—';
  const plan = cycle.plan_tier || '—';
  const chipLabel = bucket === 'overdue' ? 'Overdue' : bucket === 'renewed' ? 'Renewed' : bucket === 'churned' ? 'Churned' : label;

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      {...(isOverlay ? {} : attributes)}
      {...(isOverlay ? {} : listeners)}
      className={cn(
        'relative bg-surface border border-border rounded-[11px] p-3.5 shadow-sh1 transition-shadow cursor-grab active:cursor-grabbing',
        'hover:shadow-sh2 hover:border-border-2',
        isOverlay && 'shadow-sh3 scale-[1.03]',
      )}
    >
      {/* Same fix as the Sales Pipeline board: the source card becomes an
          empty dashed ghost slot while dragging — the DragOverlay clone is
          what actually follows the pointer. */}
      {isDragging && !isOverlay && (
        <div className="absolute inset-0 rounded-[11px] border-2 border-dashed border-border-2 bg-surface-2/40" />
      )}
      <div className={cn(isDragging && !isOverlay && 'invisible')}>
        {/* Only the name is a navigation link (stopping propagation so a
            click doesn't also start a drag) — the rest of the card is free
            drag surface, same split as the Sales Pipeline cards. Wrapping
            the WHOLE card in the link (the original bug here) swallows
            every pointerdown before dnd-kit's listeners on the outer div
            ever see it, so dragging could never start at all. */}
        <Link
          to={`/companies/${account.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="block"
        >
          <div className="text-[14.5px] font-black tracking-tight text-text truncate leading-tight">{name}</div>
        </Link>
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-[12px] font-semibold text-text-2">{plan}</span>
          <span className="tnum text-[13px] font-black text-text">EGP {fmtInt(row.value)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
          <span className="text-[11px] font-semibold text-text-3">Ends {fmtDate(cycle.ends_at)}</span>
          <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-bold', chipClass)}>
            {chipLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
