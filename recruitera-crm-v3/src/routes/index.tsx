import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { AuthGate } from './AuthGate';
import DashboardRouter from '@/features/dashboard/DashboardRouter';
import Companies from '@/features/companies/Companies';
import CompanyProfile from '@/features/company-profile/CompanyProfile';
import Pipeline from '@/features/pipeline/Pipeline';
import Renewal from '@/features/renewal/Renewal';
import Tasks from '@/features/tasks/Tasks';
import Notifications from '@/features/notifications/Notifications';
import Logs from '@/features/logs/Logs';
import ReportsShell from '@/features/reports/ReportsShell';
import LeadGenerationReport from '@/features/reports/tabs/LeadGenerationReport';
import PipelineReport from '@/features/reports/tabs/PipelineReport';
import WinLossChurnedReport from '@/features/reports/tabs/WinLossChurnedReport';
import AMReport from '@/features/reports/tabs/AMReport';
import AMPerformance from '@/features/am-performance/AMPerformance';
import Users from '@/features/users/Users';
import Utm from '@/features/utm/Utm';
import RequalificationSettings from '@/features/settings/RequalificationSettings';
import { RequireModule } from './RequireModule';

// Vite's BASE_URL matches the deploy path (/crm-v3/ on Vercel, / in dev).
// Strip trailing slash so React Router accepts it as basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthGate>
        <AppShell />
      </AuthGate>
    ),
    children: [
      // Dashboard is the fallback landing for every role, so it's never
      // module-gated — DashboardRouter itself picks sales vs CS view.
      { index: true, element: <DashboardRouter /> },
      { path: 'companies', element: <RequireModule moduleKey="accounts"><Companies /></RequireModule> },
      { path: 'companies/:id', element: <RequireModule moduleKey="accounts"><CompanyProfile /></RequireModule> },
      { path: 'pipeline', element: <RequireModule moduleKey="sales_pipeline"><Pipeline /></RequireModule> },
      { path: 'renewal', element: <RequireModule moduleKey="renewal"><Renewal /></RequireModule> },
      { path: 'notifications', element: <RequireModule moduleKey="notifications"><Notifications /></RequireModule> },
      { path: 'tasks', element: <RequireModule moduleKey="tasks"><Tasks /></RequireModule> },
      { path: 'am-performance', element: <RequireModule moduleKey="am_performance"><AMPerformance /></RequireModule> },
      {
        path: 'reports',
        element: <RequireModule moduleKey="reports"><ReportsShell /></RequireModule>,
        children: [
          { index: true, element: <LeadGenerationReport /> },
          { path: 'pipeline', element: <PipelineReport /> },
          { path: 'win-loss', element: <WinLossChurnedReport /> },
          { path: 'am', element: <AMReport /> },
        ],
      },
      { path: 'logs', element: <RequireModule moduleKey="logs"><Logs /></RequireModule> },
      // Users route enforces its own admin gate inside the component.
      { path: 'users', element: <Users /> },
      { path: 'utm', element: <RequireModule moduleKey="utm_generator"><Utm /></RequireModule> },
      { path: 'settings/requalification', element: <RequalificationSettings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
], { basename });
