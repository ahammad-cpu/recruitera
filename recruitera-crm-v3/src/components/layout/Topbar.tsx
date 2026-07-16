import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';
import { fmtInt } from '@/lib/format';
import { AddCompanyModal } from '@/features/companies/AddCompanyModal';

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
  const { data, isLoading } = useAccounts();
  // Exclude merged-loser rows so LIVE count matches Companies page (521, not 610).
  const count = (data ?? []).filter((a) => !a.merged_into).length;
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="h-[60px] flex-shrink-0 bg-surface border-b border-border flex items-center px-6 gap-4">
      <div className="flex items-center gap-2 text-[12px] text-text-3 font-medium">
        <Link to="/" className="cursor-pointer hover:text-text-2">Home</Link>
        <span className="text-text-4">/</span>
        <span className="text-text font-semibold">{title}</span>
      </div>

      <span className="ml-3 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-ok-bg text-ok text-[11px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-ok" />
        LIVE · {isLoading ? '…' : fmtInt(count)}
      </span>

      <div className="ml-auto flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 w-[340px]">
        <Search size={14} className="text-text-3" />
        <input
          placeholder="Search companies, contacts, tasks…"
          className="bg-transparent border-0 outline-none text-[13px] text-text w-full"
        />
        <span className="text-[10px] font-bold text-text-3 bg-surface border border-border rounded px-1.5 py-0.5 tracking-wider">⌘K</span>
      </div>

      <button
        onClick={() => setAddOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-cg-900 text-white text-[12.5px] font-bold hover:bg-cg-800"
      >
        <Plus size={14} />
        New employer
      </button>

      {addOpen && <AddCompanyModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}
