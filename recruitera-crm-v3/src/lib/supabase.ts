import { createClient } from '@supabase/supabase-js';

// Same public credentials used by /crm and /crm-v2. Publishable anon key is
// safe for browsers; RLS + ABAC enforce access on the server. Env vars still
// override so local dev can point at a different project.
const DEFAULT_URL = 'https://rtdrlpnfqjtwtsrwnifn.supabase.co';
const DEFAULT_KEY = 'sb_publishable_jqOHcIOvPYsEWnSKQjjEWQ_vWsxCVwr';

const SB_URL = (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_URL;
const SB_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_KEY;

export const supabase = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
