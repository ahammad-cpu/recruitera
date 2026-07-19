import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCompanyHistory } from '../useCompanyHistory';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({
      data: [{ id: 'act:1', kind: 'note', at: '2026-07-19T10:00:00Z', actor_id: null,
               actor_name: 'Amr', stage_at_time: 'lead', title: 'Note', body: 'hi', meta: {} }],
      error: null,
    }),
  },
}));

describe('useCompanyHistory', () => {
  it('returns first page of events', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCompanyHistory('acct-1'), { wrapper: wrap });
    await waitFor(() => expect(result.current.data?.pages?.[0]?.length).toBe(1));
    expect(result.current.data!.pages[0][0].kind).toBe('note');
  });
});
