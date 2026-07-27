import { Navigate } from 'react-router-dom';
import { useModuleAccess } from '@/hooks/useModuleAccess';

/**
 * Route guard — renders children only if the current role's
 * module_access grants `moduleKey`. Otherwise redirects to the
 * Dashboard. Admins and unassigned-role users always pass (see
 * useModuleAccess). While role data loads we render nothing to avoid
 * flashing a page the user shouldn't see.
 */
export function RequireModule({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { can, isLoading } = useModuleAccess();
  if (isLoading) return null;
  if (!can(moduleKey)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
