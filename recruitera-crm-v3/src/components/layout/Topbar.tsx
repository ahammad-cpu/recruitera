import { useLocation, Link } from 'react-router-dom';
import { Search } from 'lucide-react';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/companies': 'Companies',
  '/pipeline': 'Sales Pipeline',
  '/renewal': 'Renewal Pipeline',
  '/notifications': 'Notifications',
  '/tasks': 'Tasks',
  '/am-performance': 'AM Performance',
  '/reports': 'Reports',
  '/logs': 'System Logs',
  '/users': 'Users & Permissions',
  '/utm': 'UTM Generator',
};

export function Topbar() {
  const { pathname } = useLocation();
  const title = TITLES[pathname] ?? 'Recruitera';

  return (
    <div className="h-[60px] flex-shrink-0 bg-surface border-b border-border flex items-center px-6 gap-4">
      <div className="flex items-center gap-2 text-[12px] text-text-3 font-medium">
        <Link to="/" className="cursor-pointer hover:text-text-2">Home</Link>
        <span className="text-text-4">/</span>
        <span className="text-text font-semibold">{title}</span>
      </div>

      <span className="ml-3 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-ok-bg text-ok text-[11px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-ok" />
        LIVE
      </span>

      <div className="ml-auto flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 w-[300px]">
        <Search size={14} className="text-text-3" />
        <input
          placeholder="Search companies, contacts, tasks…"
          className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
        />
      </div>
    </div>
  );
}
