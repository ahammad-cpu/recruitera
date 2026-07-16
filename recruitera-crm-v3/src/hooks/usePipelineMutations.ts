import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Account } from './useAccounts';

// Fractional card ordering. Rather than renumber every row on reorder, we
// pick a position between the two neighbours (or before/after when at the
// edge). Big spacing avoids float underflow for a very long time.
const STEP = 1024;
export function positionBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return STEP;
  if (before == null) return (after as number) - STEP;
  if (after == null)  return (before as number) + STEP;
  return (before + after) / 2;
}

export function useMoveDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, position }: { id: string; stage: string; position: number }) => {
      const { error } = await supabase
        .from('accounts')
        .update({ stage: stage as Account['stage'], board_position: position })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage, position }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => a.id === id ? { ...a, stage, board_position: position } : a) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Move failed: ${String((err as Error).message || err)}`);
    },
  });
}

// Move to WON — required deal value confirmation and optional follow-up
// activities (invoice request, collection task).
export function useMarkWon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, amount, currency, requestInvoice, createCollectionTask,
    }: {
      id: string; amount: number; currency: string;
      requestInvoice: boolean; createCollectionTask: boolean;
    }) => {
      if (!(amount > 0)) throw new Error('Deal value must be greater than 0');
      const { data: sess } = await supabase.auth.getSession();
      const author_id = sess.session?.user?.id ?? null;

      const { error } = await supabase.from('accounts').update({
        stage: 'won',
        deal_value: amount,
        deal_currency: currency,
      }).eq('id', id);
      if (error) throw error;

      const activities: Array<Record<string, unknown>> = [];
      if (requestInvoice) {
        activities.push({
          account_id: id, author_id, type: 'task',
          title: 'Request invoice from finance',
          text: 'Auto-created on WON — routes to finance@wuzzuf.net for issuance.',
        });
      }
      if (createCollectionTask) {
        const due = new Date(); due.setDate(due.getDate() + 14);
        activities.push({
          account_id: id, author_id, type: 'task',
          title: 'Track payment (14-day window)',
          text: 'Auto-created on WON — collection team tracks payment; flag overdue after 14 days.',
          task_due_date: due.toISOString().slice(0, 10),
        });
      }
      if (activities.length) {
        const { error: actErr } = await supabase.from('activities').insert(activities);
        if (actErr) console.warn('[markWon] follow-up activities insert failed', actErr);
      }
    },
    onSuccess: () => {
      toast.success('Deal marked as won');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['activities'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e) => toast.error(`Mark won failed: ${String((e as Error).message || e)}`),
  });
}
