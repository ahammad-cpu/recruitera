import { useMemo, useState, useEffect } from 'react';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import type { Contact } from '@/hooks/useAccountDetail';
import { useMergeAccounts } from '@/hooks/useMergeAccounts';
import { StagePill } from '@/components/shared/StagePill';
import { fmtInt, fmtDate, initials } from '@/lib/format';
import { cn } from '@/lib/cn';

type Props = {
  accountA: Account;
  accountB: Account;
  contactsByAcct: Map<string, Contact[]>;
  reasons: Set<'name' | 'domain' | 'phone' | 'email'>;
  onClose: () => void;
  onDone?: (winnerId: string) => void;
};

export function MergeConfirmation({ accountA, accountB, contactsByAcct, reasons, onClose, onDone }: Props) {
  const merge = useMergeAccounts();
  // Recommended = higher funnel_score. User can override.
  const scoreA = accountA.funnel_score ?? 0;
  const scoreB = accountB.funnel_score ?? 0;
  const recommended = useMemo(() => (scoreA >= scoreB ? accountA.id : accountB.id), [scoreA, scoreB, accountA.id, accountB.id]);
  const [keeper, setKeeper] = useState<string>(recommended);

  useEffect(() => setKeeper(recommended), [recommended]);

  async function confirm() {
    const res = await merge.mutateAsync({ a: accountA.id, b: accountB.id, userPref: keeper });
    onDone?.(res.winner.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <Sparkles size={16} className="text-accent-ink" />
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">Merge duplicates</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">
              Sharing {Array.from(reasons).join(' · ')}. Winner keeps every contact + activity from the loser row.
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <SideCard
            account={accountA}
            score={scoreA}
            contacts={(contactsByAcct.get(accountA.id) ?? []).length}
            selected={keeper === accountA.id}
            recommended={recommended === accountA.id}
            onSelect={() => setKeeper(accountA.id)}
          />
          <SideCard
            account={accountB}
            score={scoreB}
            contacts={(contactsByAcct.get(accountB.id) ?? []).length}
            selected={keeper === accountB.id}
            recommended={recommended === accountB.id}
            onSelect={() => setKeeper(accountB.id)}
          />
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center gap-3">
          <div className="text-[12px] text-text-2">
            {keeper === recommended
              ? <>Using recommended winner (higher funnel score).</>
              : <>Overriding recommended winner.</>}
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-semibold text-text-2 hover:bg-surface">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={merge.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-bold hover:bg-cg-800 disabled:opacity-60"
          >
            {merge.isPending ? 'Merging…' : <>Merge → keeper <ArrowRight size={12} /></>}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SideCard({
  account, score, contacts, selected, recommended, onSelect,
}: {
  account: Account;
  score: number;
  contacts: number;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const name = account.name || account.domain || '—';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'text-left rounded-2xl border-2 p-4 transition-colors',
        selected ? 'border-accent bg-accent-soft/40' : 'border-border hover:border-border-2 bg-surface',
      )}
    >
      {recommended && (
        <div className="inline-flex items-center gap-1 h-[18px] px-2 rounded-full bg-accent text-cg-900 text-[10px] font-bold uppercase tracking-widest mb-2">
          <Sparkles size={10} />
          Recommended — higher win probability
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-cg-800 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-text truncate">{name}</div>
          <div className="text-[11px] text-text-3 truncate">{account.domain || '—'}</div>
        </div>
        <StagePill stage={account.stage} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat k="Funnel score" v={fmtInt(score)} highlight={recommended} />
        <Stat k="Contacts" v={fmtInt(contacts)} />
        <Stat k="Created" v={fmtDate(account.created_at)} />
      </dl>
      {account.am_mail && (
        <div className="mt-3 text-[11.5px] text-text-3 truncate">Owner: <b className="text-text-2">{account.am_mail}</b></div>
      )}
    </button>
  );
}

function Stat({ k, v, highlight }: { k: string; v: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2">
      <dt className="text-[9.5px] font-bold uppercase tracking-widest text-text-3">{k}</dt>
      <dd className={cn('tnum text-[14px] font-extrabold mt-0.5', highlight ? 'text-accent-ink' : 'text-text')}>{v}</dd>
    </div>
  );
}
