import { useEffect, useState } from 'react';
import { X, Plus, Check } from 'lucide-react';
import { useCreateDeal, type NewDealInput } from '@/hooks/useDealMutations';
import { useMe } from '@/hooks/useMe';
import { DEAL_TYPES, BANT_PILLARS, type BantAnswer, type DealType } from '@/hooks/useDeals';
import { cn } from '@/lib/cn';

type Props = {
  accountId: string;
  companyName: string;
  onClose: () => void;
  onCreated?: (dealId: string) => void;
};

type BantForm = {
  budget: BantAnswer | ''; budget_note: string;
  authority: BantAnswer | ''; authority_note: string;
  need: BantAnswer | ''; need_note: string;
  timing: BantAnswer | ''; timing_note: string;
};

const EMPTY_BANT: BantForm = {
  budget: '', budget_note: '',
  authority: '', authority_note: '',
  need: '', need_note: '',
  timing: '', timing_note: '',
};

export function NewDealModal({ accountId, companyName, onClose, onCreated }: Props) {
  const create = useCreateDeal();
  const me = useMe();
  const [dealType, setDealType] = useState<DealType | ''>('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [expectedClose, setExpectedClose] = useState('');
  const [bant, setBant] = useState<BantForm>(EMPTY_BANT);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function setBantPart<K extends keyof BantForm>(k: K, v: BantForm[K]) {
    setBant((b) => ({ ...b, [k]: v }));
  }

  async function submit() {
    setErr(null);
    if (!dealType) { setErr('Pick a deal type'); return; }
    const input: NewDealInput = {
      account_id: accountId,
      stage: 'mql',
      deal_type: dealType,
      title: title.trim() || null,
      amount: amount ? Number(amount) : null,
      expected_close_date: expectedClose || null,
      owner_id: me.data?.id ?? null,
      bant_budget:    bant.budget    || null,
      bant_authority: bant.authority || null,
      bant_need:      bant.need      || null,
      bant_timing:    bant.timing    || null,
      bant_budget_note:    bant.budget_note.trim()    || null,
      bant_authority_note: bant.authority_note.trim() || null,
      bant_need_note:      bant.need_note.trim()      || null,
      bant_timing_note:    bant.timing_note.trim()    || null,
    };
    try {
      const deal = await create.mutateAsync(input);
      onCreated?.(deal.id);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-3xl overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center text-cg-900">
            <Plus size={18} strokeWidth={3} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-black tracking-tight text-text">New deal</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">
              For <span className="font-bold text-text-2">{companyName}</span> — starts in MQL until you qualify it.
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 overflow-y-auto sc space-y-6">
          {/* Deal type + basics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Deal type <span className="text-bad">*</span></span>
              <select
                autoFocus
                value={dealType}
                onChange={(e) => setDealType(e.target.value as DealType | '')}
                className={cn(
                  'mt-1 w-full h-11 px-3 border-2 rounded-lg bg-surface text-[14px] font-semibold outline-none',
                  dealType ? 'border-accent-strong text-text' : 'border-border-2 text-text-3',
                )}
              >
                <option value="">Select…</option>
                {DEAL_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Title <span className="text-text-4 font-medium normal-case tracking-normal">(optional)</span></span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 renewal — Pro plan"
                className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">ACV (EGP) <span className="text-text-4 font-medium normal-case tracking-normal">(optional)</span></span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={0}
                placeholder="e.g. 120000"
                className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong tnum"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Expected close date <span className="text-text-4 font-medium normal-case tracking-normal">(optional)</span></span>
              <input
                type="date"
                value={expectedClose}
                onChange={(e) => setExpectedClose(e.target.value)}
                className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
              />
            </label>
          </div>

          {/* BANT block */}
          <div className="border-t border-border pt-5">
            <div className="flex items-baseline gap-2 mb-1">
              <Check size={14} className="text-accent-ink" />
              <div className="text-[14px] font-black tracking-tight text-text">Qualify SQL — BANT</div>
            </div>
            <div className="text-[12px] text-text-3 mb-4">
              Confirm <span className="font-bold text-text">{companyName}</span> meets each BANT pillar. Yes / No / Unknown plus an optional note.
              <span className="ml-1 text-text-4">(Optional now — you can fill this later when moving to SQL.)</span>
            </div>

            <div className="space-y-3">
              {BANT_PILLARS.map((p) => {
                const answer = bant[p.key as 'budget' | 'authority' | 'need' | 'timing'];
                const noteKey = `${p.key}_note` as 'budget_note' | 'authority_note' | 'need_note' | 'timing_note';
                return (
                  <div key={p.key} className="border border-border rounded-xl p-3.5">
                    <div className="text-[13.5px] leading-snug">
                      <span className="font-black text-text">{p.label}</span>
                      <span className="text-text-2"> — {p.q}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {(['yes', 'no', 'unknown'] as BantAnswer[]).map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setBantPart(p.key as keyof BantForm, (answer === v ? '' : v) as BantForm[keyof BantForm])}
                          className={cn(
                            'h-8 px-4 rounded-full text-[12px] font-black border-2 capitalize transition-colors',
                            answer === v
                              ? v === 'yes'  ? 'bg-ok-bg text-ok border-ok'
                              : v === 'no'   ? 'bg-bad-bg text-bad border-bad'
                              :                'bg-surface-2 text-text-2 border-border-2'
                              : 'bg-surface text-text-2 border-border hover:border-border-2',
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={2}
                      value={bant[noteKey]}
                      onChange={(e) => setBantPart(noteKey, e.target.value as BantForm[typeof noteKey])}
                      placeholder={`Optional — ${p.ph}`}
                      className="mt-2 w-full p-2.5 border border-border-2 rounded-lg bg-surface text-[12.5px] outline-none focus:border-accent-strong resize-vertical"
                    />
                  </div>
                );
              })}
            </div>
          </div>

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
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={create.isPending || !dealType}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-60"
          >
            <Check size={14} strokeWidth={3} /> {create.isPending ? 'Creating…' : 'Create deal'}
          </button>
        </footer>
      </div>
    </div>
  );
}
