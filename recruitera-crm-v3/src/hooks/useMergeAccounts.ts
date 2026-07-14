import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type MergeResult = {
  status: 'merged';
  winner: { id: string; name: string | null; stage: string | null };
  loser: string;
  contacts_moved: number;
};

export function useMergeAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ a, b, userPref }: { a: string; b: string; userPref?: string | null }) => {
      const { data, error } = await supabase.rpc('merge_accounts_smart', {
        p_a: a, p_b: b, p_user_pref: userPref ?? null,
      });
      if (error) throw error;
      return data as MergeResult;
    },
    onSuccess: (res) => {
      toast.success(`Merged into "${res.winner.name || 'account'}" — ${res.contacts_moved} contact${res.contacts_moved === 1 ? '' : 's'} moved`);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
    },
    onError: (e) => toast.error(`Merge failed: ${String((e as Error).message || e)}`),
  });
}
