import { useEffect, useState } from 'react';
import { XCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CHURN_REASONS, useMarkChurned, type ChurnReason } from '@/hooks/useCycleMutations';

/**
 * Opens when a renewal card is dropped on the Churned column. We refuse to
 * churn without a reason so the Reports > Churn breakdown can actually
 * differentiate a competitive loss from a budget cut. Free-text notes
 * always allowed; when reason='other', notes become mandatory (5+ chars).
 */
export function ChurnReasonModal({
  cycleId, accountName, onClose,
}: {
  cycleId: string;
  accountName: string;
  onClose: () => void;
}) {
  const mut = useMarkChurned();
  const [reason, setReason] = useState<ChurnReason | ''>('');
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
    if (reason === 'other' && notes.trim().length < 5) {
      setErr('When picking "Other", add a note of at least 5 characters.');
      return;
    }
    try {
      await mut.mutateAsync({ id: cycleId, reason: reason as ChurnReason, notes: notes.trim() || null });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="churn-title"
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-4 px-6 py-5 bg-gradient-to-r from-bad-bg via-bad-bg/60 to-surface border-b border-border relative">
          <div className="w-14 h-14 rounded-2xl bg-bad text-white grid place-items-center flex-shrink-0 shadow-sh2">
            <XCircle size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-bad">Mark as churned</div>
            <div id="churn-title" className="text-[22px] font-black tracking-tight text-text mt-0.5 truncate">{accountName}</div>
            <div className="text-[12.5px] text-text-2 mt-1">
              Why did this customer churn? The reason feeds the Reports &gt; Churn breakdown.
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
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">
              Reason <span className="text-bad">*</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {CHURN_REASONS.map((r) => {
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
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', active ? 'bg-bad' : 'bg-text-4')} />
                    <span className="truncate">{r.label}</span>
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
              placeholder="Any context worth keeping. What did they say?"
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
            className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface-2"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={mut.isPending || !reason}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-bad text-white text-[13px] font-black hover:opacity-90 disabled:opacity-50"
          >
            <X size={14} strokeWidth={3} /> {mut.isPending ? 'Churning…' : 'Mark churned'}
          </button>
        </footer>
      </div>
    </div>
  );
}
