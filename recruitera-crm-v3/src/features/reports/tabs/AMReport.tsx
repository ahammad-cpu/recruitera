import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { useContractCycles } from '@/hooks/useContractCycles';
import { useProfiles } from '@/hooks/useUsersData';
import { fmtEgp, fmtInt } from '@/lib/format';
import { useReportsOwner } from '../shared/reportsContext';
import { DateRangeFilter } from '../shared/DateRangeFilter';
import { resolveDateRange, type DateRangeKey } from '../shared/dateRange';
import { ReportPanel, HeaderPill } from '../shared/ReportUI';
import { computeAmCrossAttribution, type AmCol, type SH } from './__parts/amCrossAttribution';
import { RequalificationRulesPanel } from './__parts/RequalificationRulesPanel';

const EMPTY_AM_COL: AmCol = {
  wins: 0, wonRev: 0, losses: 0, reopensAttempted: 0, reopensWon: 0, recoveredByOthers: 0,
};

export default function AMReport() {
  const { data, isLoading } = useAccounts();
  const cycles = useContractCycles();
  const profiles = useProfiles();
  const { ownerId } = useReportsOwner();
  const rows = data ?? [];

  const [rangeKey, setRangeKey] = useState<DateRangeKey>('90d');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const range = useMemo(() => resolveDateRange(rangeKey, new Date(), from, to), [rangeKey, from, to]);

  // Stage-history rows relevant to win/loss/reopen attribution, fetched
  // history-wide (not date-scoped) so a loss from before the reporting
  // period can still be matched against a win inside it.
  const shQuery = useQuery({
    queryKey: ['stage_history', 'am-cross-attribution'],
    queryFn: async (): Promise<SH[]> => {
      const { data, error } = await supabase
        .from('stage_history')
        .select('account_id, from_stage, to_stage, changed_by, changed_at')
        .or('to_stage.eq.won,to_stage.eq.lost,from_stage.eq.lost');
      if (error) throw error;
      return (data ?? []).filter((r) => r.changed_by) as SH[];
    },
  });

  const idToEmail = useMemo(() => {
    const m = new Map<string, string>();
    (profiles.data ?? []).forEach((p) => { if (p.email) m.set(p.id, p.email); });
    return m;
  }, [profiles.data]);

  const scoped = useMemo(() => (ownerId ? rows.filter((a) => a.owner_id === ownerId) : rows), [rows, ownerId]);
  const scopedIds = useMemo(() => new Set(scoped.map((a) => a.id)), [scoped]);

  const scopedSh = useMemo(
    () => (shQuery.data ?? []).filter((r) => scopedIds.has(r.account_id)),
    [shQuery.data, scopedIds],
  );
  const scopedCycles = useMemo(
    () => (cycles.data ?? []).filter((c) => scopedIds.has(c.account_id)).map((c) => ({
      account_id: c.account_id,
      value: c.value ?? 0,
      currency: c.currency ?? 'EGP',
      started_at: c.started_at ?? '',
    })),
    [cycles.data, scopedIds],
  );

  const crossAttrib = useMemo(
    () => computeAmCrossAttribution(scopedSh, scopedCycles, { from: range.startISO, to: range.endISO }),
    [scopedSh, scopedCycles, range.startISO, range.endISO],
  );

  const perAM = useMemo(() => {
    const map = new Map<string, { total: number; open: number; won: number; paid: number; lost: number }>();
    scoped.forEach((a) => {
      const k = a.am_mail || '— unassigned';
      const rec = map.get(k) ?? { total: 0, open: 0, won: 0, paid: 0, lost: 0 };
      rec.total++;
      const s = (a.stage || '').toLowerCase();
      if (['mql', 'sql', 'demo', 'proposal'].includes(s)) rec.open++;
      if (s === 'won') rec.won++;
      if (isPaid(a)) rec.paid++;
      if (s === 'lost') rec.lost++;
      map.set(k, rec);
    });

    // Merge cross-attribution columns, keyed by changed_by resolved to email
    // (falling back to the raw uid if no matching profile — still shown so
    // the credit isn't silently dropped).
    const crossByEmail = new Map<string, AmCol>();
    crossAttrib.forEach((col, uid) => {
      const key = idToEmail.get(uid) ?? uid;
      const cur = crossByEmail.get(key) ?? { ...EMPTY_AM_COL };
      crossByEmail.set(key, {
        wins: cur.wins + col.wins,
        wonRev: cur.wonRev + col.wonRev,
        losses: cur.losses + col.losses,
        reopensAttempted: cur.reopensAttempted + col.reopensAttempted,
        reopensWon: cur.reopensWon + col.reopensWon,
        recoveredByOthers: cur.recoveredByOthers + col.recoveredByOthers,
      });
    });

    const combined = Array.from(map.entries()).map(([am, r]) => ({
      am,
      ...r,
      cross: crossByEmail.get(am) ?? EMPTY_AM_COL,
    }));
    // Include AMs that only show up via cross-attribution (e.g. filtered out
    // of `rows` by owner scope but still credited on a shared account).
    crossByEmail.forEach((col, am) => {
      if (!map.has(am)) {
        combined.push({ am, total: 0, open: 0, won: 0, paid: 0, lost: 0, cross: col });
      }
    });

    return combined.sort((a, b) => b.total - a.total);
  }, [scoped, crossAttrib, idToEmail]);

  const totalAms = perAM.length;

  return (
    <div className="space-y-6">
    <ReportPanel
      title="Account managers"
      subtitle="Book breakdown by AM"
      headerRight={<HeaderPill>{fmtInt(totalAms)} AMs</HeaderPill>}
    >
      <div className="flex items-center gap-3 flex-wrap no-print mb-4">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label} — Reopens Won / Recovered by Others</span>
      </div>
      <div className="border border-border rounded-xl overflow-x-auto">
        <div className="grid grid-cols-[1fr_repeat(5,80px)_100px_repeat(2,110px)_130px] px-4 py-2.5 bg-surface-2 text-[11px] font-bold uppercase tracking-wider text-text-3 min-w-[980px]">
          <div>Account manager</div>
          <div className="text-right">Total</div>
          <div className="text-right">Open</div>
          <div className="text-right">Won</div>
          <div className="text-right">Paid</div>
          <div className="text-right">Lost</div>
          <div className="text-right">Win rate</div>
          <div className="text-right" title="Accounts this AM previously lost that were later reopened and won by a different AM">Reopens Won</div>
          <div className="text-right" title="Accounts this AM lost that came back and closed under another AM">Recovered by Others</div>
          <div className="text-right" title="Won revenue for the period, attributed to whoever owned the account at win time">Won revenue</div>
        </div>
        {isLoading && <div className="p-4 text-[12.5px] text-text-3">Loading…</div>}
        {!isLoading && perAM.length === 0 && (
          <div className="p-6 text-center text-[12.5px] text-text-3">No account managers in scope.</div>
        )}
        {perAM.map(({ am, total, open, won, paid, lost, cross }) => {
          const wr = won + lost > 0 ? (won / (won + lost)) * 100 : 0;
          return (
            <div key={am} className="grid grid-cols-[1fr_repeat(5,80px)_100px_repeat(2,110px)_130px] px-4 py-2.5 border-t border-border hover:bg-surface-2/60 text-[13px] min-w-[980px]">
              <div className="text-text truncate font-semibold" title={am}>{am}</div>
              <div className="text-right tnum font-bold">{fmtInt(total)}</div>
              <div className="text-right tnum text-info">{fmtInt(open)}</div>
              <div className="text-right tnum text-ok">{fmtInt(won)}</div>
              <div className="text-right tnum text-accent-ink">{fmtInt(paid)}</div>
              <div className="text-right tnum text-bad">{fmtInt(lost)}</div>
              <div className="text-right tnum font-bold">{wr.toFixed(0)}%</div>
              <div className="text-right tnum text-ok">{cross.reopensWon > 0 ? `+${fmtInt(cross.reopensWon)}` : '—'}</div>
              <div className="text-right tnum text-bad">{cross.recoveredByOthers > 0 ? `+${fmtInt(cross.recoveredByOthers)}` : '—'}</div>
              <div className="text-right tnum font-bold">{cross.wonRev > 0 ? fmtEgp(cross.wonRev) : '—'}</div>
            </div>
          );
        })}
      </div>
    </ReportPanel>

    <RequalificationRulesPanel from={range.startISO} to={range.endISO} />
    </div>
  );
}
