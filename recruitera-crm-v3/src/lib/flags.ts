import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type FeatureFlagKey = 'deals_ui_hidden' | 'use_new_reports';

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const { data } = useQuery({
    queryKey: ['feature_flag', key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      // app_settings.value is jsonb; the value may be a bool literal or a JSON-wrapped bool.
      const raw = (data as { value: unknown } | null)?.value;
      return raw === true || raw === 'true';
    },
    staleTime: 60_000,
  });
  return data ?? false;
}
