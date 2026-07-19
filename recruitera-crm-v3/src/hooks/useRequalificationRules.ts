import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export const ASSIGNMENT_MODES = [
  'same_owner',
  'original_owner',
  'round_robin_pool',
  'round_robin_excluding_original_owner',
  'specific_user',
] as const;
export type AssignmentMode = typeof ASSIGNMENT_MODES[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const REQUAL_STAGES = ['lead', 'mql', 'sql', 'demo', 'proposal'] as const;
export type RequalStage = typeof REQUAL_STAGES[number];

export type RequalificationRule = {
  id: string;
  name: string;
  enabled: boolean;
  reason_code: string | null;
  from_stages: string[] | null;
  delay_days: number;
  task_title_tpl: string;
  task_priority: TaskPriority;
  assignment_mode: AssignmentMode;
  assignee_pool: string[] | null;
  specific_assignee: string | null;
  fires_once: boolean;
  created_at?: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export function useRequalificationRules() {
  return useQuery({
    queryKey: ['requalification_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('requalification_rules').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as RequalificationRule[];
    },
  });
}

export function useUpsertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<RequalificationRule>) => {
      const { data, error } = await supabase.from('requalification_rules').upsert(rule).select().single();
      if (error) throw error;
      return data as RequalificationRule;
    },
    onSuccess: () => {
      toast.success('Rule saved');
      qc.invalidateQueries({ queryKey: ['requalification_rules'] });
    },
    onError: (err) => toast.error(`Save failed: ${String((err as Error).message || err)}`),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('requalification_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Rule deleted');
      qc.invalidateQueries({ queryKey: ['requalification_rules'] });
    },
    onError: (err) => toast.error(`Delete failed: ${String((err as Error).message || err)}`),
  });
}
