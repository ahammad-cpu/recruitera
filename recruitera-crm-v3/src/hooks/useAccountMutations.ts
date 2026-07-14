import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Account } from './useAccounts';

export function useRenameAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('accounts').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, name } : a)) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Rename failed: ${String(err)}`);
    },
    onSuccess: (_d, v) => toast.success(`Renamed to "${v.name}"`),
  });
}

export function useChangeOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, owner_id, am_mail }: { id: string; owner_id: string | null; am_mail: string | null }) => {
      const { error } = await supabase.from('accounts').update({ owner_id, am_mail }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, owner_id, am_mail }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, owner_id, am_mail } : a)) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Owner change failed: ${String(err)}`);
    },
    onSuccess: (_d, v) => toast.success(`Owner set to ${v.am_mail || 'unassigned'}`),
  });
}

export function useChangeStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase.from('accounts').update({ stage }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, stage } : a)) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Stage change failed: ${String(err)}`);
    },
    onSuccess: (_d, v) => toast.success(`Stage → ${v.stage.toUpperCase()}`),
  });
}
