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
        {/* Underline tab style — matches the Logs page so both analytics-y
            surfaces feel like siblings instead of two different toolkits. */}
        <div className="flex items-center gap-0 border-b border-border overflow-x-auto sc no-print">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'text-[13px] py-3.5 mr-5 border-b-2 -mb-px transition-colors whitespace-nowrap',
                  isActive ? 'font-black text-text border-cg-900' : 'font-semibold text-text-3 border-transparent hover:text-text-2',
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
