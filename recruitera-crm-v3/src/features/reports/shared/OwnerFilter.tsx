import { useMe } from '@/hooks/useMe';
import { useProfiles } from '@/hooks/useUsersData';
import { useReportsOwner } from './reportsContext';

export function OwnerFilter() {
  const me = useMe();
  const profiles = useProfiles();
  const { ownerId, setOwnerId } = useReportsOwner();
  const isAdmin = me.data?.role === 'admin';
  if (!isAdmin) return null;
  return (
    <select
      value={ownerId ?? ''}
      onChange={(e) => setOwnerId(e.target.value || null)}
      className="h-8 pl-3 pr-8 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text outline-none cursor-pointer"
      title="Filter Reports by AM/owner"
    >
      <option value="">All AMs</option>
      {(profiles.data ?? []).map((p) => (
        <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
      ))}
    </select>
  );
}
