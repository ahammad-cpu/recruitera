import { useMemo } from 'react';
import { useAccounts } from './useAccounts';
import { useMarketingTrackingAll } from './useMarketingTrackingAll';
import { resolveChannel } from '@/features/reports/shared/attribution';

export function useResolvedAttribution() {
  const accts = useAccounts();
  const mt = useMarketingTrackingAll();

  const channelByAccountId = useMemo(() => {
    const mtByRef = new Map<string, { first_source: string | null }>();
    (mt.data ?? []).forEach((r) => {
      if (r.company_ref) mtByRef.set(r.company_ref, { first_source: r.first_source });
    });
    const out = new Map<string, string>();
    (accts.data ?? []).forEach((a) => {
      out.set(a.id, resolveChannel({ source: a.source ?? null, company_ref: a.company_ref ?? null }, mtByRef));
    });
    return out;
  }, [accts.data, mt.data]);

  return { channelByAccountId, isLoading: accts.isLoading || mt.isLoading };
}
