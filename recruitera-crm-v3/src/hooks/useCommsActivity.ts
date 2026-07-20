import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type CommsKind = 'call' | 'email' | 'whatsapp';

export type CommsRow = {
  author_id: string | null;
  type: CommsKind;
  created_at: string;
};

/**
 * Powers the AM Performance Calls/Emails/WhatsApp columns — these are
 * logged through the note composer's channel picker (Call/Email/WhatsApp),
 * so counting activities by type + author is the real source, not a mock.
 *
 * Fetches each channel independently: if a future channel is added in the
 * UI before the DB enum is migrated, that one channel returns [] instead
 * of the whole query erroring out and zeroing every count. (This actually
 * happened once — 'whatsapp' was pushed to the frontend before the enum
 * had it, and Calls + Emails both silently read 0 for weeks.)
 */
const KINDS: CommsKind[] = ['call', 'email', 'whatsapp'];

export function useCommsActivity() {
  return useQuery({
    queryKey: ['activities', 'comms'],
    queryFn: async (): Promise<CommsRow[]> => {
      const results = await Promise.all(
        KINDS.map(async (k) => {
          const { data, error } = await supabase
            .from('activities')
            .select('author_id,type,created_at')
            .eq('type', k)
            .limit(5000);
          if (error) {
            console.warn(`[useCommsActivity] ${k} query failed:`, error.message);
            return [];
          }
          return (data ?? []) as CommsRow[];
        }),
      );
      return results.flat();
    },
  });
}
