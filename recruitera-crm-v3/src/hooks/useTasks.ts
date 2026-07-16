import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Task = {
  id: string;
  account_id: string | null;
  author_id: string | null;
  title: string | null;
  text: string | null;
  task_due_date: string | null;
  task_done: boolean | null;
  task_done_at: string | null;
  priority: string | null;
  assigned_to: string | null;
  created_at: string;
  onboarding_plan_id: string | null;
};

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id,account_id,author_id,title,text,task_due_date,task_done,task_done_at,priority,assigned_to,created_at,onboarding_plan_id')
        .eq('type', 'task')
        .order('task_due_date', { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}
