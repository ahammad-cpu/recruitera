import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, Phone, Mail, MessageCircle, ArrowLeftRight, DollarSign, Building2, AlertTriangle, X, Pencil } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useProfiles, type Profile } from '@/hooks/useUsersData';
import { useDeals, isOpen, isStale } from '@/hooks/useDeals';
import { useTargets, useSaveTarget, periodEndOf, periodStartDefault, type PeriodKind, type Target } from '@/hooks/useTargets';
import { useRecentActivities } from '@/hooks/useRecentActivities';
import { useCommsActivity } from '@/hooks/useCommsActivity';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt, fmtEgp, fmtDate, toEgp } from '@/lib/format';
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
  const activitiesQ = useRecentActivities(150);
  const commsQ = useCommsActivity();
  const [tab, setTab] = useState<TabKey>('team');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.merged_into), [accountsQ.data]);
  const profiles = profilesQ.data ?? [];

  const ownerIdByAccount = useMemo(() => {
    const m = new Map<string, string | null>();
    accounts.forEach((a) => m.set(a.id, resolveOwnerId(a, profiles)));
    return m;
  }, [accounts, profiles]);

  const commsByAuthor = useMemo(() => {
    const m = new Map<string, { call: number; email: number; whatsapp: number }>();
    for (const c of commsQ.data ?? []) {
      if (!c.author_id) continue;
      const rec = m.get(c.author_id) ?? { call: 0, email: 0, whatsapp: 0 };
      rec[c.type]++;
      m.set(c.author_id, rec);
    }
    return m;
  }, [commsQ.data]);

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
        const comms = commsByAuthor.get(p.id) ?? { call: 0, email: 0, whatsapp: 0 };
        return {
          profile: p, owned: owned.length, deals, collected, gaps: invoicedNotCollected,
          closable, score, status: statusFor(closable, score), comms,
        };
      })
      .filter((r) => r.owned > 0)
      .sort((a, b) => b.score - a.score);
  }, [profiles, accounts, ownerIdByAccount, commsByAuthor]);

  const filteredRows = ownerFilter === 'all' ? rows : rows.filter((r) => r.profile.id === ownerFilter);

  const kpis = useMemo(() => {
    const stageOf = (a: Account) => (a.stage || '').toLowerCase();
    const comms = commsQ.data ?? [];
    return {
      deals: accounts.filter((a) => OPEN_STAGES.includes(stageOf(a))).length,
      collected: accounts.filter((a) => stageOf(a) === 'paid').length,
      total: accounts.length,
      calls: comms.filter((c) => c.type === 'call').length,
      emails: comms.filter((c) => c.type === 'email').length,
      whatsapps: comms.filter((c) => c.type === 'whatsapp').length,
    };
  }, [accounts, commsQ.data]);

  const gapDeals = useMemo(
    () => (dealsQ.data ?? []).filter((d) => isOpen(d) && isStale(d)),
    [dealsQ.data],
  );

  function exportCsv() {
    const header = ['account_manager', 'email', 'owned', 'calls', 'emails', 'whatsapp', 'deals_moved', 'collected', 'gaps', 'score', 'status'];
    const csvRows = filteredRows.map((r) => [
      r.profile.full_name || '', r.profile.email || '', String(r.owned),
      String(r.comms.call), String(r.comms.email), String(r.comms.whatsapp),
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
      {tab === 'targets' && (
        <TargetsTab
          profiles={profiles}
          accounts={accounts}
          ownerIdByAccount={ownerIdByAccount}
        />
      )}
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
  comms: { call: number; email: number; whatsapp: number };
};

function TeamPerformance({
  rows, kpis, isLoading,
}: {
  rows: AMRow[];
  kpis: { deals: number; collected: number; total: number; calls: number; emails: number; whatsapps: number };
  isLoading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<Phone size={15} />} label="Calls" value={fmtInt(kpis.calls)} sub="logged via composer" accent />
        <KpiCard icon={<Mail size={15} />} label="Emails" value={fmtInt(kpis.emails)} sub="logged via composer" />
        <KpiCard icon={<MessageCircle size={15} />} label="WhatsApps" value={fmtInt(kpis.whatsapps)} sub="logged via composer" />
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
                    <Cell v={r.comms.call} />
                    <Cell v={r.comms.email} />
                    <Cell v={r.comms.whatsapp} />
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

type TargetRow = {
  profile: Profile;
  target: Target | undefined;
  targetVal: number;
  actualVal: number;
  pct: number;
  hasTarget: boolean;
};

function statusFromPct(hasTarget: boolean, pct: number) {
  if (!hasTarget) return { label: 'No target', tone: 'neutral' as const };
  if (pct >= 100) return { label: 'Achieved', tone: 'ok' as const };
  if (pct >= 70) return { label: 'On track', tone: 'info' as const };
  if (pct >= 40) return { label: 'At risk', tone: 'warn' as const };
  return { label: 'Behind', tone: 'bad' as const };
}

const TONE_TEXT: Record<'ok' | 'info' | 'warn' | 'bad' | 'neutral', string> = {
  ok: 'text-ok',
  info: 'text-accent-ink',
  warn: 'text-warn',
  bad: 'text-bad',
  neutral: 'text-text-4',
};
const TONE_BAR: Record<'ok' | 'info' | 'warn' | 'bad' | 'neutral', string> = {
  ok: 'bg-ok',
  info: 'bg-accent',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-surface-2',
};

function TargetsTab({
  profiles, accounts, ownerIdByAccount,
}: {
  profiles: Profile[];
  accounts: Account[];
  ownerIdByAccount: Map<string, string | null>;
}) {
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');
  const [periodStart, setPeriodStart] = useState<string>(() => periodStartDefault('month'));
  const targetsQ = useTargets({ periodKind, periodStart });
  const saveTarget = useSaveTarget();
  const [modal, setModal] = useState<{ ownerId: string | null; amount: number; existingId: string | null; bulk: boolean } | null>(null);

  const periodEnd = useMemo(() => periodEndOf(periodKind, periodStart), [periodKind, periodStart]);

  function onPeriodKind(k: PeriodKind) {
    setPeriodKind(k);
    setPeriodStart(periodStartDefault(k));
  }

  const targetsByOwner = useMemo(() => {
    const m = new Map<string, Target>();
    for (const t of targetsQ.data ?? []) if (t.owner_id) m.set(t.owner_id, t);
    return m;
  }, [targetsQ.data]);

  const rows: TargetRow[] = useMemo(() => {
    const startT = Date.parse(periodStart);
    const endT = Date.parse(periodEnd) + 86_400_000;
    return profiles.map((p) => {
      const owned = accounts.filter((a) => ownerIdByAccount.get(a.id) === p.id);
      const paid = owned.filter((a) => (a.stage || '').toLowerCase() === 'paid');
      const inPeriod = paid.filter((a) => {
        const iso = a.first_won_at || a.last_won_at || a.bubble_created_at || a.created_at;
        if (!iso) return false;
        const t = Date.parse(iso);
        return !isNaN(t) && t >= startT && t <= endT;
      });
      const pool = inPeriod.length ? inPeriod : paid;
      const actualVal = pool.reduce((s, a) => s + toEgp(a.deal_value, a.deal_currency), 0);
      const target = targetsByOwner.get(p.id);
      const targetVal = target ? target.amount_egp : 0;
      const pct = targetVal > 0 ? Math.min(999, Math.round((actualVal / targetVal) * 100)) : 0;
      return { profile: p, target, targetVal, actualVal, pct, hasTarget: !!target };
    });
  }, [profiles, accounts, ownerIdByAccount, targetsByOwner, periodStart, periodEnd]);

  const teamTarget = rows.reduce((s, r) => s + r.targetVal, 0);
  const teamActual = rows.reduce((s, r) => s + r.actualVal, 0);
  const teamPct = teamTarget > 0 ? Math.round((teamActual / teamTarget) * 100) : 0;
  const teamStatus = teamPct >= 100 ? 'Achieved' : teamPct >= 70 ? 'On track' : teamPct >= 40 ? 'At risk' : 'Behind';
  const teamTone = teamPct >= 100 ? 'ok' : teamPct >= 70 ? 'info' : teamPct >= 40 ? 'warn' : 'bad';
  const withTargets = rows.filter((r) => r.hasTarget).length;

  const isLoading = targetsQ.isLoading;

  async function submitModal(amount: number) {
    if (!modal) return;
    if (modal.bulk) {
      const jobs = rows.map((r) =>
        saveTarget.mutateAsync({
          owner_kind: 'profile',
          owner_id: r.profile.id,
          period_kind: periodKind,
          period_start: periodStart,
          period_end: periodEnd,
          amount_egp: amount,
          existingId: r.target?.id ?? null,
        }),
      );
      await Promise.allSettled(jobs);
    } else {
      await saveTarget.mutateAsync({
        owner_kind: 'profile',
        owner_id: modal.ownerId,
        period_kind: periodKind,
        period_start: periodStart,
        period_end: periodEnd,
        amount_egp: amount,
        existingId: modal.existingId,
      });
    }
    setModal(null);
  }

  return (
    <div className="space-y-4">
      {/* Period bar */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 bg-surface border border-border rounded-xl shadow-sh1">
        <span className="text-[11px] font-black uppercase tracking-widest text-text-3">Period</span>
        <div className="inline-flex bg-surface-2 border border-border rounded-lg p-[3px]">
          {(['month', 'quarter', 'year'] as PeriodKind[]).map((k) => (
            <button
              key={k}
              onClick={() => onPeriodKind(k)}
              className={cn(
                'h-[30px] px-3.5 rounded-md text-[12px] transition-colors',
                periodKind === k ? 'bg-cg-900 text-white font-black' : 'text-text-2 font-semibold hover:text-text',
              )}
            >
              {k === 'month' ? 'Monthly' : k === 'quarter' ? 'Quarterly' : 'Yearly'}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="h-[34px] px-2.5 border border-border rounded-lg bg-surface text-[13px] font-semibold text-text outline-none focus:border-accent-strong"
        />
        <div className="flex-1" />
        <button
          onClick={() => setModal({ ownerId: null, amount: 0, existingId: null, bulk: true })}
          className="h-9 px-3.5 rounded-lg bg-surface border border-border-2 text-[13px] font-bold text-text-2 hover:bg-surface-2"
        >
          Bulk set
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <TargetKpi label="Team total target" value={fmtEgp(teamTarget)} sub={`${withTargets} of ${rows.length} AMs have targets`} topColor="bg-accent" />
        <TargetKpi label="Team total actual" value={fmtEgp(teamActual)} sub="From accounts closed in period" topColor="bg-accent-ink" />
        <TargetKpi
          label="Team achievement"
          value={teamTarget > 0 ? `${teamPct}%` : '—'}
          sub={teamTarget > 0 ? teamStatus : 'no target'}
          topColor={TONE_BAR[teamTone]}
          bar={teamTarget > 0 ? Math.min(100, teamPct) : undefined}
          barColor={TONE_BAR[teamTone]}
        />
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="overflow-x-auto sc">
          <div style={{ minWidth: 1000 }}>
            <div className="grid grid-cols-[2fr_130px_130px_80px_1.4fr_130px_140px] gap-3 px-4 py-2.5 bg-surface-2 text-[10.5px] font-black uppercase tracking-wider text-text-3 border-b border-border">
              <div>Account manager</div>
              <div>Target</div>
              <div>Actual</div>
              <div>%</div>
              <div>Progress</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
            {!isLoading && rows.length === 0 && (
              <div className="p-8 text-center text-[12.5px] text-text-3">No account managers found.</div>
            )}
            {!isLoading && rows.map((r) => {
              const status = statusFromPct(r.hasTarget, r.pct);
              const barTone = r.hasTarget ? (r.pct >= 100 ? 'ok' : r.pct >= 70 ? 'info' : r.pct >= 40 ? 'warn' : 'bad') : 'neutral';
              return (
                <div
                  key={r.profile.id}
                  className="grid grid-cols-[2fr_130px_130px_80px_1.4fr_130px_140px] gap-3 px-4 py-3 border-b border-border items-center hover:bg-surface-2/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <OwnerAvatar profile={r.profile} size={30} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-black text-text truncate">{r.profile.full_name || r.profile.email}</div>
                      <div className="text-[11px] text-text-3 font-semibold truncate">{r.profile.email || ''}</div>
                    </div>
                  </div>
                  <div className="tnum text-[13px] font-bold text-text">{r.hasTarget ? fmtEgp(r.targetVal) : '—'}</div>
                  <div className="tnum text-[13px] font-bold text-text">{fmtEgp(r.actualVal)}</div>
                  <div className={cn('tnum text-[13px] font-black', TONE_TEXT[barTone])}>{r.hasTarget ? `${r.pct}%` : '—'}</div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden border border-border">
                    <div className={cn('h-full', TONE_BAR[barTone])} style={{ width: `${r.hasTarget ? Math.min(100, r.pct) : 0}%` }} />
                  </div>
                  <div>
                    <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold bg-surface-2 border border-border', TONE_TEXT[status.tone])}>
                      {status.label}
                    </span>
                  </div>
                  <div>
                    {r.hasTarget ? (
                      <button
                        onClick={() => setModal({ ownerId: r.profile.id, amount: r.targetVal, existingId: r.target?.id ?? null, bulk: false })}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-surface border border-border-2 text-text-2 text-[12px] font-bold hover:bg-surface-2"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => setModal({ ownerId: r.profile.id, amount: 0, existingId: null, bulk: false })}
                        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg bg-accent border border-accent-strong text-cg-900 text-[12px] font-black hover:bg-accent-strong"
                      >
                        + Set target
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {modal && (
        <TargetModal
          ownerName={
            modal.bulk
              ? 'All AMs'
              : (profiles.find((p) => p.id === modal.ownerId)?.full_name || profiles.find((p) => p.id === modal.ownerId)?.email || '—')
          }
          bulk={modal.bulk}
          initial={modal.amount}
          periodKind={periodKind}
          periodStart={periodStart}
          periodEnd={periodEnd}
          saving={saveTarget.isPending}
          onClose={() => setModal(null)}
          onSave={submitModal}
        />
      )}
    </div>
  );
}

function TargetKpi({
  label, value, sub, topColor, bar, barColor,
}: {
  label: string;
  value: string;
  sub: string;
  topColor: string;
  bar?: number;
  barColor?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
      <div className={cn('h-[3px]', topColor)} />
      <div className="p-4">
        <div className="text-[10.5px] font-black uppercase tracking-widest text-text-3">{label}</div>
        <div className="tnum text-[26px] font-black tracking-tight text-text leading-none mt-1.5">{value}</div>
        <div className="text-[11.5px] text-text-3 font-semibold mt-1">{sub}</div>
        {bar != null && (
          <div className="mt-2.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className={cn('h-full rounded-full', barColor || 'bg-accent')} style={{ width: `${Math.min(100, bar)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function TargetModal({
  ownerName, bulk, initial, periodKind, periodStart, periodEnd, saving, onClose, onSave,
}: {
  ownerName: string;
  bulk: boolean;
  initial: number;
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  saving: boolean;
  onClose: () => void;
  onSave: (amount: number) => void | Promise<void>;
}) {
  const [amount, setAmount] = useState<string>(initial ? String(initial) : '');
  useEffect(() => { setAmount(initial ? String(initial) : ''); }, [initial]);
  const n = Number(amount.replace(/[^\d.]/g, ''));
  const valid = isFinite(n) && n >= 0;
  const periodLabel = periodKind === 'month' ? 'Monthly' : periodKind === 'quarter' ? 'Quarterly' : 'Yearly';

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md overflow-hidden flex flex-col my-8 border border-border">
        <header className="flex items-start gap-3 px-5 py-4 bg-gradient-to-r from-accent-soft via-accent-soft/50 to-surface border-b border-border relative">
          <div className="w-11 h-11 rounded-xl bg-accent text-cg-900 grid place-items-center flex-shrink-0 shadow-sh2">
            <DollarSign size={18} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black tracking-[0.18em] uppercase text-accent-ink">
              {bulk ? 'Bulk set targets' : 'Set target'}
            </div>
            <div className="text-[18px] font-black tracking-tight text-text mt-0.5 truncate">{ownerName}</div>
            <div className="text-[11.5px] text-text-2 mt-0.5">
              {periodLabel} · {fmtDate(periodStart)} → {fmtDate(periodEnd)}
            </div>
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-md text-text-3 hover:bg-surface-2" aria-label="Close">
            <X size={15} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Target (EGP) <span className="text-bad">*</span></span>
            <div className="mt-1.5 flex items-stretch border-2 border-border-2 rounded-lg overflow-hidden focus-within:border-accent-strong bg-surface">
              <span className="px-3 flex items-center bg-surface-2 border-r-2 border-border-2 text-[12px] font-black text-text-2">EGP</span>
              <input
                autoFocus
                type="number"
                min={0}
                step={1000}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && valid) onSave(n); }}
                placeholder="0"
                className="tnum flex-1 px-3 py-2.5 text-[15px] font-black text-text outline-none bg-transparent"
              />
            </div>
          </label>
          {bulk && (
            <p className="text-[11.5px] text-text-3">
              This will set the same target for every AM on the roster for the selected period. Existing targets are updated in place.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-surface-2/40">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-9 px-3.5 rounded-lg bg-surface border border-border-2 text-[13px] font-bold text-text-2 hover:bg-surface-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(n)}
            disabled={!valid || saving}
            className="h-9 px-4 rounded-lg bg-accent border border-accent-strong text-cg-900 text-[13px] font-black hover:bg-accent-strong disabled:opacity-50"
          >
            {saving ? 'Saving…' : bulk ? 'Apply to all' : 'Save target'}
          </button>
        </footer>
      </div>
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
