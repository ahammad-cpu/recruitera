import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type UtmOption = { id: string; name: string; created_at: string };

const makeReader = (table: 'utm_sources' | 'utm_mediums') => () =>
  useQuery({
    queryKey: [table],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UtmOption[]> => {
      const { data, error } = await supabase.from(table).select('id,name,created_at').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

export const useUtmSources = makeReader('utm_sources');
export const useUtmMediums = makeReader('utm_mediums');

const makeCreator = (table: 'utm_sources' | 'utm_mediums', label: string) => () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed) throw new Error('Name required');
      const { data: session } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from(table)
        .insert({ name: trimmed, created_by: session.session?.user?.id ?? null })
        .select('id,name,created_at')
        .single();
      if (error) throw error;
      return data as UtmOption;
    },
    onSuccess: () => { toast.success(`${label} added`); qc.invalidateQueries({ queryKey: [table] }); },
    onError: (e) => toast.error(`${label} add failed: ${String((e as Error).message || e)}`),
  });
};

export const useCreateUtmSource = makeCreator('utm_sources', 'Source');
export const useCreateUtmMedium = makeCreator('utm_mediums', 'Medium');
