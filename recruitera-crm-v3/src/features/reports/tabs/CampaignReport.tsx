import { useMemo } from 'react';
import { useUtmLinks, useUtmCampaigns } from '@/hooks/useUtmData';
import { useAccounts } from '@/hooks/useAccounts';
import { KpiCard } from '@/components/shared/KpiCard';
import { fmtInt } from '@/lib/format';

export default function CampaignReport() {
  const links = useUtmLinks();
  const campaigns = useUtmCampaigns();
  const accounts = useAccounts();

  const byCampaign = useMemo(() => {
    const m = new Map<string, number>();
    (links.data ?? []).forEach((l) => {
      const k = l.utm_campaign || '(none)';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [links.data]);

  const bySourceAccounts = useMemo(() => {
    const m = new Map<string, number>();
    (accounts.data ?? []).forEach((a) => {
      const k = a.source || '(direct)';
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [accounts.data]);

  const maxAcct = Math.max(1, ...bySourceAccounts.map((r) => r[1]));
  const maxCamp = Math.max(1, ...byCampaign.map((r) => r[1]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Saved links" value={links.isLoading ? '…' : fmtInt(links.data?.length ?? 0)} />
        <KpiCard label="Named campaigns" value={campaigns.isLoading ? '…' : fmtInt(campaigns.data?.length ?? 0)} />
        <KpiCard label="Total accounts (attributed)" value={accounts.isLoading ? '…' : fmtInt((accounts.data ?? []).filter((a) => a.source).length)} accent="accent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Links per campaign">
          {byCampaign.length === 0 && <div className="text-[12px] text-text-3">No saved UTM links yet.</div>}
          {byCampaign.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxCamp} />
          ))}
        </Panel>
        <Panel title="Accounts by source (top 10)">
          {bySourceAccounts.map(([k, v]) => (
            <Bar key={k} label={k} value={v} max={maxAcct} />
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-2xl p-5 shadow-sh1 space-y-2">
      <div className="text-[13px] font-bold text-text mb-2">{title}</div>
      {children}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(3, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-[12px] text-text-2 truncate" title={label}>{label}</div>
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div className="h-full bg-accent-strong" style={{ width: `${pct}%` }} />
      </div>
      <div className="tnum text-[12px] font-bold text-text-2 w-10 text-right">{fmtInt(value)}</div>
    </div>
  );
}
