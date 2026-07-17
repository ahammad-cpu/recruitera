import { toEgp } from '@/lib/format';

const DAY = 86_400_000;
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function monthStart(d: Date) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function addMonths(d: Date, n: number) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); }

export type CycleInput = {
  started_at: string | null;
  ends_at: string | null;
  value: number | null;
  currency: string | null;
  status?: string | null;
  updated_at?: string | null;
};

export type DealInput = {
  created_at?: string | null;
  closed_at: string | null;
  stage?: string | null;
  amount: number | null;
  currency: string | null;
};

export function reconstructArrPipeline(
  cycles: CycleInput[], deals: DealInput[], days: number, now: Date,
): Array<{ dateISO: string; arr: number; pipeline: number }> {
  const out: Array<{ dateISO: string; arr: number; pipeline: number }> = [];
  const startOfNow = new Date(iso(now) + 'T00:00:00Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(startOfNow.getTime() - i * DAY);
    const dISO = iso(d);
    let arr = 0;
    for (const c of cycles) {
      if (!c.started_at || !c.ends_at) continue;
      if (c.started_at <= dISO && dISO <= c.ends_at) arr += toEgp(c.value ?? 0, c.currency);
    }
    let pipeline = 0;
    for (const dl of deals) {
      if (!dl.created_at) continue;
      const createdISO = dl.created_at.slice(0, 10);
      if (createdISO > dISO) continue;
      const closedISO = dl.closed_at ? dl.closed_at.slice(0, 10) : null;
      if (closedISO && closedISO <= dISO) continue;
      pipeline += toEgp(dl.amount ?? 0, dl.currency);
    }
    out.push({ dateISO: dISO, arr, pipeline });
  }
  return out;
}

export function reconstructRollingMrr(
  cycles: CycleInput[], months: number, now: Date,
): Array<{ monthISO: string; mrr: number; churnRate: number }> {
  const out: Array<{ monthISO: string; mrr: number; churnRate: number }> = [];
  const thisMonth = monthStart(now);
  for (let i = months - 1; i >= 0; i--) {
    const mStart = addMonths(thisMonth, -i);
    const mEnd = addMonths(mStart, 1);
    const mStartISO = iso(mStart);
    const mEndISO = iso(mEnd);
    // MRR at month start: cycles active at that date AND not already churned before it
    let startMrr = 0;
    for (const c of cycles) {
      if (!c.started_at || !c.ends_at) continue;
      if (c.started_at > mStartISO || c.ends_at < mStartISO) continue;
      if (c.status === 'churned' && c.updated_at && c.updated_at.slice(0, 10) < mStartISO) continue;
      startMrr += toEgp(c.value ?? 0, c.currency);
    }
    let churnedValue = 0;
    for (const c of cycles) {
      if (c.status !== 'churned' || !c.updated_at) continue;
      const chISO = c.updated_at.slice(0, 10);
      if (chISO >= mStartISO && chISO < mEndISO) churnedValue += toEgp(c.value ?? 0, c.currency);
    }
    const churnRate = startMrr > 0 ? (churnedValue / startMrr) * 100 : 0;
    out.push({ monthISO: mStartISO, mrr: startMrr, churnRate });
  }
  return out;
}

export function reconstructWonLostWeekly(
  deals: DealInput[], weeks: number, now: Date,
): Array<{ weekStartISO: string; won: number; lost: number }> {
  const out: Array<{ weekStartISO: string; won: number; lost: number }> = [];
  const startOfNow = new Date(iso(now) + 'T00:00:00Z');
  // week bucket = Monday of the week the closed_at falls in
  const dayOfWeek = (startOfNow.getUTCDay() + 6) % 7; // Mon=0
  const thisMon = new Date(startOfNow.getTime() - dayOfWeek * DAY);
  for (let i = weeks - 1; i >= 0; i--) {
    const wStart = new Date(thisMon.getTime() - i * 7 * DAY);
    const wEnd = new Date(wStart.getTime() + 7 * DAY);
    const wStartISO = iso(wStart);
    const wEndISO = iso(wEnd);
    let won = 0, lost = 0;
    for (const dl of deals) {
      if (!dl.closed_at) continue;
      const clISO = dl.closed_at.slice(0, 10);
      if (clISO < wStartISO || clISO >= wEndISO) continue;
      const amt = toEgp(dl.amount ?? 0, dl.currency);
      if (dl.stage === 'won' || dl.stage === 'collected') won += amt;
      else if (dl.stage === 'lost') lost += amt;
    }
    out.push({ weekStartISO: wStartISO, won, lost });
  }
  return out;
}

export function averageCycleDays(
  wonDeals: Array<{ closed_at: string; account_id: string; channel: string }>,
  accountsById: Map<string, { created_at: string }>,
): { overallAvgDays: number; byChannel: Map<string, number> } {
  let totalDays = 0, totalCount = 0;
  const perChannel = new Map<string, { days: number; count: number }>();
  for (const d of wonDeals) {
    const acct = accountsById.get(d.account_id);
    if (!acct) continue;
    const days = (new Date(d.closed_at).getTime() - new Date(acct.created_at).getTime()) / DAY;
    if (!Number.isFinite(days) || days < 0) continue;
    totalDays += days; totalCount++;
    const cur = perChannel.get(d.channel) ?? { days: 0, count: 0 };
    cur.days += days; cur.count++;
    perChannel.set(d.channel, cur);
  }
  const byChannel = new Map<string, number>();
  perChannel.forEach((v, k) => byChannel.set(k, v.count > 0 ? v.days / v.count : 0));
  return { overallAvgDays: totalCount > 0 ? totalDays / totalCount : 0, byChannel };
}
