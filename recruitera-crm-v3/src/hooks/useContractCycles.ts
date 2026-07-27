import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Cycle = {
  id: string;
  account_id: string;
  cycle_number: number | null;
  status: string | null;
  started_at: string | null;
  ends_at: string | null;
  value: number | null;
  currency: string | null;
  renewal_due_date: string | null;
  auto_renew: boolean | null;
  plan_tier: string | null;
  // Renewal money timeline + fees.
  offer_sent_date: string | null;
  invoice_date: string | null;
  paid_date: string | null;
  original_price: number | null;
  discount_given: number | null;
  payment_type: string | null;
  notes: string | null;
};

export function useContractCycles() {
  return useQuery({
    queryKey: ['contract_cycles'],
    queryFn: async (): Promise<Cycle[]> => {
      const { data, error } = await supabase.from('contract_cycles').select('*').order('started_at', { ascending: false }).limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
