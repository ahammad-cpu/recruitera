import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { fmtInt, initials } from '@/lib/format';

export default function Renewal() {
  const { data, isLoading, error } = useAccounts();

  const paid = useMemo(() => (data ?? []).filter(isPaid), [data]);

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">Renewal Pipeline</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          {isLoading ? 'Loading…' : `${fmtInt(paid.length)} active paid customers`}
        </p>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="grid grid-cols-[1fr_180px_120px] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3">
          <div>Account</div>
          <div>Owner</div>
          <div>Paid status</div>
        </div>
        {isLoading && [...Array(8)].map((_, i) => (
          <div key={i} className="border-t border-border px-4 py-3">
            <div className="h-4 bg-surface-2 rounded animate-pulse" />
          </div>
        ))}
        {!isLoading && paid.slice(0, 300).map((a) => (
          <Link
            key={a.id}
            to={`/companies/${a.id}`}
            className="grid grid-cols-[1fr_180px_120px] px-4 py-2.5 border-t border-border hover:bg-surface-2 transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-cg-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {initials(a.name || a.domain)}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-text text-[13px] truncate">{a.name || a.domain}</div>
                <div className="text-[11px] text-text-3 truncate">{a.domain}</div>
              </div>
            </div>
            <div className="text-[12px] text-text-2 self-center truncate">{a.am_mail || '—'}</div>
            <div className="self-center">
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-ok-bg text-ok text-[10.5px] font-bold">
                {a.paid_status || 'Paid'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
