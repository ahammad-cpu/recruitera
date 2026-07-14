import { Link } from 'react-router-dom';
import { CheckSquare, Square, Clock } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useToggleTaskDone } from '@/hooks/useActivityMutations';
import { fmtDate } from '@/lib/format';

export default function Tasks() {
  const { data, isLoading, error } = useTasks();
  const toggle = useToggleTaskDone();

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  const open = (data ?? []).filter((t) => !t.task_done);
  const done = (data ?? []).filter((t) => t.task_done);

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg font-bold text-text">Tasks</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          {isLoading ? 'Loading…' : `${open.length} open · ${done.length} done`}
        </p>
      </div>

      <Section title="Open" rows={open} loading={isLoading} empty="Nothing on your plate."
               onToggle={(id, done) => toggle.mutate({ id, done })} />
      <Section title="Completed" rows={done.slice(0, 30)} loading={false} empty="No completed tasks yet." muted
               onToggle={(id, done) => toggle.mutate({ id, done })} />
    </div>
  );
}

function Section({
  title, rows, loading, empty, muted, onToggle,
}: {
  title: string;
  rows: ReturnType<typeof useTasks>['data'];
  loading: boolean;
  empty: string;
  muted?: boolean;
  onToggle: (id: string, done: boolean) => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className="px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3">{title}</div>
      {loading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {!loading && rows && rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">{empty}</div>}
      {rows?.map((t) => (
        <div key={t.id} className={`px-4 py-3 border-t border-border flex items-start gap-3 ${muted ? 'opacity-60' : ''}`}>
          <button
            onClick={() => onToggle(t.id, !t.task_done)}
            className="mt-0.5 hover:opacity-70"
            title={t.task_done ? 'Mark open' : 'Mark done'}
          >
            {t.task_done ? <CheckSquare size={16} className="text-ok" /> : <Square size={16} className="text-text-3" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-text">{t.title || t.text || '(untitled)'}</div>
            {t.text && t.title && <div className="text-[12px] text-text-2 mt-0.5">{t.text}</div>}
            <div className="flex items-center gap-3 mt-1 text-[11px] text-text-3">
              {t.task_due_date && <span className="inline-flex items-center gap-1"><Clock size={11} /> {fmtDate(t.task_due_date)}</span>}
              {t.priority && <span className="uppercase tracking-wider font-bold text-warn">{t.priority}</span>}
              {t.account_id && <Link to={`/companies/${t.account_id}`} className="hover:text-accent-ink">Open company →</Link>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
