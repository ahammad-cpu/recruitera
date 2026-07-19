import { useEffect, useState } from 'react';
import { XCircle, X } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import { useLoseAccount } from '@/hooks/useLoseAccount';
import { cn } from '@/lib/cn';

/**
 * Disqualify a lead. Only offered at Lead / MQL — the account was never a
 * real sales opportunity. Broader reason list than the Loss modal (Loss is
 * for real sales attempts that failed at SQL+). Both write to stage='lost'
 * via the same `lose_account` RPC; reports differentiate by reason_code.
 */
const DISQ_REASONS = [
  { key: 'fake_lead',   label: 'Fake lead',    hint: 'Fake name / email / phone or bot submission', dot: 'bg-bad'     },
  { key: 'not_icp',     label: 'Not ICP',      hint: 'Does not fit size, industry, or region',       dot: 'bg-info'    },
  { key: 'duplicate',   label: 'Duplicate',    hint: 'Already exists in CRM',                        dot: 'bg-text-3'  },
  { key: 'spam',        label: 'Spam / junk',  hint: 'Junk submission',                              dot: 'bg-text-4'  },
  { key: 'competitor',  label: 'Competitor',   hint: 'Works for a competitor',                       dot: 'bg-bad'     },
  { key: 'no_response', label: 'No response',  hint: 'Never replied to outreach',                    dot: 'bg-text-3'  },
  { key: 'other',       label: 'Other',        hint: 'Requires a note',                              dot: 'bg-text-4'  },
] as const;

type DisqKey = typeof DISQ_REASONS[number]['key'];

export function DisqualifyModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const lose = useLoseAccount();
  const [reason, setReason] = useState<DisqKey | ''>('');
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
    if (reason === 'other' && !notes.trim()) { setErr('Add a note when picking "Other"'); return; }
    try {
      await lose.mutateAsync({ accountId: account.id, reason: reason as any, notes: notes.trim() || null });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const name = account.name || account.domain || 'Untitled account';

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-4 px-6 py-5 bg-gradient-to-r from-warn-bg via-warn-bg/60 to-surface border-b border-border relative">
          <div className="w-14 h-14 rounded-2xl bg-warn text-white grid place-items-center flex-shrink-0 shadow-sh2">
            <XCircle size={22} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-warn">Disqualify lead</div>
            <div className="text-[22px] font-black tracking-tight text-text mt-0.5 truncate">{name}</div>
            <div className="text-[12.5px] text-text-2 mt-1">
              Use this when the lead was never a real prospect. For accounts that reached SQL and didn't
              close, use <span className="font-bold text-text">Lose</span> instead.
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
                        ? 'border-warn bg-warn-bg/40 text-text'
                        : 'border-border bg-surface text-text-2 hover:border-border-2',
                    )}
                    title={r.hint}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', r.dot)} />
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
              placeholder="Any context worth keeping. What tipped you off?"
              className="mt-1.5 w-full p-3.5 border-2 border-border-2 rounded-xl bg-surface text-[13px] outline-none focus:border-warn resize-vertical"
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
            disabled={lose.isPending || !reason}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-warn text-white text-[13px] font-black hover:opacity-90 disabled:opacity-50"
          >
            <X size={14} strokeWidth={3} /> {lose.isPending ? 'Disqualifying…' : 'Disqualify'}
          </button>
        </footer>
      </div>
    </div>
  );
}
