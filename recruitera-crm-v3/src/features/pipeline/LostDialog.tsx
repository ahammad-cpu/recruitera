import { useEffect, useState } from 'react';
import { XCircle, X } from 'lucide-react';
import type { Deal } from '@/hooks/useDeals';
import { useMarkDealLost } from '@/hooks/useDealMutations';
import { DISQ_REASONS, type DisqReason } from '@/hooks/useLoseAccount';
import { cn } from '@/lib/cn';

type Props = { deal: Deal; onClose: () => void; onDone?: () => void };

const REASON_DOT: Record<DisqReason, string> = {
  not_icp:      'bg-info',
  fake_lead:    'bg-bad',
  duplicate:    'bg-text-3',
  no_response:  'bg-text-3',
  wrong_timing: 'bg-info',
  competitor:   'bg-bad',
  no_budget:    'bg-warn',
  other:        'bg-text-4',
};

const REASON_LABEL_OVERRIDE: Partial<Record<DisqReason, string>> = {
  not_icp:      'No need',
  fake_lead:    'Wrong contact',
  duplicate:    'Duplicate',
  no_response:  'Unresponsive',
  wrong_timing: 'Timing',
  competitor:   'Competitor',
  no_budget:    'Price',
  other:        'No decision',
};

export function LostDialog({ deal, onClose, onDone }: Props) {
  const mark = useMarkDealLost();
  const [reason, setReason] = useState<DisqReason | ''>('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    if (!reason) { setErr('Pick a reason'); return; }
    try {
      await mark.mutateAsync({ id: deal.id, reason, notes });
      onDone?.();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const name = deal.company?.name || deal.title || 'Untitled deal';

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-4 px-6 py-5 bg-gradient-to-r from-bad-bg via-bad-bg/60 to-surface border-b border-border relative">
          <div className="w-14 h-14 rounded-2xl bg-bad text-white grid place-items-center flex-shrink-0 shadow-sh2">
            <XCircle size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-bad">Mark deal as LOST</div>
            <div className="text-[22px] font-black tracking-tight text-text mt-0.5 truncate">{name}</div>
            <div className="text-[12.5px] text-text-2 mt-1">
              Capture why this deal didn&apos;t close — feeds the lost-reason report.
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-md text-text-3 hover:bg-surface-2"
            aria-label="Close"
          ><X size={16} /></button>
        </header>

        <div className="p-6 space-y-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Reason <span className="text-bad">*</span></div>
            <div className="grid grid-cols-2 gap-2.5">
              {DISQ_REASONS.map((r) => {
                const active = reason === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setReason(r.key)}
                    className={cn(
                      'flex items-center gap-2 h-11 px-3.5 rounded-xl border-2 text-left text-[13px] font-bold transition-colors',
                      active
                        ? 'border-bad bg-bad-bg/40 text-text'
                        : 'border-border bg-surface text-text-2 hover:border-border-2',
                    )}
                    title={r.hint}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', REASON_DOT[r.key])} />
                    <span className="truncate">{REASON_LABEL_OVERRIDE[r.key] ?? r.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">
              Notes {reason === 'other' && <span className="text-bad">*</span>}
            </span>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Who did we lose to? Anything to learn."
              className="mt-1.5 w-full p-3.5 border-2 border-border-2 rounded-xl bg-surface text-[13px] outline-none focus:border-bad resize-vertical"
            />
          </label>

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
            disabled={mark.isPending || !reason}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-bad text-white text-[13px] font-black hover:opacity-90 disabled:opacity-50"
          >
            <X size={14} strokeWidth={3} /> {mark.isPending ? 'Marking…' : 'Mark as lost'}
          </button>
        </footer>
      </div>
    </div>
  );
}
