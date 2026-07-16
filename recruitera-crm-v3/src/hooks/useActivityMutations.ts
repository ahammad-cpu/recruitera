import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export function useLogActivity(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      type, text, title, task_due_date, assigned_to, parent_id,
    }: {
      type: string; text?: string; title?: string;
      task_due_date?: string | null; assigned_to?: string | null; parent_id?: string | null;
    }) => {
      if (!accountId) throw new Error('No account');
      const { data: session } = await supabase.auth.getSession();
      const author_id = session.session?.user?.id ?? null;
      const { error } = await supabase.from('activities').insert({
        account_id: accountId,
        type,
        text: text || null,
        title: title || null,
        author_id,
        task_due_date: task_due_date || null,
        assigned_to: assigned_to || null,
        parent_id: parent_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Logged');
      qc.invalidateQueries({ queryKey: ['activities', accountId] });
      qc.invalidateQueries({ queryKey: ['activities', 'recent'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => toast.error(`Log failed: ${String(err)}`),
  });
}

export function useUpdateActivity(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text, title }: { id: string; text?: string | null; title?: string | null }) => {
      const patch: Record<string, unknown> = { edited_at: new Date().toISOString() };
      if (text !== undefined) patch.text = text;
      if (title !== undefined) patch.title = title;
      const { error } = await supabase.from('activities').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activities', accountId] });
      qc.invalidateQueries({ queryKey: ['activities', 'recent'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast.error(`Save failed: ${String((e as Error).message || e)}`),
  });
}

export function useDeleteActivity(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Hard delete — RLS restricts to author or admin server-side.
      const { error } = await supabase.from('activities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Deleted');
      qc.invalidateQueries({ queryKey: ['activities', accountId] });
      qc.invalidateQueries({ queryKey: ['activities', 'recent'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast.error(`Delete failed: ${String((e as Error).message || e)}`),
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
