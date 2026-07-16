import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const BUCKET = 'account-docs';

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

export function useUploadDocument(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!accountId) throw new Error('No account');
      const { data: sess } = await supabase.auth.getSession();
      const uploader_id = sess.session?.user?.id ?? null;
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${accountId}/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        cacheControl: '3600',
        upsert: false,
      });
      if (up.error) throw up.error;
      const { error } = await supabase.from('account_documents').insert({
        account_id: accountId,
        uploader_id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        is_archived: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['account_documents', accountId] });
    },
    onError: (e) => toast.error(`Upload failed: ${String((e as Error).message || e)}`),
  });
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (doc: Pick<AccountDocument, 'storage_path' | 'file_name'>) => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    },
    onError: (e) => toast.error(`Download failed: ${String((e as Error).message || e)}`),
  });
}

export function useDeleteDocument(accountId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Pick<AccountDocument, 'id' | 'storage_path'>) => {
      // Soft-delete row + hard-delete object so storage doesn't bloat.
      const { error } = await supabase
        .from('account_documents')
        .update({ is_archived: true })
        .eq('id', doc.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    },
    onSuccess: () => {
      toast.success('Removed');
      qc.invalidateQueries({ queryKey: ['account_documents', accountId] });
    },
    onError: (e) => toast.error(`Remove failed: ${String((e as Error).message || e)}`),
  });
}
