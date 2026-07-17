import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MtRow = { company_ref: string; first_source: string | null };

export function useMarketingTrackingAll() {
  return useQuery({
    queryKey: ['marketing_tracking', 'all'],
    queryFn: async (): Promise<MtRow[]> => {
      const { data, error } = await supabase
        .from('marketing_tracking')
        .select('company_ref,first_source')
        .not('company_ref', 'is', null);
      if (error) throw error;
      return (data ?? []) as MtRow[];
    },
  });
}
