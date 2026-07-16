import { useEffect, useState } from 'react';
import { Check, Trophy, FileText, CheckSquare } from 'lucide-react';
import type { Deal } from '@/hooks/useDeals';
import { useMarkDealWon } from '@/hooks/useDealMutations';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';

type Props = { deal: Deal; onClose: () => void; onDone?: () => void };

export function WonDialog({ deal, onClose, onDone }: Props) {
  const mark = useMarkDealWon();
  const [amount, setAmount] = useState<string>(String(deal.amount ?? ''));
  const currency = deal.currency || 'EGP';
  const [requestInvoice, setRequestInvoice] = useState(true);
  const [createCollectionTask, setCreateCollectionTask] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr('Deal value must be greater than 0'); return; }
    try {
      await mark.mutateAsync({ id: deal.id, amount: n, currency });
      // Fire follow-up tasks best-effort so a failure doesn't block the win.
      const tasks: Array<Record<string, unknown>> = [];
      if (requestInvoice && deal.account_id) {
        tasks.push({
          account_id: deal.account_id, type: 'task',
          title: 'Request invoice from finance',
          text: 'Auto-created on WON — routes to finance for issuance.',
        });
      }
      if (createCollectionTask && deal.account_id) {
        const due = new Date(); due.setDate(due.getDate() + 14);
        tasks.push({
          account_id: deal.account_id, type: 'task',
          title: 'Track payment (14-day window)',
          text: 'Auto-created on WON — collection team follow-up; flag overdue after 14 days.',
          task_due_date: due.toISOString().slice(0, 10),
        });
      }
      if (tasks.length) {
        const { error } = await supabase.from('activities').insert(tasks);
        if (error) console.warn('[WonDialog] follow-up tasks failed', error);
      }
      onDone?.();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const wonOn = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const name = deal.company?.name || deal.title || 'Untitled deal';

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-4 px-6 py-5 bg-gradient-to-r from-ok-bg via-ok-bg/60 to-surface border-b border-border">
          <div className="w-14 h-14 rounded-2xl bg-ok text-white grid place-items-center flex-shrink-0 shadow-sh2">
            <Trophy size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-ok">Mark deal as WON</div>
            <div className="text-[22px] font-black tracking-tight text-text mt-0.5 truncate">{name}</div>
            <div className="text-[12.5px] text-text-2 mt-1">
              Confirm the deal value and select follow-ups for finance &amp; collections.
            </div>
          </div>
        </header>

        <div className="p-6 space-y-5">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Deal value ({currency})</span>
            <div className="mt-1.5 flex items-stretch border-2 border-border-2 rounded-xl overflow-hidden focus-within:border-ok bg-surface-2/50">
              <span className="px-4 flex items-center bg-surface-2 border-r-2 border-border-2 text-[13px] font-black text-text-2">
                {currency}
              </span>
              <input
                autoFocus
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-4 py-3 bg-transparent text-[22px] font-black text-text outline-none"
                placeholder="0"
                min={0}
              />
            </div>
            <div className="text-[12px] text-text-3 mt-2">Won on {wonOn}</div>
          </label>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Follow-up actions</div>
            <div className="space-y-2.5">
              <FollowupRow
                checked={requestInvoice}
                onChange={setRequestInvoice}
                icon={<FileText size={16} />}
                title="Request invoice from finance"
                sub="Auto-creates a draft invoice and routes to finance for issuance."
              />
              <FollowupRow
                checked={createCollectionTask}
                onChange={setCreateCollectionTask}
                icon={<CheckSquare size={16} />}
                title="Create task for collection team"
                sub="Assigns @collections to track payment within 14 days &amp; flag overdue."
              />
            </div>
          </div>

          {err && (
            <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={mark.isPending}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-ok text-white text-[13px] font-black hover:opacity-90 disabled:opacity-60"
          >
            <Check size={14} strokeWidth={3} /> {mark.isPending ? 'Confirming…' : 'Confirm win'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FollowupRow({
  checked, onChange, icon, title, sub,
}: {
  checked: boolean; onChange: (v: boolean) => void;
  icon: React.ReactNode; title: string; sub: string;
}) {
  return (
    <label className={cn(
      'flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer transition-colors',
      checked ? 'border-ok bg-ok-bg/50' : 'border-border bg-surface hover:border-border-2',
    )}>
      <span className={cn(
        'w-5 h-5 rounded-md border-2 grid place-items-center flex-shrink-0 mt-0.5',
        checked ? 'bg-ok border-ok text-white' : 'border-border-2 bg-surface',
      )}>
        {checked && <Check size={13} strokeWidth={3.5} />}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-black text-text">{title}</div>
        <div className="text-[12px] text-text-2 mt-0.5 leading-snug">{sub}</div>
      </div>
      <span className="text-text-3 mt-0.5">{icon}</span>
    </label>
  );
}
