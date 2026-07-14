import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type AccountDocument = {
  id: string;
  account_id: string;
  uploader_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  label: string | null;
  is_archived: boolean | null;
  created_at: string;
};

export function useAccountDocuments(accountId: string | undefined) {
  return useQuery({
    queryKey: ['account_documents', accountId],
    enabled: !!accountId,
    queryFn: async (): Promise<AccountDocument[]> => {
      const { data, error } = await supabase
        .from('account_documents')
        .select('*')
        .eq('account_id', accountId!)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
