import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home, Building2, TrendingUp, RefreshCw, Bell, CheckSquare,
  BarChart3, FileText, ScrollText, Users, Link as LinkIcon,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { RecruiteraLogo } from './RecruiteraLogo';
import { useSession, signOut } from '@/lib/auth';

type NavItem = { to: string; icon: React.ComponentType<{ size?: number }>; label: string; badge?: string | number };

const WORKSPACE: NavItem[] = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/companies', icon: Building2, label: 'Companies' },
  { to: '/pipeline', icon: TrendingUp, label: 'Pipeline' },
  { to: '/renewal', icon: RefreshCw, label: 'Renewal' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
];

const OPERATIONS: NavItem[] = [
  { to: '/am-performance', icon: BarChart3, label: 'AM Performance' },
  { to: '/reports', icon: FileText, label: 'Reports' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/utm', icon: LinkIcon, label: 'UTM Generator' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { session } = useSession();
  const email = session?.user?.email ?? 'guest@recruitera';
  const initials = (email[0] ?? 'R').toUpperCase();

  return (
    <aside
      className={cn(
        'sc bg-surface border-r border-border flex flex-col gap-1 overflow-y-auto overflow-x-hidden transition-[width,padding] duration-200',
        collapsed ? 'w-[64px] px-2 py-[18px]' : 'w-[220px] px-[14px] py-[18px]',
      )}
    >
      <div className="flex items-center justify-center gap-2 px-2 pb-4 mb-3 border-b border-border">
        <RecruiteraLogo size={30} />
      </div>

      <Section label="Workspace" collapsed={collapsed} />
      {WORKSPACE.map((n) => <NavRow key={n.to} item={n} collapsed={collapsed} />)}

      <Section label="Operations" collapsed={collapsed} />
      {OPERATIONS.map((n) => <NavRow key={n.to} item={n} collapsed={collapsed} />)}

      <div className="mt-auto pt-3 border-t border-border flex items-center gap-2.5 pb-1">
        <div
          className="w-[30px] h-[30px] rounded-full bg-cg-900 text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          title={email}
        >
          {initials}
        </div>
        {!collapsed && (
          <button
            onClick={() => signOut()}
            className="min-w-0 flex-1 text-left hover:opacity-80"
            title="Sign out"
          >
            <div className="font-semibold text-[13px] truncate">{email}</div>
            <div className="text-[10px] text-text-3 uppercase tracking-wider font-semibold">Sign out</div>
          </button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center w-[26px] h-[26px] rounded-md border border-border bg-surface-2 text-text-3 flex-shrink-0"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
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
    </NavLink>
  );
}
