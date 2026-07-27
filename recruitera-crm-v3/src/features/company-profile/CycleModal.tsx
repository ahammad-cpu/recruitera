import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Cycle } from '@/hooks/useContractCycles';
import { useSaveCycle, type CycleFormInput } from '@/hooks/useCycleMutations';
import { cn } from '@/lib/cn';

type Props = {
  accountId: string;
  existing?: Cycle | null;
  onClose: () => void;
  onDone?: () => void;
};

const CURRENCIES = ['EGP', 'USD', 'EUR', 'SAR'] as const;
const STATUSES = ['active', 'renewed', 'collected', 'paid', 'churned', 'overdue'] as const;
const PLAN_TIERS = ['Basic', 'Pro', 'Enterprise', 'No fees'] as const;
const PAYMENT_TYPES = ['Bank transfer', 'Credit', 'Credit card', 'Cash', 'Cheque', 'Other'] as const;

export function CycleModal({ accountId, existing, onClose, onDone }: Props) {
  const save = useSaveCycle(accountId);
  const isEdit = !!existing?.id;
  const [form, setForm] = useState<CycleFormInput>({
    id: existing?.id ?? null,
    plan_tier: existing?.plan_tier ?? '',
    value: existing?.value != null ? String(existing.value) : '',
    currency: existing?.currency ?? 'EGP',
    started_at: existing?.started_at ?? '',
    ends_at: existing?.ends_at ?? '',
    status: existing?.status ?? 'active',
    auto_renew: !!existing?.auto_renew,
    payment_type: existing?.payment_type ?? '',
    notes: existing?.notes ?? '',
    offer_sent_date: existing?.offer_sent_date ?? '',
    invoice_date: existing?.invoice_date ?? '',
    paid_date: existing?.paid_date ?? '',
    original_price: existing?.original_price != null ? String(existing.original_price) : '',
    discount_given: existing?.discount_given != null ? String(existing.discount_given) : '',
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    try {
      await save.mutateAsync(form);
      onDone?.();
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const set = <K extends keyof CycleFormInput>(k: K, v: CycleFormInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div>
            <div className="text-[15px] font-extrabold text-text">{isEdit ? 'Edit contract cycle' : 'Add contract cycle'}</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Writes to <code className="font-mono bg-surface-2 px-1 rounded text-[10.5px]">contract_cycles</code></div>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Money timeline & fees — leads the form: offer → invoice →
              payment/collection, plus the fee figures and their currency. */}
          <div className="md:col-span-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Money timeline &amp; fees</span>
          </div>
          <FieldDate label="Offer sent date" value={form.offer_sent_date ?? ''} onChange={(v) => set('offer_sent_date', v)} />
          <FieldDate label="Invoice created date" value={form.invoice_date ?? ''} onChange={(v) => set('invoice_date', v)} />
          <FieldDate label="Payment / collection date" value={form.paid_date ?? ''} onChange={(v) => set('paid_date', v)} />
          <FieldSelect label="Currency" value={form.currency} onChange={(v) => set('currency', v)} options={CURRENCIES} />
          <FieldNumber label={`Offer amount (${form.currency || 'EGP'})`} value={String(form.value ?? '')} onChange={(v) => set('value', v)} />
          <FieldNumber label={`Original fees (${form.currency || 'EGP'})`} value={String(form.original_price ?? '')} onChange={(v) => set('original_price', v)} />
          <FieldNumber label={`Discount given (${form.currency || 'EGP'})`} value={String(form.discount_given ?? '')} onChange={(v) => set('discount_given', v)} />
          <FieldSelect label="Payment type" value={form.payment_type ?? ''} onChange={(v) => set('payment_type', v)} options={PAYMENT_TYPES} allowCustom optional />

          {/* Plan + term */}
          <div className="md:col-span-2 mt-1 pt-3 border-t border-border/60">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Plan &amp; term</span>
          </div>
          <FieldSelect label="Plan tier *" value={form.plan_tier} onChange={(v) => set('plan_tier', v)} options={PLAN_TIERS} allowCustom />
          <FieldSelect label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUSES} />
          <FieldDate label="Term start *" value={form.started_at} onChange={(v) => set('started_at', v)} />
          <FieldDate label="Term end *" value={form.ends_at} onChange={(v) => set('ends_at', v)} />
          <label className="flex items-center gap-2 mt-1">
            <input type="checkbox" checked={form.auto_renew} onChange={(e) => set('auto_renew', e.target.checked)} className="w-4 h-4 accent-accent-strong" />
            <span className="text-[12.5px] font-bold text-text-2">Auto-renew</span>
          </label>
          <div />
          <div className="md:col-span-2">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Notes</span>
              <textarea
                rows={3}
                value={form.notes ?? ''}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Discount rationale, renewal terms, discussion notes…"
                className="mt-1 w-full p-2.5 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong resize-vertical"
              />
            </label>
          </div>
          {err && (
            <div className="md:col-span-2 text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="h-9 px-4 rounded-lg bg-accent text-cg-900 text-[12.5px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : (isEdit ? 'Save changes' : '+ Add cycle')}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- fields ---------- */
function FieldSelect({ label, value, onChange, options, allowCustom, optional }: {
  label: string; value: string; onChange: (v: string) => void;
  options: ReadonlyArray<string>; allowCustom?: boolean; optional?: boolean;
}) {
  const inList = options.includes(value);
  const [custom, setCustom] = useState(!!value && !inList);
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      {custom ? (
        <div className="mt-1 flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Custom value"
            className="flex-1 h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
          />
          <button onClick={() => { setCustom(false); onChange(''); }} className="text-[11px] text-text-3 hover:text-text">Use list</button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => { if (e.target.value === '__custom__') { setCustom(true); onChange(''); return; } onChange(e.target.value); }}
          className={cn('mt-1 w-full h-9 px-3 border rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong', 'border-border-2')}
        >
          {optional && <option value="">—</option>}
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {allowCustom && <option value="__custom__">+ Custom…</option>}
        </select>
      )}
    </label>
  );
}
function FieldDate({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong" />
    </label>
  );
}
function FieldNumber({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <input type="number" min="0" step="1" value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong tnum" />
    </label>
  );
}
