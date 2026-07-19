import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { BantAnswer, Deal, DealStage, DealType } from './useDeals';
import { OPEN_STAGES } from './useDeals';

const STEP = 1024;
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return STEP;
  if (before == null) return (after as number) - STEP;
  if (after == null)  return (before as number) + STEP;
  return (before + after) / 2;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['deals'] });
  qc.invalidateQueries({ queryKey: ['accounts'] });
}

/**
 * Business rule: no ACV gate on stage promotion. Deals move freely between
 * stages; entering ACV is encouraged but never blocking. The Won dialog
 * still enforces a positive amount at the moment a deal is marked Won.
 */
export function guardStagePromotion(
  _prev: DealStage,
  _next: DealStage,
  _amount: number | null | undefined,
): string | null {
  return null;
}

export type NewDealInput = {
  account_id: string;
  stage?: DealStage;
  deal_type?: DealType | null;
  amount?: number | null;
  currency?: string;
  owner_id?: string | null;
  title?: string | null;
  source?: string | null;
  expected_close_date?: string | null;
  temperature?: 'hot' | 'warm' | 'cold' | null;
  bant_budget?: BantAnswer | null;
  bant_authority?: BantAnswer | null;
  bant_need?: BantAnswer | null;
  bant_timing?: BantAnswer | null;
  bant_budget_note?: string | null;
  bant_authority_note?: string | null;
  bant_need_note?: string | null;
  bant_timing_note?: string | null;
};

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewDealInput): Promise<Deal> => {
      const { data: sess } = await supabase.auth.getSession();
      const created_by = sess.session?.user?.id ?? null;
      const bantTouched =
        input.bant_budget || input.bant_authority || input.bant_need || input.bant_timing;
      const { data, error } = await supabase
        .from('deals')
        .insert({
          account_id: input.account_id,
          stage: input.stage ?? 'mql',
          deal_type: input.deal_type ?? null,
          amount: input.amount ?? null,
          currency: input.currency ?? 'EGP',
          owner_id: input.owner_id ?? created_by,
          title: input.title ?? null,
          source: input.source ?? null,
          expected_close_date: input.expected_close_date ?? null,
          temperature: input.temperature ?? null,
          bant_budget:    input.bant_budget    ?? null,
          bant_authority: input.bant_authority ?? null,
          bant_need:      input.bant_need      ?? null,
          bant_timing:    input.bant_timing    ?? null,
          bant_budget_note:    input.bant_budget_note    ?? null,
          bant_authority_note: input.bant_authority_note ?? null,
          bant_need_note:      input.bant_need_note      ?? null,
          bant_timing_note:    input.bant_timing_note    ?? null,
          bant_filled_at: bantTouched ? new Date().toISOString() : null,
          bant_filled_by: bantTouched ? created_by : null,
          created_by,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as Deal;
    },
    onSuccess: () => { toast.success('Deal created'); invalidateAll(qc); },
    onError: (e) => toast.error(`Create deal failed: ${String((e as Error).message || e)}`),
  });
}

export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, position }: {
      id: string; stage: DealStage; position: number; currentAmount?: number | null;
    }) => {
      const { error } = await supabase
        .from('deals')
        .update({ stage, board_position: position, last_activity_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage, position }) => {
      await qc.cancelQueries({ queryKey: ['deals'] });
      const prev = qc.getQueryData<Deal[]>(['deals']);
      qc.setQueryData<Deal[]>(['deals'], (old) =>
        old?.map((d) => d.id === id ? { ...d, stage, board_position: position } : d) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['deals'], ctx.prev);
      toast.error(String((err as Error).message || err));
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Won requires a positive amount. Mirrors accounts.stage → 'won' via trigger. */
export function useMarkDealWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, currency, closed_at }: {
      id: string; amount: number; currency: string; closed_at?: string;
    }) => {
      if (!(amount > 0)) throw new Error('Deal value must be greater than 0 to mark as won');
      const { error } = await supabase.from('deals').update({
        stage: 'won',
        amount, currency,
        closed_at: closed_at ?? new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deal won'); invalidateAll(qc); },
    onError: (e) => toast.error(`Mark won failed: ${String((e as Error).message || e)}`),
  });
}

/** Lost requires a non-empty reason. */
export function useMarkDealLost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason, notes }: { id: string; reason: string; notes?: string | null }) => {
      if (!reason || !reason.trim()) throw new Error('Lost reason is required');
      if (reason === 'other' && !(notes && notes.trim())) throw new Error('Notes required when reason is "other"');
      const { data: sess } = await supabase.auth.getSession();
      const lost_by = sess.session?.user?.id ?? null;
      const { error } = await supabase.from('deals').update({
        stage: 'lost',
        loss_reason: reason,
        loss_notes: notes?.trim() || null,
        lost_by,
        closed_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deal marked as lost'); invalidateAll(qc); },
    onError: (e) => toast.error(`Mark lost failed: ${String((e as Error).message || e)}`),
  });
}

/**
 * Reopen a lost deal — audited via reopened_at / reopened_by. Sends it back
 * to an open stage (default 'mql'). Enforces that the deal is currently lost.
 */
export function useReopenDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, toStage = 'mql' }: { id: string; toStage?: DealStage }) => {
      if (!OPEN_STAGES.includes(toStage)) throw new Error('Reopen must target an open stage');
      const { data: sess } = await supabase.auth.getSession();
      const reopened_by = sess.session?.user?.id ?? null;
      // Guarded by RLS + this fetch: refuse if the deal isn't actually lost.
      const { data: current, error: fetchErr } = await supabase
        .from('deals').select('stage').eq('id', id).maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!current || current.stage !== 'lost') throw new Error('Deal is not lost — nothing to reopen');
      const { error } = await supabase.from('deals').update({
        stage: toStage,
        closed_at: null,
        loss_reason: null,
        loss_notes: null,
        lost_by: null,
        reopened_at: new Date().toISOString(),
        reopened_by,
        last_activity_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Deal reopened'); invalidateAll(qc); },
    onError: (e) => toast.error(`Reopen failed: ${String((e as Error).message || e)}`),
  });
}

export function useChangeDealOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, owner_id }: { id: string; owner_id: string | null }) => {
      const { error } = await supabase.from('deals').update({
        owner_id, last_activity_at: new Date().toISOString(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Owner updated'); invalidateAll(qc); },
    onError: (e) => toast.error(`Owner change failed: ${String((e as Error).message || e)}`),
  });
}
