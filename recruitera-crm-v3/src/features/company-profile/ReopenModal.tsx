import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  REOPEN_REASONS,
  REOPEN_TARGET_STAGES,
  useReopenAccount,
  type ReopenReason,
  type ReopenTargetStage,
} from '@/hooks/useReopenAccount';
import { cn } from '@/lib/cn';

type Props = {
  accountId: string;
  companyName: string;
  lostFromStage: string | null;
  lossReason: string | null;
  onClose: () => void;
};

const REASON_LABELS: Record<ReopenReason, string> = {
  customer_returned: 'Customer returned',
  budget_approved: 'Budget approved',
  timing_changed: 'Timing changed',
  wrong_call: "Wrong call — shouldn't have been lost",
  other: 'Other',
};

const REASON_HINTS: Record<ReopenReason, string> = {
  customer_returned: 'They reached back out',
  budget_approved: 'Budget is now available',
  timing_changed: 'Timing objection is resolved',
  wrong_call: 'This should not have been marked lost',
  other: 'Requires free-text explanation below',
};

const STAGE_LABELS: Record<ReopenTargetStage, string> = {
  lead: 'Lead', mql: 'MQL', sql: 'SQL', demo: 'Demo', proposal: 'Proposal',
};

export function ReopenModal({ accountId, companyName, lostFromStage, lossReason, onClose }: Props) {
  const [target, setTarget] = useState<ReopenTargetStage>('lead');
  const [reason, setReason] = useState<ReopenReason | ''>('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const reopen = useReopenAccount();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const notesRequired = reason === 'other';
  const canSubmit = !!reason && (!notesRequired || notes.trim().length > 0);

  async function submit() {
    setErr(null);
    if (!reason) { setErr('Pick a reason'); return; }
    if (notesRequired && !notes.trim()) { setErr('Notes required when reason is "other"'); return; }
    try {
      await reopen.mutateAsync({ accountId, targetStage: target, reasonCode: reason, notes: notes.trim() || null });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-ok/10 text-ok grid place-items-center font-black text-[15px]">↺</div>
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">Reopen "{companyName}"</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Moves the account back into the pipeline and clears the loss record</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Move back to stage</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as ReopenTargetStage)}
              className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            >
              {REOPEN_TARGET_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            </select>
          </label>

          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Why is this back?</div>
            <div className="grid grid-cols-2 gap-2">
              {REOPEN_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    'text-left rounded-xl p-3 border transition-colors',
                    reason === r
                      ? 'border-ok bg-ok/10'
                      : 'border-border bg-surface hover:bg-surface-2',
                  )}
                >
                  <div className="text-[13px] font-bold text-text">{REASON_LABELS[r]}</div>
                  <div className="text-[11px] text-text-3 mt-0.5 leading-snug">{REASON_HINTS[r]}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">
              Note {notesRequired && <span className="text-bad">*</span>}
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={notesRequired ? 'Required — explain what "other" means here…' : 'Optional context, quote, next-step reminder…'}
              className="mt-1 w-full p-2.5 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong resize-vertical"
            />
          </label>

          {(lostFromStage || lossReason) && (
            <div className="text-[11px] text-text-3 p-2 rounded bg-surface-2">
              Was lost from <span className="font-bold text-text-2">{lostFromStage ?? '—'}</span>
              {' '}· reason <span className="font-bold text-text-2">{lossReason ?? '—'}</span>
            </div>
          )}

          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={!canSubmit || reopen.isPending}
            className="h-9 px-4 rounded-lg bg-ok text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
          >
            {reopen.isPending ? 'Reopening…' : 'Reopen'}
          </button>
        </footer>
      </div>
    </div>
  );
}
