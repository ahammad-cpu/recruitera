import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MarketingTracking = {
  id: string;
  account_id: string | null;
  device_type: string | null;
  first_source: string | null;
  first_medium: string | null;
  first_campaign: string | null;
  first_landing_page: string | null;
  first_date: string | null;
  last_source: string | null;
  last_medium: string | null;
  last_campaign: string | null;
  last_landing_page: string | null;
  last_date: string | null;
  touch_count: number | null;
};

export function useMarketingTracking(accountId: string | undefined) {
  return useQuery({
    queryKey: ['marketing_tracking', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<MarketingTracking | null> => {
      const { data, error } = await supabase
        .from('marketing_tracking')
        .select('id,account_id,device_type,first_source,first_medium,first_campaign,first_landing_page,first_date,last_source,last_medium,last_campaign,last_landing_page,last_date,touch_count')
        .eq('account_id', accountId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
