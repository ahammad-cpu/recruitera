// Edge function: bubble-sync (v9)
// v9 (2026-06-02): SECURITY — reads BUBBLE_API_KEY + BUBBLE_URL from env
//   secrets, NOT from sync_config.config.api_key. Matches sync-paid-customers
//   and sync-marketing-tracking. sync_config is still consulted for `enabled`
//   and (optionally) for the Bubble object type + environment override.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const BUBBLE_URL   = Deno.env.get('BUBBLE_URL') ?? '';
const BUBBLE_KEY   = Deno.env.get('BUBBLE_API_KEY') ?? '';

const DEFAULT_TYPE = 'Unified_Company';
const DEFAULT_ENV  = 'live'; // 'live' → /api ; 'version-test' → /version-test

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GENERIC_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
  'live.com','me.com','msn.com','aol.com','protonmail.com',
  'basharsoft.com','icareer.com.eg','icareer.ai','recruitera.ai',
]);

function parseSource(raw: any): string {
  if (!raw) return '';
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p[0] || ''; } catch {}
  return String(raw);
}
function extractDomainFromWebsite(website: any): string | null {
  if (!website) return null;
  try {
    const w = String(website);
    const u = new URL(w.startsWith('http') ? w : 'https://' + w);
    const d = u.hostname.replace(/^www\./, '').toLowerCase();
    return GENERIC_DOMAINS.has(d) ? null : d;
  } catch {
    const d = String(website).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    return d && !GENERIC_DOMAINS.has(d) ? d : null;
  }
}
function extractDomainFromEmail(email: any): string | null {
  if (!email || !String(email).includes('@')) return null;
  const d = String(email).split('@')[1]?.toLowerCase().trim();
  if (!d || d.length < 4 || GENERIC_DOMAINS.has(d)) return null;
  return d;
}
function safeDate(d: any): string | null {
  if (!d) return null;
  try { return new Date(d).toISOString(); } catch { return null; }
}

function bubbleToAccount(b: any) {
  const companyName = b['Company Name'] || b.company_name || b.company_name_lowercase || b.Name || 'Untitled';
  const website = b.WP_Website || b.Website || b.website || '';
  const email   = b.Contact_Email || b.contact_email || b.Email || '';
  const domain  = extractDomainFromWebsite(website) || extractDomainFromEmail(email) || null;
  const bubbleCreatedAt = safeDate(b['Created Date'] || b.created_at);
  const realSource = parseSource(b.Source || b.source) || null;
  const companyRef = b.Company_Ref || null;
  const hasTrial   = !!companyRef;
  return {
    bubble_id:            b._id,
    name:                 String(companyName).slice(0, 200),
    domain,
    website:              website || null,
    industry:             b.WP_Industry   || b.Industry   || null,
    size:                 b.WP_Company_Size || b.Company_Size || null,
    location:             b.WP_Location   || b.Location   || null,
    description:          (b.WP_Description || b.Description || '').slice(0, 5000) || null,
    vacancies:            b.WP_Vacancies  || b.Vacancies  || null,
    source:               realSource,
    medium:               b.Medium        || b.medium     || null,
    campaign:             b.Campaign      || b.campaign   || null,
    first_touch:          safeDate(b.First_Touch || b.first_touch),
    rc_mail:              b['RC Mail']    || b['RC_Mail'] || null,
    am_mail:              b['AM Mail']    || b['AM_Mail'] || null,
    bubble_created_at:    bubbleCreatedAt,
    utm_source:           b.utm_source    || null,
    utm_medium:           b.utm_medium    || null,
    utm_campaign:         b.utm_campaign  || null,
    utm_content:          b.utm_content   || null,
    referrer_url:         b.referrer_url  || null,
    landing_page:         b.landing_page  || null,
    cta_clicked:          b.cta_clicked   || null,
    wp_marketing_channel: b.WP_Marketing_Channel || null,
    wp_rec_challenge:     b.WP_Rec_Challenge     || null,
    company_ref:          companyRef,
    has_trial:            hasTrial,
    activation_status:    b.Activation_Status || null,
    paid_status:          parseSource(b.Paid_Status) || null,
    raw_data:             b,
  };
}

async function fetchBubbleSince(env: string, type: string, sinceIso: string | null): Promise<any[]> {
  const envPath = env === 'version-test' ? 'version-test' : 'api';
  const base = `${BUBBLE_URL.replace(/\/$/, '')}/${envPath}/1.1/obj`;
  const all: any[] = [];
  let cursor = 0;
  const pageSize = 100;
  const constraints = sinceIso
    ? encodeURIComponent(JSON.stringify([{ key: 'Modified Date', constraint_type: 'greater than', value: sinceIso }]))
    : '';
  let pages = 0;
  while (pages < 100) {
    pages++;
    const url = `${base}/${encodeURIComponent(type)}?cursor=${cursor}&limit=${pageSize}${constraints ? `&constraints=${constraints}` : ''}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${BUBBLE_KEY}` } });
    if (!res.ok) { const t = await res.text(); throw new Error(`Bubble API ${res.status}: ${t.slice(0, 200)}`); }
    const data = await res.json();
    const results = data.response?.results ?? [];
    const remaining = data.response?.remaining ?? 0;
    all.push(...results);
    if (remaining === 0 || results.length === 0) break;
    cursor += pageSize;
  }
  return all;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (!BUBBLE_KEY || !BUBBLE_URL) {
    return new Response(JSON.stringify({
      status: 'disabled',
      message: 'Bubble sync is paused. Set BUBBLE_API_KEY + BUBBLE_URL secrets to re-enable.',
      env_status: { BUBBLE_URL: BUBBLE_URL ? 'set' : 'missing', BUBBLE_API_KEY: BUBBLE_KEY ? 'set' : 'missing' },
    }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  const startedAt = new Date().toISOString();
  const supabase  = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // sync_config is optional. We accept rows under either 'bubble' (legacy) or
    // 'crm_import' (current). If both exist, prefer 'bubble'.
    const { data: cfgRows } = await supabase.from('sync_config').select('source, config, enabled').in('source', ['bubble','crm_import']);
    const cfgRow = (cfgRows || []).find(r => r.source === 'bubble') || (cfgRows || []).find(r => r.source === 'crm_import') || null;
    if (cfgRow && cfgRow.enabled === false) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'sync_config.enabled is false' }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }
    const objType: string = cfgRow?.config?.type || DEFAULT_TYPE;
    const env: string     = cfgRow?.config?.environment || DEFAULT_ENV;

    const { data: lastSync } = await supabase.from('sync_state').select('last_sync_at').eq('source', 'bubble').single();
    const since = lastSync?.last_sync_at ?? null;

    const bubbleLeads = await fetchBubbleSince(env, objType, since);

    if (bubbleLeads.length === 0) {
      await supabase.from('sync_state').upsert({ source: 'bubble', last_sync_at: startedAt, last_run_at: startedAt, last_count: 0 });
      return new Response(JSON.stringify({ ok: true, synced: 0, since }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const rows = bubbleLeads.map(bubbleToAccount);
    let inserted = 0, errors = 0;
    const errorMessages: string[] = [];
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error, data } = await supabase.from('accounts').upsert(batch, { onConflict: 'bubble_id', ignoreDuplicates: false }).select('id');
      if (error) { errors += batch.length; errorMessages.push(error.message); }
      else { inserted += data?.length ?? 0; }
    }

    await supabase.from('sync_state').upsert({ source: 'bubble', last_sync_at: startedAt, last_run_at: startedAt, last_count: inserted, last_errors: errors, last_error_msg: errorMessages.slice(0, 3).join(' | ') || null });

    return new Response(JSON.stringify({ ok: true, fetched: bubbleLeads.length, upserted: inserted, errors, since }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (err) {
    await supabase.from('sync_state').upsert({ source: 'bubble', last_run_at: startedAt, last_error_msg: String(err).slice(0, 500) });
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
});
