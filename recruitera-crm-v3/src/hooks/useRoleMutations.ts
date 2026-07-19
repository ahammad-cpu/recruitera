import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import type { Role } from './useUsersData';

/**
 * Every togglable module (or scope flag) available on the Roles page.
 * Grouped into sections so the toggle grid is scannable — one section per
 * area of the app, plus a Scope section for override flags that aren't
 * pages. Every key persists to `roles.module_access` as a bare boolean; the
 * section grouping is purely a UI hint.
 *
 * Adding a module here is enough to make it appear in the Roles UI. Removing
 * one won't drop the historic value from existing roles — the DB stays
 * source of truth for whatever was toggled before it was removed.
 */
export type ModuleSection = 'workspace' | 'customer_success' | 'operations' | 'scope';
export type ModuleEntry = {
  key: string;
  label: string;
  section: ModuleSection;
  hint?: string;
  legacy?: boolean;
};

export const MODULE_CATALOG: ModuleEntry[] = [
  // Workspace — day-to-day sales pages
  { key: 'dashboard',      label: 'Dashboard',      section: 'workspace', hint: 'Landing page with KPIs, target banner, my tasks' },
  { key: 'accounts',       label: 'Companies',      section: 'workspace', hint: 'Companies list, filters, profiles' },
  { key: 'sales_pipeline', label: 'Sales Pipeline', section: 'workspace', hint: 'Kanban board, drag-to-move deal stages' },
  { key: 'renewal',        label: 'Renewal',        section: 'workspace', hint: 'Renewal board + 60-day automation' },
  { key: 'tasks',          label: 'Tasks',          section: 'workspace', hint: 'Task list, quick-complete, filters' },
  { key: 'notifications',  label: 'Notifications',  section: 'workspace', hint: 'In-app notification center' },
  { key: 'reports',        label: 'Reports',        section: 'workspace', hint: 'Lead Gen / Pipeline / Win-Loss / AM tabs' },

  // Customer Success area
  { key: 'customer_success', label: 'CS Dashboard',       section: 'customer_success', hint: 'Renewal target, health summary, at-risk companies' },
  { key: 'onboarding',       label: 'Onboarding',         section: 'customer_success', hint: 'Auto 10-day onboarding plans + tasks' },
  { key: 'health_score',     label: 'Health Score',       section: 'customer_success', hint: 'Company health signals (payment, engagement, onboarding)' },

  // Operations / admin
  { key: 'am_performance', label: 'AM Performance', section: 'operations', hint: 'Per-AM leaderboard and book breakdown' },
  { key: 'logs',           label: 'System Logs',    section: 'operations', hint: 'Activity feed across all companies' },
  { key: 'utm_generator',  label: 'UTM Generator',  section: 'operations', hint: 'Build tagged tracking links + campaigns' },
  { key: 'settings',       label: 'Settings',       section: 'operations', hint: 'Users, roles, teams, targets' },

  // Legacy — kept only so pre-rename data doesn't lose its toggle.
  // "AM Performance" (above) is the current canonical name.
  { key: 'team_targeting', label: 'Team Targeting (legacy)', section: 'operations', legacy: true, hint: 'Superseded by AM Performance — kept for existing role data' },

  // Scope flags — not a page, an override on the AM-owns-what rule
  { key: 'all_accounts', label: 'See all accounts', section: 'scope', hint: 'Bypass owner scoping and view every company. Grants read-only visibility outside the AM’s own book.' },
];

export const MODULE_SECTIONS: { key: ModuleSection; label: string }[] = [
  { key: 'workspace',        label: 'Workspace' },
  { key: 'customer_success', label: 'Customer Success' },
  { key: 'operations',       label: 'Operations & Admin' },
  { key: 'scope',            label: 'Scope Overrides' },
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
      const module_access = Object.fromEntries(
        MODULE_CATALOG.filter((m) => !m.legacy).map((m) => [m.key, false]),
      );
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
