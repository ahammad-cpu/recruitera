import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useRenewalBoard, type RenewalRow } from '@/hooks/useRenewals';
import { RENEWAL_COLUMNS } from '@/lib/renewal';
import { fmtInt, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

export default function Renewal() {
  const { rowsByBucket, isLoading, error, refetch } = useRenewalBoard();

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-text">Renewal Pipeline</h1>
          <p className="text-[13px] text-text-3 font-medium mt-1">
            Active contracts, bucketed by days remaining until renewal.
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

      <div className="overflow-x-auto sc pb-2">
        <div className="flex gap-3" style={{ minWidth: `${RENEWAL_COLUMNS.length * 260}px` }}>
          {RENEWAL_COLUMNS.map((col) => {
            const colRows = rowsByBucket.get(col.key) ?? [];
            return (
              <div
                key={col.key}
                className="w-[260px] flex-shrink-0 flex flex-col bg-surface-2 border border-border rounded-2xl overflow-hidden min-h-[520px]"
              >
                <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 bg-surface">
                  <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dot)} />
                  <span className="text-[14px] font-black tracking-tight text-text">{col.label}</span>
                  <div className="flex-1" />
                  <span className="tnum bg-surface-2 border border-border text-text-2 text-[12px] font-black px-2.5 py-0.5 rounded-full">
                    {isLoading ? '…' : colRows.length}
                  </span>
                </div>

                <div className="flex-1 p-3 space-y-2.5 overflow-y-auto sc">
                  {isLoading && [...Array(2)].map((_, i) => (
                    <div key={i} className="h-24 bg-surface rounded-xl animate-pulse" />
                  ))}
                  {!isLoading && colRows.length === 0 && (
                    <div className="py-8 text-center text-[12.5px] font-semibold text-text-4">No customers here</div>
                  )}
                  {!isLoading && colRows.map((r) => (
                    <RenewalCard key={r.account.id} row={r} chipClass={col.chip} label={col.label} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RenewalCard({ row, chipClass, label }: { row: RenewalRow; chipClass: string; label: string }) {
  const { account, cycle, bucket } = row;
  const name = account.name || account.domain || '—';
  const plan = cycle.plan_tier || '—';
  const chipLabel = bucket === 'overdue' ? 'Overdue' : bucket === 'renewed' ? 'Renewed' : bucket === 'churned' ? 'Churned' : label;

  return (
    <Link
      to={`/companies/${account.id}`}
      className="block bg-surface border border-border rounded-[11px] p-3.5 shadow-sh1 hover:shadow-sh2 hover:border-border-2 transition-shadow"
    >
      <div className="text-[14.5px] font-black tracking-tight text-text truncate leading-tight">{name}</div>
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
    </Link>
  );
}
