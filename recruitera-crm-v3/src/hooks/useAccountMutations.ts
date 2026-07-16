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

export function useUpdateAccountDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; industry?: string | null; size?: string | null; domain?: string | null }) => {
      const { error } = await supabase.from('accounts').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success('Company details saved');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['account_attribution', v.id] });
    },
    onError: (e) => toast.error(`Save failed: ${String((e as Error).message || e)}`),
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
      toast.error(`Owner change failed: ${String((err as Error)?.message || err)}`);
    },
    onSuccess: (_d, v) => toast.success(`Owner set to ${v.am_mail || 'unassigned'}`),
  });
}

export function useBulkAssignOwner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, owner_id, am_mail }: { ids: string[]; owner_id: string | null; am_mail: string | null }) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from('accounts').update({ owner_id, am_mail }).in('id', ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, owner_id, am_mail }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<Account[]>(['accounts']);
      const set = new Set(ids);
      qc.setQueryData<Account[]>(['accounts'], (old) =>
        old?.map((a) => (set.has(a.id) ? { ...a, owner_id, am_mail } : a)) ?? old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
      toast.error(`Bulk assign failed: ${String(err)}`);
    },
    onSuccess: (_d, v) => toast.success(`${v.ids.length} account${v.ids.length === 1 ? '' : 's'} assigned to ${v.am_mail || 'unassigned'}`),
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
