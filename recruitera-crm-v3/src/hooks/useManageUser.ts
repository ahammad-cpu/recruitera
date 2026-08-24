import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Admin-only user management via the `manage-user` edge function (service role).

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async (userId: string): Promise<{ temp_password: string }> => {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'reset_password', user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { temp_password: string };
    },
    onError: (e) => toast.error(`Reset failed: ${String((e as Error).message || e)}`),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action: 'delete', user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('User deleted');
      qc.invalidateQueries({ queryKey: ['profiles'] });
      // Ownership was cleared across accounts/deals — refresh those too.
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: (e) => toast.error(`Delete failed: ${String((e as Error).message || e)}`),
  });
}
