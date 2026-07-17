import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Account = {
  id: string;
  bubble_id: string | null;
  name: string | null;
  domain: string | null;
  stage: string | null;
  source: string | null;
  am_mail: string | null;
  paid_status: string | null;
  activation_status: string | null;
  has_trial: boolean | null;
  deal_value: number | null;
  deal_currency: string | null;
  owner_id: string | null;
  customer_success_id: string | null;
  disq_stage: string | null;
  disqualified_reason: string | null;
  disqualified_notes: string | null;
  disqualified_at: string | null;
  cs_email: string | null;
  company_ref: string | null;
  campaign: string | null;
  merged_into: string | null;
  funnel_score: number | null;
  board_position: number | null;
  created_at: string;
  bubble_created_at: string | null;
  health_score: number | null;
  health_status: 'healthy' | 'needs_attention' | 'at_risk' | 'critical' | null;
  health_factors: { payment_contract: number; engagement: number; onboarding: number; reasons: string[] } | null;
};

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: async (): Promise<Account[]> => {
      const rows: Account[] = [];
      const PAGE = 1000;
      let from = 0;
      // paginate — accounts table is ~500-600 rows but keep this robust
      while (true) {
        const { data, error } = await supabase
          .from('accounts')
          .select('id,bubble_id,name,domain,stage,source,am_mail,paid_status,activation_status,has_trial,deal_value,deal_currency,owner_id,customer_success_id,disq_stage,disqualified_reason,disqualified_notes,disqualified_at,cs_email,company_ref,campaign,merged_into,funnel_score,board_position,created_at,bubble_created_at,health_score,health_status,health_factors')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return rows;
    },
  });
}

export const isPaid = (a: Account) =>
  (a.paid_status === 'Paid' || a.paid_status === 'Without Charge') &&
  a.activation_status === 'Active';
