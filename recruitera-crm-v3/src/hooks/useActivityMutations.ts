import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export function useLogActivity(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, text, title }: { type: string; text?: string; title?: string }) => {
      if (!accountId) throw new Error('No account');
      const { data: session } = await supabase.auth.getSession();
      const author_id = session.session?.user?.id ?? null;
      const { error } = await supabase.from('activities').insert({
        account_id: accountId, type, text: text || null, title: title || null, author_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Logged');
      qc.invalidateQueries({ queryKey: ['activities', accountId] });
      qc.invalidateQueries({ queryKey: ['activities', 'recent'] });
    },
    onError: (err) => toast.error(`Log failed: ${String(err)}`),
  });
}

export function useToggleTaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('activities')
        .update({ task_done: done, task_done_at: done ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (err) => toast.error(`Update failed: ${String(err)}`),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => toast.error(`Update failed: ${String(err)}`),
  });
}
