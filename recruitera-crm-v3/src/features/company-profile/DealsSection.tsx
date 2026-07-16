import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, TrendingUp, RotateCcw, AlertTriangle } from 'lucide-react';
import { useDealsForCompany, isOpen, isOverdue, isStale, type Deal, type DealStage } from '@/hooks/useDeals';
import { useReopenDeal } from '@/hooks/useDealMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { useAccounts } from '@/hooks/useAccounts';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { NewDealModal } from './NewDealModal';

const STAGE_COLORS: Record<DealStage, string> = {
  mql:         'bg-accent-soft text-accent-ink',
  sql:         'bg-info-bg text-info',
  demo:        'bg-info-bg text-info',
  proposal:    'bg-warn-bg text-warn',
  negotiation: 'bg-warn-bg text-warn',
  won:         'bg-ok-bg text-ok',
  collected:   'bg-ok-bg text-ok',
  lost:        'bg-bad-bg text-bad',
};

export function DealsSection({ accountId }: { accountId: string }) {
  const { data: deals, isLoading } = useDealsForCompany(accountId);
  const profilesQ = useProfiles();
  const accountsQ = useAccounts();
  const reopen = useReopenDeal();
  const [warnDup, setWarnDup] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const list = deals ?? [];
  const openDeals   = list.filter(isOpen);
  const wonDeals    = list.filter((d) => d.stage === 'won' || d.stage === 'collected');
  const lifetimeRev = wonDeals.reduce((s, d) => s + (d.amount || 0), 0);
  const companyName = accountsQ.data?.find((a) => a.id === accountId)?.name || 'this company';

  function requestNew() {
    if (openDeals.length > 0) { setWarnDup(true); return; }
    openModal();
  }
  function openModal() {
    setWarnDup(false);
    setModalOpen(true);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-[10px] font-black tracking-[0.14em] uppercase text-accent-ink">Deals</div>
        <div className="text-[22px] font-black tracking-tight text-text">
          {isLoading ? '…' : list.length}
        </div>
        <button
          onClick={requestNew}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-accent text-cg-900 text-[12px] font-black border border-accent-strong hover:bg-accent-strong"
        >
          <Plus size={12} /> New deal
        </button>
      </div>

      {/* Duplicate-open-deal warning */}
      {warnDup && (
        <div className="mb-3 border-2 border-warn/40 bg-warn-bg/40 rounded-xl p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-warn flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-black text-text">
                This company already has {openDeals.length} open deal{openDeals.length === 1 ? '' : 's'}.
              </div>
              <div className="text-[11.5px] text-text-2 mt-0.5">
                Existing:{' '}
                {openDeals.slice(0, 2).map((d, i) => {
                  const own = d.owner_id ? profilesQ.data?.find((p) => p.id === d.owner_id) : null;
                  return (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <span className="font-bold">{d.stage.toUpperCase()}</span> — {own?.full_name || own?.email || 'unassigned'}
                    </span>
                  );
                })}
                {openDeals.length > 2 && ` · +${openDeals.length - 2} more`}. Create another anyway?
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setWarnDup(false)}
                  className="h-8 px-3 rounded-md border border-border bg-surface text-text-2 text-[12px] font-bold"
                >Cancel</button>
                <button
                  onClick={openModal}
                  className="h-8 px-3 rounded-md bg-accent text-cg-900 text-[12px] font-black border border-accent-strong"
                >Create anyway</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lifetime revenue stat */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Open" value={String(openDeals.length)} />
        <Stat label="Won" value={String(wonDeals.length)} />
        <Stat label="Lifetime rev." value={lifetimeRev > 0 ? `${lifetimeRev.toLocaleString('en-US')} EGP` : '—'} accent={lifetimeRev > 0} />
      </div>

      {isLoading && <div className="text-[12.5px] text-text-3 py-6 text-center">Loading deals…</div>}
      {!isLoading && list.length === 0 && (
        <div className="text-[12.5px] text-text-3 py-8 text-center border border-dashed border-border rounded-xl">
          No deals yet. Click <span className="font-bold">New deal</span> to start tracking one.
        </div>
      )}
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((d) => (
            <DealRow
              key={d.id}
              deal={d}
              owner={d.owner_id ? profilesQ.data?.find((p) => p.id === d.owner_id) ?? undefined : undefined}
              onReopen={() => reopen.mutate({ id: d.id })}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewDealModal
          accountId={accountId}
          companyName={companyName}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-surface-2/60 border border-border rounded-lg p-2.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</div>
      <div className={cn('mt-0.5 text-[15px] font-black tnum', accent ? 'text-accent-ink' : 'text-text')}>{value}</div>
    </div>
  );
}

function DealRow({
  deal, owner, onReopen,
}: {
  deal: Deal;
  owner: import('@/hooks/useUsersData').Profile | undefined;
  onReopen: () => void;
}) {
  const stageCls = STAGE_COLORS[deal.stage];
  const stale = isStale(deal);
  const overdue = isOverdue(deal);
  return (
    <div className="border border-border rounded-xl p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-cg-900 text-white grid place-items-center flex-shrink-0">
        <TrendingUp size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex items-center h-[20px] px-2 rounded-full text-[10.5px] font-black uppercase tracking-wider', stageCls)}>
            {deal.stage}
          </span>
          <span className="tnum text-[13px] font-black text-text">
            {(deal.amount || 0) > 0 ? `${(deal.amount || 0).toLocaleString('en-US')} ${deal.currency || 'EGP'}` : <span className="text-text-4">0 EGP</span>}
          </span>
          {overdue && <span className="inline-flex items-center gap-1 text-[10.5px] font-black text-bad"><AlertTriangle size={10} /> overdue</span>}
          {stale && <span className="text-[10.5px] font-black text-warn">stale</span>}
        </div>
        <div className="text-[11px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
          <span>Created {fmtDate(deal.created_at)}</span>
          {deal.closed_at && <><span className="text-text-4">·</span><span>Closed {fmtDate(deal.closed_at)}</span></>}
          {deal.reopened_at && <><span className="text-text-4">·</span><span>Reopened {fmtDate(deal.reopened_at)}</span></>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <OwnerAvatar profile={owner} size={22} />
        {deal.stage === 'lost' && (
          <button
            onClick={onReopen}
            title="Reopen this deal (sends it back to MQL)"
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-text-3 hover:text-accent-ink hover:border-accent-strong text-[11px] font-black"
          >
            <RotateCcw size={11} /> Reopen
          </button>
        )}
      </div>
    </div>
  );
}
