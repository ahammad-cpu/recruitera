import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SB_URL || !SB_KEY) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing — set them in .env.local');
}

export const supabase = createClient(SB_URL ?? '', SB_KEY ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
