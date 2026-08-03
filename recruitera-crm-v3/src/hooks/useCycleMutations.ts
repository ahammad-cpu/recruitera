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
  // Renewal money timeline + fees (all optional).
  offer_sent_date?: string | null;
  invoice_date?: string | null;
  paid_date?: string | null;
  original_price?: string | number | null;
  discount_given?: string | number | null;
};

export function useSaveCycle(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: CycleFormInput) => {
      if (!accountId) throw new Error('No account');
      if (!form.plan_tier || !form.started_at || !form.ends_at) {
        throw new Error('Plan tier, term start, and term end are required');
      }
      const num = (v: string | number | null | undefined) =>
        v === '' || v == null ? null : Number(v);
      const payload = {
        account_id: accountId,
        plan_tier: form.plan_tier,
        value: num(form.value),
        currency: form.currency || 'EGP',
        started_at: form.started_at,
        ends_at: form.ends_at,
        status: form.status,
        auto_renew: !!form.auto_renew,
        payment_type: form.payment_type || null,
        notes: form.notes || null,
        offer_sent_date: form.offer_sent_date || null,
        invoice_date: form.invoice_date || null,
        paid_date: form.paid_date || null,
        original_price: num(form.original_price),
        discount_given: num(form.discount_given),
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

/**
 * Renewing a cycle from the board isn't just a status flip — the sales
 * cycle has actually turned over. We close the old cycle (status='renewed')
 * AND insert a fresh cycle for the next term so the customer immediately
 * reappears in the Healthy column with a real end date. Term length
 * mirrors the old term when known, else defaults to 365 days.
 */
export function useRenewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: old, error: readErr } = await supabase
        .from('contract_cycles')
        .select('id, account_id, cycle_number, plan_tier, value, currency, started_at, ends_at, payment_type, auto_renew')
        .eq('id', id)
        .single();
      if (readErr) throw readErr;
      if (!old?.account_id || !old?.ends_at) throw new Error('Cycle missing account or end date');

      const oldStart = old.started_at ? Date.parse(old.started_at) : NaN;
      const oldEnd = Date.parse(old.ends_at);
      const termDays = !Number.isNaN(oldStart) && !Number.isNaN(oldEnd)
        ? Math.max(30, Math.round((oldEnd - oldStart) / 86_400_000))
        : 365;

      const nextStart = old.ends_at;
      const nextEndMs = oldEnd + termDays * 86_400_000;
      const nextEnd = new Date(nextEndMs).toISOString().slice(0, 10);

      const { error: updErr } = await supabase
        .from('contract_cycles')
        .update({ status: 'renewed' })
        .eq('id', id);
      if (updErr) throw updErr;

      const { error: insErr } = await supabase.from('contract_cycles').insert({
        account_id: old.account_id,
        cycle_number: (old.cycle_number ?? 0) + 1,
        plan_tier: old.plan_tier,
        value: old.value,
        currency: old.currency || 'EGP',
        started_at: nextStart,
        ends_at: nextEnd,
        status: 'active',
        auto_renew: old.auto_renew ?? false,
        payment_type: old.payment_type ?? null,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success('Renewed — new cycle created');
      qc.invalidateQueries({ queryKey: ['contract_cycles'] });
    },
    onError: (e) => toast.error(`Renewal failed: ${String((e as Error).message || e)}`),
  });
}

/** Mark a cycle as actively-worked ("In Progress" column → status negotiating). */
export function useMarkInProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from('contract_cycles')
        .update({ status: 'negotiating' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Moved to In Progress');
      qc.invalidateQueries({ queryKey: ['contract_cycles'] });
    },
    onError: (e) => toast.error(`Update failed: ${String((e as Error).message || e)}`),
  });
}

export const CHURN_REASONS = [
  { key: 'competitor',        label: 'Went to competitor' },
  { key: 'feature_gap',       label: 'Missing features' },
  { key: 'performance',       label: 'Performance / quality' },
  { key: 'pricing',           label: 'Pricing too high' },
  { key: 'no_longer_needed',  label: 'No longer needed' },
  { key: 'budget_cut',        label: 'Budget cut' },
  { key: 'poor_support',      label: 'Poor support experience' },
  { key: 'product_bug',       label: 'Product bugs / instability' },
  { key: 'other',             label: 'Other' },
] as const;

export type ChurnReason = typeof CHURN_REASONS[number]['key'];

/** Mark a cycle as churned with a reason code + optional notes. */
export function useMarkChurned() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, notes }: { id: string; reason: ChurnReason; notes?: string | null }) => {
      const { error } = await supabase
        .from('contract_cycles')
        .update({
          status: 'churned',
          churn_reason: reason,
          churn_notes: notes || null,
          churned_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Marked as churned');
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
