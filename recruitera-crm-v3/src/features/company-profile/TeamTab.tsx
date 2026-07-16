import { useState } from 'react';
import { Users, Plus, Pencil } from 'lucide-react';
import { useContacts, type Contact } from '@/hooks/useAccountDetail';
import { useMe } from '@/hooks/useMe';
import { initials } from '@/lib/format';
import { ContactEditorModal } from './ContactEditorModal';

export function TeamTab({ accountId }: { accountId: string }) {
  const { data, isLoading } = useContacts(accountId);
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const contacts = data ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  if (isLoading) {
    return (
      <div className="bg-surface border border-border rounded-2xl px-8 py-14 text-center text-[13px] text-text-3">
        Loading contacts…
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <>
        <div className="bg-surface border border-border rounded-2xl px-8 py-14 shadow-sh1 text-center">
          <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border inline-grid place-items-center text-text-3 mb-3.5">
            <Users size={20} />
          </div>
          <div className="text-[16px] font-extrabold tracking-tight mb-1.5">No contacts yet</div>
          <div className="text-[13px] text-text-3 font-medium max-w-md mx-auto mb-4">
            Add the first contact so the account team can reach the right person.
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 text-[13px] font-bold border border-accent-strong hover:bg-accent-strong"
          >
            <Plus size={13} /> Add first contact
          </button>
        </div>
        {addOpen && <ContactEditorModal accountId={accountId} onClose={() => setAddOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-black uppercase tracking-widest text-text-3">
            Contacts · {contacts.length}
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-accent text-cg-900 text-[12px] font-bold border border-accent-strong hover:bg-accent-strong"
          >
            <Plus size={12} /> Add contact
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[40px_1.4fr_1.4fr_1.2fr_28px] gap-3.5 items-center px-3.5 py-3 bg-surface-2 border border-border rounded-xl"
            >
              <div className="w-[34px] h-[34px] rounded-full bg-cg-800 text-white text-[11px] font-bold flex items-center justify-center">
                {initials(c.full_name || c.email)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-bold text-text truncate">{c.full_name || '(no name)'}</span>
                  {c.is_primary && (
                    <span className="text-[9.5px] font-black tracking-wider bg-accent text-cg-900 px-1.5 py-0.5 rounded">
                      PRIMARY
                    </span>
                  )}
                </div>
                {c.job_title && <div className="text-[11.5px] text-text-3 font-semibold mt-0.5 truncate">{c.job_title}</div>}
              </div>
              <div className="min-w-0">
                {c.email
                  ? <a href={`mailto:${c.email}`} className="text-[12.5px] text-accent-ink font-semibold break-all">{c.email}</a>
                  : <span className="text-text-4 text-[12.5px]">—</span>}
              </div>
              <div>
                {c.phone
                  ? <a href={`tel:${c.phone}`} className="tnum text-[12.5px] text-text font-semibold">{c.phone}</a>
                  : <span className="text-text-4 text-[12.5px]">—</span>}
              </div>
              {isAdmin ? (
                <button
                  onClick={() => setEditing(c)}
                  title="Edit contact (admin only)"
                  className="w-7 h-7 rounded-md text-text-3 hover:bg-surface hover:text-text flex items-center justify-center"
                >
                  <Pencil size={13} />
                </button>
              ) : (
                <div />
              )}
            </div>
          ))}
        </div>
      </div>

      {addOpen && <ContactEditorModal accountId={accountId} onClose={() => setAddOpen(false)} />}
      {editing && <ContactEditorModal accountId={accountId} contact={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
