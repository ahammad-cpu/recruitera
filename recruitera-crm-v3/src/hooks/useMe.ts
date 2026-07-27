import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile } from './useUsersData';
import { useRoles } from './useUsersData';
import { useImpersonation } from '@/lib/impersonation';

async function fetchProfile(uid: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * The TRUE signed-in user — never impersonation-aware. Impersonation
 * controls and the exit banner read this so an admin can always get back
 * to their own identity, and useMe uses it to check "is the real user an
 * admin?" before honouring a view-as target.
 */
export function useRealMe() {
  return useQuery({
    queryKey: ['me', 'real'],
    queryFn: async (): Promise<Profile | null> => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) return null;
      return fetchProfile(uid);
    },
  });
}

type MeResult = {
  data: Profile | null | undefined;
  isLoading: boolean;
  error: unknown;
  isImpersonating: boolean;
};

/**
 * Effective identity. When an ADMIN is impersonating (view-as), this
 * returns the target user's profile so every downstream gate —
 * module_access, isAdmin, listOnly, the sidebar, RequireModule — reflects
 * THEM. Everyone else always gets their real profile.
 *
 * Note: this changes UI gating only. Row-level data still comes back under
 * the real Supabase session (RLS), so an admin impersonating a rep sees
 * the rep's NAV and PERMISSIONS, not the rep's exact row scope.
 */
export function useMe(): MeResult {
  const real = useRealMe();
  const roles = useRoles();
  const { viewAsId } = useImpersonation();

  const realRole = (roles.data ?? []).find((r) => r.id === real.data?.role_id);
  const realIsAdmin = (real.data?.role || '').toLowerCase() === 'admin' || realRole?.type === 'admin';
  // Only an admin can impersonate, and never impersonate yourself.
  const active = !!viewAsId && realIsAdmin && viewAsId !== real.data?.id;

  const imp = useQuery({
    queryKey: ['me', 'as', viewAsId],
    enabled: active,
    queryFn: () => fetchProfile(viewAsId as string),
  });

  if (active && imp.data) {
    return { data: imp.data, isLoading: imp.isLoading, error: imp.error, isImpersonating: true };
  }
  return {
    data: real.data,
    isLoading: real.isLoading || roles.isLoading || (active && imp.isLoading),
    error: real.error,
    isImpersonating: false,
  };
}
