import { useMe } from './useMe';
import { useRoles } from './useUsersData';

/**
 * True when the current user's role has module_access.list_only=true —
 * marketing/reporting roles that should see the Companies list but not
 * be able to open a profile page. Gates the /companies/:id route + the
 * click-through on list rows.
 *
 * Admins are never restricted (they own the permission surface).
 */
export function useListOnly(): { listOnly: boolean; isLoading: boolean } {
  const me = useMe();
  const roles = useRoles();
  const isLoading = me.isLoading || roles.isLoading;
  if (isLoading || !me.data) return { listOnly: false, isLoading };

  const myRole = (roles.data ?? []).find((r) => r.id === me.data?.role_id);
  const isAdmin = (me.data.role || '').toLowerCase() === 'admin' || myRole?.type === 'admin';
  if (isAdmin) return { listOnly: false, isLoading: false };

  const listOnly = !!myRole?.module_access?.list_only;
  return { listOnly, isLoading: false };
}
