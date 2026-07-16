import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type InviteUserInput = {
  email: string;
  full_name: string;
  role_id: string | null;
  team_id: string | null;
  reports_to: string | null;
};

export type InviteUserResult = {
  ok: boolean;
  email: string;
  temp_password: string;
  message: string;
};

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteUserInput): Promise<InviteUserResult> => {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: input });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as InviteUserResult;
    },
    onSuccess: () => {
      toast.success('User invited');
      qc.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (e) => toast.error(`Invite failed: ${String((e as Error).message || e)}`),
  });
}
