import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageCircle, Mail, FileText, Trash2,
  X, Pencil, Globe, Phone as PhoneIcon, Plus, Sparkles, Clock,
} from 'lucide-react';
import { useAccounts, isPaid, type Account } from '@/hooks/useAccounts';
import { useContacts, useActivities } from '@/hooks/useAccountDetail';
import { useLogActivity, useToggleTaskDone, useUpdateActivity, useDeleteActivity } from '@/hooks/useActivityMutations';
import { useMarketingTracking } from '@/hooks/useMarketingTracking';
import { useAccountAttribution } from '@/hooks/useAccountAttribution';
import { useUpsertContact } from '@/hooks/useContactMutations';
import { useDealsForCompany } from '@/hooks/useDeals';
import { useRenameAccount, useChangeStage, useChangeOwner, useUpdateAccountDetails } from '@/hooks/useAccountMutations';
import { OwnerPickerPopover } from '@/components/shared/OwnerPickerPopover';
import { TagPickerPopover } from '@/components/shared/TagPickerPopover';
import { LossModal } from '@/features/companies/LossModal';
import { DeleteAccountModal } from '@/features/companies/DeleteAccountModal';
import { useMe } from '@/hooks/useMe';
import { useTags, useAccountTags, useAttachTag, useDetachTag, useCreateTag } from '@/hooks/useTags';
import { useProfiles } from '@/hooks/useUsersData';
import { useEnum } from '@/hooks/useEnum';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { StagePill } from '@/components/shared/StagePill';
import { fmtDate, fmtEgp, initials, toEgp } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PlansTab } from './PlansTab';
import { TeamTab } from './TeamTab';
import { DocumentsTab } from './DocumentsTab';
import { DealsSection } from './DealsSection';

type Tab = 'overview' | 'activity' | 'plans' | 'team' | 'documents';

export default function CompanyProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: accounts, isLoading: loadingAccts } = useAccounts();
  const { data: contacts, isLoading: loadingContacts } = useContacts(id);
  const { data: activities, isLoading: loadingActs } = useActivities(id);
  const marketing = useMarketingTracking(id);
  const attribution = useAccountAttribution(id);
  const deals = useDealsForCompany(id);
  const profiles = useProfiles();
  const stagesEnum = useEnum('pipeline_stage');
  const rename = useRenameAccount();
  const changeStage = useChangeStage();
  const me = useMe();
  const isAdmin = me.data?.role === 'admin';
  const allTags = useTags();
  const acctTags = useAccountTags(id);
  const attachTag = useAttachTag(id);
  const detachTag = useDetachTag(id);
  const createTag = useCreateTag();
  const [tagOpen, setTagOpen] = useState(false);
  const [disqOpen, setDisqOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

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
            {renaming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = nameDraft.trim();
                  if (next && next !== lead.name) rename.mutate({ id: lead.id, name: next });
                  setRenaming(false);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(false); }}
                  className="text-[26px] font-black tracking-tight text-text bg-surface-2 border-2 border-accent rounded-lg px-2 py-0.5 outline-none flex-1 min-w-0"
                />
                <button type="submit" className="h-9 px-3 rounded-lg bg-accent text-cg-900 text-[12.5px] font-black border border-accent-strong">Save</button>
                <button type="button" onClick={() => setRenaming(false)} className="h-9 px-3 rounded-lg border border-border text-text-2 text-[12.5px] font-bold">Cancel</button>
              </form>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[26px] font-black tracking-tight text-text truncate">{name}</h1>
                <button
                  onClick={() => { setNameDraft(lead.name || ''); setRenaming(true); }}
                  className="p-1 rounded-md text-text-3 hover:bg-surface-2 hover:text-text"
                  title="Rename company"
                  aria-label="Rename company"
                ><Pencil size={14} /></button>
              </div>
            )}
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
            {isAdmin && (
              <button
                onClick={() => setDeleteOpen(true)}
                className="h-9 w-9 rounded-lg border border-bad/40 bg-bad-bg text-bad hover:bg-bad hover:text-white flex items-center justify-center"
                title="Delete company (admin only) — permanent"
                aria-label="Delete company"
              ><Trash2 size={14} /></button>
            )}
          </div>
        </div>

        {/* TAGS + DISQUALIFY ROW */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setTagOpen((v) => !v)}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border-2 text-[11.5px] font-bold text-text-3 hover:border-accent-strong hover:text-accent-ink"
            >
              <Plus size={11} /> Add tag
            </button>
            {tagOpen && (
              <TagPickerPopover
                allTags={allTags.data ?? []}
                attachedIds={new Set((acctTags.data ?? []).map((t) => t.id))}
                onAttach={(tid) => attachTag.mutate(tid)}
                onDetach={(tid) => detachTag.mutate(tid)}
                onCreate={(label) => createTag.mutateAsync(label)}
                onClose={() => setTagOpen(false)}
              />
            )}
          </div>

          {(acctTags.data ?? []).map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full bg-accent-soft text-accent-ink text-[11.5px] font-bold border border-accent-strong/40"
              style={t.color ? { background: `${t.color}22`, color: t.color, borderColor: `${t.color}55` } : undefined}
            >
              {t.label}
              <button
                onClick={() => detachTag.mutate(t.id)}
                className="w-4 h-4 grid place-items-center rounded-full hover:bg-black/10"
                title="Remove tag"
              ><X size={10} /></button>
            </span>
          ))}

          {(lead.stage || '').toLowerCase() === 'lead' && (
            <button
              onClick={() => setDisqOpen(true)}
              className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-bad/30 bg-bad-bg text-bad text-[12px] font-bold hover:bg-bad/10"
              title="Only available while the company is still a Lead"
            ><X size={12} /> Lose</button>
          )}
        </div>

        {disqOpen && <LossModal account={lead} onClose={() => setDisqOpen(false)} />}
        {deleteOpen && <DeleteAccountModal account={lead} onClose={() => setDeleteOpen(false)} />}

        {/* STAT STRIP */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label="Deal value" value={lead.deal_value ? fmtEgp(toEgp(lead.deal_value, lead.deal_currency)) : '—'} hint={lead.deal_value ? '' : 'not set'} />
          <OwnerStat lead={lead} owner={owner} profiles={profiles.data ?? []} />
          <Stat
            label="Trial"
            value={lead.has_trial ? (lead.activation_status || 'Active') : 'None'}
            valueClass={lead.has_trial && lead.activation_status === 'Active' ? 'text-ok' : undefined}
            hint={lead.has_trial ? 'free trial running' : 'no trial'}
          />
          <Stat label="Created" value={fmtDate(lead.created_at)} hint={isPaid(lead) ? 'active customer' : 'no close date'} />
          <StageStat
            lead={lead}
            stages={stagesEnum.data ?? []}
            hasLiveDeal={(deals.data ?? []).some((d) => !d.is_archived)}
            onChange={(stage) => changeStage.mutate({ id: lead.id, stage })}
          />
        </div>
      </div>

      {/* TABS */}
      <div role="tablist" aria-label="Company sections" className="flex items-center gap-6 border-b border-border">
        {(['overview', 'activity', 'plans', 'team', 'documents'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            id={`tab-${t}`}
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
            <CompanyDetailsPanel lead={lead} attr={attribution.data ?? null} isAdmin={isAdmin} />
            <DealsSection accountId={lead.id} />
            <QuickTasksPanel accountId={lead.id} activities={activities ?? []} />
            <AttributionPanel
              tracking={marketing.data ?? null}
              attr={attribution.data ?? null}
              loading={marketing.isLoading || attribution.isLoading}
            />
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

function Stat({ label, value, hint, truncate, valueClass }: { label: string; value: React.ReactNode; hint?: string; truncate?: boolean; valueClass?: string }) {
  return (
    <div className="bg-surface-2/60 rounded-xl p-3.5">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className={cn('mt-1 text-[16px] font-extrabold tracking-tight', valueClass ?? 'text-text', truncate && 'truncate')} title={typeof value === 'string' ? value : undefined}>
        {value || '—'}
      </div>
      {hint && <div className="text-[11px] text-text-3 mt-1">{hint}</div>}
    </div>
  );
}

function OwnerStat({
  lead, owner, profiles,
}: {
  lead: Account;
  owner: import('@/hooks/useUsersData').Profile | undefined;
  profiles: import('@/hooks/useUsersData').Profile[];
}) {
  const [open, setOpen] = useState(false);
  const changeOwner = useChangeOwner();
  const label = owner?.full_name || lead.am_mail || 'Unassigned';
  return (
    <div className="bg-surface-2/60 rounded-xl p-3.5 relative">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">Owner</div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 w-full flex items-center gap-2 text-left rounded-md hover:bg-surface-2 -mx-1 px-1 py-0.5 transition-colors"
        title="Change owner"
      >
        <OwnerAvatar profile={owner} size={24} fallback={lead.am_mail ?? undefined} />
        <span className="text-[16px] font-extrabold tracking-tight truncate text-text flex-1 min-w-0">
          {label}
        </span>
      </button>
      {owner?.email && <div className="text-[11px] text-text-3 mt-1 truncate">{owner.email}</div>}
      {open && (
        <OwnerPickerPopover
          profiles={profiles}
          currentId={lead.owner_id}
          onSelect={(p) => {
            changeOwner.mutate({ id: lead.id, owner_id: p?.id ?? null, am_mail: p?.email ?? null });
          }}
          onClose={() => setOpen(false)}
          placement="bottom"
          align="left"
        />
      )}
    </div>
  );
}

function StageStat({ lead, stages, hasLiveDeal, onChange }: { lead: Account; stages: string[]; hasLiveDeal: boolean; onChange: (s: string) => void }) {
  const current = (lead.stage || 'lead').toLowerCase();
  // Once a real deal exists, its stage is what's authoritative — a DB
  // trigger mirrors deals.stage -> accounts.stage on every deal change.
  // Editing accounts.stage manually here would silently desync from the
  // deal on the next deal update (this happened in production: an account
  // got hand-set back to "lead" while its deal was still at MQL). So once
  // a live deal exists, stage is read-only here and only changes via the
  // Deals panel / pipeline board.
  return (
    <div className="bg-surface-2/60 rounded-xl p-3.5">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">Stage</div>
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <StagePill stage={lead.stage} />
        {!hasLiveDeal && current === 'lead' && (
          <span className="text-[11px] text-text-3 font-semibold">
            No deal yet — create one to set a stage
          </span>
        )}
        {hasLiveDeal && (
          <span className="text-[11px] text-text-3 font-semibold">
            Follows the deal below
          </span>
        )}
        {!hasLiveDeal && current !== 'lead' && (
          <select
            value={current}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 pl-2 pr-6 border border-border rounded-md bg-surface text-[11px] font-bold outline-none"
            aria-label="Change stage"
          >
            {stages.filter((s) => s !== 'lead').map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </select>
        )}
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
    // The composer only highlights @mentions visually — resolve them here
    // against the loaded profile list so the DB mention trigger (which reads
    // activities.mentions, not the raw text) actually fires and emails the
    // right people.
    const lower = t.toLowerCase();
    const handles = new Set<string>();
    for (const p of profileList) {
      const prefix = (p.email || '').split('@')[0].toLowerCase();
      const fullName = (p.full_name || '').toLowerCase();
      if (prefix && lower.includes(`@${prefix}`)) handles.add(prefix);
      else if (fullName && lower.includes(`@${fullName}`)) handles.add(prefix || fullName.replace(/\s+/g, ''));
    }
    log.mutate({ type, text: t, mentions: [...handles] }, { onSuccess: () => setText('') });
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
            <NoteItem
              key={a.id}
              accountId={accountId}
              activity={a}
              author={a.author_id ? profileById.get(a.author_id) : undefined}
              profiles={profileList}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteItem({
  accountId, activity, author, profiles,
}: {
  accountId: string;
  activity: import('@/hooks/useAccountDetail').Activity;
  author: import('@/hooks/useUsersData').Profile | undefined;
  profiles: import('@/hooks/useUsersData').Profile[];
}) {
  const me = useMe();
  const isMine = me.data?.id && activity.author_id === me.data.id;
  const canEdit = !!isMine;
  const canDelete = !!isMine || me.data?.role === 'admin';

  const update = useUpdateActivity(accountId);
  const del = useDeleteActivity(accountId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(activity.text || '');

  const name = author?.full_name || author?.email || 'Someone';
  const chip = channelChip(activity.type);

  function save() {
    const next = draft.trim();
    if (!next) return;
    if (next === (activity.text || '').trim()) { setEditing(false); return; }
    update.mutate({ id: activity.id, text: next }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="border border-border rounded-xl p-4 flex gap-3 group">
      <OwnerAvatar profile={author} size={40} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-text text-[14px]">{name}</span>
          <span className={cn('inline-flex items-center h-[22px] px-2.5 rounded-full text-[11px] font-black uppercase tracking-wider', chip.cls)}>
            {chip.label}
          </span>
          <span className="text-[12px] text-text-3">{fmtRelative(activity.created_at)}</span>
          {(canEdit || canDelete) && !editing && (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  onClick={() => { setDraft(activity.text || ''); setEditing(true); }}
                  className="text-[11px] font-bold text-text-3 hover:text-accent-ink px-1.5 py-0.5 rounded"
                >Edit</button>
              )}
              {canDelete && (
                <button
                  onClick={() => { if (confirm('Delete this note?')) del.mutate(activity.id); }}
                  className="text-[11px] font-bold text-text-3 hover:text-bad px-1.5 py-0.5 rounded"
                >Delete</button>
              )}
            </div>
          )}
        </div>
        {!editing && activity.text && (
          <div className="mt-1.5 text-[13.5px] text-text-2 whitespace-pre-wrap leading-relaxed">
            {renderWithMentions(activity.text, profiles)}
          </div>
        )}
        {editing && (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
                if (e.key === 'Escape') setEditing(false);
              }}
              rows={3}
              className="w-full bg-surface border border-border rounded-lg p-2.5 text-[13px] text-text outline-none focus:border-accent-strong resize-vertical"
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                onClick={() => setEditing(false)}
                className="h-8 px-3 rounded-lg border border-border text-text-2 text-[12px] font-bold"
              >Cancel</button>
              <button
                onClick={save}
                disabled={!draft.trim() || update.isPending}
                className="h-8 px-3.5 rounded-lg bg-accent text-cg-900 text-[12px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
              >{update.isPending ? 'Saving…' : 'Save'}</button>
            </div>
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

const COMPANY_SIZES = ['5-25', '25-50', '50-100', '100-500', '500-1000', '1000+'] as const;

function CompanyDetailsPanel({
  lead, attr, isAdmin,
}: {
  lead: Account;
  attr: import('@/hooks/useAccountAttribution').AccountAttribution | null;
  isAdmin: boolean;
}) {
  const update = useUpdateAccountDetails();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    industry: attr?.industry ?? '',
    size: attr?.size ?? '',
    domain: lead.domain ?? '',
  });

  useEffect(() => {
    if (editing) return;
    setForm({ industry: attr?.industry ?? '', size: attr?.size ?? '', domain: lead.domain ?? '' });
  }, [attr?.industry, attr?.size, lead.domain, editing]);

  function save() {
    update.mutate(
      {
        id: lead.id,
        industry: form.industry.trim() || null,
        size: form.size || null,
        domain: form.domain.trim().toLowerCase() || null,
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <Panel
      title="Company details"
      action={
        isAdmin && !editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-text-3 hover:text-text p-1 rounded-md hover:bg-surface-2"
            aria-label="Edit company details"
            title="Edit (admin only)"
          ><Pencil size={13} /></button>
        ) : null
      }
    >
      {!editing && (
        <>
          <Row k="Industry"     v={attr?.industry || '—'} />
          <Row k="Company size" v={attr?.size || '—'} />
          <Row k="Domain"       v={lead.domain || '—'} />
          <LeadFormRows lf={attr?.lead_form ?? null} />
        </>
      )}
      {editing && (
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Industry</span>
            <input
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              placeholder="e.g. Construction"
              className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Company size</span>
            <select
              value={form.size}
              onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
              className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            >
              <option value="">—</option>
              {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Domain</span>
            <input
              value={form.domain}
              onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
              placeholder="company.com"
              className="mt-1 w-full h-9 px-3 border border-border-2 rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="h-8 px-3 rounded-lg border border-border text-text-2 text-[12px] font-bold">Cancel</button>
            <button
              onClick={save}
              disabled={update.isPending}
              className="h-8 px-4 rounded-lg bg-accent text-cg-900 text-[12px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
            >{update.isPending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Lead-form answers captured at signup (Meta Lead Ads or Bubble webform).
 * Both sources normalize into raw_data.lead_form; useAccountAttribution lifts
 * that to attr.lead_form. Renders nothing when no fields are present.
 */
function LeadFormRows({ lf }: { lf: import('@/hooks/useAccountAttribution').LeadForm | null }) {
  if (!lf || (!lf.headcount && !lf.vacancies && !lf.challenge)) return null;
  // Meta Lead Ads return option-picker values as snake_case tokens
  // (e.g. "sourcing_candidates_from_multiple_channels_at_once"). Humanize.
  const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <>
      {lf.headcount && <Row k="Current headcount" v={lf.headcount} />}
      {lf.vacancies && <Row k="Vacancies (12 mo)" v={lf.vacancies} />}
      {lf.challenge && <Row k="Biggest challenge" v={humanize(lf.challenge)} wrap />}
    </>
  );
}

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
  const profiles = useProfiles();
  const profileList = profiles.data ?? [];
  const profileById = useMemo(() => {
    const m = new Map<string, import('@/hooks/useUsersData').Profile>();
    profileList.forEach((p) => m.set(p.id, p));
    return m;
  }, [profileList]);

  const [text, setText] = useState('');
  const [kind, setKind] = useState<'Quick' | 'Call' | 'Email' | 'Follow-up'>('Quick');
  const [due, setDue] = useState<string>('');
  const [assignee, setAssignee] = useState<string>('');
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const log = useLogActivity(accountId);
  const toggle = useToggleTaskDone();

  const tasks = activities.filter((a) => a.type === 'task' && !a.parent_id);
  const repliesByParent = useMemo(() => {
    const m = new Map<string, import('@/hooks/useAccountDetail').Activity[]>();
    activities
      .filter((a) => a.parent_id)
      .forEach((a) => {
        const arr = m.get(a.parent_id!) ?? [];
        arr.push(a);
        m.set(a.parent_id!, arr);
      });
    // oldest first
    m.forEach((arr) => arr.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return m;
  }, [activities]);

  const openTasks = tasks.filter((t) => !t.task_done);
  const doneTasks = tasks.filter((t) => t.task_done);
  const list = view === 'todo' ? openTasks : doneTasks;

  function add() {
    const t = text.trim();
    if (!t) return;
    const title = kind === 'Quick' ? t : `[${kind}] ${t}`;
    log.mutate(
      { type: 'task', title, task_due_date: due || null, assigned_to: assignee || null },
      {
        onSuccess: () => {
          setText('');
          setDue('');
          setAssignee('');
        },
      },
    );
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
      <div className="grid grid-cols-2 gap-2 mb-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="h-10 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] font-semibold text-text outline-none focus:border-accent-strong"
        >
          <option>Quick</option>
          <option>Call</option>
          <option>Email</option>
          <option>Follow-up</option>
        </select>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="h-10 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] text-text outline-none focus:border-accent-strong"
        />
      </div>
      <div className="flex items-center gap-2 mb-3">
        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          className="flex-1 h-10 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] font-semibold text-text outline-none focus:border-accent-strong"
        >
          <option value="">Assign to…</option>
          {profileList.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={!text.trim() || log.isPending}
          className="h-10 px-6 rounded-lg bg-accent text-cg-900 text-[13px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
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
              accountId={accountId}
              task={t}
              assignee={t.assigned_to ? profileById.get(t.assigned_to) : undefined}
              replies={repliesByParent.get(t.id) ?? []}
              profileById={profileById}
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
  accountId, task, assignee, replies, profileById, onToggle,
}: {
  accountId: string;
  task: import('@/hooks/useAccountDetail').Activity;
  assignee: import('@/hooks/useUsersData').Profile | undefined;
  replies: import('@/hooks/useAccountDetail').Activity[];
  profileById: Map<string, import('@/hooks/useUsersData').Profile>;
  onToggle: () => void;
}) {
  const done = !!task.task_done;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const log = useLogActivity(accountId);

  function sendReply() {
    const t = replyText.trim();
    if (!t) return;
    log.mutate(
      { type: 'task', text: t, parent_id: task.id },
      { onSuccess: () => { setReplyText(''); setReplyOpen(false); } },
    );
  }

  const dueClass = (() => {
    if (!task.task_due_date) return '';
    const today = new Date().toISOString().slice(0, 10);
    if (task.task_due_date < today && !done) return 'bg-bad-bg text-bad';
    if (task.task_due_date === today) return 'bg-warn-bg text-warn';
    return 'bg-surface-2 text-text-2 border border-border';
  })();

  return (
    <div className="rounded-xl bg-surface-2/70 border border-border hover:border-border-2 transition-colors">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="mt-0.5 w-[18px] h-[18px] rounded border-2 border-border-2 accent-accent cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className={cn('text-[13.5px] break-words', done ? 'line-through text-text-3' : 'font-bold text-text')}>
            {task.title || task.text || 'Untitled task'}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {task.task_due_date && (
              <span className={cn('inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[11px] font-bold', dueClass)}>
                <Clock size={10} /> {fmtDate(task.task_due_date)}
              </span>
            )}
            {assignee && (
              <span className="inline-flex items-center gap-1.5 h-[20px] pl-0.5 pr-2 rounded-full bg-surface border border-border">
                <OwnerAvatar profile={assignee} size={18} />
                <span className="text-[11px] font-bold text-text-2 truncate max-w-[120px]">{assignee.full_name || assignee.email}</span>
              </span>
            )}
            <button
              onClick={() => setReplyOpen((v) => !v)}
              className="ml-auto text-[11.5px] font-bold text-accent-ink hover:underline"
            >
              {replies.length > 0 ? `${replyOpen ? 'Hide' : 'Show'} ${replies.length} repl${replies.length === 1 ? 'y' : 'ies'}` : (replyOpen ? 'Cancel' : 'Reply')}
            </button>
          </div>
        </div>
      </div>

      {(replyOpen || replies.length > 0) && (
        <div className="border-t border-border px-3.5 py-3 space-y-2 bg-surface/60 rounded-b-xl">
          {replies.map((r) => {
            const who = r.author_id ? profileById.get(r.author_id) : undefined;
            return (
              <div key={r.id} className="flex items-start gap-2">
                <OwnerAvatar profile={who} size={22} />
                <div className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-text-3">
                    <span className="font-bold text-text">{who?.full_name || who?.email || 'Someone'}</span>
                    <span>·</span>
                    <span>{fmtRelative(r.created_at)}</span>
                  </div>
                  {r.text && <div className="text-[12.5px] text-text-2 whitespace-pre-wrap mt-0.5">{r.text}</div>}
                </div>
              </div>
            );
          })}
          {replyOpen && (
            <div className="flex items-start gap-2">
              <div className="flex-1 flex items-center gap-2">
                <input
                  autoFocus
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendReply(); } }}
                  placeholder="Write a reply…"
                  className="flex-1 h-9 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] outline-none focus:border-accent-strong"
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || log.isPending}
                  className="h-9 px-4 rounded-lg bg-accent text-cg-900 text-[12px] font-black border border-accent-strong hover:bg-accent-strong disabled:opacity-50"
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AttributionPanel({
  tracking, attr, loading,
}: {
  tracking: import('@/hooks/useMarketingTracking').MarketingTracking | null;
  attr: import('@/hooks/useAccountAttribution').AccountAttribution | null;
  loading: boolean;
}) {
  const source   = attr?.source                                      || null;
  const medium   = tracking?.last_medium   || attr?.medium           || null;
  const campaign = tracking?.last_campaign || attr?.campaign         || null;
  const joinedAt = attr?.bubble_created_at || attr?.created_at       || null;

  const utmRows: [string, string | null][] = [
    ['utm_source',   attr?.utm_source ?? null],
    ['utm_medium',   attr?.utm_medium ?? null],
    ['utm_campaign', attr?.utm_campaign ?? null],
    ['utm_content',  attr?.utm_content ?? null],
  ];
  const landingRows: [string, string | null, { link?: boolean }][] = [
    ['Referrer',     attr?.referrer_url ?? null, { link: true }],
    ['Landing page', attr?.landing_page ?? null, { link: true }],
    ['CTA clicked',  attr?.cta_clicked ?? null,  {}],
  ];
  const channelRows: [string, string | null][] = [
    ['Marketing channel', attr?.wp_marketing_channel ?? null],
    ['Rec challenge',     attr?.wp_rec_challenge ?? null],
  ];

  const hasFirst = !!(tracking?.first_source || tracking?.first_medium || tracking?.first_date);
  const hasLanding = !!tracking?.first_landing_page;

  return (
    <>
      <Panel title="Attribution" icon={<Sparkles size={13} />}>
        <CoreRow k="Source"    v={source} />
        <CoreRow k="Medium"    v={medium}    fallback="(none)" />
        <CoreRow k="Campaign"  v={campaign} />
        <CoreRow k="Joined at" v={joinedAt ? fmtDate(joinedAt) : null} />

        <AttrSection title="UTM Parameters" rows={utmRows.map(([k, v]) => [k, v])} />
        <AttrSection title="Landing" rows={landingRows.map(([k, v, o]) => [k, v, o])} />
        <AttrSection title="Recruitera Channels" rows={channelRows.map(([k, v]) => [k, v])} />
      </Panel>

      <Panel
        title="Marketing tracking"
        hint={tracking?.touch_count ? `${tracking.touch_count} touch${tracking.touch_count === 1 ? '' : 'es'}` : '—'}
      >
        {loading && <div className="text-[12px] text-text-3">Loading…</div>}
        {!loading && !tracking && <div className="text-[12px] text-text-3">No tracking data.</div>}
        {tracking && (
          <div className="space-y-3">
            {hasFirst && (
              <div className="border border-border rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-3">First touch</div>
                <div className="text-[13px] font-bold text-text mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-info" />
                  {tracking.first_source || '(direct)'}
                </div>
                {tracking.first_medium && (
                  <div className="text-[11px] text-text-3">
                    {tracking.first_medium}
                    {tracking.first_campaign ? ` · ${tracking.first_campaign}` : ''}
                  </div>
                )}
                {tracking.first_date && <div className="text-[11px] text-text-4 mt-1">{fmtDate(tracking.first_date)}</div>}
              </div>
            )}
            {tracking.device_type && (
              <div className="border border-border rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-3">Device</div>
                <div className="text-[13px] font-bold text-text mt-1">{tracking.device_type}</div>
              </div>
            )}
            {hasLanding && (
              <div className="border border-border rounded-xl p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-3">First landing page</div>
                <a href={tracking.first_landing_page!} target="_blank" rel="noreferrer"
                   className="text-[12px] font-mono text-accent-ink mt-1 break-all block">
                  {tracking.first_landing_page}
                </a>
              </div>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

function CoreRow({ k, v, fallback = '—' }: { k: string; v: string | null; fallback?: string }) {
  const empty = !v;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
      <div className="text-[11.5px] text-text-3">{k}</div>
      <div
        className={cn('text-[12.5px] font-bold text-right truncate max-w-[200px]', empty ? 'text-text-4' : 'text-text')}
        title={v || undefined}
      >
        {v || fallback}
      </div>
    </div>
  );
}

function AttrSection({
  title, rows,
}: {
  title: string;
  rows: [string, string | null, { link?: boolean }?][];
}) {
  const shown = rows.filter(([, v]) => v != null && v !== '');
  if (!shown.length) return null;
  const trunc = (u: string) => (u.length > 42 ? u.slice(0, 39) + '…' : u);
  return (
    <div className="mt-3">
      <div className="text-[9px] tracking-[0.1em] uppercase text-accent-ink font-black border-b-2 border-accent pb-1 mb-1">
        {title}
      </div>
      {shown.map(([k, v, opts]) => {
        const isLink = !!opts?.link && !!v;
        return (
          <div key={k} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60 last:border-0 min-w-0">
            <div className="text-[10px] tracking-widest uppercase text-text-3 font-bold flex-shrink-0">{k}</div>
            <div className="text-[12px] text-right truncate max-w-[200px] min-w-0" title={v || undefined}>
              {isLink ? (
                <a href={v!} target="_blank" rel="noreferrer" className="text-accent-ink font-bold underline">
                  {trunc(v!)}
                </a>
              ) : (
                <span className="font-bold text-text">{v}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Row({ k, v, wrap }: { k: string; v: React.ReactNode; wrap?: boolean }) {
  if (wrap) {
    return (
      <div className="py-1.5 border-b border-border/60 last:border-0">
        <div className="text-[11.5px] text-text-3">{k}</div>
        <div className="text-[12.5px] font-bold text-text mt-0.5 whitespace-pre-wrap break-words">{v}</div>
      </div>
    );
  }
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

/**
 * For each activity, derive the account's stage at the moment that activity
 * was created. Walks the timeline once: activities of `type='stage'` carry
 * a `to_stage` transition — the effective stage before that entry is the
 * previous to_stage. Non-stage activities inherit whatever the most-recent
 * prior stage transition set. Missing/unknown → `'lead'` (the funnel entry).
 * Result: Map<activityId, stage> that every note/call/email/meeting can
 * badge with a StagePill to answer "which stage were we in when this
 * happened?".
 */
function buildStageAtTime(activities: import('@/hooks/useAccountDetail').Activity[]): Map<string, string> {
  const chronological = [...activities].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const out = new Map<string, string>();
  let current = 'lead';
  for (const a of chronological) {
    if (a.type === 'stage' && a.to_stage) {
      out.set(a.id, a.to_stage);
      current = a.to_stage;
    } else {
      out.set(a.id, current);
    }
  }
  return out;
}

function ActivityFeed({
  activities, profiles, loading,
}: {
  activities: import('@/hooks/useAccountDetail').Activity[];
  profiles: import('@/hooks/useUsersData').Profile[];
  loading: boolean;
}) {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const stageAtTime = useMemo(() => buildStageAtTime(activities), [activities]);
  return (
    <div className="bg-surface border border-border rounded-2xl px-5 py-2 shadow-sh1">
      {loading && <div className="text-[12.5px] text-text-3 py-3">Loading…</div>}
      {!loading && activities.length === 0 && (
        <div className="py-8 text-center text-[12.5px] text-text-3">No activity yet.</div>
      )}
      <div>
        {activities.map((a) => (
          <ActivityRow
            key={a.id}
            activity={a}
            author={a.author_id ? byId.get(a.author_id) : undefined}
            profiles={profiles}
            stageAtTime={stageAtTime.get(a.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ActivityRow({
  activity, author, profiles, stageAtTime,
}: {
  activity: import('@/hooks/useAccountDetail').Activity;
  author: import('@/hooks/useUsersData').Profile | undefined;
  profiles: import('@/hooks/useUsersData').Profile[];
  stageAtTime?: string;
}) {
  const name = author?.full_name || author?.email || 'System';
  const sentence = activityToSentence(activity);
  // Don't show a stage pill on the stage-transition entries themselves —
  // they already say "moved stage from X to Y" in the sentence.
  const showStagePill = activity.type !== 'stage' && stageAtTime;
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-border last:border-0">
      <OwnerAvatar profile={author} size={32} />
      <div className="flex-1 min-w-0 text-[13.5px] text-text-2 leading-snug">
        <span className="font-extrabold text-text">{name}</span>{' '}
        {sentence.action}
        {sentence.subject && <> <span className="font-extrabold text-text">{renderWithMentions(sentence.subject, profiles)}</span></>}
        {sentence.trail}
        {sentence.suffix && <> <span className="font-extrabold text-text">{renderWithMentions(sentence.suffix, profiles)}</span></>}
        <span className="text-text-3">.</span>
      </div>
      {showStagePill && (
        <div className="flex-shrink-0" title={`Stage at the time of this activity: ${stageAtTime}`}>
          <StagePill stage={stageAtTime} />
        </div>
      )}
      <div className="text-[12px] text-text-3 flex-shrink-0 whitespace-nowrap">
        {fmtDateTime(activity.created_at)}
      </div>
    </div>
  );
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function activityToSentence(a: import('@/hooks/useAccountDetail').Activity): {
  action: string; subject?: string; trail?: string; suffix?: string;
} {
  const t = a.type;
  const title = a.title || '';
  const text = a.text || '';
  if (t === 'task') {
    if (a.parent_id) return { action: 'replied on task', subject: text.slice(0, 80) };
    return { action: 'added a task', subject: title || text };
  }
  if (t === 'note')     return { action: 'left a note',   subject: text.slice(0, 120) };
  if (t === 'call')     return { action: 'logged a call', subject: text.slice(0, 120) };
  if (t === 'email')    return { action: 'sent an email', subject: a.email_subject || text.slice(0, 120) };
  if (t === 'whatsapp') return { action: 'sent WhatsApp', subject: text.slice(0, 120) };
  if (t === 'meeting')  return { action: 'held a meeting', subject: title || text.slice(0, 120) };
  if (a.from_stage && a.to_stage) {
    return { action: 'moved stage from', subject: a.from_stage.toUpperCase(), trail: ' to', suffix: a.to_stage.toUpperCase() };
  }
  return { action: t.replace(/_/g, ' '), subject: title || text.slice(0, 120) };
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
