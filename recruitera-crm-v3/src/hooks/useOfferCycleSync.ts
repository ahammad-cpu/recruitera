import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Keeps a contract_cycle in step with the pipeline so the renewal money
 * timeline fills itself as a deal advances:
 *
 *   Proposal  → seedOffer   : offer_sent_date + value + currency + plan_tier
 *   Won       → stampInvoice: invoice_date
 *   Collected → paid_date is stamped server-side by a trigger on
 *               accounts.stage = 'paid' (covers drag / dropdown / any path).
 *
 * "In-flight" cycle = the account's newest cycle that hasn't been paid and
 * isn't churned/renewed. If none exists a fresh one is created (term
 * defaults to 1 year from the offer date; the rep can adjust in the cycle
 * modal). All writes are best-effort — a sync failure never blocks the
 * stage change itself.
 */

const YEAR_MS = 365 * 86_400_000;

type CycleRow = {
  id: string;
  cycle_number: number | null;
  status: string | null;
  paid_date: string | null;
  offer_sent_date: string | null;
};

async function findInFlightCycle(accountId: string): Promise<CycleRow | null> {
  const { data, error } = await supabase
    .from('contract_cycles')
    .select('id, cycle_number, status, paid_date, offer_sent_date')
    .eq('account_id', accountId)
    .order('cycle_number', { ascending: false })
    .limit(50);
  if (error || !data) return null;
  return (
    (data as CycleRow[]).find(
      (c) => !c.paid_date && c.status !== 'churned' && c.status !== 'renewed',
    ) ?? null
  );
}

export function useOfferCycleSync() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['contract_cycles'] });

  /** Move-to-Proposal: seed (or update) the offer on the in-flight cycle. */
  async function seedOffer(args: {
    accountId: string;
    amount: number;
    currency: string;
    planTier: string | null;
    offerDateISO: string;
  }) {
    try {
      const existing = await findInFlightCycle(args.accountId);
      if (existing) {
        await supabase
          .from('contract_cycles')
          .update({
            offer_sent_date: existing.offer_sent_date ?? args.offerDateISO,
            value: args.amount,
            currency: args.currency,
            plan_tier: args.planTier || undefined,
            status: existing.status ?? 'active',
          })
          .eq('id', existing.id);
      } else {
        const { data: rows } = await supabase
          .from('contract_cycles').select('cycle_number').eq('account_id', args.accountId);
        const maxN = (rows ?? []).reduce(
          (m: number, c: { cycle_number: number | null }) => Math.max(m, c.cycle_number || 0), 0,
        );
        const endISO = new Date(Date.parse(args.offerDateISO) + YEAR_MS).toISOString().slice(0, 10);
        await supabase.from('contract_cycles').insert({
          account_id: args.accountId,
          cycle_number: maxN + 1,
          status: 'active',
          started_at: args.offerDateISO,
          ends_at: endISO,
          offer_sent_date: args.offerDateISO,
          value: args.amount,
          currency: args.currency,
          plan_tier: args.planTier || null,
        });
      }
      invalidate();
    } catch (e) {
      console.warn('[useOfferCycleSync] seedOffer failed', e);
    }
  }

  /** Move-to-Won: stamp the invoice date on the in-flight cycle. */
  async function stampInvoice(accountId: string, invoiceISO: string) {
    try {
      const existing = await findInFlightCycle(accountId);
      if (existing) {
        await supabase.from('contract_cycles')
          .update({ invoice_date: invoiceISO }).eq('id', existing.id);
        invalidate();
      }
    } catch (e) {
      console.warn('[useOfferCycleSync] stampInvoice failed', e);
    }
  }

  return { seedOffer, stampInvoice };
}
