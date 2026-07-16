import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Contact } from './useAccountDetail';

export function useUpsertContact(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Contact> & { id?: string }) => {
      if (!accountId) throw new Error('No account');
      const { id, ...rest } = input;
      const payload = { ...rest, account_id: accountId, updated_at: new Date().toISOString() };
      if (id) {
        const { error } = await supabase.from('contacts').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('contacts').insert({ is_primary: false, ...payload });
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
