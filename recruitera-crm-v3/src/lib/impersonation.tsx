import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const KEY = 'crm-v3:view-as';

type Ctx = {
  /** Profile id the admin is currently viewing the app as, or null. */
  viewAsId: string | null;
  startImpersonation: (id: string) => void;
  stopImpersonation: () => void;
};

const ImpersonationContext = createContext<Ctx>({
  viewAsId: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

/**
 * Wraps the whole app. Holds the "view as" target in sessionStorage so it
 * survives navigation but clears when the tab closes (safer than
 * localStorage — impersonation should never silently persist across
 * browser restarts). Only useMe honours it, and only when the REAL user is
 * an admin, so setting the key manually can't escalate a non-admin.
 */
export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [viewAsId, setViewAsId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  });

  const startImpersonation = useCallback((id: string) => {
    try { sessionStorage.setItem(KEY, id); } catch { /* ignore */ }
    setViewAsId(id);
    // Re-resolve the effective identity everywhere it's read.
    qc.invalidateQueries({ queryKey: ['me'] });
  }, [qc]);

  const stopImpersonation = useCallback(() => {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    setViewAsId(null);
    qc.invalidateQueries({ queryKey: ['me'] });
  }, [qc]);

  return (
    <ImpersonationContext.Provider value={{ viewAsId, startImpersonation, stopImpersonation }}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  return useContext(ImpersonationContext);
}
