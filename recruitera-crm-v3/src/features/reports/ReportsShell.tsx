import { useState, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Download } from 'lucide-react';
import { cn } from '@/lib/cn';
import { OwnerFilter } from './shared/OwnerFilter';
import { ReportsContext } from './shared/reportsContext';
import { exportReportPdf } from './shared/exportPdf';
import './reportsPrint.css';

const TABS = [
  { to: '/reports', label: 'Lead Generation', end: true },
  { to: '/reports/pipeline', label: 'Pipeline' },
  { to: '/reports/win-loss', label: 'Win / Loss / Churned' },
  { to: '/reports/am', label: 'AM Performance' },
];

export default function ReportsShell() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const ctxValue = useMemo(() => ({ ownerId, setOwnerId }), [ownerId]);
  const loc = useLocation();
  const currentLabel = TABS.find((t) => t.end ? loc.pathname === t.to : loc.pathname.startsWith(t.to))?.label ?? 'Reports';

  return (
    <ReportsContext.Provider value={ctxValue}>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap no-print">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text">Reports</h1>
            <p className="text-[12.5px] text-text-3 mt-0.5">Live analytics from Supabase.</p>
          </div>
          <OwnerFilter />
          <button
            onClick={() => exportReportPdf(currentLabel)}
            className="inline-flex items-center gap-1.5 h-8 px-3 border border-border-2 rounded-lg bg-surface text-[12.5px] font-bold text-text hover:bg-surface-2"
          >
            <Download size={13} /> Export PDF
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap border-b border-border pb-3 no-print">
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
        <div id="reports-print-root">
          <Outlet />
        </div>
      </div>
    </ReportsContext.Provider>
  );
}
