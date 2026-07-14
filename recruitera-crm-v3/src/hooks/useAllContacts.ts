import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Contact } from './useAccountDetail';

/**
 * Fetch every contact row once and index by account_id.
 * Used by Companies list for the Contact column and by dedupe logic
 * that matches on contact email / phone.
 */
export function useAllContacts() {
  return useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: async (): Promise<Map<string, Contact[]>> => {
      const map = new Map<string, Contact[]>();
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .order('is_primary', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        for (const c of data as Contact[]) {
          const arr = map.get(c.account_id) ?? [];
          arr.push(c);
          map.set(c.account_id, arr);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return map;
    },
    staleTime: 5 * 60_000,
  });
}
