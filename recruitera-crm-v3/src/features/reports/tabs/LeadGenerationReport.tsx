import { useMemo, useState } from 'react';
import { useAccounts } from '@/hooks/useAccounts';
import { useDeals } from '@/hooks/useDeals';
import { useResolvedAttribution } from '@/hooks/useResolvedAttribution';
import { useUtmLinks, useUtmCampaigns } from '@/hooks/useUtmData';
import { fmtEgp, fmtInt, toEgp } from '@/lib/format';
import { DISQ_REASONS } from '@/hooks/useDisqualify';
import { useReportsOwner } from '../shared/reportsContext';
import { DateRangeFilter } from '../shared/DateRangeFilter';
import { resolveDateRange, type DateRangeKey } from '../shared/dateRange';

export default function LeadGenerationReport() {
  const accts = useAccounts();
  const deals = useDeals();
  const attribution = useResolvedAttribution();
  const links = useUtmLinks();
  const campaigns = useUtmCampaigns();
  const { ownerId } = useReportsOwner();
  const [rangeKey, setRangeKey] = useState<DateRangeKey>('90d');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  const range = useMemo(() => resolveDateRange(rangeKey, new Date(), from, to), [rangeKey, from, to]);

  const rows = useMemo(() => {
    let list = (accts.data ?? []).filter((a) => !a.merged_into);
    if (ownerId) list = list.filter((a) => a.owner_id === ownerId);
    list = list.filter((a) => {
      const createdISO = a.created_at.slice(0, 10);
      return createdISO >= range.startISO && createdISO <= range.endISO;
    });
    return list;
  }, [accts.data, ownerId, range]);

  // Per-channel breakdown: leads count, disqualified count, revenue attributed
  const dealAmountByAccount = useMemo(() => {
    const m = new Map<string, number>();
    (deals.data ?? []).forEach((d) => {
      if (!d.account_id || d.is_archived) return;
      m.set(d.account_id, (m.get(d.account_id) ?? 0) + toEgp(d.amount ?? 0, d.currency));
    });
    return m;
  }, [deals.data]);

  const channelStats = useMemo(() => {
    const stats = new Map<string, { leads: number; disq: number; revenue: number }>();
    rows.forEach((a) => {
      const ch = attribution.channelByAccountId.get(a.id) ?? '(unknown)';
      const cur = stats.get(ch) ?? { leads: 0, disq: 0, revenue: 0 };
      cur.leads += 1;
      if (a.disqualified_at) cur.disq += 1;
      cur.revenue += dealAmountByAccount.get(a.id) ?? toEgp(a.deal_value ?? 0, a.deal_currency);
      stats.set(ch, cur);
    });
    return Array.from(stats.entries())
      .map(([channel, s]) => ({ channel, ...s, dropOffRate: s.leads > 0 ? (s.disq / s.leads) * 100 : 0 }))
      .sort((a, b) => b.leads - a.leads);
  }, [rows, attribution.channelByAccountId, dealAmountByAccount]);

  // Disqualify reason breakdown (full, not top-6)
  const reasonBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => {
      if (!a.disqualified_at) return;
      const key = a.disqualified_reason || '(no reason)';
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .map(([reason, count]) => ({
        reason,
        label: DISQ_REASONS.find((r) => r.key === reason)?.label ?? reason,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  // Campaign stats (utm campaigns + attributed accounts + revenue)
  const campaignStats = useMemo(() => {
    const byCampaign = new Map<string, { accounts: number; revenue: number }>();
    rows.forEach((a) => {
      const camp = a.campaign;
      if (!camp) return;
      const cur = byCampaign.get(camp) ?? { accounts: 0, revenue: 0 };
      cur.accounts += 1;
      cur.revenue += dealAmountByAccount.get(a.id) ?? toEgp(a.deal_value ?? 0, a.deal_currency);
      byCampaign.set(camp, cur);
    });
    return Array.from(byCampaign.entries())
      .map(([campaign, s]) => ({ campaign, ...s }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [rows, dealAmountByAccount]);

  const totalLeads = rows.length;
  const totalDisq = rows.filter((a) => a.disqualified_at).length;
  const totalDropOff = totalLeads > 0 ? (totalDisq / totalLeads) * 100 : 0;

  const maxLeadsByChannel = Math.max(1, ...channelStats.map((s) => s.leads));
  const maxRevByChannel = Math.max(1, ...channelStats.map((s) => s.revenue));
  const maxReason = Math.max(1, ...reasonBreakdown.map((r) => r.count));
  const maxCampRev = Math.max(1, ...campaignStats.map((c) => c.revenue));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Leads in period" value={fmtInt(totalLeads)} />
        <Kpi label="Disqualified" value={fmtInt(totalDisq)} />
        <Kpi label="Drop-off rate" value={`${Math.round(totalDropOff)}%`} />
        <Kpi label="Named campaigns" value={fmtInt(campaigns.data?.length ?? 0)} sub={`${fmtInt(links.data?.length ?? 0)} UTM links`} />
      </div>

      {/* CHANNEL BREAKDOWN */}
      <Panel title="Leads by channel" hint="MT-resolved attribution — falls back to accounts.source">
        {channelStats.length === 0 && <Empty text="No leads in this range." />}
        {channelStats.map((s) => (
          <div key={s.channel} className="px-5 py-3 border-t border-border first:border-0">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold text-text flex-1 truncate">{s.channel}</span>
              <span className="text-[11.5px] text-text-3 tnum">{fmtInt(s.leads)} leads</span>
              <span className="text-[11.5px] text-text-3 tnum">{fmtEgp(s.revenue)}</span>
              <span className="text-[11.5px] text-bad tnum">{Math.round(s.dropOffRate)}% dropped</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-accent-strong" style={{ width: `${(s.leads / maxLeadsByChannel) * 100}%` }} />
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-ok" style={{ width: `${(s.revenue / maxRevByChannel) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </Panel>

      {/* DISQUALIFY REASONS */}
      <Panel title="Why leads were disqualified" hint="Full breakdown">
        {reasonBreakdown.length === 0 && <Empty text="No disqualifications in this range." />}
        {reasonBreakdown.map((r) => (
          <div key={r.reason} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{r.label}</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-bad" style={{ width: `${(r.count / maxReason) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-3 tnum w-10 text-right">{fmtInt(r.count)}</span>
          </div>
        ))}
      </Panel>

      {/* CAMPAIGNS */}
      <Panel title="Campaigns" hint="Ranked by attributed revenue">
        {campaignStats.length === 0 && <Empty text="No campaigns attributed in this range." />}
        {campaignStats.map((c) => (
          <div key={c.campaign} className="px-5 py-3 border-t border-border first:border-0 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text flex-1 truncate">{c.campaign}</span>
            <span className="text-[11.5px] text-text-3 tnum">{fmtInt(c.accounts)} accts</span>
            <div className="w-40 h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-ok" style={{ width: `${(c.revenue / maxCampRev) * 100}%` }} />
            </div>
            <span className="text-[11.5px] text-text-2 font-bold tnum w-24 text-right">{fmtEgp(c.revenue)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-sh1">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-text-3">{label}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight text-text mt-2">{value}</div>
      {sub && <div className="text-[11.5px] text-text-3 font-medium mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl shadow-sh1 overflow-hidden">
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3.5">
        <span className="text-[15px] font-extrabold tracking-tight">{title}</span>
        {hint && <span className="text-[12px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-8 text-center text-[12.5px] text-text-3 border-t border-border">{text}</div>;
}
