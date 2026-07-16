import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  role_id: string | null;
  team_id: string | null;
  reports_to: string | null;
  job_title: string | null;
  active: boolean | null;
  quarterly_target_egp: number | null;
  avatar_url: string | null;
};

export type Role = {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
  is_system: boolean | null;
  module_access: Record<string, boolean> | null;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
};

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from('roles').select('*').order('is_system', { ascending: false }).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}
