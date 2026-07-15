import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Account } from './useAccounts';

export const DISQ_REASONS = [
  { key: 'not_icp',       label: 'Not ICP',       hint: 'Does not fit size, industry, or region' },
  { key: 'fake_lead',     label: 'Fake lead',     hint: 'Fake name / email / phone or bot submission' },
  { key: 'duplicate',     label: 'Duplicate',     hint: 'Already exists in CRM' },
  { key: 'no_response',   label: 'No response',   hint: 'Reached out, no reply after X attempts' },
  { key: 'wrong_timing',  label: 'Wrong timing',  hint: 'Interested but not now — revisit later' },
  { key: 'competitor',    label: 'Competitor',    hint: 'Works for a competitor' },
  { key: 'no_budget',     label: 'No budget',     hint: 'Cannot afford' },
  { key: 'other',         label: 'Other',         hint: 'Requires free-text explanation below' },
] as const;

export type DisqReason = typeof DISQ_REASONS[number]['key'];

export function useDisqualifyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, notes }: { id: string; reason: DisqReason; notes?: string | null }) => {
      if (reason === 'other' && !(notes && notes.trim())) {
        throw new Error('Notes required when reason is "other"');
      }
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from('accounts').update({
        stage: 'lost',
        disqualified_reason: reason,
        disqualified_notes: notes?.trim() || null,
        disqualified_by: session.session?.user?.id ?? null,
        disqualified_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, reason, notes }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => a.id === id ? { ...a, stage: 'lost', disqualified_reason: reason, disqualified_notes: notes ?? null, disqualified_at: new Date().toISOString() } : a) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Disqualify failed: ${String((err as Error).message || err)}`);
    },
    onSuccess: () => toast.success('Account disqualified'),
  });
}

export function useRequalifyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('accounts').update({
        stage,
        disqualified_reason: null,
        disqualified_notes: null,
        disqualified_by: null,
        disqualified_at: null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Requalified');
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (e) => toast.error(`Requalify failed: ${String((e as Error).message || e)}`),
  });
}
