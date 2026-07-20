import { useMemo, useState } from 'react';
import { useCompanyHistory, type HistoryEvent } from '@/hooks/useCompanyHistory';
import { useProfiles } from '@/hooks/useUsersData';
import { useMe } from '@/hooks/useMe';
import { StagePill } from '@/components/shared/StagePill';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { ActivityComposer } from './ActivityComposer';
import type { Profile } from '@/hooks/useUsersData';
import { useDeleteActivity, useUpdateActivity } from '@/hooks/useActivityMutations';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffSec / 3600);
  const remMin = Math.round((diffSec % 3600) / 60);
  if (diffHr < 24) return remMin > 0 ? `${diffHr}h ${remMin}m ago` : `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.round(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  return `${Math.round(diffDay / 365)}y ago`;
}

const KIND_PILL: Partial<Record<HistoryEvent['kind'], string>> = {
  note:                 'NOTE',
  call:                 'CALL',
  email:                'EMAIL',
  meeting:              'MEETING',
  task_created:         'TASK',
  task_done:            'TASK DONE',
  stage_change:         'STAGE',
  loss:                 'LOST',
  reopen:               'REOPEN',
  owner_change:         'OWNER',
  deal_value_change:    'DEAL VALUE',
  requalification_fire: 'AUTO-TASK',
  meta_lead_attached:   'META',
  account_created:      'CREATED',
};

// Kinds a regular user can delete from the feed. System/audit events stay put.
const DELETABLE = new Set<HistoryEvent['kind']>(['note', 'call', 'email', 'meeting']);

export function HistoryTab({ accountId }: { accountId: string }) {
  const q = useCompanyHistory(accountId);
  const profiles = useProfiles();

  const events = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);

  const grouped = useMemo(() => groupByDate(events), [events]);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
        <div className="text-[10px] font-black tracking-[0.14em] uppercase text-text-4 mb-1">Notes</div>
        <div className="text-[20px] font-black tracking-tight text-text mb-4">Internal notes</div>

        <ActivityComposer accountId={accountId} profiles={profiles.data ?? []} />

        {q.isLoading && <div className="mt-4 text-[12px] text-text-3">Loading…</div>}
        {!q.isLoading && grouped.length === 0 && (
          <div className="mt-4 py-10 text-center text-[12.5px] text-text-3 border border-dashed border-border rounded-xl">
            No history yet.
          </div>
        )}

        {grouped.map((group) => (
          <section key={group.label}>
            <h4 className="text-[10px] font-black uppercase tracking-widest text-text-3 mt-4 mb-2">{group.label}</h4>
            <ul className="space-y-3">
              {group.events.map((ev) => <HistoryRow key={ev.id} ev={ev} profiles={profiles.data ?? []} accountId={accountId} />)}
            </ul>
          </section>
        ))}

        {q.hasNextPage && (
          <button
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="mt-4 w-full h-8 rounded-lg border border-border text-[12px] font-bold text-text-2 hover:bg-surface-2 disabled:opacity-50"
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load older events'}
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ ev, profiles, accountId }: { ev: HistoryEvent; profiles: Profile[]; accountId: string }) {
  const del = useDeleteActivity(accountId);
  const update = useUpdateActivity(accountId);
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [draft, setDraft] = useState(ev.body ?? '');

  const actor = ev.actor_id ? profiles.find((p) => p.id === ev.actor_id) : undefined;
  const actorName = actor?.full_name || actor?.email || ev.actor_name || 'System';
  const reason = typeof ev.meta?.reason_code === 'string' ? ev.meta.reason_code : null;
  const metaFrom = typeof ev.meta?.from === 'string' ? ev.meta.from : null;
  const metaTo   = typeof ev.meta?.to   === 'string' ? ev.meta.to   : null;

  // A disqualify writes a self-transition to stage_history (from_stage ===
  // to_stage) with a reason_code — the RPC still classifies that as
  // "stage_change" so we rewrite the kind here for correct styling + title.
  const isDisqualify = ev.kind === 'stage_change' && !!metaFrom && metaFrom === metaTo && !!reason;
  const effectiveKind = isDisqualify ? 'disqualify' : ev.kind;

  // Activities from the RPC come with id "act:<uuid>" — extract the raw id
  // so useDeleteActivity / useUpdateActivity can target the row directly.
  const activityId = ev.id.startsWith('act:') ? ev.id.slice(4) : null;
  const isDeletableKind = DELETABLE.has(ev.kind) && !!activityId;
  const isAdmin = (me.data?.role || '').toLowerCase() === 'admin';
  const isAuthor = !!ev.actor_id && me.data?.id === ev.actor_id;
  const canMutate = isDeletableKind && (isAdmin || isAuthor);

  const kindLabel = isDisqualify
    ? 'DISQUALIFIED'
    : (KIND_PILL[ev.kind] ?? ev.kind.toUpperCase().replace(/_/g, ' '));

  // Amber-tinted pill + subtle amber card border when disqualified so it
  // reads as a state-change event, not a neutral stage move.
  const pillClass = isDisqualify
    ? 'inline-flex items-center h-5 px-2 rounded-md bg-warn-bg text-warn text-[10px] font-black tracking-wider'
    : 'inline-flex items-center h-5 px-2 rounded-md bg-surface-2 text-text-3 text-[10px] font-black tracking-wider';
  const cardClass = isDisqualify
    ? 'flex gap-3 border border-warn/40 bg-warn-bg/30 rounded-xl p-4'
    : 'flex gap-3 border border-border rounded-xl p-4';

  async function saveEdit() {
    if (!activityId) return;
    await update.mutateAsync({ id: activityId, text: draft });
    setEditing(false);
  }

  function requestDelete() {
    if (!activityId) return;
    setConfirmDel(true);
  }
  function performDelete() {
    if (!activityId) return;
    del.mutate(activityId);
    setConfirmDel(false);
  }

  return (
    <li className={cardClass}>
      <OwnerAvatar profile={actor} size={40} fallback={actorName} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-black text-text">{actorName}</span>
          <span className={pillClass}>
            {kindLabel}
          </span>
          <span className="text-[11.5px] text-text-3">{relativeTime(ev.at)}</span>
          {ev.stage_at_time && <StagePill stage={ev.stage_at_time} />}
          {reason && (
            <span className="text-[11.5px] text-text-3">· reason: <span className={isDisqualify ? 'font-black text-warn' : 'font-bold text-text-2'}>{reason}</span></span>
          )}
          {canMutate && !editing && (
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => { setDraft(ev.body ?? ''); setEditing(true); }}
                className="text-[11.5px] font-bold text-text-3 hover:text-text"
              >Edit</button>
              <button
                onClick={requestDelete}
                disabled={del.isPending}
                className="text-[11.5px] font-bold text-text-3 hover:text-bad disabled:opacity-50"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              className="w-full p-2.5 border-2 border-border-2 rounded-lg bg-surface text-[13.5px] outline-none focus:border-accent-strong resize-vertical"
            />
            <div className="flex justify-end gap-2 mt-1.5">
              <button
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-md border border-border text-[11.5px] font-bold text-text-2 hover:bg-surface-2"
              >Cancel</button>
              <button
                onClick={saveEdit}
                disabled={update.isPending || draft.trim() === (ev.body ?? '').trim()}
                className="h-7 px-3 rounded-md bg-accent text-cg-900 text-[11.5px] font-black border border-accent-strong disabled:opacity-50"
              >{update.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        ) : ev.body ? (
          <div className="text-[13.5px] text-text mt-1.5 whitespace-pre-wrap leading-relaxed">
            {ev.body}
          </div>
        ) : isDisqualify ? (
          <div className="text-[13px] font-bold text-warn mt-1">Disqualified at {(metaFrom ?? '').toUpperCase()}</div>
        ) : ev.title !== actorName ? (
          <div className="text-[12px] text-text-3 mt-1">{ev.title}</div>
        ) : null}
      </div>

      {confirmDel && (
        <div
          className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-6"
          onClick={() => setConfirmDel(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-comment-title"
        >
          <div
            className="bg-surface rounded-2xl shadow-sh3 border border-border max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="delete-comment-title" className="text-[15px] font-black text-text">Delete this comment?</div>
            <div className="text-[12.5px] text-text-2 mt-1">
              This can't be undone. The event log will show it as deleted by {actorName}.
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfirmDel(false)}
                className="h-9 px-4 rounded-lg border border-border text-[12.5px] font-bold"
              >Cancel</button>
              <button
                onClick={performDelete}
                disabled={del.isPending}
                className="h-9 px-4 rounded-lg bg-bad text-white text-[12.5px] font-black disabled:opacity-50"
              >{del.isPending ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function groupByDate(events: HistoryEvent[]): { label: string; events: HistoryEvent[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest = new Date(today.getTime() - 24 * 3600 * 1000);
  const buckets = new Map<string, HistoryEvent[]>();
  for (const e of events) {
    const d = new Date(e.at); d.setHours(0, 0, 0, 0);
    const key = d.getTime() === today.getTime() ? 'TODAY'
              : d.getTime() === yest.getTime() ? 'YESTERDAY'
              : d.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  return Array.from(buckets.entries()).map(([label, evs]) => ({ label, events: evs }));
}
