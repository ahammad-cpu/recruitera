import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Unified history event returned by the `get_company_history` RPC (Task 8).
// Synthesizes activities + stage_history + audit + system_logs +
// a synthesized `account_created` event into one paginated timeline.
export type HistoryEvent = {
  id: string;
  kind: 'note' | 'call' | 'email' | 'meeting' | 'task_created' | 'task_done' |
        'stage_change' | 'loss' | 'reopen' | 'owner_change' | 'deal_value_change' |
        'requalification_fire' | 'meta_lead_attached' | 'account_created';
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  stage_at_time: string | null;
  title: string;
  body: string | null;
  meta: Record<string, unknown> | null;
};

const PAGE = 50;

/**
 * Infinite-query wrapper over the `get_company_history` RPC. Paginates
 * backwards in time using the `at` timestamp of the last event in the
 * previous page as the cursor (`p_before`).
 */
export function useCompanyHistory(accountId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['company_history', accountId],
    enabled: !!accountId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_company_history', {
        p_account_id: accountId,
        p_limit: PAGE,
        p_before: pageParam,
      });
      if (error) throw error;
      return (data ?? []) as HistoryEvent[];
    },
    getNextPageParam: (last: HistoryEvent[]) =>
      last.length === PAGE ? last[last.length - 1].at : null,
  });
}
