import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Attribution fields that live on the accounts row itself (populated by the
// trial signup form / Bubble sync). Kept in a per-account hook so we don't
// bloat the main useAccounts payload for every list view.
export type AccountAttribution = {
  source: string | null;
  campaign: string | null;
  medium: string | null;
  first_touch: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  referrer_url: string | null;
  landing_page: string | null;
  cta_clicked: string | null;
  wp_marketing_channel: string | null;
  wp_rec_challenge: string | null;
  bubble_created_at: string | null;
  created_at: string | null;
};

const COLUMNS =
  'source,campaign,medium,first_touch,' +
  'utm_source,utm_medium,utm_campaign,utm_content,' +
  'referrer_url,landing_page,cta_clicked,' +
  'wp_marketing_channel,wp_rec_challenge,' +
  'bubble_created_at,created_at';

export function useAccountAttribution(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account_attribution', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AccountAttribution | null> => {
      const { data, error } = await supabase
        .from('accounts')
        .select(COLUMNS)
        .eq('id', accountId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AccountAttribution) ?? null;
    },
  });
}
