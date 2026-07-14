import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type ActivityRow = {
  id: string;
  account_id: string;
  author_id: string | null;
  type: string;
  text: string | null;
  title: string | null;
  from_stage: string | null;
  to_stage: string | null;
  email_subject: string | null;
  call_outcome: string | null;
  created_at: string;
};

export function useRecentActivities(limit = 200) {
  return useQuery({
    queryKey: ['activities', 'recent', limit],
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id,account_id,author_id,type,text,title,from_stage,to_stage,email_subject,call_outcome,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}
