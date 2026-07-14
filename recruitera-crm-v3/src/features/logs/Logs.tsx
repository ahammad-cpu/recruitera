import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRecentActivities } from '@/hooks/useRecentActivities';
import { useEnum } from '@/hooks/useEnum';
import { fmtDate } from '@/lib/format';

export default function Logs() {
  const { data, isLoading, error } = useRecentActivities(300);
  const activityTypes = useEnum('activity_type');
  const [kind, setKind] = useState('all');

  // Union of enum values and whatever kinds actually appear in fetched rows,
  // so we never miss a kind if the DB adds one before the enum is repolled.
  const kinds = useMemo(() => {
    const set = new Set<string>(activityTypes.data ?? []);
    (data ?? []).forEach((a) => set.add(a.type));
    return ['all', ...Array.from(set).sort()];
  }, [activityTypes.data, data]);

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  const rows = (data ?? []).filter((a) => (kind === 'all' ? true : a.type === kind));

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">System Logs</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          {isLoading ? 'Loading…' : `${rows.length} entries`}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={
              'h-8 px-3 rounded-lg text-[12px] font-semibold border ' +
              (kind === k
                ? 'bg-cg-900 text-white border-cg-900'
                : 'bg-surface text-text-2 border-border hover:bg-surface-2')
            }
          >
            {k}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-text-3">No entries.</div>
        )}
        {rows.map((a) => (
          <div key={a.id} className="px-4 py-3 border-t border-border first:border-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">
                {a.type}
              </span>
              {a.from_stage && a.to_stage && (
                <span className="text-[11px] text-text-3">
                  {a.from_stage} → <b className="text-text">{a.to_stage}</b>
                </span>
              )}
              {a.email_subject && <span className="text-[11px] text-text-3">Subject: {a.email_subject}</span>}
              {a.call_outcome && <span className="text-[11px] text-text-3">Call: {a.call_outcome}</span>}
              <span className="ml-auto text-[11px] text-text-4">{fmtDate(a.created_at)}</span>
            </div>
            {a.title && <div className="mt-1 text-[13px] font-semibold text-text">{a.title}</div>}
            {a.text && <div className="mt-0.5 text-[12.5px] text-text-2 line-clamp-2">{a.text}</div>}
            {a.account_id && (
              <Link to={`/companies/${a.account_id}`} className="text-[11px] text-text-3 hover:text-accent-ink mt-1 inline-block">
                Open company →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
