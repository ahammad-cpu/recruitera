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
import { ReportPanel, ReportKpi, HeaderPill, BarList, type BarRow } from '../shared/ReportUI';

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
      if (a.lost_at) cur.disq += 1;
      cur.revenue += dealAmountByAccount.get(a.id) ?? toEgp(a.deal_value ?? 0, a.deal_currency);
      stats.set(ch, cur);
    });
    return Array.from(stats.entries())
      .map(([channel, s]) => ({ channel, ...s, dropOffRate: s.leads > 0 ? (s.disq / s.leads) * 100 : 0 }))
      .sort((a, b) => b.leads - a.leads);
  }, [rows, attribution.channelByAccountId, dealAmountByAccount]);

  const reasonBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((a) => {
      if (!a.lost_at) return;
      const key = a.loss_reason || '(no reason)';
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
  const totalDisq = rows.filter((a) => a.lost_at).length;
  const totalDropOff = totalLeads > 0 ? (totalDisq / totalLeads) * 100 : 0;
  const totalRevenue = channelStats.reduce((s, c) => s + c.revenue, 0);

  const channelBars: BarRow[] = channelStats.map((s) => ({
    key: s.channel,
    label: s.channel,
    labelHint: `${fmtInt(s.leads)} leads · ${fmtEgp(s.revenue)}`,
    value: s.leads,
    displayValue: `${Math.round((s.leads / (totalLeads || 1)) * 100)}%`,
    rightHint: s.disq > 0 ? `${Math.round(s.dropOffRate)}% dropped` : undefined,
  }));

  const reasonBars: BarRow[] = reasonBreakdown.map((r) => ({
    key: r.reason,
    label: r.label,
    value: r.count,
    displayValue: fmtInt(r.count),
    rightHint: `${Math.round((r.count / (totalDisq || 1)) * 100)}%`,
    fillClass: 'bg-bad',
  }));

  const campaignBars: BarRow[] = campaignStats.map((c) => ({
    key: c.campaign,
    label: c.campaign,
    labelHint: `${fmtInt(c.accounts)} accounts`,
    value: c.revenue,
    displayValue: fmtEgp(c.revenue),
    fillClass: 'bg-ok',
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap no-print">
        <DateRangeFilter value={rangeKey} customFrom={from} customTo={to} onChange={(k, f, t) => { setRangeKey(k); setFrom(f); setTo(t); }} />
        <span className="text-[11px] text-text-3">{range.label}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ReportKpi label="Leads in period" value={fmtInt(totalLeads)} accent />
        <ReportKpi label="Disqualified" value={fmtInt(totalDisq)} tone={totalDisq > 0 ? 'bad' : undefined} />
        <ReportKpi label="Drop-off rate" value={`${Math.round(totalDropOff)}%`} sub="of leads in period" />
        <ReportKpi label="Named campaigns" value={fmtInt(campaigns.data?.length ?? 0)} sub={`${fmtInt(links.data?.length ?? 0)} UTM links`} />
      </div>

      <ReportPanel
        title="Sources"
        subtitle="Where leads come from"
        headerRight={<HeaderPill>{fmtInt(totalLeads)} leads</HeaderPill>}
      >
        <BarList rows={channelBars} variant="raw" emptyText="No leads in this range." autoColor />
      </ReportPanel>

      <ReportPanel
        title="Disqualified reasons"
        subtitle="Why leads dropped off"
        headerRight={<HeaderPill tone={totalDisq > 0 ? 'bad' : 'muted'}>{fmtInt(totalDisq)} disqualified</HeaderPill>}
      >
        <BarList rows={reasonBars} variant="raw" emptyText="No disqualifications in this range." />
      </ReportPanel>

      <ReportPanel
        title="Campaigns"
        subtitle="Ranked by attributed revenue"
        headerRight={<HeaderPill tone="ok">{fmtEgp(totalRevenue)}</HeaderPill>}
      >
        <BarList rows={campaignBars} variant="raw" emptyText="No campaigns attributed in this range." />
      </ReportPanel>
    </div>
  );
}
