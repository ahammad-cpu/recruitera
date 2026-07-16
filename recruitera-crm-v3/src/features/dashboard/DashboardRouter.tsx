import { useMe } from '@/hooks/useMe';
import { useRoles } from '@/hooks/useUsersData';
import Dashboard from './Dashboard';
import CsDashboard from './CsDashboard';

/**
 * A profile's dashboard is decided by its role's `dashboard` column
 * ('sales' | 'cs'), not by role name/type — admins can point any future
 * custom role at either dashboard from Settings → Roles without a code
 * change. Defaults to the Sales dashboard while loading or if unset.
 */
export default function DashboardRouter() {
  const me = useMe();
  const roles = useRoles();

  if (me.isLoading || roles.isLoading) {
    return <div className="p-7 text-[12.5px] text-text-3">Loading…</div>;
  }

  const role = (roles.data ?? []).find((r) => r.id === me.data?.role_id);
  return role?.dashboard === 'cs' ? <CsDashboard /> : <Dashboard />;
}
