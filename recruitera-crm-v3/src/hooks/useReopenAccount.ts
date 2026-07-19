import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// Reasons shown in the account-level "Reopen" flow (ReopenModal), backed by
// the `reopen_account` RPC (Task 7).
export const REOPEN_REASONS = [
  'customer_returned', 'budget_approved', 'timing_changed', 'wrong_call', 'other',
] as const;
export type ReopenReason = typeof REOPEN_REASONS[number];

// Stages a lost account can be reopened into. Reopening directly to 'lost'
// or 'won'/'paid' style terminal stages is not allowed — enforced server-side too.
export const REOPEN_TARGET_STAGES = ['lead', 'mql', 'sql', 'demo', 'proposal'] as const;
export type ReopenTargetStage = typeof REOPEN_TARGET_STAGES[number];

/**
 * Thin wrapper over the `reopen_account` RPC (Task 7). The RPC:
 *   1. guards that the account is currently 'lost' and the target stage /
 *      reason code are valid
 *   2. writes stage=<target> and clears loss_reason / loss_notes / lost_at /
 *      lost_by / lost_from_stage
 *   3. logs the transition (with reason_code + notes) into stage_history
 * All that logic lives server-side to avoid race conditions.
 */
export function useReopenAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      accountId: string;
      targetStage: ReopenTargetStage;
      reasonCode: ReopenReason;
      notes: string | null;
    }) => {
      const { error } = await supabase.rpc('reopen_account', {
        p_account_id: args.accountId,
        p_target_stage: args.targetStage,
        p_reason_code: args.reasonCode,
        p_notes: args.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Account reopened');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['company_history'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => toast.error(`Reopen failed: ${String((err as Error).message || err)}`),
  });
}
