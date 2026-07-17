import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, StickyNote, Users, Paperclip, GitBranch, CheckSquare,
  AlertTriangle, Video, Bot,
} from 'lucide-react';
import { useRecentActivities, type ActivityRow } from '@/hooks/useRecentActivities';
import { useEnum } from '@/hooks/useEnum';
import { useAccounts } from '@/hooks/useAccounts';
import { useProfiles, type Profile } from '@/hooks/useUsersData';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  call: Phone, email: Mail, note: StickyNote, meeting: Users, file: Paperclip,
  stage: GitBranch, task: CheckSquare, escalation: AlertTriangle, demo: Video,
};

// Solid = icon-badge circle (bg-X text-white); soft = the TYPE label pill
// (bg-X-bg text-X). Each activity type gets its own color so the feed reads
// at a glance instead of everything but escalations looking the same.
const TYPE_COLOR: Record<string, { solid: string; soft: string }> = {
  call: { solid: 'bg-info text-white', soft: 'bg-info-bg text-info' },
  email: { solid: 'bg-violet text-white', soft: 'bg-violet-bg text-violet' },
  note: { solid: 'bg-warn text-white', soft: 'bg-warn-bg text-warn' },
  meeting: { solid: 'bg-purple text-white', soft: 'bg-purple-bg text-purple' },
  file: { solid: 'bg-cyan text-white', soft: 'bg-cyan/15 text-cyan' },
  stage: { solid: 'bg-accent-strong text-accent-ink', soft: 'bg-accent-soft text-accent-ink' },
  task: { solid: 'bg-ok text-white', soft: 'bg-ok-bg text-ok' },
  escalation: { solid: 'bg-bad text-white', soft: 'bg-bad-bg text-bad' },
  demo: { solid: 'bg-flame text-white', soft: 'bg-flame/15 text-flame' },
};
const DEFAULT_TYPE_COLOR = { solid: 'bg-cg-800 text-white', soft: 'bg-surface-2 text-text-2' };

const DAY = 86_400_000;
type DateRangeKey = 'all' | 'today' | 'week' | 'month';
const DATE_RANGES: { key: DateRangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
];

export default function Logs() {
  const { data, isLoading, error } = useRecentActivities(300);
  const activityTypes = useEnum('activity_type');
  const accounts = useAccounts();
  const profiles = useProfiles();
  const [kind, setKind] = useState('all');
  const [personId, setPersonId] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');

  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    (accounts.data ?? []).forEach((a) => m.set(a.id, a.name || a.domain || '—'));
    return m;
  }, [accounts.data]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    (profiles.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles.data]);

  // Union of enum values and whatever kinds actually appear in fetched rows,
  // so we never miss a kind if the DB adds one before the enum is repolled.
  const kinds = useMemo(() => {
    const set = new Set<string>(activityTypes.data ?? []);
    (data ?? []).forEach((a) => set.add(a.type));
    return ['all', ...Array.from(set).sort()];
  }, [activityTypes.data, data]);

  if (error) return <div className="p-6 text-bad">Error: {String((error as Error).message)}</div>;

  const now = Date.now();
  const rangeStart = dateRange === 'today' ? now - (now % DAY)
    : dateRange === 'week' ? now - 7 * DAY
    : dateRange === 'month' ? now - 30 * DAY
    : null;

  const rows = (data ?? []).filter((a) => {
    if (kind !== 'all' && a.type !== kind) return false;
    if (personId !== 'all') {
      if (personId === 'system' ? a.author_id !== null : a.author_id !== personId) return false;
    }
    if (rangeStart !== null && new Date(a.created_at).getTime() < rangeStart) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">System Logs</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">
          {isLoading ? 'Loading…' : `${rows.length} entries`}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              'h-8 px-3 rounded-lg text-[12px] font-semibold border',
              kind === k ? 'bg-cg-900 text-white border-cg-900' : 'bg-surface text-text-2 border-border hover:bg-surface-2',
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="h-8 pl-3 pr-8 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text outline-none cursor-pointer"
        >
          <option value="all">Everyone</option>
          <option value="system">System (automated)</option>
          {(profiles.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
          ))}
        </select>
        <div className="flex gap-0.5 bg-surface-2 border border-border rounded-md p-0.5">
          {DATE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={cn(
                'px-2.5 py-1 rounded text-[12px] font-semibold',
                dateRange === r.key ? 'bg-surface text-text shadow-sh1' : 'text-text-3',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && rows.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-text-3">No entries.</div>
        )}
        {rows.map((a) => (
          <LogRow
            key={a.id}
            activity={a}
            author={a.author_id ? profileById.get(a.author_id) : undefined}
            companyName={a.account_id ? accountNameById.get(a.account_id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function LogRow({ activity: a, author, companyName }: { activity: ActivityRow; author: Profile | undefined; companyName: string | undefined }) {
  const isSystem = !a.author_id;
  const Icon = TYPE_ICON[a.type];
  const color = TYPE_COLOR[a.type] ?? DEFAULT_TYPE_COLOR;
  const name = author?.full_name || author?.email || 'System';

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-t border-border first:border-0">
      <div className="relative flex-shrink-0 mt-0.5">
        {isSystem ? (
          <div className="rounded-full bg-surface-2 border border-border flex items-center justify-center" style={{ width: 32, height: 32 }} title="System (automated)">
            <Bot size={15} className="text-text-3" />
          </div>
        ) : (
          <OwnerAvatar profile={author} size={32} />
        )}
        {Icon && (
          <div className={cn(
            'absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full border-2 border-surface flex items-center justify-center',
            color.solid,
          )}>
            <Icon size={10} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('font-extrabold text-[13.5px]', isSystem ? 'text-text-2' : 'text-text')}>{name}</span>
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', color.soft)}>
            {a.type}
          </span>
          {companyName && a.account_id && (
            <Link to={`/companies/${a.account_id}`} className="text-[12px] font-semibold text-text-3 hover:text-accent-ink">
              on {companyName}
            </Link>
          )}
          <span className="ml-auto text-[11px] text-text-4 whitespace-nowrap">{fmtDate(a.created_at)}</span>
        </div>
        {a.from_stage && a.to_stage && (
          <div className="mt-1 text-[12.5px] text-text-2">
            {a.from_stage} → <b className="text-text">{a.to_stage}</b>
          </div>
        )}
        {a.email_subject && <div className="mt-0.5 text-[12px] text-text-3">Subject: {a.email_subject}</div>}
        {a.call_outcome && <div className="mt-0.5 text-[12px] text-text-3">Call: {a.call_outcome}</div>}
        {a.title && <div className="mt-1 text-[13px] font-semibold text-text">{a.title}</div>}
        {a.text && <div className="mt-0.5 text-[12.5px] text-text-2 line-clamp-2">{a.text}</div>}
      </div>
    </div>
  );
}
