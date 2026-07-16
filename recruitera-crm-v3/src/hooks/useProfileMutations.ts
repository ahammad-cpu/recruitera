import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type ProfileFieldUpdate = {
  id: string;
  role_id?: string | null;
  team_id?: string | null;
  reports_to?: string | null;
};

/** Powers the inline Role / Team / Reports-to pickers on the Members table. */
export function useUpdateProfileFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: ProfileFieldUpdate) => {
      const { error } = await supabase.from('profiles').update(fields).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['profiles'] }); },
    onError: (e) => toast.error(`Update failed: ${String((e as Error).message || e)}`),
  });
}
