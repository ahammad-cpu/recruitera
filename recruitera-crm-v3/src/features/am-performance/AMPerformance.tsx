import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Phone, Mail, MessageCircle, ArrowLeftRight, DollarSign, Building2, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAccounts, type Account } from '@/hooks/useAccounts';
import { useProfiles, useRoles, type Profile, type Role } from '@/hooks/useUsersData';
import { useDeals, isOpen, isStale, type Deal } from '@/hooks/useDeals';
import { useTargets, useSaveTarget, type Target } from '@/hooks/useTargets';
import { useCommsActivity } from '@/hooks/useCommsActivity';
import { OwnerAvatar } from '@/components/shared/OwnerAvatar';
import { fmtInt, fmtEgp, fmtDate } from '@/lib/format';
import { cn } from '@/lib/cn';

type TabKey = 'team' | 'targets' | 'gaps';
const TABS: { key: TabKey; label: string; tone?: 'bad' }[] = [
  { key: 'team', label: 'Team Performance' },
  { key: 'targets', label: 'Targets' },
  { key: 'gaps', label: 'Gaps', tone: 'bad' },
];

// AM Performance is a Sales + CS view — admins/collection/marketing show
// up in the profiles list but they don't own accounts or carry targets,
// so filtering them out keeps the tables honest.
function isSalesOrCsRole(role: Role | undefined): boolean {
  if (!role) return false;
  if (role.type === 'member' || role.type === 'team_lead') return true;
  if ((role.name || '').toLowerCase().includes('customer success')) return true;
  return false;
}

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
  const rolesQ = useRoles();
  const dealsQ = useDeals();
  const targetsQ = useTargets();
  const commsQ = useCommsActivity();
  const [tab, setTab] = useState<TabKey>('team');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => !a.merged_into), [accountsQ.data]);
  // Only Account Managers + Customer Success are relevant here — admins,
  // collection, and marketing don't own deals or carry targets, so hiding
  // them keeps the tables focused on the sales + retention frontline.
  const profiles = useMemo(() => {
    const roleById = new Map<string, Role>();
    (rolesQ.data ?? []).forEach((r) => roleById.set(r.id, r));
    return (profilesQ.data ?? []).filter((p) => isSalesOrCsRole(roleById.get(p.role_id ?? '')));
  }, [profilesQ.data, rolesQ.data]);

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

      {tab === 'team' && (
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
      {tab === 'targets' && (
        <TargetsTab
          targets={targetsQ.data}
          profiles={profiles}
          deals={dealsQ.data ?? []}
          accounts={accounts}
          isLoading={targetsQ.isLoading || dealsQ.isLoading || accountsQ.isLoading}
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

// v2-style Targets tab: period toggle → team KPIs → per-AM table with
// target/actual/%/status + Set target action. Keeps the existing DB shape
// (targets rows keyed by owner_id + period_kind + period_start/end).

type PeriodKind = 'monthly' | 'quarterly' | 'yearly';

// The DB stores period_kind as 'month' | 'quarter' | 'year' and
// owner_kind as 'profile' for per-AM rows. The UI uses the fuller words.
// Map at the boundary so the two vocabularies never leak past this file.
const UI_TO_DB_PERIOD: Record<PeriodKind, string> = {
  monthly: 'month', quarterly: 'quarter', yearly: 'year',
};
function matchesUiPeriod(dbKind: string, ui: PeriodKind): boolean {
  return dbKind === UI_TO_DB_PERIOD[ui] || dbKind === ui;
}
function isProfileTarget(t: Target): boolean {
  return (t.owner_kind === 'profile' || t.owner_kind === 'user') && !!t.owner_id;
}

// Human label for the currently selected period — "Jul 2026", "Q3 2026",
// or just "2026" — so a rep glancing at the tab can tell what window
// they're looking at without decoding the date input.
function periodLabel(kind: PeriodKind, asOf: Date): string {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  if (kind === 'yearly') return String(y);
  if (kind === 'quarterly') return `Q${Math.floor(m / 3) + 1} ${y}`;
  return asOf.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Step the as-of date one period backwards or forwards. Anchor to the
// FIRST day of the resulting period so subsequent bounds/label lookups
// are stable regardless of how the user picked the initial date.
function stepPeriod(kind: PeriodKind, asOf: Date, direction: -1 | 1): Date {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  if (kind === 'yearly')   return new Date(y + direction, 0, 1);
  if (kind === 'quarterly') {
    const qStart = Math.floor(m / 3) * 3;
    return new Date(y, qStart + direction * 3, 1);
  }
  return new Date(y, m + direction, 1);
}

function periodBounds(kind: PeriodKind, asOf: Date): { start: string; end: string } {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  // Format in LOCAL time — toISOString() converts to UTC and shifts Jan 1
  // in Egypt (UTC+2/+3) back to Dec 31, breaking overlap math + display.
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (kind === 'yearly') {
    return { start: iso(new Date(y, 0, 1)), end: iso(new Date(y, 11, 31)) };
  }
  if (kind === 'quarterly') {
    const qStart = Math.floor(m / 3) * 3;
    return { start: iso(new Date(y, qStart, 1)), end: iso(new Date(y, qStart + 3, 0)) };
  }
  return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
}

function statusFromPct(pct: number, hasTarget: boolean): { label: string; cls: string; barCls: string } {
  if (!hasTarget) return { label: 'No target', cls: 'bg-surface-2 text-text-3', barCls: 'bg-border' };
  if (pct >= 100) return { label: 'Ahead',   cls: 'bg-ok-bg text-ok',     barCls: 'bg-ok' };
  if (pct >= 60)  return { label: 'On track',cls: 'bg-accent-soft text-accent-ink', barCls: 'bg-accent-strong' };
  if (pct >= 30)  return { label: 'Behind',  cls: 'bg-warn-bg text-warn', barCls: 'bg-warn' };
  return { label: 'At risk', cls: 'bg-bad-bg text-bad', barCls: 'bg-bad' };
}

function TargetsTab({
  targets, profiles, deals, accounts, isLoading,
}: {
  targets: Target[] | undefined;
  profiles: Profile[];
  deals: Deal[];
  accounts: Account[];
  isLoading: boolean;
}) {
  const [periodKind, setPeriodKind] = useState<PeriodKind>('monthly');
  const [asOfISO, setAsOfISO] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [editing, setEditing] = useState<{ profile: Profile; existing?: Target } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const asOfDate = useMemo(() => new Date(asOfISO), [asOfISO]);
  const { start, end } = useMemo(() => periodBounds(periodKind, asOfDate), [periodKind, asOfDate]);

  // Pro-rate each target row to the selected window. A Q3 target of 600k
  // shown at Monthly should attribute ~200k to July (31/92 of the quarter),
  // not the full 600k. When the target period sits entirely inside the
  // selected window (e.g. a Q3 target in Yearly view) the ratio is 1.0
  // and the full amount counts — which is what "yearly = sum of quarters"
  // requires.
  const targetTotalByOwner = useMemo(() => {
    const m = new Map<string, number>();
    const winStartMs = Date.parse(start);
    const winEndMs = Date.parse(end);
    const DAY = 86_400_000;
    (targets ?? []).forEach((t) => {
      if (!isProfileTarget(t)) return;
      if (t.period_end < start || t.period_start > end) return;
      const tStartMs = Date.parse(t.period_start);
      const tEndMs = Date.parse(t.period_end);
      if (Number.isNaN(tStartMs) || Number.isNaN(tEndMs)) return;
      const overlapDays = (Math.min(tEndMs, winEndMs) - Math.max(tStartMs, winStartMs)) / DAY + 1;
      const targetDays = (tEndMs - tStartMs) / DAY + 1;
      if (targetDays <= 0) return;
      const ratio = Math.max(0, Math.min(1, overlapDays / targetDays));
      const contribution = (t.amount_egp || 0) * ratio;
      m.set(t.owner_id!, (m.get(t.owner_id!) ?? 0) + contribution);
    });
    return m;
  }, [targets, start, end]);

  // Exact row for the Set/Edit action — only used to prefill the modal
  // and to decide "Edit" vs "+ Set target" copy. Matches the selected
  // granularity precisely so editing at Monthly doesn't clobber a
  // Quarterly plan.
  const exactTargetByOwner = useMemo(() => {
    const m = new Map<string, Target>();
    (targets ?? []).forEach((t) => {
      if (!isProfileTarget(t)) return;
      if (!matchesUiPeriod(t.period_kind, periodKind)) return;
      if (t.period_start <= start && t.period_end >= end) m.set(t.owner_id!, t);
    });
    return m;
  }, [targets, periodKind, start, end]);

  // account_id → paid_since ISO date. Used to attribute collected deals to
  // the exact period in which the account transitioned to Paid — deal
  // rows have closed_at NULL and last_activity_at bumps on every touch,
  // so falling back to those inflates the current period with old wins.
  const paidSinceByAccount = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => { if (a.paid_since) m.set(a.id, a.paid_since.slice(0, 10)); });
    return m;
  }, [accounts]);

  const actualByOwner = useMemo(() => {
    const m = new Map<string, number>();
    // Achievement counts revenue that HIT COLLECTION inside the selected
    // window. A Won deal that never gets paid shouldn't inflate hit-rate.
    const wins = deals.filter((d) => {
      if (!d.owner_id) return false;
      if (d.stage !== 'collected') return false;
      const paidISO = paidSinceByAccount.get(d.account_id);
      if (!paidISO) return false; // no attribution timestamp → skip, don't guess
      return paidISO >= start && paidISO <= end;
    });
    wins.forEach((d) => {
      const v = d.amount ?? 0;
      m.set(d.owner_id!, (m.get(d.owner_id!) ?? 0) + v);
    });
    return m;
  }, [deals, start, end]);

  const rows = useMemo(() => {
    return profiles
      .map((p) => {
        const targetAmt = targetTotalByOwner.get(p.id) ?? 0;
        const target = exactTargetByOwner.get(p.id);
        const actual = actualByOwner.get(p.id) ?? 0;
        const pct = targetAmt > 0 ? Math.round((actual / targetAmt) * 100) : 0;
        const hasAnyTarget = targetAmt > 0;
        return { profile: p, target, targetAmt, actual, pct, hasAnyTarget };
      })
      .sort((a, b) => {
        // AMs with a target first (highest pct first), then AMs with actuals, then rest alphabetically.
        if (a.hasAnyTarget !== b.hasAnyTarget) return a.hasAnyTarget ? -1 : 1;
        if (a.hasAnyTarget && b.hasAnyTarget) return b.pct - a.pct;
        if (a.actual !== b.actual) return b.actual - a.actual;
        return (a.profile.full_name || a.profile.email || '').localeCompare(b.profile.full_name || b.profile.email || '');
      });
  }, [profiles, targetTotalByOwner, exactTargetByOwner, actualByOwner]);

  const teamTarget = rows.reduce((s, r) => s + r.targetAmt, 0);
  const teamActual = rows.reduce((s, r) => s + r.actual, 0);
  const teamPct = teamTarget > 0 ? Math.round((teamActual / teamTarget) * 100) : 0;
  const amsWithTarget = rows.filter((r) => r.hasAnyTarget).length;

  return (
    <div className="space-y-4">
      {/* Period selector row — pills + as-of date + Bulk set */}
      <div className="flex items-center gap-3 flex-wrap bg-surface border border-border rounded-xl p-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Period</span>
        <div className="inline-flex gap-1 bg-surface-2 border border-border rounded-lg p-0.5">
          {(['monthly', 'quarterly', 'yearly'] as const).map((k) => {
            const active = periodKind === k;
            return (
              <button
                key={k}
                onClick={() => setPeriodKind(k)}
                className={cn(
                  'h-7 px-3 rounded-md text-[12.5px] font-bold capitalize transition-colors',
                  active ? 'bg-cg-900 text-white' : 'text-text-2 hover:bg-surface',
                )}
              >{k}</button>
            );
          })}
        </div>
        {/* Prev / label / next stepper — one click walks to Q1, Q2, next
            month, next year, etc. The date input is still there for
            jumping to an arbitrary point in time. */}
        <div className="inline-flex items-center h-9 border border-border rounded-lg bg-surface overflow-hidden">
          <button
            onClick={() => setAsOfISO(periodBounds(periodKind, stepPeriod(periodKind, asOfDate, -1)).start)}
            className="h-full w-8 grid place-items-center text-text-3 hover:bg-surface-2"
            title="Previous period"
          ><ChevronLeft size={15} /></button>
          <span className="px-3 text-[13px] font-black text-text tnum whitespace-nowrap border-x border-border">
            {periodLabel(periodKind, asOfDate)}
          </span>
          <button
            onClick={() => setAsOfISO(periodBounds(periodKind, stepPeriod(periodKind, asOfDate, 1)).start)}
            className="h-full w-8 grid place-items-center text-text-3 hover:bg-surface-2"
            title="Next period"
          ><ChevronRight size={15} /></button>
        </div>
        {/* Picker adapts to the period kind so reps don't need to think in
            terms of day numbers when they only care about month/quarter/year. */}
        {periodKind === 'monthly' && (
          <input
            type="month"
            value={`${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, '0')}`}
            onChange={(e) => {
              const [yy, mm] = e.target.value.split('-').map(Number);
              if (Number.isFinite(yy) && Number.isFinite(mm)) {
                setAsOfISO(`${yy}-${String(mm).padStart(2, '0')}-01`);
              }
            }}
            className="h-9 px-2.5 border border-border rounded-lg bg-surface text-[13px] outline-none focus:border-accent-strong"
          />
        )}
        {periodKind === 'quarterly' && (() => {
          const y = asOfDate.getFullYear();
          const q = Math.floor(asOfDate.getMonth() / 3) + 1;
          const years = [y - 2, y - 1, y, y + 1, y + 2];
          return (
            <select
              value={`${y}-Q${q}`}
              onChange={(e) => {
                const [yy, qq] = e.target.value.split('-Q').map(Number);
                if (Number.isFinite(yy) && Number.isFinite(qq)) {
                  setAsOfISO(`${yy}-${String((qq - 1) * 3 + 1).padStart(2, '0')}-01`);
                }
              }}
              className="h-9 pl-3 pr-8 border border-border rounded-lg bg-surface text-[13px] font-semibold text-text outline-none focus:border-accent-strong cursor-pointer"
            >
              {years.flatMap((yr) => [1, 2, 3, 4].map((qi) => (
                <option key={`${yr}-Q${qi}`} value={`${yr}-Q${qi}`}>Q{qi} {yr}</option>
              )))}
            </select>
          );
        })()}
        {periodKind === 'yearly' && (() => {
          const y = asOfDate.getFullYear();
          const years = [y - 3, y - 2, y - 1, y, y + 1, y + 2, y + 3];
          return (
            <select
              value={y}
              onChange={(e) => setAsOfISO(`${e.target.value}-01-01`)}
              className="h-9 pl-3 pr-8 border border-border rounded-lg bg-surface text-[13px] font-semibold text-text outline-none focus:border-accent-strong cursor-pointer"
            >
              {years.map((yr) => <option key={yr} value={yr}>{yr}</option>)}
            </select>
          );
        })()}
        <button
          onClick={() => setAsOfISO(new Date().toISOString().slice(0, 10))}
          className="h-9 px-3 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2"
          title="Jump to the current period"
        >Today</button>
        <div className="flex-1" />
        <button
          onClick={() => setBulkOpen(true)}
          className="inline-flex items-center h-9 px-4 rounded-lg border border-border bg-surface text-[13px] font-bold text-text-2 hover:bg-surface-2"
        >Bulk set</button>
      </div>

      {/* Team hero KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TargetHero
          label="Team total target"
          value={fmtEgp(teamTarget)}
          sub={`${amsWithTarget} of ${profiles.length} AMs have targets`}
          bar="bg-accent-strong"
        />
        <TargetHero
          label="Team total actual"
          value={fmtEgp(teamActual)}
          sub="From accounts collected in period"
          bar="bg-info"
        />
        <TargetHero
          label="Team achievement"
          value={teamTarget > 0 ? `${teamPct}%` : '—'}
          sub={teamTarget > 0 ? (teamPct >= 100 ? 'Ahead' : 'Behind') : 'No team target'}
          bar={teamTarget === 0 ? 'bg-border' : teamPct >= 100 ? 'bg-ok' : teamPct >= 60 ? 'bg-warn' : 'bg-bad'}
        />
      </div>

      {/* Per-AM table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sh1">
        <div className="overflow-x-auto sc">
          <table className="w-full text-left" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-surface-2 text-[10.5px] font-black uppercase tracking-wider text-text-3">
                <th className="px-4 py-3 text-left">Account manager</th>
                <th className="px-3 py-3 text-right">Target</th>
                <th className="px-3 py-3 text-right">Actual</th>
                <th className="px-3 py-3 text-right">%</th>
                <th className="px-3 py-3 text-left">Progress</th>
                <th className="px-3 py-3 text-left">Status</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="p-4 text-[12.5px] text-text-3">Loading…</td></tr>}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-[12.5px] text-text-3">No AMs to show.</td></tr>
              )}
              {!isLoading && rows.map((r) => {
                const s = statusFromPct(r.pct, r.hasAnyTarget);
                return (
                  <tr key={r.profile.id} className="border-t border-border hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <OwnerAvatar profile={r.profile} size={30} />
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-black text-text truncate">{r.profile.full_name || r.profile.email}</div>
                          {r.profile.email && r.profile.full_name && (
                            <div className="text-[11px] text-text-3 truncate">{r.profile.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tnum text-[13px] font-bold text-text">{r.hasAnyTarget ? fmtEgp(r.targetAmt) : '—'}</td>
                    <td className="px-3 py-3 text-right tnum text-[13px] font-black text-text">{fmtEgp(r.actual)}</td>
                    <td className="px-3 py-3 text-right tnum text-[12.5px] font-bold text-text-2">{r.hasAnyTarget ? `${r.pct}%` : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="h-2 rounded-full bg-surface-2 border border-border overflow-hidden min-w-[120px] max-w-[220px]">
                        <div className={cn('h-full rounded-full', s.barCls)} style={{ width: `${Math.min(100, r.pct)}%` }} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold', s.cls)}>{s.label}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => setEditing({ profile: r.profile, existing: r.target })}
                        className="inline-flex items-center h-8 px-3 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12px] font-black hover:bg-accent-strong"
                      >{r.target ? `Edit ${periodKind}` : '+ Set target'}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <SetTargetModal
          profile={editing.profile}
          existing={editing.existing}
          periodKind={periodKind}
          periodStart={start}
          periodEnd={end}
          onClose={() => setEditing(null)}
        />
      )}
      {bulkOpen && (
        <BulkSetTargetsModal
          profiles={profiles}
          existingByOwner={exactTargetByOwner}
          periodKind={periodKind}
          periodStart={start}
          periodEnd={end}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

function TargetHero({ label, value, sub, bar }: { label: string; value: string; sub: string; bar: string }) {
  return (
    <div className="relative bg-surface border border-border rounded-2xl p-5 shadow-sh1 overflow-hidden">
      <div className={cn('absolute top-0 left-0 right-0 h-[3px]', bar)} />
      <div className="text-[10px] font-black uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[28px] font-black tracking-tight text-text leading-none mt-2">{value}</div>
      <div className="text-[11.5px] text-text-3 font-semibold mt-2">{sub}</div>
    </div>
  );
}

function SetTargetModal({
  profile, existing, periodKind, periodStart, periodEnd, onClose,
}: {
  profile: Profile;
  existing: Target | undefined;
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
}) {
  const save = useSaveTarget();
  const [amount, setAmount] = useState<string>(String(existing?.amount_egp ?? ''));
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) { setErr('Enter a valid amount'); return; }
    try {
      await save.mutateAsync({
        // When editing an existing row, pass its id so the mutation UPDATEs
        // instead of inserting a duplicate.
        id: existing?.id,
        owner_kind: existing?.owner_kind ?? 'profile',
        owner_id: profile.id,
        category: existing?.category ?? 'new_sales',
        period_kind: existing?.period_kind ?? UI_TO_DB_PERIOD[periodKind],
        period_start: existing?.period_start ?? periodStart,
        period_end: existing?.period_end ?? periodEnd,
        amount_egp: n,
        notes: existing?.notes ?? null,
      });
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-md border border-border overflow-hidden">
        <header className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-black uppercase tracking-widest text-text-3">{periodKind} target</div>
          <div className="text-[18px] font-black text-text mt-0.5">{profile.full_name || profile.email}</div>
          <div className="text-[11.5px] text-text-3 mt-1">{periodStart} → {periodEnd}</div>
        </header>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Amount (EGP)</span>
            <input
              autoFocus
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full h-11 px-3 border-2 border-border-2 rounded-lg bg-surface text-[16px] font-black tnum outline-none focus:border-accent-strong"
              placeholder="0"
              min={0}
            />
          </label>
          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>
        <footer className="px-5 py-3 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2">Cancel</button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12.5px] font-black hover:bg-accent-strong disabled:opacity-50"
          >{save.isPending ? 'Saving…' : (existing ? 'Update' : 'Set target')}</button>
        </footer>
      </div>
    </div>
  );
}

function BulkSetTargetsModal({
  profiles, existingByOwner, periodKind, periodStart, periodEnd, onClose,
}: {
  profiles: Profile[];
  existingByOwner: Map<string, Target>;
  periodKind: PeriodKind;
  periodStart: string;
  periodEnd: string;
  onClose: () => void;
}) {
  const save = useSaveTarget();
  const [amount, setAmount] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelected(new Set(profiles.map((p) => p.id))); }
  function clear() { setSelected(new Set()); }

  async function submit() {
    setErr(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) { setErr('Enter a valid amount'); return; }
    if (selected.size === 0) { setErr('Pick at least one AM'); return; }
    const targets = [...selected].filter((id) => overwrite || !existingByOwner.has(id));
    if (targets.length === 0) { setErr('All selected AMs already have a target — enable Overwrite to replace.'); return; }
    try {
      // Sequential to keep the query invalidation predictable; volumes are small.
      for (const id of targets) {
        await save.mutateAsync({
          owner_kind: 'profile',
          owner_id: id,
          category: 'new_sales',
          period_kind: UI_TO_DB_PERIOD[periodKind],
          period_start: periodStart,
          period_end: periodEnd,
          amount_egp: n,
          notes: null,
        });
      }
      onClose();
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface rounded-2xl shadow-sh3 w-full max-w-lg border border-border overflow-hidden my-8">
        <header className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-black uppercase tracking-widest text-text-3">Bulk set {periodKind} target</div>
          <div className="text-[18px] font-black text-text mt-0.5">Same amount for many AMs</div>
          <div className="text-[11.5px] text-text-3 mt-1">{periodStart} → {periodEnd}</div>
        </header>
        <div className="p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-3">Amount (EGP)</span>
            <input
              autoFocus
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 w-full h-11 px-3 border-2 border-border-2 rounded-lg bg-surface text-[16px] font-black tnum outline-none focus:border-accent-strong"
              placeholder="0"
              min={0}
            />
          </label>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-3">AMs</span>
              <span className="text-[11px] text-text-3 tnum">{selected.size} selected</span>
              <div className="flex-1" />
              <button onClick={selectAll} className="text-[11.5px] font-bold text-accent-ink hover:underline">Select all</button>
              <button onClick={clear} className="text-[11.5px] font-bold text-text-3 hover:text-bad">Clear</button>
            </div>
            <div className="max-h-[260px] overflow-y-auto sc border border-border rounded-lg divide-y divide-border">
              {profiles.map((p) => {
                const on = selected.has(p.id);
                const has = existingByOwner.has(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-2">
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="accent-accent-strong" />
                    <span className="text-[13px] font-semibold text-text flex-1 truncate">{p.full_name || p.email}</span>
                    {has && <span className="text-[10px] font-black uppercase tracking-wider text-warn bg-warn-bg px-1.5 py-0.5 rounded">Has target</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="accent-accent-strong" />
            <span className="text-[12.5px] text-text-2">Overwrite AMs that already have a target for this period</span>
          </label>
          {err && <div className="text-[12px] text-bad bg-bad-bg border border-bad/30 rounded-lg px-3 py-2">{err}</div>}
        </div>
        <footer className="px-5 py-3 border-t border-border bg-surface-2/50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-surface text-[12.5px] font-bold text-text-2 hover:bg-surface-2">Cancel</button>
          <button
            onClick={submit}
            disabled={save.isPending}
            className="h-9 px-4 rounded-lg bg-accent text-cg-900 border border-accent-strong text-[12.5px] font-black hover:bg-accent-strong disabled:opacity-50"
          >{save.isPending ? 'Saving…' : `Apply to ${selected.size}`}</button>
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
