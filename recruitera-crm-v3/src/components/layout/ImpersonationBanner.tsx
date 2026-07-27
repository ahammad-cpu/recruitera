import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useImpersonation } from '@/lib/impersonation';
import { useMe, useRealMe } from '@/hooks/useMe';
import { useRoles } from '@/hooks/useUsersData';

/**
 * Persistent amber bar shown while an admin is viewing the app as another
 * user. Reads useMe (the impersonated identity) for the name, useRealMe to
 * confirm the viewer is genuinely an admin, and offers a one-click exit.
 */
export function ImpersonationBanner() {
  const { viewAsId, stopImpersonation } = useImpersonation();
  const me = useMe();
  const real = useRealMe();
  const roles = useRoles();
  const navigate = useNavigate();

  if (!viewAsId || !me.isImpersonating || !me.data) return null;

  const roleName = roles.data?.find((r) => r.id === me.data?.role_id)?.name || me.data.role || 'No role';
  const name = me.data.full_name || me.data.email || 'user';
  const realName = real.data?.full_name || real.data?.email || 'you';

  return (
    <div
      role="status"
      className="flex items-center gap-3 px-4 h-10 bg-warn text-white text-[13px] font-bold flex-shrink-0"
    >
      <Eye size={15} strokeWidth={2.5} />
      <span className="truncate">
        Viewing as <b className="font-black">{name}</b>
        <span className="font-semibold opacity-90"> · {roleName}</span>
      </span>
      <span className="hidden sm:inline text-[11.5px] font-semibold opacity-80 truncate">
        Permissions preview — data still loads as {realName}
      </span>
      <button
        onClick={() => { stopImpersonation(); navigate('/'); }}
        className="ml-auto inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-white/20 hover:bg-white/30 text-white text-[12px] font-black flex-shrink-0"
      >
        <X size={13} strokeWidth={3} /> Exit
      </button>
    </div>
  );
}
