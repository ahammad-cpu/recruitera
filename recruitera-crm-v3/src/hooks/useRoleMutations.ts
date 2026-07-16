import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Role } from './useUsersData';

/** Module keys mirror crm.html's MODULE_CATALOG — same table, same JSONB shape. */
export const MODULE_CATALOG: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'team_targeting', label: 'Team Targeting' },
  { key: 'reports', label: 'Reports' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'sales_pipeline', label: 'Sales Pipeline' },
  { key: 'renewal', label: 'Renewal' },
  { key: 'logs', label: 'Logs' },
  { key: 'settings', label: 'Settings' },
  { key: 'utm_generator', label: 'UTM Generator' },
  { key: 'all_accounts', label: 'See all accounts' },
];

export function useToggleRoleModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, key }: { role: Role; key: string }) => {
      const next = { ...(role.module_access || {}), [key]: !role.module_access?.[key] };
      const { error } = await supabase.from('roles').update({ module_access: next }).eq('id', role.id);
      if (error) throw error;
      return next;
    },
    onMutate: async ({ role, key }) => {
      await qc.cancelQueries({ queryKey: ['roles'] });
      const prev = qc.getQueryData<Role[]>(['roles']);
      qc.setQueryData<Role[]>(['roles'], (old) => old?.map((r) => r.id === role.id
        ? { ...r, module_access: { ...(r.module_access || {}), [key]: !r.module_access?.[key] } }
        : r) ?? old);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['roles'], ctx.prev);
      toast.error(`Update failed: ${String((err as Error).message || err)}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Role name is required');
      const module_access = Object.fromEntries(MODULE_CATALOG.map((m) => [m.key, false]));
      const { data, error } = await supabase.from('roles').insert({
        name: trimmed, type: 'custom', is_system: false, module_access,
      }).select('*').single();
      if (error) throw error;
      return data as Role;
    },
    onSuccess: () => { toast.success('Role created'); qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: (e) => toast.error(`Create failed: ${String((e as Error).message || e)}`),
  });
}
