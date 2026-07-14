import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Contact } from './useAccountDetail';

export function useUpsertContact(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Contact> & { id?: string }) => {
      if (!accountId) throw new Error('No account');
      const payload = { ...input, account_id: accountId, updated_at: new Date().toISOString() };
      if (input.id) {
        const { error } = await supabase.from('contacts').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contacts').insert({ ...payload, is_primary: true });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Contact saved');
      qc.invalidateQueries({ queryKey: ['contacts', accountId] });
      qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
    },
    onError: (e) => toast.error(`Save failed: ${String((e as Error).message || e)}`),
  });
}
