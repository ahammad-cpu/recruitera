import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Reasons shown in the deal-level "Mark as lost" picker (LostDialog) and used
// for lost-reason reporting (LeadGenerationReport). Unrelated to the
// account-level Lose flow below — kept as-is, not in scope for this rename.
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

// Reasons for the account-level "Lose" flow (LossModal), backed by the
// `lose_account` RPC (Task 7).
export const LOSS_REASONS = [
  'no_budget', 'competitor', 'wrong_timing', 'no_response', 'chose_alternative', 'postponed', 'other',
] as const;
export type LossReason = typeof LOSS_REASONS[number];

/**
 * Thin wrapper over the `lose_account` RPC (Task 7). The RPC:
 *   1. reads current stage → writes lost_from_stage
 *   2. writes stage='lost' + loss_reason + loss_notes + lost_by atomically
 *   3. suppresses the log_stage_change trigger during the UPDATE so exactly
 *      ONE stage_history row is written (with reason_code + notes)
 * All that logic lives server-side to avoid dup rows and race conditions.
 */
export function useLoseAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { accountId: string; reason: LossReason; notes: string | null }) => {
      if (args.reason === 'other' && !(args.notes && args.notes.trim())) {
        throw new Error('Notes required when reason is "other"');
      }
      const { error } = await supabase.rpc('lose_account', {
        p_account_id:  args.accountId,
        p_reason_code: args.reason,
        p_notes:       args.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Account marked as lost');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['company_history'] });
    },
    onError: (err) => toast.error(`Mark lost failed: ${String((err as Error).message || err)}`),
  });
}

export function useRequalifyAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('accounts').update({
        stage,
        loss_reason: null,
        loss_notes: null,
        lost_by: null,
        lost_at: null,
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
