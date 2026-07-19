import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFeatureFlag } from '../flags';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: (_: string, key: string) => ({
          maybeSingle: async () => ({ data: { value: key === 'deals_ui_hidden' } }),
        }),
      }),
    }),
  },
}));

describe('useFeatureFlag', () => {
  it('returns the boolean value for a known flag key', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFeatureFlag('deals_ui_hidden'), { wrapper });
    await vi.waitFor(() => expect(result.current).toBe(true));
  });
});
