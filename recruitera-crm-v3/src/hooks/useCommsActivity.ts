import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type CommsKind = 'call' | 'email' | 'whatsapp';

export type CommsRow = {
  author_id: string | null;
  type: CommsKind;
  created_at: string;
};

/** Powers the AM Performance Calls/Emails/WhatsApp columns — these are
 * logged through the note composer's channel picker (Call/Email/WhatsApp),
 * so counting activities by type + author is the real source, not a mock. */
export function useCommsActivity() {
  return useQuery({
    queryKey: ['activities', 'comms'],
    queryFn: async (): Promise<CommsRow[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('author_id,type,created_at')
        .in('type', ['call', 'email', 'whatsapp'])
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as CommsRow[];
    },
  });
}
