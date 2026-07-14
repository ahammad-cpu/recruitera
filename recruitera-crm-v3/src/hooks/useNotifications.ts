import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Notification = {
  id: string;
  recipient_id: string | null;
  account_id: string | null;
  activity_id: string | null;
  kind: string | null;
  title: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}
