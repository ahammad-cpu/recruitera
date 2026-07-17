import { createContext, useContext } from 'react';

export type ReportsContextValue = {
  ownerId: string | null;
  setOwnerId: (id: string | null) => void;
};

export const ReportsContext = createContext<ReportsContextValue>({
  ownerId: null,
  setOwnerId: () => {},
});

export function useReportsOwner() {
  return useContext(ReportsContext);
}
