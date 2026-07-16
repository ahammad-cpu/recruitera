import { useEffect, useMemo, useState } from 'react';
import { X, Send, Mail, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { Account } from '@/hooks/useAccounts';
import type { Contact } from '@/hooks/useAccountDetail';
import { cn } from '@/lib/cn';

type Props = {
  accounts: Account[];
  contactsByAcct: Map<string, Contact[]>;
  onClose: () => void;
};

export function BulkEmailModal({ accounts, contactsByAcct, onClose }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'bcc' | 'to'>('bcc');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const recipients = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      (contactsByAcct.get(a.id) ?? []).forEach((c) => {
        if (c.email) set.add(c.email);
      });
    });
    return Array.from(set).sort();
  }, [accounts, contactsByAcct]);

  const missingEmail = accounts.filter((a) => !(contactsByAcct.get(a.id) ?? []).some((c) => c.email));

  function openMail() {
    if (!recipients.length) { toast.error('No recipients — none of the selected accounts have a primary contact email'); return; }
    const params = new URLSearchParams();
    if (subject) params.set('subject', subject);
    if (body) params.set('body', body);
    const qs = params.toString();
    const to = mode === 'to' ? encodeURIComponent(recipients.join(',')) : '';
    const bcc = mode === 'bcc' ? `bcc=${encodeURIComponent(recipients.join(','))}` : '';
    const url = `mailto:${to}?${bcc}${bcc && qs ? '&' : ''}${qs}`;
    window.location.href = url;
  }

  function copyEmails() {
    if (!recipients.length) return;
    navigator.clipboard.writeText(recipients.join(', '));
    toast.success(`Copied ${recipients.length} email${recipients.length === 1 ? '' : 's'}`);
  }

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-info-bg text-info grid place-items-center">
            <Mail size={16} />
          </div>
          <div className="flex-1">
            <div className="text-[15px] font-extrabold text-text">Compose email</div>
            <div className="text-[11.5px] text-text-3 mt-0.5">
              {recipients.length} recipient{recipients.length === 1 ? '' : 's'} from {accounts.length} account{accounts.length === 1 ? '' : 's'}
              {missingEmail.length > 0 && (
                <> · <span className="text-warn font-bold">{missingEmail.length} without email skipped</span></>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-text-3 hover:bg-surface-2"><X size={16} /></button>
        </header>

        <div className="p-6 space-y-4 overflow-y-auto sc">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Recipients</span>
              <div className="flex items-center gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
                {(['bcc', 'to'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider',
                      mode === m ? 'bg-surface text-text shadow-sh1' : 'text-text-3',
                    )}
                  >{m}</button>
                ))}
              </div>
              <div className="flex-1" />
              <button onClick={copyEmails} className="inline-flex items-center gap-1 text-[11px] font-bold text-text-3 hover:text-text">
                <Copy size={11} /> Copy
              </button>
            </div>
            <div className="max-h-24 overflow-y-auto sc bg-surface-2/60 border border-border rounded-lg p-2 flex flex-wrap gap-1">
              {recipients.length === 0
                ? <span className="text-[12px] text-text-3">No recipients — selected accounts have no primary contact email.</span>
                : recipients.map((e) => (
                    <span key={e} className="inline-flex items-center h-6 px-2 rounded-md bg-surface border border-border text-[11.5px] font-medium text-text-2">{e}</span>
                  ))}
            </div>
            {mode === 'bcc' && recipients.length > 1 && (
              <div className="text-[11px] text-text-3 mt-1">BCC hides recipients from each other — recommended for outbound.</div>
            )}
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quick intro from Recruitera"
              className="mt-1 w-full h-10 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            />
          </label>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Body</span>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {first_name},\n\n…"}
              className="mt-1 w-full p-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong resize-vertical leading-relaxed"
            />
            <div className="text-[11px] text-text-3 mt-1">
              Opens in your default mail client — subject and body are prefilled, addresses go in the {mode.toUpperCase()} field.
            </div>
          </label>
        </div>

        <footer className="px-6 py-4 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface">Cancel</button>
          <button
            onClick={openMail}
            disabled={!recipients.length}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-cg-900 text-white text-[12.5px] font-black hover:bg-cg-800 disabled:opacity-60"
          >
            <Send size={13} /> Open in mail client
          </button>
        </footer>
      </div>
    </div>
  );
}
