import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FileText, Phone, Mail, Users, CheckSquare, ArrowRightLeft, XCircle,
  RotateCcw, UserCheck, DollarSign, Bot, Target, Star,
} from 'lucide-react';
import { useCompanyHistory, type HistoryEvent } from '@/hooks/useCompanyHistory';
import { useProfiles } from '@/hooks/useUsersData';
import { StagePill } from '@/components/shared/StagePill';
import { cn } from '@/lib/cn';
import { ActivityComposer } from './ActivityComposer';

const KIND_STYLE: Record<HistoryEvent['kind'], { icon: LucideIcon; tone: string }> = {
  note:                  { icon: FileText,       tone: 'text-text-3' },
  call:                  { icon: Phone,          tone: 'text-text-3' },
  email:                 { icon: Mail,           tone: 'text-text-3' },
  meeting:               { icon: Users,          tone: 'text-text-3' },
  task_created:          { icon: CheckSquare,    tone: 'text-text-3' },
  task_done:             { icon: CheckSquare,    tone: 'text-ok' },
  stage_change:          { icon: ArrowRightLeft, tone: 'text-info' },
  loss:                  { icon: XCircle,        tone: 'text-bad' },
  reopen:                { icon: RotateCcw,      tone: 'text-ok' },
  owner_change:          { icon: UserCheck,      tone: 'text-text-3' },
  deal_value_change:     { icon: DollarSign,     tone: 'text-text-3' },
  requalification_fire:  { icon: Bot,            tone: 'text-purple' },
  meta_lead_attached:    { icon: Target,         tone: 'text-info' },
  account_created:       { icon: Star,           tone: 'text-text-3' },
};

type Filter = 'all' | 'comms' | 'tasks' | 'stage' | 'system';

const FILTERS: Filter[] = ['all', 'comms', 'tasks', 'stage', 'system'];

export function HistoryTab({ accountId }: { accountId: string }) {
  const q = useCompanyHistory(accountId);
  const profiles = useProfiles();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const events = useMemo(() => (q.data?.pages ?? []).flat(), [q.data]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: events.length, comms: 0, tasks: 0, stage: 0, system: 0 };
    for (const e of events) {
      if (['note', 'call', 'email', 'meeting'].includes(e.kind)) c.comms += 1;
      else if (['task_created', 'task_done'].includes(e.kind)) c.tasks += 1;
      else if (['stage_change', 'loss', 'reopen'].includes(e.kind)) c.stage += 1;
      else if (['owner_change', 'deal_value_change', 'requalification_fire', 'meta_lead_attached', 'account_created'].includes(e.kind)) c.system += 1;
    }
    return c;
  }, [events]);

  const filtered = useMemo(() => events.filter((e) => {
    if (filter === 'comms'  && !['note', 'call', 'email', 'meeting'].includes(e.kind)) return false;
    if (filter === 'tasks'  && !['task_created', 'task_done'].includes(e.kind)) return false;
    if (filter === 'stage'  && !['stage_change', 'loss', 'reopen'].includes(e.kind)) return false;
    if (filter === 'system' && !['owner_change', 'deal_value_change', 'requalification_fire', 'meta_lead_attached', 'account_created'].includes(e.kind)) return false;
    if (search) {
      const s = search.toLowerCase();
      return !!(e.title?.toLowerCase().includes(s) || e.body?.toLowerCase().includes(s));
    }
    return true;
  }), [events, filter, search]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sh1">
        <div className="text-[10px] font-black tracking-[0.14em] uppercase text-text-4 mb-1">History</div>
        <div className="text-[20px] font-black tracking-tight text-text mb-4">Company history</div>

        <ActivityComposer accountId={accountId} profiles={profiles.data ?? []} />

        {/* Filter chips + search */}
        <div className="flex flex-wrap items-center gap-2 mt-5 mb-1">
          {FILTERS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'h-7 px-3 rounded-full text-[11.5px] font-bold border transition-colors',
                filter === k
                  ? 'bg-accent text-cg-900 border-accent-strong'
                  : 'bg-surface-2 text-text-3 border-border hover:border-border-2',
              )}
            >
              {k[0].toUpperCase() + k.slice(1)} <span className="opacity-70">{counts[k]}</span>
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history…"
            className="ml-auto h-7 px-2 text-[12px] border border-border rounded-lg bg-surface w-64 outline-none focus:border-accent-strong"
          />
        </div>

        {/* Grouped list */}
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
              {group.events.map((ev) => <HistoryRow key={ev.id} ev={ev} />)}
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

function HistoryRow({ ev }: { ev: HistoryEvent }) {
  const { icon: Icon, tone } = KIND_STYLE[ev.kind];
  return (
    <li className="flex gap-3 border border-border rounded-xl p-4">
      <Icon size={14} className={cn('mt-0.5 shrink-0', tone)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] font-bold text-text">{ev.title}</span>
          {ev.stage_at_time && <StagePill stage={ev.stage_at_time} />}
        </div>
        <div className="text-[11px] text-text-3">
          {ev.actor_name ?? 'System'} · {new Date(ev.at).toLocaleString()}
          {typeof ev.meta?.reason_code === 'string' && ` · reason: ${ev.meta.reason_code}`}
        </div>
        {ev.body && <div className="text-[12.5px] text-text mt-1 whitespace-pre-wrap">{ev.body}</div>}
      </div>
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
