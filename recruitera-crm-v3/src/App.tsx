import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { router } from './routes';
import { queryClient } from './lib/queryClient';
import { ImpersonationProvider } from './lib/impersonation';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ImpersonationProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton />
      </ImpersonationProvider>
    </QueryClientProvider>
  );
}
