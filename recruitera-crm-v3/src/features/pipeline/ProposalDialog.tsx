import { useEffect, useState } from 'react';
import { FileText, Check, X } from 'lucide-react';
import type { Deal } from '@/hooks/useDeals';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type Props = { deal: Deal; onClose: () => void; onDone?: () => void };

/**
 * Moving a deal to PROPOSAL is the moment the deal value becomes real.
 * This dialog captures ACV + expected close so the number shows on the
 * card and the company profile. Both fields required (per product rule:
 * a real proposal has both).
 */
export function ProposalDialog({ deal, onClose, onDone }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>(String(deal.amount ?? ''));
  const [close, setClose] = useState<string>(deal.expected_close_date ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const currency = deal.currency || 'EGP';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr('Deal value must be greater than 0'); return; }
    if (!close) { setErr('Expected close date is required'); return; }
    try {
      setSaving(true);
      const { error } = await supabase.from('deals').update({
        stage: 'proposal',
        amount: n,
        currency,
        expected_close_date: close,
        last_activity_at: new Date().toISOString(),
      }).eq('id', deal.id);
      if (error) throw error;
      toast.success('Deal moved to Proposal');
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setSaving(false);
    }
  }

  const name = deal.company?.name || deal.title || 'Untitled deal';

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-3 px-5 py-4 bg-gradient-to-r from-warn-bg via-warn-bg/50 to-surface border-b border-border relative">
          <div className="w-11 h-11 rounded-xl bg-warn text-white grid place-items-center flex-shrink-0 shadow-sh2">
            <FileText size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-warn">Move to PROPOSAL</div>
            <div className="text-[18px] font-black tracking-tight text-text mt-0.5 truncate">{name}</div>
            <div className="text-[11.5px] text-text-2 mt-0.5">
              Enter the deal value and expected close date.
            </div>
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-md text-text-3 hover:bg-surface-2" aria-label="Close">
            <X size={15} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Deal value ({currency}) <span className="text-bad">*</span></span>
            <div className="mt-1.5 flex items-stretch border-2 border-border-2 rounded-lg overflow-hidden focus-within:border-warn bg-surface">
              <span className="px-3 flex items-center bg-surface-2 border-r-2 border-border-2 text-[12px] font-black text-text-2">
                {currency}
              </span>
              <input
                autoFocus
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 px-3 py-2.5 bg-transparent text-[18px] font-black text-text outline-none tnum"
                placeholder="0"
                min={0}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Expected close date <span className="text-bad">*</span></span>
            <input
              type="date"
              value={close}
              onChange={(e) => setClose(e.target.value)}
              className="mt-1.5 w-full h-10 px-3 border-2 border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-warn"
            />
          </label>

          {err && (
            <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-warn text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
          >
            <Check size={13} strokeWidth={3} /> {saving ? 'Moving…' : 'Move to Proposal'}
          </button>
        </footer>
      </div>
    </div>
  );
}
