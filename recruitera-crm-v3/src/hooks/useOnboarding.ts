import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type OnboardingPlan = {
  id: string;
  account_id: string;
  owner_id: string | null;
  day_length: number;
  started_at: string;
  status: 'active' | 'completed';
  completed_at: string | null;
  created_at: string;
};

export function useOnboardingPlans() {
  return useQuery({
    queryKey: ['onboarding_plans'],
    queryFn: async (): Promise<OnboardingPlan[]> => {
      const { data, error } = await supabase.from('onboarding_plans').select('*').order('started_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
