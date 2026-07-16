import { NavLink } from 'react-router-dom';
import {
  Home, Building2, TrendingUp, RefreshCw, Bell, CheckSquare,
  BarChart3, FileText, ScrollText, Users, Link as LinkIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { RecruiteraLogo } from './RecruiteraLogo';
import { useSession, signOut } from '@/lib/auth';
import { useMe } from '@/hooks/useMe';
import { useAccounts, isPaid } from '@/hooks/useAccounts';
import { useNotifications } from '@/hooks/useNotifications';
import { useTasks } from '@/hooks/useTasks';
import { fmtInt, initials } from '@/lib/format';

type NavItem = { to: string; icon: React.ComponentType<{ size?: number }>; label: string; badge?: string | number; badgeAccent?: 'bad' };

export function Sidebar() {
  const collapsed = false;
  const { session } = useSession();
  const me = useMe();
  const accounts = useAccounts();
  const notifs = useNotifications();
  const tasks = useTasks();

  // Exclude merged-loser rows everywhere — they folded into another account
  // and are no longer standalone. Matches Companies page count.
  const acts = (accounts.data ?? []).filter((a) => !a.merged_into);
  const activeAccts = acts.length;
  const openLeads = acts.filter((a) => ['mql', 'sql', 'demo', 'proposal'].includes((a.stage || '').toLowerCase())).length;
  const renewalCount = acts.filter(isPaid).length;
  const unreadNotifs = (notifs.data ?? []).filter((n) => !n.read_at).length;
  const openTasks = (tasks.data ?? []).filter((t) => !t.task_done).length;

  const fmt = (n: number) => (accounts.isLoading ? '…' : fmtInt(n));

  const WORKSPACE: NavItem[] = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/companies', icon: Building2, label: 'Companies', badge: fmt(activeAccts) },
    { to: '/pipeline', icon: TrendingUp, label: 'Pipeline', badge: fmt(openLeads) },
    { to: '/renewal', icon: RefreshCw, label: 'Renewal', badge: fmt(renewalCount) },
    { to: '/notifications', icon: Bell, label: 'Notifications', badge: unreadNotifs || undefined, badgeAccent: unreadNotifs ? 'bad' : undefined },
    { to: '/tasks', icon: CheckSquare, label: 'Tasks', badge: openTasks || undefined },
  ];

  const OPERATIONS: NavItem[] = [
    { to: '/am-performance', icon: BarChart3, label: 'AM Performance' },
    { to: '/reports', icon: FileText, label: 'Reports' },
    { to: '/logs', icon: ScrollText, label: 'Logs' },
    { to: '/users', icon: Users, label: 'Users' },
    { to: '/utm', icon: LinkIcon, label: 'UTM Generator' },
  ];

  const profile = me.data;
  const displayName = profile?.full_name || session?.user?.email || '—';
  const roleLabel = (profile?.role || 'member').toUpperCase();
  const inits = initials(displayName);

  return (
    <aside
      className={cn(
        'sc bg-surface border-r border-border flex flex-col gap-1 overflow-y-auto overflow-x-hidden transition-[width,padding] duration-200',
        collapsed ? 'w-[60px] px-1.5 py-[18px]' : 'w-[220px] px-[14px] py-[18px]',
      )}
    >
      <div className="flex items-center justify-center gap-2 px-2 pb-4 mb-3 border-b border-border">
        <RecruiteraLogo size={36} />
      </div>

      <Section label="Workspace" collapsed={collapsed} />
      {WORKSPACE.map((n) => <NavRow key={n.to} item={n} collapsed={collapsed} />)}

      <Section label="Operations" collapsed={collapsed} />
      {OPERATIONS.map((n) => <NavRow key={n.to} item={n} collapsed={collapsed} />)}

      <div className="mt-auto pt-3 border-t border-border flex items-center gap-2.5 pb-1">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-[32px] h-[32px] rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-[32px] h-[32px] rounded-full bg-cg-900 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0" title={displayName}>
            {inits}
          </div>
        )}
        {!collapsed && (
          <button onClick={() => signOut()} className="min-w-0 flex-1 text-left hover:opacity-80" title="Sign out">
            <div className="font-bold text-[13px] truncate text-text">{displayName}</div>
            <div className="text-[10px] text-text-3 uppercase tracking-widest font-bold">{roleLabel}</div>
          </button>
        )}
      </div>
    </aside>
  );
}

function Section({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="text-[10px] tracking-[0.08em] uppercase text-text-4 px-2.5 pt-3.5 pb-1.5 font-semibold">
      {label}
    </div>
  );
}

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  const hasBadge = item.badge != null && item.badge !== 0 && item.badge !== '';
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg text-[13px] cursor-pointer transition-colors',
          collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-2',
          isActive
            ? 'bg-cg-900 text-white font-semibold'
            : 'text-text-2 font-medium hover:bg-surface-2',
        )
      }
    >
      <Icon size={16} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && hasBadge && (
        <span
          className={cn(
            'tnum ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full border',
            item.badgeAccent === 'bad'
              ? 'bg-bad text-white border-bad'
              : 'bg-surface-2 text-text-3 border-border',
          )}
        >
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}
