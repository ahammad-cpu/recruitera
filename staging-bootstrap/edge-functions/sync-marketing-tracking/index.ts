// Edge function: sync-marketing-tracking (v5)
// v5 (2026-06-04): FIX: Bubble field is named `Company` (not `Company_Ref`).
//   Maps b.Company → accounts.company_ref so rows actually link to accounts.
//   Also dedupes incoming rows by Company keeping the latest, so the
//   unique(company_ref) constraint isn't violated when one Company has
//   multiple visitor sessions in Bubble.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUBBLE_URL   = Deno.env.get('BUBBLE_URL') ?? '';
const BUBBLE_KEY   = Deno.env.get('BUBBLE_API_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TYPE_CANDIDATES = ['marketingtracking', 'marketing tracking', 'Marketing Tracking', 'MarketingTracking'];

function safeDate(d: any): string | null { if (!d) return null; try { return new Date(d).toISOString(); } catch { return null; } }
function safeInt(v: any): number | null { const n = parseInt(v); return isNaN(n) ? null : n; }

async function probeTypeSlug(): Promise<string> {
  const tried: string[] = [];
  for (const slug of TYPE_CANDIDATES) {
    const url = `${BUBBLE_URL}/api/1.1/obj/${encodeURIComponent(slug)}?limit=1`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${BUBBLE_KEY}` } });
    tried.push(`${slug}=${res.status}`);
    if (res.ok) return slug;
  }
  throw new Error(`No matching Bubble type. Tried: ${tried.join(', ')}`);
}

async function fetchAllBubble(slug: string, since: string | null): Promise<any[]> {
  const all: any[] = [];
  let cursor = 0;
  const constraints = since ? encodeURIComponent(JSON.stringify([{ key: 'Modified Date', constraint_type: 'greater than', value: since }])) : '';
  while (true) {
    const url = `${BUBBLE_URL}/api/1.1/obj/${encodeURIComponent(slug)}?cursor=${cursor}&limit=100${constraints ? `&constraints=${constraints}` : ''}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${BUBBLE_KEY}` } });
    if (!res.ok) { const t = await res.text(); throw new Error(`Bubble API ${res.status}: ${t.slice(0, 300)}`); }
    const data = await res.json();
    const results = data.response?.results ?? [];
    const remaining = data.response?.remaining ?? 0;
    all.push(...results);
    if (remaining === 0 || results.length === 0) break;
    cursor += results.length;
  }
  return all;
}

function bubbleToTracking(b: any) {
  // The Bubble Marketing Tracking type uses `Company` as the link field to
  // Unified_Company. Fall back to Company_Ref / company_ref for any old
  // records that may still use the alternate naming.
  const companyRef = b.Company || b.Company_Ref || b.company_ref || null;
  return {
    company_ref:        companyRef,
    visitor_id:         b.visitor_id || null,
    device_type:        b.device_type || null,
    signup_language:    b.signup_language || null,
    cta_clicked:        b.cta_clicked || null,
    first_source:       b.first_source || null,
    first_medium:       b.first_medium || null,
    first_campaign:     b.first_campaign || null,
    first_content:      b.first_content || null,
    first_term:         b.first_term || null,
    first_landing_page: b.first_landing_page || null,
    first_referrer:     b.first_referrer || null,
    first_date:         safeDate(b.first_date),
    last_source:        b.last_source || null,
    last_medium:        b.last_medium || null,
    last_campaign:      b.last_campaign || null,
    last_content:       b.last_content || null,
    last_term:          b.last_term || null,
    last_landing_page:  b.last_landing_page || null,
    last_referrer:      b.last_referrer || null,
    last_date:          safeDate(b.last_date),
    touch_count:        safeInt(b.touch_count),
    days_to_convert:    safeInt(b.days_to_convert),
    touch_history_json: b.touch_history_json || null,
    raw_data:           b,
    updated_at:         new Date().toISOString(),
  };
}

// Dedupe by company_ref keeping the most recent (by last_date / first_date / Modified Date).
// Anonymous rows (no company_ref) skip the unique constraint and are kept as-is.
function dedupeByCompany(rows: any[]): any[] {
  const score = (r: any) => {
    const candidates = [r.last_date, r.first_date, r.raw_data?.['Modified Date']];
    for (const c of candidates) { if (c) return new Date(c).getTime(); }
    return 0;
  };
  const bestByRef = new Map<string, any>();
  const anon: any[] = [];
  for (const r of rows) {
    const ref = r.company_ref;
    if (!ref) { anon.push(r); continue; }
    const existing = bestByRef.get(ref);
    if (!existing || score(r) > score(existing)) bestByRef.set(ref, r);
  }
  return [...bestByRef.values(), ...anon];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (!BUBBLE_KEY || !BUBBLE_URL) {
    return new Response(JSON.stringify({ status: 'disabled', message: 'BUBBLE_API_KEY/BUBBLE_URL missing' }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  const startedAt = new Date().toISOString();
  const supabase  = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const slug = await probeTypeSlug();
    const { data: lastSync } = await supabase.from('sync_state').select('last_sync_at').eq('source', 'marketing_tracking').single();
    const since = lastSync?.last_sync_at && lastSync.last_sync_at > '2024-01-01' ? lastSync.last_sync_at : null;
    const records = await fetchAllBubble(slug, since);
    if (records.length === 0) {
      await supabase.from('sync_state').upsert({ source: 'marketing_tracking', last_sync_at: startedAt, last_run_at: startedAt, last_count: 0, last_errors: 0, last_error_msg: null });
      return new Response(JSON.stringify({ ok: true, synced: 0, slug }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    // Map then dedupe (Bubble can return many visitor sessions per Company)
    let rows = records.map(bubbleToTracking);
    rows = dedupeByCompany(rows);

    // Resolve account_id for rows that have a company_ref
    const refs = rows.map(r => r.company_ref).filter(Boolean) as string[];
    const { data: accountRows } = await supabase.from('accounts').select('id, company_ref').in('company_ref', refs);
    const refToAccountId = new Map((accountRows || []).map(a => [a.company_ref, a.id]));
    rows = rows.map(r => ({ ...r, account_id: r.company_ref ? (refToAccountId.get(r.company_ref) ?? null) : null }));

    let upserted = 0, errors = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from('marketing_tracking').upsert(batch, { onConflict: 'company_ref', ignoreDuplicates: false });
      if (error) { errors += batch.length; console.error('[mt] upsert', error); } else { upserted += batch.length; }
    }
    await supabase.from('sync_state').upsert({ source: 'marketing_tracking', last_sync_at: startedAt, last_run_at: startedAt, last_count: upserted, last_errors: errors, last_error_msg: null });
    return new Response(JSON.stringify({ ok: true, synced: upserted, errors, slug, fetched: records.length, after_dedupe: rows.length, linked: rows.filter(r => r.account_id).length }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  } catch (err) {
    await supabase.from('sync_state').upsert({ source: 'marketing_tracking', last_run_at: startedAt, last_error_msg: String(err).slice(0, 500) });
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
