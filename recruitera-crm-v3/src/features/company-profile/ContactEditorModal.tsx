import { useEffect, useState } from 'react';
import { X, Check, User as UserIcon } from 'lucide-react';
import { useUpsertContact } from '@/hooks/useContactMutations';
import type { Contact } from '@/hooks/useAccountDetail';

type Props = {
  accountId: string;
  contact?: Contact | null;
  onClose: () => void;
};

export function ContactEditorModal({ accountId, contact, onClose }: Props) {
  const upsert = useUpsertContact(accountId);
  const [form, setForm] = useState({
    full_name: contact?.full_name ?? '',
    job_title: contact?.job_title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    is_primary: !!contact?.is_primary,
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const editing = !!contact?.id;

  function submit() {
    setErr(null);
    if (!form.full_name.trim() && !form.email.trim() && !form.phone.trim()) {
      setErr('At least one of name, email, or phone is required.');
      return;
    }
    upsert.mutate(
      {
        id: contact?.id,
        full_name: form.full_name.trim() || null,
        job_title: form.job_title.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        is_primary: form.is_primary,
      },
      { onSuccess: onClose },
    );
  }

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-lg overflow-hidden flex flex-col my-8">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-accent grid place-items-center text-cg-900">
            <UserIcon size={18} strokeWidth={3} />
          </div>
          <div className="flex-1">
            <div className="text-[16px] font-black tracking-tight text-text">
              {editing ? 'Edit contact' : 'Add contact'}
            </div>
            <div className="text-[11.5px] text-text-3 mt-0.5">
              {editing ? 'Update this contact’s details.' : 'A new person on this account.'}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-4">
          <Field label="Full name" value={form.full_name} onChange={(v) => set('full_name', v)} placeholder="Jane Doe" autoFocus />
          <Field label="Job title" value={form.job_title} onChange={(v) => set('job_title', v)} placeholder="HR Director" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Email" value={form.email} onChange={(v) => set('email', v)} placeholder="jane@company.com" type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+20 10 XXXX XXXX" />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_primary}
              onChange={(e) => set('is_primary', e.target.checked)}
              className="w-4 h-4 rounded border-2 border-border-2 accent-accent"
            />
            <span className="text-[13px] font-bold text-text">Primary contact</span>
            <span className="text-[11.5px] text-text-3">— the person shown on lead cards and used for WhatsApp / Email quick actions</span>
          </label>

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
            disabled={upsert.isPending}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-60"
          >
            <Check size={14} strokeWidth={3} /> {upsert.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</span>
      <input
        autoFocus={autoFocus}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
      />
    </label>
  );
}
