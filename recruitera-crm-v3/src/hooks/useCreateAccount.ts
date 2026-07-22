import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type NewAccountInput = {
  name: string;
  source?: string | null;
  stage?: string;
  campaign?: string | null;
  medium?: string | null;
  am_mail?: string | null;
  owner_id?: string | null;
  cs_email?: string | null;
  industry?: string | null;
  company_size?: string | null;
  domain?: string | null;
  contact: {
    full_name: string;
    phone: string;
    email?: string | null;
    job_title?: string | null;
  };
};

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'live.com', 'aol.com', 'mail.com', 'protonmail.com', 'yandex.com',
  'msn.com', 'me.com',
]);

function deriveDomain(email: string | null | undefined, explicit?: string | null): string | null {
  if (explicit && explicit.trim()) return explicit.trim().toLowerCase();
  const e = (email ?? '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  const d = e.split('@')[1];
  return d && !GENERIC_DOMAINS.has(d) ? d : null;
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAccountInput) => {
      const name = input.name.trim();
      if (!name) throw new Error('Company name is required');
      if (!input.contact.full_name.trim()) throw new Error('Contact name is required');
      if (!input.contact.phone.trim()) throw new Error('Contact phone is required');

      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id ?? null;
      const userEmail = session.session?.user?.email?.toLowerCase() ?? null;

      const raw_data: Record<string, unknown> = {
        created_via: 'crm-v3.add-company',
        created_by: userId,
      };
      if (input.campaign) raw_data.campaign = input.campaign.trim();

      const domain = deriveDomain(input.contact.email, input.domain);

      // Default owner + am_mail to the creator when the form didn't set them.
      // The DB-side round-robin trigger (assign_account_manager_trg) also
      // skips crm-v3.* manual creates now, so together the "Sayed adds a
      // company, Mariam gets it" round-robin surprise can't happen.
      const effectiveOwnerId = input.owner_id || userId;
      const effectiveAmMail  = input.am_mail  || userEmail;

      // INSERT account
      const { data: acct, error: accErr } = await supabase
        .from('accounts')
        .insert({
          name,
          domain,
          source: input.source || null,
          stage: (input.stage ?? 'lead') as 'lead' | 'mql' | 'sql' | 'demo' | 'proposal' | 'won' | 'paid' | 'lost',
          am_mail: effectiveAmMail,
          owner_id: effectiveOwnerId,
          cs_email: input.cs_email?.trim().toLowerCase() || null,
          industry: input.industry?.trim() || null,
          size: input.company_size || null,
          campaign: input.campaign?.trim() || null,
          medium: input.medium?.trim() || null,
          raw_data,
        })
        .select('id')
        .single();
      if (accErr) throw accErr;
      const acctId = acct.id as string;

      // INSERT primary contact
      const { error: contErr } = await supabase.from('contacts').insert({
        account_id: acctId,
        full_name: input.contact.full_name.trim(),
        phone: input.contact.phone.trim(),
        email: input.contact.email?.trim().toLowerCase() || null,
        job_title: input.contact.job_title?.trim() || null,
        is_primary: true,
      });
      if (contErr) throw contErr;

      // INSERT marketing_tracking row if we have campaign or medium
      if (input.campaign || input.medium || input.source) {
        const { error: mkErr } = await supabase.from('marketing_tracking').insert({
          account_id: acctId,
          first_source: input.source || null,
          first_medium: input.medium || null,
          first_campaign: input.campaign || null,
          first_date: new Date().toISOString(),
          last_source: input.source || null,
          last_medium: input.medium || null,
          last_campaign: input.campaign || null,
          last_date: new Date().toISOString(),
          touch_count: 1,
        });
        if (mkErr) {
          // Not fatal — account + contact are already in. Warn but don't throw.
          console.warn('[useCreateAccount] marketing_tracking insert failed', mkErr);
        }
      }

      // NOTE: no deal is auto-created here. Per product rule, a company is
      // just a company until a rep explicitly starts a deal from the profile
      // or the pipeline. This keeps the board free of "lead" clutter.

      return { id: acctId, name };
    },
    onSuccess: (res) => {
      toast.success(`Company "${res.name}" created`);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['contacts', 'all'] });
      qc.invalidateQueries({ queryKey: ['marketing_tracking'] });
    },
    onError: (e) => toast.error(`Create failed: ${String((e as Error).message || e)}`),
  });
}
