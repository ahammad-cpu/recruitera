import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, Mail, FileText, Trash2,
  X, Pencil, Globe, Phone as PhoneIcon, Plus, Sparkles,
} from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useContacts, useActivities } from '@/hooks/useAccountDetail';
import { useLogActivity, useToggleTaskDone } from '@/hooks/useActivityMutations';
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
            <AccountTeamPanel primary={owner} csEmail={lead.cs_email} profiles={profiles.data ?? []} />
            <QuickTasksPanel accountId={lead.id} activities={activities ?? []} />
            <AttributionPanel tracking={marketing.data ?? null} loading={marketing.isLoading} />
          </aside>
        </div>
      )}

      {tab === 'activity' && <ActivityFeed activities={activities ?? []} profiles={profiles.data ?? []} loading={loadingActs} />}
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

  // Sync form once contact arrives from the query. Don't clobber unsaved edits.
  useEffect(() => {
    if (editing) return;
    setForm({
      full_name: contact?.full_name ?? '',
      job_title: contact?.job_title ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
    });
  }, [contact?.id, contact?.full_name, contact?.job_title, contact?.email, contact?.phone, editing]);

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
  const profiles = useProfiles();
  const profileList = profiles.data ?? [];
  const profileById = useMemo(() => {
    const m = new Map<string, import('@/hooks/useUsersData').Profile>();
    profileList.forEach((p) => m.set(p.id, p));
    return m;
  }, [profileList]);

  const [type, setType] = useState<'call' | 'email' | 'whatsapp' | 'note'>('call');
  const [text, setText] = useState('');
  const [mention, setMention] = useState<{ query: string; start: number; idx: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const log = useLogActivity(accountId);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return profileList
      .filter((p) => (p.full_name || p.email || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, profileList]);

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    // find `@word` ending at caret with no whitespace between @ and caret
    const before = v.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}\p{N}._-]*)$/u);
    if (m) {
      setMention({ query: m[2], start: caret - m[2].length - 1, idx: 0 });
    } else {
      setMention(null);
    }
  }

  function insertMention(p: import('@/hooks/useUsersData').Profile) {
    if (!mention) return;
    const name = (p.full_name || p.email || '').replace(/\s+/g, ' ');
    const insert = `@${name} `;
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    const next = before + insert + after;
    setText(next);
    setMention(null);
    // restore caret after the inserted mention
    requestAnimationFrame(() => {
      const pos = (before + insert).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMention({ ...mention, idx: (mention.idx + 1) % mentionMatches.length }); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMention({ ...mention, idx: (mention.idx - 1 + mentionMatches.length) % mentionMatches.length }); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mention.idx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setMention(null); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
  }

  function submit() {
    const t = text.trim();
    if (!t) return;
    log.mutate({ type, text: t }, { onSuccess: () => setText('') });
  }

  const filtered = activities.filter((a) => ['note', 'call', 'email', 'whatsapp', 'meeting'].includes(a.type));

  const CHANNELS: { id: 'call' | 'email' | 'whatsapp'; label: string; Icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'call',     label: 'Call',     Icon: PhoneIcon },
    { id: 'email',    label: 'Email',    Icon: Mail },
    { id: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  ];

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
      <div className="text-[10px] font-black tracking-[0.14em] uppercase text-text-4 mb-1">Notes</div>
      <div className="text-[20px] font-black tracking-tight text-text mb-4">Internal notes</div>

      {/* Composer */}
      <div className="bg-surface-2/60 border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2">
          {CHANNELS.map(({ id, label, Icon }) => {
            const active = type === id;
            return (
              <button
                key={id}
                onClick={() => setType(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-bold border transition-colors',
                  active
                    ? 'bg-accent-soft text-accent-ink border-accent-strong'
                    : 'bg-surface text-text-2 border-border hover:border-border-2',
                )}
              >
                <Icon size={13} /> {label}
              </button>
            );
          })}
        </div>

        <div className="relative mt-3">
          <textarea
            ref={taRef}
            value={text}
            onChange={onTextChange}
            onKeyDown={onKeyDown}
            rows={5}
            placeholder="What happened? Use @ to mention or @name/task to assign…"
            className="w-full bg-surface border border-border rounded-xl p-4 text-[14px] text-text placeholder:text-text-3 outline-none focus:border-accent-strong resize-vertical min-h-[130px]"
          />
          {mention && mentionMatches.length > 0 && (
            <div className="absolute left-3 top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-sh3 w-[280px] overflow-hidden">
              {mentionMatches.map((p, i) => (
                <button
                  key={p.id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(p); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px]',
                    i === mention.idx ? 'bg-accent-soft' : 'hover:bg-surface-2',
                  )}
                >
                  <OwnerAvatar profile={p} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-text truncate">{p.full_name || p.email}</div>
                    {p.full_name && p.email && <div className="text-[11px] text-text-3 truncate">{p.email}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end mt-3">
          <button
            onClick={submit}
            disabled={!text.trim() || log.isPending}
            className="h-11 px-6 rounded-xl bg-accent text-cg-900 text-[14px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
          >
            {log.isPending ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </div>

      {/* List */}
      {loading && <div className="mt-4 text-[12px] text-text-3">Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div className="mt-4 py-10 text-center text-[12.5px] text-text-3 border border-dashed border-border rounded-xl">
          No notes yet — write one above
        </div>
      )}
      {filtered.length > 0 && (
        <div className="mt-4 space-y-3">
          {filtered.slice(0, 30).map((a) => (
            <NoteItem key={a.id} activity={a} author={a.author_id ? profileById.get(a.author_id) : undefined} profiles={profileList} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteItem({
  activity, author, profiles,
}: {
  activity: import('@/hooks/useAccountDetail').Activity;
  author: import('@/hooks/useUsersData').Profile | undefined;
  profiles: import('@/hooks/useUsersData').Profile[];
}) {
  const name = author?.full_name || author?.email || 'Someone';
  const chip = channelChip(activity.type);
  return (
    <div className="border border-border rounded-xl p-4 flex gap-3">
      <OwnerAvatar profile={author} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-text text-[14px]">{name}</span>
          <span className={cn('inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-black uppercase tracking-wider', chip.cls)}>
            {chip.label}
          </span>
          <span className="text-[12px] text-text-3">{fmtRelative(activity.created_at)}</span>
        </div>
        {activity.text && (
          <div className="mt-1.5 text-[13.5px] text-text-2 whitespace-pre-wrap leading-relaxed">
            {renderWithMentions(activity.text, profiles)}
          </div>
        )}
      </div>
    </div>
  );
}

function channelChip(t: string): { label: string; cls: string } {
  switch (t) {
    case 'call':     return { label: 'Call',     cls: 'bg-info-bg text-info' };
    case 'email':    return { label: 'Email',    cls: 'bg-surface-2 text-text-2 border border-border' };
    case 'whatsapp': return { label: 'WhatsApp', cls: 'bg-ok-bg text-ok' };
    case 'meeting':  return { label: 'Meeting',  cls: 'bg-warn-bg text-warn' };
    default:         return { label: 'Note',     cls: 'bg-accent-soft text-accent-ink' };
  }
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 45) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const hrs = Math.floor(diffMin / 60);
  const rem = diffMin % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

function renderWithMentions(text: string, profiles: import('@/hooks/useUsersData').Profile[]): React.ReactNode {
  // Build a lookup of lowercased names, longest first so "Nour Adel Kamal" wins over "Nour Adel"
  const names = profiles
    .map((p) => (p.full_name || p.email || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`@(${escaped})`, 'gi');
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index));
    out.push(
      <span key={m.index} className="font-bold text-accent-ink bg-accent-soft px-1 rounded">
        @{m[1]}
      </span>,
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx));
  return out.length ? out : text;
}

/* ---------- RIGHT RAIL ---------- */

function AccountTeamPanel({
  primary, csEmail, profiles,
}: {
  primary: import('@/hooks/useUsersData').Profile | undefined;
  csEmail: string | null;
  profiles: import('@/hooks/useUsersData').Profile[];
}) {
  const cs = csEmail ? profiles.find((p) => p.email?.toLowerCase() === csEmail.toLowerCase()) : undefined;
  return (
    <Panel title="Account team">
      {!primary && !csEmail && <div className="text-[12px] text-text-3">Unassigned.</div>}
      <div className="space-y-3">
        {primary && <TeamRow profile={primary} role="AC" roleTitle="Account Consultant" />}
        {csEmail && <TeamRow profile={cs} fallbackEmail={csEmail} role="CS" roleTitle="Customer Success" />}
      </div>
    </Panel>
  );
}

function TeamRow({
  profile, fallbackEmail, role, roleTitle,
}: {
  profile: import('@/hooks/useUsersData').Profile | undefined;
  fallbackEmail?: string;
  role: 'AC' | 'CS';
  roleTitle: string;
}) {
  const name = profile?.full_name || profile?.email || fallbackEmail || '—';
  const email = profile?.email || fallbackEmail || '';
  return (
    <div className="flex items-center gap-3">
      <OwnerAvatar profile={profile} size={36} fallback={fallbackEmail} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-extrabold text-text truncate flex items-center gap-1.5">
          {name}
          <span
            className="text-[9px] font-black uppercase tracking-widest text-accent-ink bg-accent-soft px-1 py-0.5 rounded"
            title={roleTitle}
          >{role}</span>
        </div>
        {email && <div className="text-[11px] text-text-3 truncate">{email}</div>}
      </div>
    </div>
  );
}

function QuickTasksPanel({
  accountId, activities,
}: {
  accountId: string;
  activities: import('@/hooks/useAccountDetail').Activity[];
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'Quick' | 'Call' | 'Email' | 'Follow-up'>('Quick');
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const log = useLogActivity(accountId);
  const toggle = useToggleTaskDone();

  const tasks = activities.filter((a) => a.type === 'task');
  const openTasks = tasks.filter((t) => !t.task_done);
  const doneTasks = tasks.filter((t) => t.task_done);
  const list = view === 'todo' ? openTasks : doneTasks;

  function add() {
    const t = text.trim();
    if (!t) return;
    const title = kind === 'Quick' ? t : `[${kind}] ${t}`;
    log.mutate({ type: 'task', title }, { onSuccess: () => setText('') });
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      <div className="text-[10px] font-black tracking-[0.14em] uppercase text-accent-ink mb-1">Tasks</div>
      <div className="text-[22px] font-black tracking-tight text-text mb-3">
        {openTasks.length} <span className="text-text-3 font-black">open</span>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center bg-surface-2 border border-border rounded-full p-1 mb-3">
        <TaskTab active={view === 'todo'} onClick={() => setView('todo')} label={`To do · ${openTasks.length}`} />
        <TaskTab active={view === 'done'} onClick={() => setView('done')} label={`Done · ${doneTasks.length}`} />
      </div>

      {/* Composer */}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        placeholder="Quick task…"
        className="w-full h-11 px-3.5 border border-border-2 rounded-xl bg-surface text-[13px] text-text placeholder:text-text-3 outline-none focus:border-accent-strong mb-2"
      />
      <div className="flex items-center gap-2 mb-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="flex-1 h-11 px-3.5 border border-border-2 rounded-xl bg-surface text-[13px] font-semibold text-text outline-none focus:border-accent-strong"
        >
          <option>Quick</option>
          <option>Call</option>
          <option>Email</option>
          <option>Follow-up</option>
        </select>
        <button
          onClick={add}
          disabled={!text.trim() || log.isPending}
          className="h-11 px-6 rounded-xl bg-accent text-cg-900 text-[13.5px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
        >
          {log.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="mt-1 border border-dashed border-border rounded-xl p-5 text-center text-[12px] text-text-3">
          {view === 'todo' ? 'No open tasks' : 'No completed tasks'}
        </div>
      ) : (
        <div className="space-y-2 mt-1">
          {list.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() => toggle.mutate({ id: t.id, done: !t.task_done })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-4 rounded-full text-[12.5px] font-bold transition-colors',
        active ? 'bg-surface text-text shadow-sh1' : 'text-text-3 hover:text-text-2',
      )}
    >
      {label}
    </button>
  );
}

function TaskRow({
  task, onToggle,
}: {
  task: import('@/hooks/useAccountDetail').Activity;
  onToggle: () => void;
}) {
  const done = !!task.task_done;
  return (
    <label className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-surface-2/70 border border-border cursor-pointer hover:border-border-2 transition-colors">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        className="w-[18px] h-[18px] rounded border-2 border-border-2 accent-accent cursor-pointer flex-shrink-0"
      />
      <span className={cn('text-[13.5px] flex-1 min-w-0 truncate', done ? 'line-through text-text-3' : 'font-bold text-text')}>
        {task.title || task.text || 'Untitled task'}
      </span>
    </label>
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

function ActivityFeed({
  activities, profiles, loading,
}: {
  activities: import('@/hooks/useAccountDetail').Activity[];
  profiles: import('@/hooks/useUsersData').Profile[];
  loading: boolean;
}) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1">
      {loading && <div className="text-[12.5px] text-text-3">Loading…</div>}
      {!loading && activities.length === 0 && (
        <div className="py-8 text-center text-[12.5px] text-text-3">No activity yet.</div>
      )}
      <div className="space-y-3">
        {activities.map((a) => (
          <ActivityRow
            key={a.id}
            activity={a}
            author={a.author_id ? byId.get(a.author_id) : undefined}
            profiles={profiles}
          />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({
  activity, author, profiles,
}: {
  activity: import('@/hooks/useAccountDetail').Activity;
  author: import('@/hooks/useUsersData').Profile | undefined;
  profiles: import('@/hooks/useUsersData').Profile[];
}) {
  const name = author?.full_name || author?.email || 'System';
  const chip = channelChip(activity.type);
  return (
    <div className="border border-border rounded-xl p-4 flex gap-3">
      <OwnerAvatar profile={author} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-text text-[14px]">{name}</span>
          <span className={cn('inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-black uppercase tracking-wider', chip.cls)}>
            {chip.label}
          </span>
          <span className="text-[12px] text-text-3">{fmtRelative(activity.created_at)}</span>
        </div>
        {activity.title && (
          <div className="mt-1.5 text-[13.5px] font-bold text-text">
            {renderWithMentions(activity.title, profiles)}
          </div>
        )}
        {activity.text && (
          <div className="mt-1 text-[13.5px] text-text-2 whitespace-pre-wrap leading-relaxed">
            {renderWithMentions(activity.text, profiles)}
          </div>
        )}
      </div>
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
