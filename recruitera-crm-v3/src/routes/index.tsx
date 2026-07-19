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
      { index: true, element: <DashboardRouter /> },
      { path: 'companies', element: <Companies /> },
      { path: 'companies/:id', element: <CompanyProfile /> },
      { path: 'pipeline', element: <Pipeline /> },
      { path: 'renewal', element: <Renewal /> },
      { path: 'notifications', element: <Notifications /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'am-performance', element: <AMPerformance /> },
      {
        path: 'reports',
        element: <ReportsShell />,
        children: [
          { index: true, element: <LeadGenerationReport /> },
          { path: 'pipeline', element: <PipelineReport /> },
          { path: 'win-loss', element: <WinLossChurnedReport /> },
          { path: 'am', element: <AMReport /> },
        ],
      },
      { path: 'logs', element: <Logs /> },
      { path: 'users', element: <Users /> },
      { path: 'utm', element: <Utm /> },
      { path: 'settings/requalification', element: <RequalificationSettings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
], { basename });
