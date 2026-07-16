import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type DealStage =
  | 'mql' | 'sql' | 'demo' | 'proposal' | 'negotiation' | 'won' | 'collected' | 'lost';

// NEGOTIATION exists in the DB enum for historical rows but the funnel no
// longer shows it — deals that land there are surfaced under PROPOSAL.
export const OPEN_STAGES: DealStage[] = ['mql', 'sql', 'demo', 'proposal'];
export const CLOSED_STAGES: DealStage[] = ['won', 'collected', 'lost'];

export type Deal = {
  id: string;
  account_id: string;
  title: string | null;
  stage: DealStage;
  amount: number | null;
  currency: string | null;
  owner_id: string | null;
  temperature: 'hot' | 'warm' | 'cold' | null;
  source: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  disqualified_reason: string | null;
  disqualified_notes: string | null;
  disqualified_by: string | null;
  reopened_at: string | null;
  reopened_by: string | null;
  board_position: number | null;
  is_archived: boolean;
  last_activity_at: string;
  version: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  // Joined company (from accounts) — reads live so renames propagate.
  company: {
    id: string;
    name: string | null;
    domain: string | null;
    industry: string | null;
    am_mail: string | null;
  } | null;
};

const DEAL_SELECT =
  'id,account_id,title,stage,amount,currency,owner_id,temperature,source,expected_close_date,closed_at,' +
  'disqualified_reason,disqualified_notes,disqualified_by,reopened_at,reopened_by,board_position,is_archived,' +
  'last_activity_at,version,created_at,created_by,updated_at,' +
  'company:accounts!deals_account_id_fkey(id,name,domain,industry,am_mail)';

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async (): Promise<Deal[]> => {
      const rows: Deal[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('deals')
          .select(DEAL_SELECT)
          .eq('is_archived', false)
          .order('board_position', { ascending: true, nullsFirst: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...(data as unknown as Deal[]));
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    },
  });
}

export function useDealsForCompany(accountId: string | undefined) {
  return useQuery({
    queryKey: ['deals', 'company', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select(DEAL_SELECT)
        .eq('account_id', accountId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
  });
}

/** Duplicate-warning guardrail — RPC-backed so it's cheap to call inline. */
export function useOpenDealsForCompany(accountId: string | undefined) {
  return useQuery({
    queryKey: ['deals', 'open-for-company', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('open_deals_for_account', { _account_id: accountId! });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; title: string | null; stage: DealStage;
        amount: number | null; currency: string | null; owner_id: string | null; created_at: string;
      }>;
    },
  });
}

export function isOpen(d: Pick<Deal, 'stage'>) { return OPEN_STAGES.includes(d.stage); }
export function isClosed(d: Pick<Deal, 'stage'>) { return CLOSED_STAGES.includes(d.stage); }
export function isStale(d: Pick<Deal, 'stage' | 'last_activity_at'>, days = 30): boolean {
  if (!isOpen(d)) return false;
  const t = new Date(d.last_activity_at).getTime();
  return Date.now() - t > days * 86_400_000;
}
export function isOverdue(d: Pick<Deal, 'stage' | 'expected_close_date'>): boolean {
  if (!isOpen(d) || !d.expected_close_date) return false;
  return new Date(d.expected_close_date).getTime() < Date.now();
}
