import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Cycle } from './useContractCycles';

export type CycleFormInput = {
  id?: string | null;
  plan_tier: string;
  value: string | number | null;
  currency: string;
  started_at: string;
  ends_at: string;
  status: string;
  auto_renew: boolean;
  payment_type?: string | null;
  notes?: string | null;
};

export function useSaveCycle(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: CycleFormInput) => {
      if (!accountId) throw new Error('No account');
      if (!form.plan_tier || !form.started_at || !form.ends_at) {
        throw new Error('Plan tier, term start, and term end are required');
      }
      const payload = {
        account_id: accountId,
        plan_tier: form.plan_tier,
        value: form.value ? Number(form.value) : null,
        currency: form.currency || 'EGP',
        started_at: form.started_at,
        ends_at: form.ends_at,
        status: form.status,
        auto_renew: !!form.auto_renew,
        payment_type: form.payment_type || null,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await supabase.from('contract_cycles').update(payload).eq('id', form.id);
        if (error) throw error;
        return { edited: true };
      }
      // New cycle → next cycle_number for this account
      const { data: existing, error: readErr } = await supabase
        .from('contract_cycles').select('cycle_number').eq('account_id', accountId);
      if (readErr) throw readErr;
      const maxN = (existing ?? []).reduce((m, c: { cycle_number: number | null }) => Math.max(m, c.cycle_number || 0), 0);
      const { error } = await supabase.from('contract_cycles').insert({ ...payload, cycle_number: maxN + 1 });
      if (error) throw error;
      return { edited: false };
    },
    onSuccess: (r) => {
      toast.success(r.edited ? 'Cycle updated' : 'Cycle added');
      qc.invalidateQueries({ queryKey: ['contract_cycles', accountId] });
      qc.invalidateQueries({ queryKey: ['contract_cycles'] });
    },
    onError: (e) => toast.error(`Save failed: ${String((e as Error).message || e)}`),
  });
}

/** Used by the Renewal board's drag-and-drop: Renewed/Churned are the only
 * two columns backed by a real, settable status — the day-count buckets
 * (90/60/30/Overdue) are always derived from ends_at, never draggable-into. */
export function useUpdateCycleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'renewed' | 'churned' }) => {
      const { error } = await supabase.from('contract_cycles').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_r, { status }) => {
      toast.success(status === 'renewed' ? 'Marked as renewed' : 'Marked as churned');
      qc.invalidateQueries({ queryKey: ['contract_cycles'] });
    },
    onError: (e) => toast.error(`Update failed: ${String((e as Error).message || e)}`),
  });
}

export function useDeleteCycle(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cycleId: string) => {
      const { error } = await supabase.from('contract_cycles').delete().eq('id', cycleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cycle deleted');
      qc.invalidateQueries({ queryKey: ['contract_cycles', accountId] });
      qc.invalidateQueries({ queryKey: ['contract_cycles'] });
    },
    onError: (e) => toast.error(`Delete failed: ${String((e as Error).message || e)}`),
  });
}

export type { Cycle };
