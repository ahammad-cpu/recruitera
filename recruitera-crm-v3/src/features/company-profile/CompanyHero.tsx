import { useState } from 'react';
import { Globe, Pencil, Check, X } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import { isPaid } from '@/hooks/useAccounts';
import { useRenameAccount, useChangeStage } from '@/hooks/useAccountMutations';
import { StagePill } from '@/components/shared/StagePill';
import { fmtDate, initials } from '@/lib/format';

const STAGES = ['lead', 'mql', 'sql', 'demo', 'proposal', 'won', 'paid', 'lost'];

export function CompanyHero({ lead }: { lead: Account }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(lead.name || '');
  const rename = useRenameAccount();
  const changeStage = useChangeStage();
  const paid = isPaid(lead);
  const name = lead.name || lead.domain || '—';

  function saveName() {
    const next = draft.trim();
    if (!next || next === lead.name) { setEditing(false); return; }
    rename.mutate({ id: lead.id, name: next }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-cg-900 text-white text-lg font-bold flex items-center justify-center flex-shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {editing ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false); }}
                  className="text-xl font-bold bg-surface-2 border border-border-2 rounded-lg px-2 py-1 text-text outline-none"
                />
                <button onClick={saveName} className="p-1.5 rounded-md bg-ok text-white" title="Save">
                  <Check size={14} />
                </button>
                <button onClick={() => { setEditing(false); setDraft(lead.name || ''); }} className="p-1.5 rounded-md bg-surface-2 text-text-3" title="Cancel">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-text truncate">{name}</h1>
                <button
                  onClick={() => { setDraft(lead.name || ''); setEditing(true); }}
                  className="p-1 rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
                  title="Rename company"
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
            <StagePill stage={lead.stage} />
            <select
              value={(lead.stage || 'lead').toLowerCase()}
              onChange={(e) => changeStage.mutate({ id: lead.id, stage: e.target.value })}
              disabled={changeStage.isPending}
              className="h-6 pl-2 pr-6 rounded-full text-[11px] font-bold border border-border bg-surface text-text-2 outline-none focus:border-accent-strong"
              title="Change stage"
            >
              {STAGES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
            {paid && (
              <span className="inline-flex h-5 items-center px-2 rounded-full bg-ok-bg text-ok text-[10.5px] font-bold">● Paid</span>
            )}
            {lead.has_trial && (
              <span className="inline-flex h-5 items-center px-2 rounded-full bg-warn-bg text-warn text-[10.5px] font-bold">Trial</span>
            )}
          </div>
          {lead.domain && (
            <a href={`https://${lead.domain}`} target="_blank" rel="noopener noreferrer"
               className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-text-3 hover:text-accent-ink">
              <Globe size={12} /> {lead.domain}
            </a>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="Deal value" value={lead.deal_value != null ? `${lead.deal_value} ${lead.currency ?? 'EGP'}` : '—'} />
        <Stat label="Source" value={lead.source || '—'} />
        <Stat label="Owner" value={lead.am_mail || '—'} truncate />
        <Stat label="Paid status" value={lead.paid_status || '—'} />
        <Stat label="Activation" value={lead.activation_status || '—'} />
        <Stat label="Created" value={fmtDate(lead.created_at)} />
      </div>
    </div>
  );
}

function Stat({ label, value, truncate }: { label: string; value: React.ReactNode; truncate?: boolean }) {
  return (
    <div className="bg-surface-2 rounded-lg p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-3">{label}</div>
      <div className={'mt-1 text-[13px] font-bold text-text ' + (truncate ? 'truncate' : '')}
           title={typeof value === 'string' ? value : undefined}>{value}</div>
    </div>
  );
}
