import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, Mail, FileText, Trash2,
  X, Pencil, Globe, Phone as PhoneIcon, Plus, Sparkles,
} from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useContacts, useActivities } from '@/hooks/useAccountDetail';
import { useLogActivity } from '@/hooks/useActivityMutations';
import { useMarketingTracking } from '@/hooks/useMarketingTracking';
import { useUpsertContact } from '@/hooks/useContactMutations';
import { useRenameAccount, useChangeStage } from '@/hooks/useAccountMutations';
import { useProfiles } from '@/hooks/useUsersData';
import { useEnum } from '@/hooks/useEnum';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { StagePill } from '@/components/shared/StagePill';
import { fmtDate, fmtEgp, initials, toEgp } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PlansTab } from './PlansTab';
import { TeamTab } from './TeamTab';
import { DocumentsTab } from './DocumentsTab';

type Tab = 'overview' | 'activity' | 'plans' | 'team' | 'documents';

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accounts, isLoading: loadingAccts } = useAccounts();
  const { data: contacts, isLoading: loadingContacts } = useContacts(id);
  const { data: activities, isLoading: loadingActs } = useActivities(id);
  const marketing = useMarketingTracking(id);
  const profiles = useProfiles();
  const stagesEnum = useEnum('pipeline_stage');
  const rename = useRenameAccount();
  const changeStage = useChangeStage();

  const [tab, setTab] = useState<Tab>('overview');

  const activeAccts = useMemo(() => (accounts ?? []).filter((a) => !a.merged_into), [accounts]);
  const lead = activeAccts.find((a) => a.id === id);
  const currentIdx = activeAccts.findIndex((a) => a.id === id);
  const prev = currentIdx > 0 ? activeAccts[currentIdx - 1] : null;
  const next = currentIdx >= 0 && currentIdx < activeAccts.length - 1 ? activeAccts[currentIdx + 1] : null;

  if (loadingAccts) return <div className="p-6"><div className="h-40 bg-surface-2 rounded-2xl animate-pulse" /></div>;
  if (!lead) return <NotFound />;

  const name = lead.name || lead.domain || '—';
  const owner = profiles.data?.find((p) => p.id === lead.owner_id || p.email === lead.am_mail);
  const customerSince = lead.created_at;

  return (
    <div className="p-6 space-y-4 max-w-[1500px]">
      {/* BREADCRUMB + PAGINATION */}
      <div className="flex items-center gap-3 text-[12px] text-text-3">
        <Link to="/companies" className="hover:text-text-2 inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Companies
        </Link>
        <span className="text-text-4">›</span>
        <span className="text-text font-semibold">{name}</span>
        <div className="flex-1" />
        <div className="inline-flex items-center h-8 rounded-lg border border-border overflow-hidden bg-surface">
          <button
            disabled={!prev}
            onClick={() => prev && navigate(`/companies/${prev.id}`)}
            className="h-8 w-8 flex items-center justify-center hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            title={prev?.name || 'No previous'}
          ><ChevronLeft size={14} /></button>
          <div className="tnum text-[12px] font-bold px-3 border-x border-border">
            {currentIdx + 1} / {activeAccts.length}
          </div>
          <button
            disabled={!next}
            onClick={() => next && navigate(`/companies/${next.id}`)}
            className="h-8 w-8 flex items-center justify-center hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed"
            title={next?.name || 'No next'}
          ><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* HERO */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-cg-800 text-white text-lg font-bold flex items-center justify-center flex-shrink-0">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[26px] font-black tracking-tight text-text truncate">{name}</h1>
              <button
                onClick={() => {
                  const next = (prompt('Company name', lead.name || '') || '').trim();
                  if (next && next !== lead.name) rename.mutate({ id: lead.id, name: next });
                }}
                className="p-1 rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
                title="Rename"
              ><Pencil size={14} /></button>
            </div>
            <div className="text-[12.5px] text-text-3 mt-1 flex items-center gap-2 flex-wrap">
              {lead.domain && (
                <a href={`https://${lead.domain}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent-ink">
                  <Globe size={12} /> {lead.domain}
                </a>
              )}
              {isPaid(lead) && <span className="text-text-4">·</span>}
              {isPaid(lead) && <span>Customer since {fmtDate(customerSince)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ActionBtn
              icon={<MessageCircle size={14} />}
              label="WhatsApp"
              color="ok"
              disabled={!(contacts?.[0]?.phone)}
              href={contacts?.[0]?.phone ? `https://wa.me/${String(contacts[0].phone).replace(/\D+/g, '')}` : undefined}
            />
            <ActionBtn
              icon={<Mail size={14} />}
              label="Email"
              disabled={!(contacts?.[0]?.email)}
              href={contacts?.[0]?.email ? `mailto:${contacts[0].email}` : undefined}
            />
            <ActionBtn icon={<FileText size={14} />} label="Proposal" primary />
            <button
              onClick={() => {
                if (!confirm(`Delete ${name}? This is reversible via merged_into.`)) return;
                changeStage.mutate({ id: lead.id, stage: 'lost' });
              }}
              className="h-9 w-9 rounded-lg border border-bad/40 bg-bad-bg text-bad hover:bg-bad hover:text-white flex items-center justify-center"
              title="Disqualify (marks stage=lost)"
            ><Trash2 size={14} /></button>
          </div>
        </div>

        {/* TAG + DISQUALIFY ROW */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <button className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full border border-dashed border-border-2 text-[11px] font-bold text-text-3 hover:border-accent-strong hover:text-accent-ink">
            <Plus size={11} /> Add tag
          </button>
          {lead.stage !== 'lost' && (
            <button
              onClick={() => changeStage.mutate({ id: lead.id, stage: 'lost' })}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-bad/30 bg-bad-bg text-bad text-[12px] font-bold hover:bg-bad/10"
            ><X size={12} /> Disqualify</button>
          )}
        </div>

        {/* STAT STRIP */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Deal value" value={lead.deal_value ? fmtEgp(toEgp(lead.deal_value, lead.deal_currency)) : '—'} hint={lead.deal_value ? '' : 'not set'} />
          <Stat label="Owner" value={owner?.full_name || lead.am_mail || 'Unassigned'} truncate hint={owner?.email ?? undefined} />
          <Stat
            label="Trial"
            value={lead.has_trial ? (lead.activation_status || 'Active') : 'None'}
            valueColor={lead.has_trial && lead.activation_status === 'Active' ? '#22C55E' : undefined}
            hint={lead.has_trial ? 'free trial running' : 'no trial'}
          />
          <Stat label="Created" value={fmtDate(lead.created_at)} hint={isPaid(lead) ? 'active customer' : 'no close date'} />
          <StageStat lead={lead} stages={stagesEnum.data ?? []} onChange={(stage) => changeStage.mutate({ id: lead.id, stage })} />
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-6 border-b border-border">
        {(['overview', 'activity', 'plans', 'team', 'documents'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'py-2.5 text-[13px] font-bold border-b-2 -mb-px capitalize transition-colors',
              tab === t ? 'border-cg-900 text-text' : 'border-transparent text-text-3 hover:text-text-2',
            )}
          >
            {t === 'plans' ? 'Plans & credits' : t === 'team' ? 'Team & users' : t}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <ContactPersonCard accountId={lead.id} contact={contacts?.[0]} loading={loadingContacts} />
            <InternalNotesCard accountId={lead.id} activities={activities ?? []} loading={loadingActs} />
          </div>

          <aside className="space-y-4">
            <AccountTeamPanel primary={owner} />
            <QuickTasksPanel accountId={lead.id} />
            <AttributionPanel tracking={marketing.data ?? null} loading={marketing.isLoading} />
          </aside>
        </div>
      )}

      {tab === 'activity' && <ActivityFeed activities={activities ?? []} loading={loadingActs} />}
      {tab === 'plans' && <PlansTab accountId={lead.id} />}
      {tab === 'team' && <TeamTab accountId={lead.id} />}
      {tab === 'documents' && <DocumentsTab accountId={lead.id} />}
    </div>
  );
}

/* ---------- HERO SUB-COMPONENTS ---------- */

function ActionBtn({
  icon, label, color, primary, disabled, href,
}: {
  icon: React.ReactNode; label: string; color?: 'ok'; primary?: boolean; disabled?: boolean; href?: string;
}) {
  const cls = cn(
    'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[12.5px] font-bold transition-colors',
    disabled && 'opacity-40 cursor-not-allowed',
    !disabled && (
      primary ? 'bg-cg-900 text-white border-cg-900 hover:bg-cg-800'
      : color === 'ok' ? 'bg-ok-bg text-ok border-ok/30 hover:bg-ok/10'
      : 'bg-surface text-text-2 border-border hover:bg-surface-2'
    ),
  );
  if (disabled || !href) return <button disabled={disabled} className={cls}>{icon}{label}</button>;
  return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={cls}>{icon}{label}</a>;
}

function Stat({ label, value, hint, truncate, valueColor }: { label: string; value: React.ReactNode; hint?: string; truncate?: boolean; valueColor?: string }) {
  return (
    <div className="bg-surface-2/60 rounded-xl p-3.5">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className={cn('mt-1 text-[16px] font-extrabold tracking-tight', truncate && 'truncate')} style={{ color: valueColor ?? '#2D3844' }} title={typeof value === 'string' ? value : undefined}>
        {value || '—'}
      </div>
      {hint && <div className="text-[11px] text-text-3 mt-1">{hint}</div>}
    </div>
  );
}

function StageStat({ lead, stages, onChange }: { lead: Account; stages: string[]; onChange: (s: string) => void }) {
  return (
    <div className="bg-surface-2/60 rounded-xl p-3.5">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">Stage</div>
      <div className="mt-1 flex items-center gap-2">
        <StagePill stage={lead.stage} />
        <select
          value={(lead.stage || 'lead').toLowerCase()}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 pl-2 pr-6 border border-border rounded-md bg-surface text-[11px] font-bold outline-none"
        >
          {stages.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
        </select>
      </div>
    </div>
  );
}

/* ---------- CONTACT PERSON ---------- */

function ContactPersonCard({ accountId, contact, loading }: { accountId: string; contact: import('@/hooks/useAccountDetail').Contact | undefined; loading: boolean }) {
  const upsert = useUpsertContact(accountId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ full_name: string; job_title: string; email: string; phone: string }>({
    full_name: contact?.full_name ?? '',
    job_title: contact?.job_title ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
  });

  function save() {
    upsert.mutate({ id: contact?.id, ...form }, { onSuccess: () => setEditing(false) });
  }

  const readOnly = !editing;
  return (
    <Panel title="Contact person" action={
      <button onClick={() => { setForm({ full_name: contact?.full_name ?? '', job_title: contact?.job_title ?? '', email: contact?.email ?? '', phone: contact?.phone ?? '' }); setEditing((v) => !v); }} className="text-text-3 hover:text-text p-1 rounded-md hover:bg-surface-2">
        <Pencil size={13} />
      </button>
    }>
      {loading && <div className="text-[12px] text-text-3">Loading…</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} readOnly={readOnly} />
        <Field label="Title" value={form.job_title} onChange={(v) => setForm((f) => ({ ...f, job_title: v }))} readOnly={readOnly} />
        <Field label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} readOnly={readOnly} type="email" />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} readOnly={readOnly} />
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={save} disabled={upsert.isPending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-cg-900 text-white text-[12px] font-bold hover:bg-cg-800 disabled:opacity-60">
            {upsert.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} className="h-8 px-3 rounded-lg border border-border text-text-2 text-[12px] font-bold">Cancel</button>
        </div>
      )}
    </Panel>
  );
}

function Field({ label, value, onChange, readOnly, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-3">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        placeholder="—"
        className={cn(
          'mt-1 w-full h-9 px-3 border rounded-lg text-[13px] text-text outline-none',
          readOnly ? 'bg-surface-2 border-border cursor-default' : 'bg-surface border-border-2 focus:border-accent-strong',
        )}
      />
    </label>
  );
}

/* ---------- INTERNAL NOTES ---------- */

function InternalNotesCard({ accountId, activities, loading }: { accountId: string; activities: import('@/hooks/useAccountDetail').Activity[]; loading: boolean }) {
  const [type, setType] = useState<'call' | 'email' | 'whatsapp' | 'note'>('note');
  const [text, setText] = useState('');
  const log = useLogActivity(accountId);

  function submit() {
    const t = text.trim();
    if (!t) return;
    log.mutate({ type, text: t }, { onSuccess: () => setText('') });
  }

  const filtered = activities.filter((a) => ['note', 'call', 'email', 'meeting'].includes(a.type));

  return (
    <Panel title="Internal notes">
      <div className="bg-accent-soft/40 border border-border rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          {(['call', 'email', 'whatsapp', 'note'] as const).map((t) => {
            const active = type === t;
            const Icon = t === 'call' ? PhoneIcon : t === 'email' ? Mail : t === 'whatsapp' ? MessageCircle : Pencil;
            return (
              <button key={t} onClick={() => setType(t)} className={cn(
                'inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-bold border',
                active ? 'bg-accent-soft text-accent-ink border-accent' : 'bg-surface text-text-2 border-border',
              )}>
                <Icon size={12} /> {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            );
          })}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }}
          rows={3}
          placeholder="What happened? Use @ to mention or @name/task to assign…"
          className="w-full bg-surface border border-border rounded-lg p-2.5 text-[13px] outline-none focus:border-accent-strong resize-vertical"
        />
        <div className="flex items-center justify-end">
          <button
            onClick={submit}
            disabled={!text.trim() || log.isPending}
            className="h-8 px-4 rounded-lg bg-accent text-cg-900 text-[12.5px] font-black hover:bg-accent-strong disabled:opacity-50"
          >
            {log.isPending ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </div>

      {loading && <div className="mt-4 text-[12px] text-text-3">Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div className="mt-4 py-10 text-center text-[12.5px] text-text-3 border border-dashed border-border rounded-xl">
          No notes yet — write one above
        </div>
      )}
      {filtered.length > 0 && (
        <ol className="mt-4 space-y-3">
          {filtered.slice(0, 30).map((a) => (
            <li key={a.id} className="border-l-2 border-accent pl-3 pb-2">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-bold uppercase text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">{a.type}</span>
                <span className="ml-auto text-text-4">{fmtDate(a.created_at)}</span>
              </div>
              {a.text && <div className="mt-1 text-[12.5px] text-text-2 whitespace-pre-wrap">{a.text}</div>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ---------- RIGHT RAIL ---------- */

function AccountTeamPanel({ primary }: { primary: import('@/hooks/useUsersData').Profile | undefined }) {
  return (
    <Panel title="Account team">
      {!primary && <div className="text-[12px] text-text-3">Unassigned.</div>}
      {primary && (
        <div className="flex items-center gap-3">
          <OwnerAvatar profile={primary} size={36} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-extrabold text-text truncate flex items-center gap-1.5">
              {primary.full_name || primary.email}
              <span className="text-[9px] font-black uppercase tracking-widest text-accent-ink bg-accent-soft px-1 py-0.5 rounded" title="Account Owner">AC</span>
            </div>
            <div className="text-[11px] text-text-3 truncate">{primary.email}</div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function QuickTasksPanel({ accountId }: { accountId: string }) {
  const [text, setText] = useState('');
  const log = useLogActivity(accountId);
  return (
    <Panel title="Tasks" hint="0 open">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Quick task…"
          className="flex-1 h-8 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] outline-none focus:border-accent-strong"
        />
        <button
          onClick={() => { const t = text.trim(); if (!t) return; log.mutate({ type: 'task', title: t }, { onSuccess: () => setText('') }); }}
          className="h-8 px-3 rounded-lg bg-cg-900 text-white text-[12px] font-bold hover:bg-cg-800"
        >Add</button>
      </div>
      <div className="mt-3 border border-dashed border-border rounded-xl p-6 text-center text-[12px] text-text-3">
        No open tasks
      </div>
    </Panel>
  );
}

function AttributionPanel({ tracking, loading }: { tracking: import('@/hooks/useMarketingTracking').MarketingTracking | null; loading: boolean }) {
  return (
    <>
      <Panel title="Attribution" icon={<Sparkles size={13} />}>
        <Row k="Source" v={tracking?.first_source || tracking?.last_source || '—'} />
        <Row k="Medium" v={tracking?.first_medium || tracking?.last_medium || '(none)'} />
        <Row k="Campaign" v={tracking?.first_campaign || tracking?.last_campaign || '—'} />
        <Row k="Joined at" v={fmtDate(tracking?.first_date)} />
      </Panel>

      <Panel title="Marketing tracking" hint={tracking?.touch_count ? `${tracking.touch_count} touch${tracking.touch_count === 1 ? '' : 'es'}` : '—'}>
        {loading && <div className="text-[12px] text-text-3">Loading…</div>}
        {!loading && !tracking && <div className="text-[12px] text-text-3">No tracking data.</div>}
        {tracking && (
          <div className="space-y-3">
            <div className="border border-border rounded-xl p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-text-3">First touch</div>
              <div className="text-[13px] font-bold text-text mt-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-info" />
                {tracking.first_source || '(direct)'}
              </div>
              <div className="text-[11px] text-text-3">{tracking.first_medium || '(none)'}</div>
              <div className="text-[11px] text-text-4 mt-1">{fmtDate(tracking.first_date)}</div>
            </div>
            {tracking.device_type && (
              <div className="border border-border rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-3">Device</div>
                <div className="text-[13px] font-bold text-text mt-1">{tracking.device_type}</div>
              </div>
            )}
            {tracking.first_landing_page && (
              <div className="border border-border rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-3">First landing page</div>
                <div className="text-[12px] font-mono text-accent-ink mt-1 break-all">{tracking.first_landing_page}</div>
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <div className="text-[11.5px] text-text-3">{k}</div>
      <div className="text-[12.5px] font-bold text-text text-right truncate max-w-[180px]" title={typeof v === 'string' ? v : undefined}>{v}</div>
    </div>
  );
}

function Panel({ title, hint, icon, action, children }: { title: string; hint?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 p-5">
      <div className="flex items-center gap-1.5 mb-3">
        {icon && <span className="text-text-3">{icon}</span>}
        <span className="text-[10px] font-black uppercase tracking-widest text-text-3">{title}</span>
        <div className="flex-1" />
        {hint && <span className="text-[11px] text-text-3">{hint}</span>}
        {action}
      </div>
      {children}
    </div>
  );
}

function ActivityFeed({ activities, loading }: { activities: import('@/hooks/useAccountDetail').Activity[]; loading: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      {loading && <div className="text-[12.5px] text-text-3">Loading…</div>}
      {!loading && activities.length === 0 && <div className="py-8 text-center text-[12.5px] text-text-3">No activity yet.</div>}
      <ol className="space-y-3">
        {activities.map((a) => (
          <li key={a.id} className="border-l-2 border-border pl-3 pb-2">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-bold uppercase text-accent-ink bg-accent-soft px-1.5 py-0.5 rounded">{a.type}</span>
              <span className="ml-auto text-text-4">{fmtDate(a.created_at)}</span>
            </div>
            {a.title && <div className="mt-1 text-[13px] font-bold text-text">{a.title}</div>}
            {a.text && <div className="mt-0.5 text-[12.5px] text-text-2 whitespace-pre-wrap">{a.text}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function NotFound() {
  return (
    <div className="p-6">
      <div className="bg-warn-bg border border-warn/30 text-warn rounded-xl p-4 text-[13px]">
        Company not found. <Link to="/companies" className="underline">Back</Link>
      </div>
    </div>
  );
}
