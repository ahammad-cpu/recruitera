import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Phone, Mail, MessageCircle, ArrowLeftRight, DollarSign, Building2, AlertTriangle } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useProfiles, type Profile } from '@/hooks/useUsersData';
import { useDeals, isOpen, isStale } from '@/hooks/useDeals';
import { useTargets } from '@/hooks/useTargets';
import { useRecentActivities } from '@/hooks/useRecentActivities';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt, fmtEgp, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

type TabKey = 'team' | 'activities' | 'targets' | 'leaderboard' | 'gaps';
const TABS: { key: TabKey; label: string; tone?: 'bad' }[] = [
  { key: 'team', label: 'Team Performance' },
  { key: 'activities', label: 'All Activities' },
  { key: 'targets', label: 'Targets' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'gaps', label: 'Gaps', tone: 'bad' },
];

const OPEN_STAGES = ['proposal', 'won', 'paid'];
const CLOSABLE_STAGES = ['won', 'paid', 'lost'];
const WIN_STAGES = ['won', 'paid'];

function resolveOwnerId(a: Account, profiles: Profile[]): string | null {
  if (a.owner_id) return a.owner_id;
  const mail = (a.am_mail || '').toLowerCase().trim();
  if (!mail) return null;
  return profiles.find((p) => (p.email || '').toLowerCase() === mail)?.id ?? null;
}

function statusFor(closable: number, score: number) {
  if (closable === 0) return { label: 'No closes yet', cls: 'bg-surface-2 text-text-3' };
  if (score >= 70) return { label: 'Top Performer', cls: 'bg-ok-bg text-ok' };
  if (score >= 40) return { label: 'Average', cls: 'bg-warn-bg text-warn' };
  return { label: 'Needs Attention', cls: 'bg-bad-bg text-bad' };
}

export default function AMPerformance() {
  const accountsQ = useAccounts();
  const profilesQ = useProfiles();
  const dealsQ = useDeals();
  const targetsQ = useTargets();
  const activitiesQ = useRecentActivities(150);
  const [tab, setTab] = useState<TabKey>('team');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.merged_into), [accountsQ.data]);
  const profiles = profilesQ.data ?? [];

  const ownerIdByAccount = useMemo(() => {
    const m = new Map<string, string | null>();
    accounts.forEach((a) => m.set(a.id, resolveOwnerId(a, profiles)));
    return m;
  }, [accounts, profiles]);

  const rows = useMemo(() => {
    return profiles
      .map((p) => {
        const owned = accounts.filter((a) => ownerIdByAccount.get(a.id) === p.id);
        const stageOf = (a: Account) => (a.stage || '').toLowerCase();
        const deals = owned.filter((a) => OPEN_STAGES.includes(stageOf(a))).length;
        const collected = owned.filter((a) => stageOf(a) === 'paid').length;
        const invoicedNotCollected = owned.filter((a) => stageOf(a) === 'won').length;
        const closable = owned.filter((a) => CLOSABLE_STAGES.includes(stageOf(a))).length;
        const wins = owned.filter((a) => WIN_STAGES.includes(stageOf(a))).length;
        const score = closable > 0 ? Math.round((wins / closable) * 100) : 0;
        return {
          profile: p, owned: owned.length, deals, collected, gaps: invoicedNotCollected,
          closable, score, status: statusFor(closable, score),
        };
      })
      .filter((r) => r.owned > 0)
      .sort((a, b) => b.score - a.score);
  }, [profiles, accounts, ownerIdByAccount]);

  const filteredRows = ownerFilter === 'all' ? rows : rows.filter((r) => r.profile.id === ownerFilter);

  const kpis = useMemo(() => {
    const stageOf = (a: Account) => (a.stage || '').toLowerCase();
    return {
      deals: accounts.filter((a) => OPEN_STAGES.includes(stageOf(a))).length,
      collected: accounts.filter((a) => stageOf(a) === 'paid').length,
      total: accounts.length,
    };
  }, [accounts]);

  const gapDeals = useMemo(
    () => (dealsQ.data ?? []).filter((d) => isOpen(d) && isStale(d)),
    [dealsQ.data],
  );

  function exportCsv() {
    const header = ['account_manager', 'email', 'owned', 'deals_moved', 'collected', 'gaps', 'score', 'status'];
    const csvRows = filteredRows.map((r) => [
      r.profile.full_name || '', r.profile.email || '', String(r.owned),
      String(r.deals), String(r.collected), String(r.gaps), String(r.score), r.status.label,
    ]);
    const csv = [header, ...csvRows]
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `am-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const isLoading = accountsQ.isLoading || profilesQ.isLoading;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-black tracking-tight text-text">AM Performance</h1>
          <p className="text-[13px] text-text-3 font-medium mt-1">Team activity, scoring &amp; daily drill-down.</p>
        </div>
        <div className="flex-1" />
        {tab !== 'targets' && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[13px] font-bold hover:bg-accent-strong"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      <div className="flex items-center gap-0 border-b border-border flex-wrap">
        {TABS.map((t) => {
          const count = t.key === 'gaps' ? gapDeals.length : rows.length;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 px-5 py-3 text-[13px] border-b-2 -mb-px transition-colors',
                active ? 'font-black text-text border-cg-900' : 'font-semibold text-text-3 border-transparent hover:text-text-2',
              )}
            >
              {t.label}
              <span className={cn(
                'tnum inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black',
                t.tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-surface-2 text-text-3',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {(tab === 'team' || tab === 'leaderboard') && (
        <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-surface border border-border rounded-xl">
          <span className="text-[11px] font-black uppercase tracking-widest text-text-3">Filter</span>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-[34px] px-3 border border-border rounded-lg bg-surface text-[13px] font-semibold text-text outline-none focus:border-accent-strong"
          >
            <option value="all">All AMs</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
          <div className="flex-1" />
          <span className="tnum text-[13px] font-bold text-text-3">{filteredRows.length} AMs shown</span>
        </div>
      )}

      {tab === 'team' && (
        <TeamPerformance rows={filteredRows} kpis={kpis} isLoading={isLoading} />
      )}
      {tab === 'leaderboard' && <Leaderboard rows={filteredRows} />}
      {tab === 'activities' && <ActivitiesFeed data={activitiesQ.data} isLoading={activitiesQ.isLoading} profiles={profiles} accounts={accounts} />}
      {tab === 'targets' && <TargetsTab targets={targetsQ.data} profiles={profiles} isLoading={targetsQ.isLoading} />}
      {tab === 'gaps' && <GapsTab deals={gapDeals} isLoading={dealsQ.isLoading} />}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="relative bg-surface border border-border rounded-2xl p-4 shadow-sh1 overflow-hidden">
      {accent && <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" />}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-lg bg-surface-2 grid place-items-center text-text-3">{icon}</div>
        <span className="text-[10px] font-black tracking-widest uppercase text-text-3">{label}</span>
      </div>
      <div className="tnum text-[26px] font-black tracking-tight text-text leading-none">{value}</div>
      <div className="text-[11px] text-text-3 font-semibold mt-1">{sub}</div>
    </div>
  );
}

type AMRow = {
  profile: Profile; owned: number; deals: number; collected: number; gaps: number; score: number;
  status: { label: string; cls: string };
};

function TeamPerformance({
  rows, kpis, isLoading,
}: {
  rows: AMRow[];
  kpis: { deals: number; collected: number; total: number };
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Phone size={15} />} label="Calls" value="—" sub="no source yet" accent />
        <KpiCard icon={<Mail size={15} />} label="Emails" value="—" sub="no source yet" />
        <KpiCard icon={<MessageCircle size={15} />} label="WhatsApps" value="—" sub="no source yet" />
        <KpiCard icon={<ArrowLeftRight size={15} />} label="Deals moved" value={fmtInt(kpis.deals)} sub="proposal + won + paid" />
        <KpiCard icon={<DollarSign size={15} />} label="Collections" value={fmtInt(kpis.collected)} sub="stage = paid" />
        <KpiCard icon={<Building2 size={15} />} label="Accounts" value={fmtInt(kpis.total)} sub="in book" />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="overflow-x-auto sc">
          <table className="w-full text-left" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="bg-surface-2 text-[10.5px] font-black uppercase tracking-wider text-text-3">
                <th className="px-4 py-3 text-left">Account manager</th>
                <th className="px-3 py-3 text-center">Calls</th>
                <th className="px-3 py-3 text-center">Emails</th>
                <th className="px-3 py-3 text-center">WhatsApp</th>
                <th className="px-3 py-3 text-center">Deals moved</th>
                <th className="px-3 py-3 text-center">Collected</th>
                <th className="px-3 py-3 text-center text-bad">Gaps</th>
                <th className="px-3 py-3 text-left">Score</th>
                <th className="px-3 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={9} className="p-4 text-[12.5px] text-text-3">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-[12.5px] text-text-3">No AMs with owned accounts.</td></tr>
              )}
              {!isLoading && rows.map((r) => {
                const barColor = r.score >= 70 ? 'bg-ok' : r.score >= 40 ? 'bg-warn' : 'bg-bad';
                return (
                  <tr key={r.profile.id} className="border-t border-border hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <OwnerAvatar profile={r.profile} size={32} />
                        <div>
                          <div className="text-[14px] font-black text-text">{r.profile.full_name || r.profile.email}</div>
                          <div className="tnum text-[11px] text-text-3 font-semibold">{fmtInt(r.owned)} owned</div>
                        </div>
                      </div>
                    </td>
                    <Cell v={0} />
                    <Cell v={0} />
                    <Cell v={0} />
                    <Cell v={r.deals} />
                    <Cell v={r.collected} />
                    <Cell v={r.gaps} warn={r.gaps > 0} />
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-[140px]">
                        <div className="flex-1 h-2 rounded-full bg-surface-2 border border-border overflow-hidden">
                          <div className={cn('h-full rounded-full', barColor)} style={{ width: `${r.score}%` }} />
                        </div>
                        <span className="tnum text-[13px] font-black text-text w-7 text-right">{r.score}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold', r.status.cls)}>
                        {r.status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Cell({ v, warn }: { v: number | '—'; warn?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      <span className={cn(
        'tnum inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-md border border-border text-[12.5px] font-bold',
        v === 0 || v === '—' ? 'bg-surface-2 text-text-4' : warn ? 'bg-warn-bg text-warn' : 'bg-surface-2 text-text',
      )}>
        {v === '—' ? '—' : fmtInt(v)}
      </span>
    </td>
  );
}

function Leaderboard({ rows }: { rows: AMRow[] }) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1 divide-y divide-border">
      {rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No AMs with owned accounts.</div>}
      {rows.map((r, i) => (
        <div key={r.profile.id} className="flex items-center gap-3 px-4 py-3.5">
          <span className={cn(
            'tnum w-7 h-7 rounded-full grid place-items-center text-[12px] font-black flex-shrink-0',
            i === 0 ? 'bg-accent text-cg-900' : 'bg-surface-2 text-text-3',
          )}>
            {i + 1}
          </span>
          <OwnerAvatar profile={r.profile} size={30} />
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-black text-text truncate">{r.profile.full_name || r.profile.email}</div>
            <div className="tnum text-[11px] text-text-3 font-semibold">{fmtInt(r.owned)} owned</div>
          </div>
          <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold', r.status.cls)}>{r.status.label}</span>
          <span className="tnum text-[15px] font-black text-text w-10 text-right">{r.score}</span>
        </div>
      ))}
    </div>
  );
}

function ActivitiesFeed({
  data, isLoading, profiles, accounts,
}: {
  data: ReturnType<typeof useRecentActivities>['data'];
  isLoading: boolean;
  profiles: Profile[];
  accounts: Account[];
}) {
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const rows = data ?? [];
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1 divide-y divide-border">
      {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {!isLoading && rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No activity yet.</div>}
      {!isLoading && rows.map((a) => {
        const author = profileById.get(a.author_id || '');
        const account = accountById.get(a.account_id);
        return (
          <div key={a.id} className="flex items-start gap-3 px-4 py-3">
            <OwnerAvatar profile={author} size={26} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-text-3 bg-surface-2 px-1.5 py-0.5 rounded">{a.type}</span>
                <span className="text-[13px] font-bold text-text">{author?.full_name || author?.email || 'System'}</span>
                {account && (
                  <Link to={`/companies/${a.account_id}`} className="text-[12px] text-accent-ink hover:underline">
                    {account.name || account.domain}
                  </Link>
                )}
                <span className="ml-auto text-[11px] text-text-4">{fmtDate(a.created_at)}</span>
              </div>
              {(a.title || a.text) && <div className="text-[12.5px] text-text-2 mt-0.5 line-clamp-2">{a.title || a.text}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TargetsTab({
  targets, profiles, isLoading,
}: {
  targets: ReturnType<typeof useTargets>['data'];
  profiles: Profile[];
  isLoading: boolean;
}) {
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const rows = targets ?? [];
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className="grid grid-cols-[1fr_120px_120px_140px_120px] px-4 py-2.5 bg-surface-2 text-[11px] font-black uppercase tracking-wider text-text-3">
        <div>Owner</div>
        <div className="text-right">Category</div>
        <div className="text-right">Period</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Range</div>
      </div>
      {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="p-8 text-center text-[12.5px] text-text-3">No targets set yet.</div>
      )}
      {rows.map((t) => {
        const owner = t.owner_id ? profileById.get(t.owner_id) : undefined;
        return (
          <div key={t.id} className="grid grid-cols-[1fr_120px_120px_140px_120px] px-4 py-2.5 border-t border-border text-[13px]">
            <div className="font-semibold text-text truncate">{t.owner_kind === 'team' ? 'Whole team' : (owner?.full_name || owner?.email || '—')}</div>
            <div className="text-right text-text-2 capitalize">{t.category}</div>
            <div className="text-right text-text-2 capitalize">{t.period_kind}</div>
            <div className="text-right tnum font-bold">{fmtEgp(t.amount_egp)}</div>
            <div className="text-right text-text-3 text-[11.5px]">{fmtDate(t.period_start)} → {fmtDate(t.period_end)}</div>
          </div>
        );
      })}
    </div>
  );
}

function GapsTab({ deals, isLoading }: { deals: ReturnType<typeof useDeals>['data']; isLoading: boolean }) {
  const rows = deals ?? [];
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1 divide-y divide-border">
      <div className="px-4 py-3 bg-warn-bg/40 text-[12.5px] text-warn font-semibold flex items-center gap-2">
        <AlertTriangle size={14} /> Open deals with no activity in 30+ days — these are falling through the cracks.
      </div>
      {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
      {!isLoading && rows.length === 0 && <div className="p-8 text-center text-[12.5px] text-text-3">No gaps — every open deal has recent activity.</div>}
      {rows.map((d) => (
        <Link key={d.id} to={`/companies/${d.account_id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-text truncate">{d.company?.name || d.title || '—'}</div>
            <div className="text-[11px] text-text-3 uppercase tracking-wider font-bold mt-0.5">{d.stage}</div>
          </div>
          <div className="text-[11.5px] text-text-3 font-semibold whitespace-nowrap">
            Last activity {fmtDate(d.last_activity_at)}
          </div>
        </Link>
      ))}
    </div>
  );
}
