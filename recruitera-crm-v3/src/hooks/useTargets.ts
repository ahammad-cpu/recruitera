import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type Target = {
  id: string;
  owner_kind: string;
  owner_id: string | null;
  category: string;
  period_kind: string;
  period_start: string;
  period_end: string;
  amount_egp: number;
  notes: string | null;
  created_at: string;
};

export function useTargets() {
  return useQuery({
    queryKey: ['targets'],
    queryFn: async (): Promise<Target[]> => {
      const { data, error } = await supabase.from('targets').select('*').order('period_start', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Omit<Target, 'id' | 'created_at'>) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from('targets').insert({ ...t, set_by: session.session?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Target saved'); qc.invalidateQueries({ queryKey: ['targets'] }); },
    onError: (e) => toast.error(`Save failed: ${String(e)}`),
  });
}
