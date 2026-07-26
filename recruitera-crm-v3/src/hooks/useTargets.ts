import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type PeriodKind = 'month' | 'quarter' | 'year';

export type Target = {
  id: string;
  owner_kind: string;
  owner_id: string | null;
  category: string;
  period_kind: string;
  period_start: string;
  period_end: string;
  amount_egp: number;
  notes: string | null;
  created_at: string;
};

export function periodEndOf(kind: PeriodKind, start: string): string {
  const d = new Date(start);
  if (kind === 'month') { d.setMonth(d.getMonth() + 1); d.setDate(0); }
  else if (kind === 'quarter') { d.setMonth(d.getMonth() + 3); d.setDate(0); }
  else { d.setFullYear(d.getFullYear() + 1); d.setDate(0); }
  return d.toISOString().slice(0, 10);
}

export function periodStartDefault(kind: PeriodKind, now = new Date()): string {
  const s = kind === 'month'
    ? new Date(now.getFullYear(), now.getMonth(), 1)
    : kind === 'quarter'
      ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
      : new Date(now.getFullYear(), 0, 1);
  return s.toISOString().slice(0, 10);
}

export function useTargets(params?: { periodKind?: PeriodKind; periodStart?: string }) {
  const periodKind = params?.periodKind;
  const periodStart = params?.periodStart;
  return useQuery({
    queryKey: ['targets', periodKind ?? 'all', periodStart ?? 'all'],
    queryFn: async (): Promise<Target[]> => {
      let q = supabase.from('targets').select('*').order('period_start', { ascending: false });
      if (periodKind) q = q.eq('period_kind', periodKind);
      if (periodStart) q = q.eq('period_start', periodStart);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: {
      owner_kind: 'profile' | 'team';
      owner_id: string | null;
      category?: string;
      period_kind: PeriodKind;
      period_start: string;
      period_end?: string;
      amount_egp: number;
      existingId?: string | null;
      notes?: string | null;
    }) => {
      const payload = {
        owner_kind: t.owner_kind,
        owner_id: t.owner_id,
        category: t.category ?? 'collected',
        period_kind: t.period_kind,
        period_start: t.period_start,
        period_end: t.period_end ?? periodEndOf(t.period_kind, t.period_start),
        amount_egp: Math.round(t.amount_egp),
        notes: t.notes ?? null,
      };
      if (t.existingId) {
        const { error } = await supabase
          .from('targets')
          .update({ amount_egp: payload.amount_egp })
          .eq('id', t.existingId);
        if (error) throw error;
      } else {
        const { data: session } = await supabase.auth.getSession();
        const { error } = await supabase
          .from('targets')
          .insert({ ...payload, set_by: session.session?.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Target saved');
      qc.invalidateQueries({ queryKey: ['targets'] });
    },
    onError: (e) => toast.error(`Save failed: ${String(e)}`),
  });
}
