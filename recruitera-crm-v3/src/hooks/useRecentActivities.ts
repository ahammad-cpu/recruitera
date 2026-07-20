import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

/**
 * Recent activities feed. Kept for the dashboard side-widget where a small
 * cap (200) is fine. The Logs page uses `useRecentActivitiesInfinite`
 * because 300 rows was a hard ceiling that hid older events.
 */
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

/**
 * Paginated feed for the Logs page. Cursor is the `created_at` of the last
 * row on the previous page. Kept at PAGE_SIZE=300 so a single fetch still
 * covers a normal workday and initial render matches the old hook.
 */
const PAGE_SIZE = 300;
export function useRecentActivitiesInfinite() {
  return useInfiniteQuery({
    queryKey: ['activities', 'logs', PAGE_SIZE],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ActivityRow[]> => {
      let q = supabase
        .from('activities')
        .select('id,account_id,author_id,type,text,title,from_stage,to_stage,email_subject,call_outcome,created_at')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) q = q.lt('created_at', pageParam);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last) => (last.length === PAGE_SIZE ? last[last.length - 1].created_at : null),
  });
}
