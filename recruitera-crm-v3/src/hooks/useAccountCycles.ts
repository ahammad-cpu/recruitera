import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cycle } from './useContractCycles';

export function useAccountCycles(accountId: string | undefined) {
  return useQuery({
    queryKey: ['contract_cycles', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Cycle[]> => {
      const { data, error } = await supabase
        .from('contract_cycles')
        .select('*')
        .eq('account_id', accountId!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Cycle[];
    },
  });
}
