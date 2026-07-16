import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Contact = {
  id: string;
  account_id: string;
  full_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean | null;
  notes: string | null;
};

export type Activity = {
  id: string;
  account_id: string;
  author_id: string | null;
  type: string;
  text: string | null;
  title: string | null;
  from_stage: string | null;
  to_stage: string | null;
  task_due_date: string | null;
  task_done: boolean | null;
  assigned_to: string | null;
  parent_id: string | null;
  email_subject: string | null;
  call_outcome: string | null;
  call_duration_minutes: number | null;
  meeting_start_at: string | null;
  created_at: string;
};

export function useContacts(accountId: string | undefined) {
  return useQuery({
    queryKey: ['contacts', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId!)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useActivities(accountId: string | undefined) {
  return useQuery({
    queryKey: ['activities', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<Activity[]> => {
      const { data, error } = await supabase
        .from('activities')
        .select('id,account_id,author_id,type,text,title,from_stage,to_stage,task_due_date,task_done,assigned_to,parent_id,email_subject,call_outcome,call_duration_minutes,meeting_start_at,created_at')
        .eq('account_id', accountId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}
