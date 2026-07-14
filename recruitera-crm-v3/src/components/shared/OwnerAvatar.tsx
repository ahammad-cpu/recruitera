import type { Profile } from '@/hooks/useUsersData';
import { initials } from '@/lib/format';

export function OwnerAvatar({ profile, size = 24, fallback }: { profile: Profile | undefined | null; size?: number; fallback?: string | null }) {
  const name = profile?.full_name || profile?.email || fallback || '—';
  const cls = 'rounded-full flex items-center justify-center flex-shrink-0 bg-cg-800 text-white font-bold';
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) };
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={name}
        title={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className={cls} style={style} title={name}>
      {initials(name)}
    </div>
  );
}
