import { useMe } from './useMe';
import { useRoles } from './useUsersData';

/**
 * Central module-access resolver. Reads the current user's role and
 * exposes `can(moduleKey)` so both routes and the sidebar gate off the
 * SAME source of truth (roles.module_access).
 *
 * Admins always pass. A user with no role_id (unassigned) passes too —
 * they fall back to legacy behaviour rather than being locked out of
 * everything.
 */
export function useModuleAccess() {
  const me = useMe();
  const roles = useRoles();
  const isLoading = me.isLoading || roles.isLoading;

  const myRole = (roles.data ?? []).find((r) => r.id === me.data?.role_id);
  const isAdmin = (me.data?.role || '').toLowerCase() === 'admin' || myRole?.type === 'admin';

  function can(moduleKey: string): boolean {
    if (isAdmin) return true;
    // No role assigned → don't hard-block (legacy accounts). Once a role
    // is set, its module_access is authoritative.
    if (!myRole) return true;
    return !!myRole.module_access?.[moduleKey];
  }

  return { can, isAdmin, isLoading, hasRole: !!myRole };
}
