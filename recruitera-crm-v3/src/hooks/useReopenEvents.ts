import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * A single "reopen" transition: an account moving out of `lost` into any
 * other stage (`from_stage='lost' AND to_stage != 'lost'`), as logged by the
 * `reopen_account` RPC into `stage_history` (see useReopenAccount.ts).
 */
export type ReopenEvent = {
  account_id: string;
  from_stage: string;
  to_stage: string;
  changed_at: string;
  reason_code: string | null;
};

/**
 * Fetches reopen events (stage_history rows where an account left `lost`)
 * whose `changed_at` falls within [fromISO, toISO]. Used by ReopenRatePanel
 * to build the Reopen Rate section of the Win/Loss/Churned report.
 */
export function useReopenEvents(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['reopen_events', fromISO, toISO],
    queryFn: async (): Promise<ReopenEvent[]> => {
      const { data, error } = await supabase
        .from('stage_history')
        .select('account_id, from_stage, to_stage, changed_at, reason_code')
        .eq('from_stage', 'lost')
        .neq('to_stage', 'lost')
        .gte('changed_at', fromISO)
        .lte('changed_at', toISO);
      if (error) throw error;
      return (data ?? []) as ReopenEvent[];
    },
  });
}
