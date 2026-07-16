import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type Tag = {
  id: string;
  label: string;
  color: string | null;
  is_preset: boolean | null;
  created_at: string;
};

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase.from('tags').select('*').order('label');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAccountTags(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account_tags', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from('account_tags')
        .select('tag:tags(*)')
        .eq('account_id', accountId!);
      if (error) throw error;
      return (data ?? []).map((r: { tag: Tag }) => r.tag).filter(Boolean);
    },
  });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string): Promise<Tag> => {
      const { data: sess } = await supabase.auth.getSession();
      const created_by = sess.session?.user?.id ?? null;
      const { data, error } = await supabase
        .from('tags')
        .insert({ label: label.trim(), created_by })
        .select('*')
        .single();
      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tags'] }); },
    onError: (e) => toast.error(`Create tag failed: ${String((e as Error).message || e)}`),
  });
}

export function useAttachTag(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      if (!accountId) throw new Error('No account');
      const { data: sess } = await supabase.auth.getSession();
      const added_by = sess.session?.user?.id ?? null;
      const { error } = await supabase
        .from('account_tags')
        .insert({ account_id: accountId, tag_id: tagId, added_by });
      if (error && !String(error.message).match(/duplicate/i)) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account_tags', accountId] }); },
    onError: (e) => toast.error(`Attach failed: ${String((e as Error).message || e)}`),
  });
}

export function useDetachTag(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tagId: string) => {
      if (!accountId) throw new Error('No account');
      const { error } = await supabase
        .from('account_tags')
        .delete()
        .eq('account_id', accountId)
        .eq('tag_id', tagId);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account_tags', accountId] }); },
    onError: (e) => toast.error(`Remove failed: ${String((e as Error).message || e)}`),
  });
}
