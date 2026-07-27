import { useMe } from './useMe';
import { useRoles } from './useUsersData';

/**
 * Canonical admin check. Reads BOTH signals:
 *   1. profiles.role (legacy text field) === 'admin'
 *   2. profiles.role_id → roles.type === 'admin' (modern FK)
 *
 * Either one being true means admin. If they disagree the modern
 * role_id wins over stale text — but we accept legacy 'admin' too so
 * accounts that haven't been migrated aren't accidentally locked out.
 *
 * Returns { isAdmin, isLoading } so gates can render null while the
 * queries resolve instead of flashing content.
 */
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const me = useMe();
  const roles = useRoles();
  const isLoading = me.isLoading || roles.isLoading;
  if (isLoading || !me.data) return { isAdmin: false, isLoading };

  const legacyAdmin = (me.data.role || '').toLowerCase() === 'admin';
  const roleId = me.data.role_id;
  const modernAdmin = !!roleId
    && (roles.data ?? []).some((r) => r.id === roleId && r.type === 'admin');

  return { isAdmin: legacyAdmin || modernAdmin, isLoading: false };
}
