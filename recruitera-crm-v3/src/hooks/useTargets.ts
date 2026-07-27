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

// Upsert semantics — when an id is passed, UPDATE that row instead of
// inserting. Editing an AM's target for a period should replace the
// existing row, not duplicate it, otherwise the sum-over-overlap logic
// in AM Performance double-counts.
export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Omit<Target, 'created_at'> & { id?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const set_by = session.session?.user?.id ?? null;
      if (t.id) {
        const { id, ...patch } = t;
        const { error } = await supabase.from('targets').update({ ...patch, set_by }).eq('id', id);
        if (error) throw error;
      } else {
        const { id: _drop, ...insertPayload } = t;
        void _drop;
        const { error } = await supabase.from('targets').insert({ ...insertPayload, set_by });
        if (error) throw error;
      }
    },
    onSuccess: (_r, v) => {
      toast.success(v.id ? 'Target updated' : 'Target saved');
      qc.invalidateQueries({ queryKey: ['targets'] });
    },
    onError: (e) => toast.error(`Save failed: ${String((e as Error).message || e)}`),
  });
}
