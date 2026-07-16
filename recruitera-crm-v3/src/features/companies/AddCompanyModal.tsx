import { useEffect, useState } from 'react';
import { X, Plus, Upload, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreateAccount, type NewAccountInput } from '@/hooks/useCreateAccount';
import { useMe } from '@/hooks/useMe';
import { useEnum } from '@/hooks/useEnum';
import { useUtmSources, useUtmMediums, useCreateUtmSource, useCreateUtmMedium } from '@/hooks/useUtmOptions';
import { CreatableSelect } from '@/components/shared/CreatableSelect';
import { cn } from '@/lib/cn';

const COMPANY_SIZES = ['5-25', '25-50', '50-100', '100-500', '500-1000', '1000+'] as const;

type Props = {
  onClose: () => void;
  onBulkUpload?: () => void;
};

export function AddCompanyModal({ onClose, onBulkUpload }: Props) {
  const create = useCreateAccount();
  const me = useMe();
  const stages = useEnum('pipeline_stage');
  const sources = useUtmSources();
  const mediums = useUtmMediums();
  const createSource = useCreateUtmSource();
  const createMedium = useCreateUtmMedium();
  const navigate = useNavigate();

  const [form, setForm] = useState<NewAccountInput>({
    name: '',
    source: '',
    stage: 'lead',
    campaign: '',
    medium: '',
    am_mail: me.data?.email ?? '',
    owner_id: me.data?.id ?? null,
    cs_email: '',
    industry: '',
    company_size: '',
    contact: { full_name: '', phone: '', email: '', job_title: '' },
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Default AM email + owner once profile loads. Keeps owner_id and am_mail
    // in sync so the account team panel resolves the owner correctly.
    if (!me.data) return;
    setForm((f) => {
      if (f.am_mail) return f;
      return { ...f, am_mail: me.data!.email ?? '', owner_id: me.data!.id };
    });
  }, [me.data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit() {
    setErr(null);
    try {
      const res = await create.mutateAsync(form);
      onClose();
      // Open the newly created company profile
      navigate(`/companies/${res.id}`);
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  const set = <K extends keyof NewAccountInput>(k: K, v: NewAccountInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setContact = <K extends keyof NewAccountInput['contact']>(k: K, v: NewAccountInput['contact'][K]) =>
    setForm((f) => ({ ...f, contact: { ...f.contact, [k]: v } }));

  const srcOptions = (sources.data ?? []).map((s) => s.name);
  const mediumOptions = (mediums.data ?? []).map((m) => m.name);

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-xl max-h-[88vh] overflow-hidden flex flex-col my-8" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center text-cg-900">
            <Plus size={18} strokeWidth={3} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-black tracking-tight text-text">Add New Lead</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">Manually create a lead in the pipeline</div>
          </div>
          {onBulkUpload && (
            <button
              onClick={onBulkUpload}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-border bg-surface text-text-2 text-[12.5px] font-bold hover:bg-surface-2"
            >
              <Upload size={13} /> Bulk Upload
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-5 overflow-y-auto sc">
          {/* COMPANY NAME */}
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Company name *</span>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Hassan Allam Holding"
              className="mt-1 w-full h-11 px-3 border-2 border-accent-strong rounded-lg bg-surface text-[14px] font-semibold outline-none focus:border-accent"
            />
          </label>

          {/* SOURCE / STAGE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CreatableSelect
              label="Source"
              value={form.source ?? ''}
              options={srcOptions}
              onChange={(v) => set('source', v)}
              onCreate={async (v) => { await createSource.mutateAsync(v); }}
              creating={createSource.isPending}
              placeholder="Select source…"
            />
            <FieldSelect
              label="Stage"
              value={form.stage ?? 'lead'}
              onChange={(v) => set('stage', v)}
              options={stages.data ?? ['lead']}
              format={(s) => s.toUpperCase()}
            />
          </div>

          {/* CAMPAIGN / MEDIUM */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldText
              label="Campaign"
              value={form.campaign ?? ''}
              onChange={(v) => set('campaign', v)}
              placeholder="e.g. Q2-Enterprise-2026"
            />
            <CreatableSelect
              label="Medium"
              value={form.medium ?? ''}
              options={mediumOptions}
              onChange={(v) => set('medium', v)}
              onCreate={async (v) => { await createMedium.mutateAsync(v); }}
              creating={createMedium.isPending}
              placeholder="Select medium…"
            />
          </div>

          {/* AM / RC EMAIL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldText
              label={<>AM email (owner) <span className="text-text-4 font-medium normal-case tracking-normal">— defaults to you</span></>}
              value={form.am_mail ?? ''}
              onChange={(v) => set('am_mail', v)}
              placeholder="a.hammad@icareer.ai"
              type="email"
            />
            <FieldText
              label={<>CS email <span className="text-text-4 font-medium normal-case tracking-normal">— customer success</span></>}
              value={form.cs_email ?? ''}
              onChange={(v) => set('cs_email', v)}
              placeholder="cs@recruitera.ai"
              type="email"
            />
          </div>

          {/* INDUSTRY / COMPANY SIZE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FieldText
              label="Industry"
              value={form.industry ?? ''}
              onChange={(v) => set('industry', v)}
              placeholder="e.g. Construction"
            />
            <FieldSelect
              label="Company size"
              value={form.company_size ?? ''}
              onChange={(v) => set('company_size', v)}
              options={COMPANY_SIZES as unknown as string[]}
              optional
              optionalLabel="Select size…"
            />
          </div>

          <div className="pt-2 border-t border-border">
            <div className="text-[13px] font-extrabold text-text-2 mb-3">Contact person</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldText
                label="Name *"
                value={form.contact.full_name}
                onChange={(v) => setContact('full_name', v)}
                placeholder="HR Director name"
              />
              <FieldText
                label="Phone *"
                value={form.contact.phone}
                onChange={(v) => setContact('phone', v)}
                placeholder="+20 10 XXXX XXXX"
              />
              <FieldText
                label={<>Email <span className="text-text-4 font-medium normal-case tracking-normal">(optional)</span></>}
                value={form.contact.email ?? ''}
                onChange={(v) => setContact('email', v)}
                placeholder="contact@company.com"
                type="email"
              />
              <FieldText
                label={<>Job title <span className="text-text-4 font-medium normal-case tracking-normal">(optional)</span></>}
                value={form.contact.job_title ?? ''}
                onChange={(v) => setContact('job_title', v)}
                placeholder="e.g. HR Director"
              />
            </div>
          </div>

          {err && (
            <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">
              {err}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-10 px-5 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={submit}
            disabled={create.isPending}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-60"
          >
            <Check size={14} strokeWidth={3} /> {create.isPending ? 'Creating…' : 'Create lead'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- fields ---------- */
function FieldText({ label, value, onChange, placeholder, type = 'text' }: {
  label: React.ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn('mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong')}
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options, format, optional, optionalLabel }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
  format?: (s: string) => string; optional?: boolean; optionalLabel?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
      >
        {optional && <option value="">{optionalLabel ?? '—'}</option>}
        {options.map((o) => <option key={o} value={o}>{format ? format(o) : o}</option>)}
      </select>
    </label>
  );
}
