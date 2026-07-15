import { useEffect, useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import { DISQ_REASONS, useDisqualifyAccount, type DisqReason } from '@/hooks/useDisqualify';
import { cn } from '@/lib/cn';

type Props = { account: Account; onClose: () => void };

export function DisqualifyModal({ account, onClose }: Props) {
  const disq = useDisqualifyAccount();
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
      await disq.mutateAsync({ id: account.id, reason, notes });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const notesRequired = reason === 'other';

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-bad-bg text-bad grid place-items-center">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">Disqualify {account.name || account.domain || 'account'}</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Sets stage → lost and stamps who / why / when</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Reason</div>
            <div className="grid grid-cols-2 gap-2">
              {DISQ_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setReason(r.key)}
                  className={cn(
                    'text-left rounded-xl p-3 border transition-colors',
                    reason === r.key
                      ? 'border-bad bg-bad-bg/40'
                      : 'border-border bg-surface hover:bg-surface-2',
                  )}
                >
                  <div className="text-[13px] font-bold text-text">{r.label}</div>
                  <div className="text-[11px] text-text-3 mt-0.5 leading-snug">{r.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">
              Notes {notesRequired && <span className="text-bad">*</span>}
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={notesRequired ? 'Required — explain what "other" means here…' : 'Optional context, quote, next-step reminder…'}
              className="mt-1 w-full p-2.5 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong resize-vertical"
            />
          </label>

          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={disq.isPending || !reason}
            className="h-9 px-4 rounded-lg bg-bad text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
          >
            {disq.isPending ? 'Disqualifying…' : 'Disqualify'}
          </button>
        </footer>
      </div>
    </div>
  );
}
