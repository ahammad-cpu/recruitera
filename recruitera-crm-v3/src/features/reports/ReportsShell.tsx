import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';

const TABS = [
  { to: '/reports', label: 'Key metrics', end: true },
  { to: '/reports/pipeline', label: 'Pipeline' },
  { to: '/reports/revenue', label: 'Revenue vs target' },
  { to: '/reports/acquisition', label: 'Acquisition' },
  { to: '/reports/renewal', label: 'Renewal & churn' },
  { to: '/reports/am', label: 'AM performance' },
  { to: '/reports/campaign', label: 'Campaign' },
];

export default function ReportsShell() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-text">Reports</h1>
        <p className="text-[12.5px] text-text-3 mt-0.5">Live analytics from Supabase — mirrors /crm-v2.</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-3">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center h-9 px-4 rounded-lg text-[12.5px] font-semibold border transition-colors',
                isActive
                  ? 'bg-cg-900 text-white border-cg-900'
                  : 'bg-surface text-text-2 border-border hover:bg-surface-2',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
