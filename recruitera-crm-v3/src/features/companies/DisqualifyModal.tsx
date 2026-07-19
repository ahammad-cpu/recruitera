import { useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import type { Account } from '@/hooks/useAccounts';
import { useLoseAccount } from '@/hooks/useLoseAccount';

/**
 * Disqualify a lead. Only offered at Lead / MQL stages — the account never
 * became a real sales opportunity, so this is a "not worth pursuing" call
 * with a broader reason list than the Loss modal (Loss is for real sales
 * attempts that didn't close at SQL+). Both write to stage='lost' via the
 * same `lose_account` RPC — the reason_code distinguishes them in reports.
 */
const DISQ_REASONS = [
  { key: 'fake_lead',   label: 'Fake lead',    hint: 'Fake name / email / phone or bot submission' },
  { key: 'not_icp',     label: 'Not ICP',      hint: 'Does not fit size, industry, or region' },
  { key: 'duplicate',   label: 'Duplicate',    hint: 'Already exists in CRM' },
  { key: 'spam',        label: 'Spam / junk',  hint: 'Junk submission' },
  { key: 'competitor',  label: 'Competitor',   hint: 'Works for a competitor' },
  { key: 'no_response', label: 'No response',  hint: 'Never replied to outreach' },
  { key: 'other',       label: 'Other',        hint: 'Requires a note' },
] as const;

export function DisqualifyModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [reason, setReason] = useState<string>('fake_lead');
  const [notes, setNotes] = useState('');
  const lose = useLoseAccount();

  const canSubmit = !!reason && (reason !== 'other' || notes.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    await lose.mutateAsync({
      accountId: account.id,
      reason: reason as any,
      notes: notes.trim() || null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-sh3 border border-border w-full max-w-[520px] p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[16px] font-black">Disqualify "{account.name || '—'}"</div>
          <button onClick={onClose} className="text-text-3 hover:text-text"><X size={16} /></button>
        </div>
        <div className="text-[12px] text-text-3 mb-4">
          Use this when the lead was never a real prospect. For accounts that reached SQL and
          didn't close, use <span className="font-bold text-text-2">Lose</span> instead.
        </div>

        <fieldset className="mb-4">
          <legend className="text-[10px] font-black uppercase tracking-widest text-text-3 mb-2">Reason (required)</legend>
          <div className="space-y-1.5">
            {DISQ_REASONS.map((r) => (
              <label key={r.key} className="flex items-start gap-2 text-[13px] p-2 rounded-lg hover:bg-surface-2 cursor-pointer">
                <input
                  type="radio"
                  name="disq_reason"
                  value={r.key}
                  checked={reason === r.key}
                  onChange={() => setReason(r.key)}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-bold text-text">{r.label}</div>
                  <div className="text-[11.5px] text-text-3">{r.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-3">
            Note {reason === 'other' && <span className="text-bad">(required)</span>}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full px-3 py-2 border border-border-2 rounded-lg bg-surface text-[13px] resize-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-border text-[12px] font-bold">Cancel</button>
          <button
            onClick={submit}
            disabled={!canSubmit || lose.isPending}
            className="h-8 px-4 rounded-lg bg-bad text-white text-[12px] font-black disabled:opacity-50"
          >
            {lose.isPending ? 'Disqualifying…' : 'Disqualify'}
          </button>
        </div>
      </div>
    </div>
  );
}
