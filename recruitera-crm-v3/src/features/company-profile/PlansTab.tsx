import { useState } from 'react';
import { ScrollText, Plus, Trash2 } from 'lucide-react';
import { useAccountCycles } from '@/hooks/useAccountCycles';
import { useDeleteCycle } from '@/hooks/useCycleMutations';
import type { Cycle } from '@/hooks/useContractCycles';
import { CycleModal } from './CycleModal';
import { cn } from '@/lib/cn';

export function PlansTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useAccountCycles(accountId);
  const del = useDeleteCycle(accountId);
  const cycles = data ?? [];
  const [modal, setModal] = useState<{ open: boolean; cycle?: Cycle | null }>({ open: false });

  if (isLoading) return <EmptyCard>Loading contract cycles…</EmptyCard>;
  if (cycles.length === 0) {
    return (
      <>
        <EmptyCard
          icon={<ScrollText size={20} />}
          title="No plans yet"
          hint="Contract cycles appear here once a plan is set — plan tier, dates, and renewal history."
          actionLabel="+ Add first cycle"
          onAction={() => setModal({ open: true, cycle: null })}
        />
        {modal.open && <CycleModal accountId={accountId} existing={modal.cycle} onClose={() => setModal({ open: false })} />}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-text-3">Renewal cycles</div>
          <div className="text-[16px] font-extrabold tracking-tight mt-1">
            {cycles.length} cycle{cycles.length === 1 ? '' : 's'} on record
          </div>
        </div>
        <button
          onClick={() => setModal({ open: true, cycle: null })}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-accent text-cg-900 text-[12.5px] font-bold border border-accent-strong hover:bg-accent-strong"
        >
          <Plus size={13} /> Add cycle
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {cycles.map((c, i) => (
          <CycleCard
            key={c.id}
            cycle={c}
            isCurrent={i === 0}
            onEdit={() => setModal({ open: true, cycle: c })}
            onDelete={() => {
              if (!confirm(`Delete cycle #${c.cycle_number ?? ''}? This is not reversible.`)) return;
              del.mutate(c.id);
            }}
          />
        ))}
      </div>

      <HistoryTable cycles={cycles} />

      {modal.open && (
        <CycleModal
          accountId={accountId}
          existing={modal.cycle ?? null}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}

function CycleCard({ cycle: c, isCurrent, onEdit, onDelete }: { cycle: Cycle; isCurrent: boolean; onEdit: () => void; onDelete: () => void }) {
  const months = monthsBetween(c.started_at, c.ends_at);
  return (
    <div className={cn(
      'bg-surface rounded-xl p-5 shadow-sh1',
      isCurrent ? 'border-2 border-accent' : 'border border-border',
    )}>
      <div className="flex items-center flex-wrap gap-2.5 mb-4">
        <Chip variant={isCurrent ? 'lime' : 'neutral'}>{isCurrent ? 'current' : 'completed'}</Chip>
        <Chip variant="neutral">{termLabel(months)}</Chip>
        <Chip variant={c.auto_renew ? 'ok' : 'neutral'}>● {c.auto_renew ? 'Auto-renew' : 'Manual'}</Chip>
        <div className="flex-1" />
        <span className="text-[9px] font-black uppercase tracking-widest text-text-3">Invoice</span>
        {invoiceChip(c.status)}
        <button onClick={onEdit} className="h-7 px-3 rounded-md border border-border-2 bg-surface text-text-2 text-[11.5px] font-bold hover:bg-surface-2">Edit</button>
        <button onClick={onDelete} title="Delete cycle" className="h-7 w-7 grid place-items-center rounded-md border border-bad/40 text-bad hover:bg-bad-bg"><Trash2 size={12} /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Term start" value={fmtShortDate(c.started_at)} />
        <Stat label="Term end" value={fmtShortDate(c.ends_at)} />
        <Stat label="Length" value={months} />
        <Stat label="Amount" value={fmtValue(c.value, c.currency)} />
      </div>

      {/* Money timeline — only rendered when the cycle has any of these set,
          so old cycles without them stay clean. */}
      {(c.offer_sent_date || c.invoice_date || c.paid_date || c.original_price != null || c.discount_given != null) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/60">
          {c.offer_sent_date && <Stat label="Offer sent" value={fmtShortDate(c.offer_sent_date)} />}
          {c.invoice_date && <Stat label="Invoice date" value={fmtShortDate(c.invoice_date)} />}
          {c.paid_date && <Stat label="Payment / collection" value={fmtShortDate(c.paid_date)} />}
          {c.original_price != null && <Stat label="Original fees" value={fmtValue(c.original_price, c.currency)} />}
          {c.discount_given != null && <Stat label="Discount given" value={fmtValue(c.discount_given, c.currency)} />}
        </div>
      )}
    </div>
  );
}

function HistoryTable({ cycles }: { cycles: Cycle[] }) {
  return (
    <div className="mt-6">
      <h3 className="m-0 mb-3 text-[15px] font-extrabold tracking-tight">Plans history</h3>
      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sh1">
        <div className="overflow-x-auto sc">
          <table className="w-full border-collapse text-[13px]" style={{ minWidth: 800 }}>
            <thead>
              <tr>
                {['Plan', 'Amount', 'Length', 'Start', 'Expiry', 'Type', 'Active'].map((h) => (
                  <th key={h} className="px-3.5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-text-3 border-b border-border bg-surface-2 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => {
                const isActive = c.status === 'active';
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-3.5 py-3 font-bold">{c.plan_tier || '—'}</td>
                    <td className="px-3.5 py-3 font-bold tnum">{fmtValue(c.value, c.currency)}</td>
                    <td className="px-3.5 py-3 text-text-2 font-semibold">{monthsBetween(c.started_at, c.ends_at)}</td>
                    <td className="px-3.5 py-3 text-text-2 tnum">{fmtShortDate(c.started_at)}</td>
                    <td className="px-3.5 py-3 text-text-2 tnum">{fmtShortDate(c.ends_at)}</td>
                    <td className="px-3.5 py-3">{typeChip(c.status)}</td>
                    <td className="px-3.5 py-3"><Chip variant={isActive ? 'ok' : 'neutral'}>{isActive ? 'Active' : 'Expired'}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- shared bits ---------- */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-text-3 mb-1.5">{label}</div>
      <div className="tnum text-[16px] font-extrabold tracking-tight text-text">{value}</div>
    </div>
  );
}
type ChipVariant = 'lime' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
function Chip({ children, variant }: { children: React.ReactNode; variant: ChipVariant }) {
  const map: Record<ChipVariant, string> = {
    lime: 'bg-accent text-cg-900 border-accent-strong',
    neutral: 'bg-surface-2 text-text-2 border-border',
    ok: 'bg-ok-bg text-ok border-ok/30',
    warn: 'bg-warn-bg text-warn border-warn/30',
    bad: 'bg-bad-bg text-bad border-bad/30',
    info: 'bg-info-bg text-info border-info/30',
  };
  return <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-bold border', map[variant])}>{children}</span>;
}
function invoiceChip(status: string | null) {
  if (['renewed', 'collected', 'paid'].includes(status || '')) return <Chip variant="info">Collected</Chip>;
  if (status === 'active') return <Chip variant="warn">Pending</Chip>;
  if (status === 'churned') return <Chip variant="bad">Churned</Chip>;
  if (status === 'overdue') return <Chip variant="bad">Overdue</Chip>;
  return <Chip variant="neutral">{status || '—'}</Chip>;
}
function typeChip(status: string | null) {
  const paid = ['renewed', 'collected', 'paid', 'active'].includes(status || '');
  if (paid) return <Chip variant="info">Paid</Chip>;
  if (status === 'churned') return <Chip variant="neutral">Churned</Chip>;
  if (status === 'overdue') return <Chip variant="warn">Overdue</Chip>;
  return <Chip variant="warn">Free</Chip>;
}
function fmtShortDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
function fmtValue(v: number | null, ccy: string | null) {
  return v ? `${ccy || 'EGP'} ${Number(v).toLocaleString('en-US')}` : '—';
}
function monthsBetween(a: string | null, b: string | null) {
  if (!a || !b) return '—';
  const da = new Date(a), db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return '—';
  return `${Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24 * 30.44))} months`;
}
function termLabel(m: string) {
  if (m === '—') return '—';
  const n = parseInt(m, 10);
  if (n >= 11 && n <= 13) return 'Annual';
  if (n >= 5 && n <= 7) return 'Semi-annual';
  if (n >= 2 && n <= 4) return 'Quarterly';
  if (n >= 22 && n <= 26) return '2 Years';
  return m;
}

function EmptyCard({ icon, title, hint, actionLabel, onAction, children }: { icon?: React.ReactNode; title?: string; hint?: string; actionLabel?: string; onAction?: () => void; children?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl px-8 py-14 shadow-sh1 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border inline-grid place-items-center text-text-3 mb-3.5">{icon}</div>
      )}
      {title && <div className="text-[16px] font-extrabold tracking-tight mb-1.5">{title}</div>}
      {hint && <div className="text-[13px] text-text-3 font-medium max-w-md mx-auto mb-4">{hint}</div>}
      {actionLabel && (
        <button onClick={onAction} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 text-[13px] font-bold border border-accent-strong hover:bg-accent-strong">
          {actionLabel}
        </button>
      )}
      {children}
    </div>
  );
}
