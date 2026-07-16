import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type UtmLink = {
  id: string;
  base_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  full_url: string;
  short_url: string | null;
  group_id: string | null;
  created_at: string;
};

export type UtmCampaign = { id: string; name: string; description: string | null };
export type UtmLinkGroup = { id: string; name: string; color: string | null; created_at: string };

export function useUtmLinks() {
  return useQuery({
    queryKey: ['utm_links'],
    queryFn: async (): Promise<UtmLink[]> => {
      const { data, error } = await supabase.from('utm_links').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUtmCampaigns() {
  return useQuery({
    queryKey: ['utm_campaigns'],
    queryFn: async (): Promise<UtmCampaign[]> => {
      const { data, error } = await supabase.from('utm_campaigns').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUtmLinkGroups() {
  return useQuery({
    queryKey: ['utm_link_groups'],
    queryFn: async (): Promise<UtmLinkGroup[]> => {
      const { data, error } = await supabase.from('utm_link_groups').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateUtmLinkGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from('utm_link_groups').insert({ name, color, created_by: session.session?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Group created'); qc.invalidateQueries({ queryKey: ['utm_link_groups'] }); },
    onError: (e) => toast.error(`Create failed: ${String(e)}`),
  });
}

export function useSaveUtmLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: Omit<UtmLink, 'id' | 'created_at'>) => {
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from('utm_links').insert({ ...link, created_by: session.session?.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Link saved');
      qc.invalidateQueries({ queryKey: ['utm_links'] });
    },
    onError: (e) => toast.error(`Save failed: ${String(e)}`),
  });
}
