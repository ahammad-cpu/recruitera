import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useChangeStage } from '@/hooks/useAccountMutations';
import { fmtInt, initials } from '@/lib/format';

const COLUMNS: Array<{ key: string; label: string }> = [
  { key: 'mql', label: 'MQL' },
  { key: 'sql', label: 'SQL' },
  { key: 'demo', label: 'Demo' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'paid', label: 'Paid' },
  { key: 'lost', label: 'Lost' },
];

const COL_ACCENT: Record<string, string> = {
  mql: 'border-info/40', sql: 'border-[#392396]/40', demo: 'border-warn/40',
  proposal: 'border-[#F97316]/40', won: 'border-ok/40', paid: 'border-accent-strong/50',
  lost: 'border-bad/40',
};

export default function Pipeline() {
  const { data, isLoading, error } = useAccounts();
  const changeStage = useChangeStage();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const groups = useMemo(() => {
    const m = new Map<string, Account[]>();
    COLUMNS.forEach((c) => m.set(c.key, []));
    (data ?? []).forEach((a) => {
      const k = (a.stage || '').toLowerCase();
      if (m.has(k)) m.get(k)!.push(a);
    });
    return m;
  }, [data]);

  function handleDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const nextStage = e.over?.id ? String(e.over.id) : null;
    if (!nextStage) return;
    const acct = (data ?? []).find((a) => a.id === id);
    if (!acct || (acct.stage || '').toLowerCase() === nextStage) return;
    changeStage.mutate({ id, stage: nextStage });
  }

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">Sales Pipeline</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">Drag cards between columns to change stage.</p>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto sc pb-4">
          <div className="flex gap-3" style={{ minWidth: `${COLUMNS.length * 280}px` }}>
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                col={col}
                rows={groups.get(col.key) ?? []}
                isLoading={isLoading}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function Column({ col, rows, isLoading }: { col: { key: string; label: string }; rows: Account[]; isLoading: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={`w-[270px] flex-shrink-0 bg-surface-2 rounded-2xl border-t-2 ${COL_ACCENT[col.key]} ${isOver ? 'ring-2 ring-accent' : ''}`}
    >
      <div className="px-3 py-3 flex items-center justify-between">
        <div className="text-[12px] font-bold uppercase tracking-wider text-text-2">{col.label}</div>
        <div className="tnum text-[11px] font-bold text-text-3 bg-surface px-2 py-0.5 rounded-full">
          {isLoading ? '…' : fmtInt(rows.length)}
        </div>
      </div>
      <div className="px-2 pb-2 space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto sc">
        {isLoading && [...Array(3)].map((_, i) => (
          <div key={i} className="h-16 bg-surface rounded-lg animate-pulse" />
        ))}
        {!isLoading && rows.length === 0 && (
          <div className="py-6 text-center text-[11px] text-text-4">Empty</div>
        )}
        {rows.slice(0, 60).map((a) => <Card key={a.id} a={a} />)}
        {rows.length > 60 && (
          <div className="text-[10px] text-text-4 text-center py-1">+{rows.length - 60} more (scroll or filter)</div>
        )}
      </div>
    </div>
  );
}

function Card({ a }: { a: Account }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: a.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-surface border border-border rounded-lg p-2.5 hover:shadow-sh2 transition-shadow ${isDragging ? 'shadow-sh3 opacity-90' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="w-6 h-6 rounded-md bg-cg-800 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing"
          title="Drag to change stage"
        >
          {initials(a.name || a.domain)}
        </div>
        <Link to={`/companies/${a.id}`} className="min-w-0 flex-1 block">
          <div className="text-[12.5px] font-semibold text-text truncate">{a.name || a.domain || '—'}</div>
          <div className="text-[10.5px] text-text-3 truncate">{a.am_mail || 'unassigned'}</div>
        </Link>
      </div>
    </div>
  );
}
