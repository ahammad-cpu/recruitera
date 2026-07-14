import { useSession } from '@/lib/auth';
import Login from './Login';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-3 text-[13px]">
        Loading…
      </div>
    );
  }
  if (!session) return <Login />;
  return <>{children}</>;
}
