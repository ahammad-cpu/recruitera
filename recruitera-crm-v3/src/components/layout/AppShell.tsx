import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

export function AppShell() {
  return (
    <div className="h-screen flex flex-row">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" role="main">
        <Topbar />
        <div className="flex-1 min-h-0 overflow-auto" role="region" aria-label="Page content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
