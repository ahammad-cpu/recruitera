import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, User as UserIcon, Tag, Building2 } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { useContacts, useActivities } from '@/hooks/useAccountDetail';
import { fmtDate, initials } from '@/lib/format';
import { CompanyHero } from './CompanyHero';
import { ActivityComposer } from './ActivityComposer';

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: accounts, isLoading: loadingAccts } = useAccounts();
  const { data: contacts, isLoading: loadingContacts } = useContacts(id);
  const { data: activities, isLoading: loadingActs } = useActivities(id);

  const lead = accounts?.find((a) => a.id === id);

  if (loadingAccts) return <div className="p-6"><div className="h-40 bg-surface-2 rounded-2xl animate-pulse" /></div>;
  if (!lead) return (
    <div className="p-6">
      <div className="bg-warn-bg border border-warn/30 text-warn rounded-xl p-4 text-[13px]">
        Company not found. <Link to="/companies" className="underline">Back</Link>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center gap-3 text-[12px] text-text-3">
        <Link to="/companies" className="hover:text-text-2 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Back to Companies
        </Link>
      </div>

      <CompanyHero lead={lead} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1 space-y-4">
          <ActivityComposer accountId={lead.id} />

          <div>
            <div className="text-[13px] font-bold text-text mb-3">Activity</div>
            {loadingActs && <div className="text-[12.5px] text-text-3">Loading…</div>}
            {!loadingActs && (activities?.length ?? 0) === 0 && (
              <div className="text-[12.5px] text-text-3 py-8 text-center">No activity yet. Log the first one above.</div>
            )}
            {!loadingActs && activities && activities.length > 0 && (
              <ol className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="border-l-2 border-border pl-3 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">
                        {a.type}
                      </span>
                      {a.from_stage && a.to_stage && (
                        <span className="text-[11px] text-text-3">{a.from_stage} → <b className="text-text">{a.to_stage}</b></span>
                      )}
                      <span className="ml-auto text-[11px] text-text-4">{fmtDate(a.created_at)}</span>
                    </div>
                    {a.title && <div className="mt-1 text-[13px] font-semibold text-text">{a.title}</div>}
                    {a.text && <div className="mt-0.5 text-[12.5px] text-text-2 whitespace-pre-wrap">{a.text}</div>}
                    {a.email_subject && <div className="mt-0.5 text-[12px] text-text-3">Subject: {a.email_subject}</div>}
                    {a.call_outcome && <div className="mt-0.5 text-[12px] text-text-3">Call: {a.call_outcome} · {a.call_duration_minutes ?? '?'} min</div>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Panel title="Contact people" icon={<UserIcon size={13} />}>
            {loadingContacts && <div className="text-[12px] text-text-3">Loading…</div>}
            {!loadingContacts && (contacts?.length ?? 0) === 0 && (
              <div className="text-[12px] text-text-3">No contacts on file.</div>
            )}
            {contacts?.map((c) => (
              <div key={c.id} className="pb-3 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-cg-800 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {initials(c.full_name || c.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-text text-[12.5px] truncate flex items-center gap-1">
                      {c.full_name || '—'}
                      {c.is_primary && <span className="text-[9px] font-bold text-accent-ink bg-accent-soft px-1 rounded">PRIMARY</span>}
                    </div>
                    {c.job_title && <div className="text-[11px] text-text-3 truncate">{c.job_title}</div>}
                  </div>
                </div>
                {c.email && <a href={`mailto:${c.email}`} className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-text-2 hover:text-accent-ink"><Mail size={11} /> {c.email}</a>}
                {c.phone && <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-2"><Phone size={11} /> {c.phone}</div>}
              </div>
            ))}
          </Panel>

          <Panel title="Company details" icon={<Building2 size={13} />}>
            <Detail label="Domain" value={lead.domain} />
            <Detail label="Source" value={lead.source} />
            <Detail label="Bubble ID" value={lead.bubble_id} mono />
            <Detail label="Created" value={fmtDate(lead.created_at)} />
            <Detail label="Bubble created" value={fmtDate(lead.bubble_created_at)} />
          </Panel>

          <Panel title="Ownership" icon={<Tag size={13} />}>
            <Detail label="AM email" value={lead.am_mail} />
            <Detail label="Owner ID" value={lead.owner_id} mono />
            <Detail label="Disq stage" value={lead.disq_stage} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 shadow-sh1">
      <div className="flex items-center gap-1.5 mb-3 text-[11px] font-bold uppercase tracking-wider text-text-3">
        {icon}{title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-[11.5px] text-text-3 flex-shrink-0">{label}</div>
      <div className={'text-[12px] font-semibold text-text text-right truncate ' + (mono ? 'font-mono text-[10.5px]' : '')} title={value || ''}>
        {value || <span className="text-text-4">—</span>}
      </div>
    </div>
  );
}
