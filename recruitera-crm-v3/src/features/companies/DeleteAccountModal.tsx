import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Trash2 } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import { useDeleteAccount } from '@/hooks/useAccountMutations';

type Props = { account: Account; onClose: () => void };

export function DeleteAccountModal({ account, onClose }: Props) {
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const expected = account.name || account.domain || '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    try {
      await del.mutateAsync(account.id);
      navigate('/companies');
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const matches = confirmText.trim() === expected.trim() && expected.length > 0;

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-bad-bg text-bad grid place-items-center">
            <Trash2 size={16} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">Delete {expected || 'account'}</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Permanent — removes the company and all its activity, contacts, deals, and notes</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-4">
          <div className="text-[12.5px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2.5">
            This cannot be undone. All logged calls, emails, notes, tasks, deals, contract cycles, and notifications for this company will be permanently deleted.
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">
              Type <b className="text-text">{expected}</b> to confirm
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expected}
              className="mt-1 w-full h-9 px-2.5 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              autoFocus
            />
          </label>

          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={del.isPending || !matches}
            className="h-9 px-4 rounded-lg bg-bad text-white text-[12.5px] font-black hover:opacity-90 disabled:opacity-60"
          >
            {del.isPending ? 'Deleting…' : 'Delete permanently'}
          </button>
        </footer>
      </div>
    </div>
  );
}
