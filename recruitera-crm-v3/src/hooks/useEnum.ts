import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Fetch a Postgres enum's values in defined order.
 * Cached for the session — enums almost never change at runtime.
 *
 * Backed by public.get_enum_values(text) RPC which reads pg_enum.
 * Using this instead of hardcoding lists like ['lead','mql',…] means
 * a DB-side enum change (ADD VALUE) shows up in the UI without code.
 */
export function useEnum(enumName: string) {
  return useQuery({
    queryKey: ['enum', enumName],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc('get_enum_values', { enum_name: enumName });
      if (error) throw error;
      return (data as string[] | null) ?? [];
    },
  });
}
