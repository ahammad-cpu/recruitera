// Edge function: webflow-demo-intake (v2)
// Receives the recruitera.ai/demo Webflow form and creates an MQL lead.
// Form fields: Full Name, Business Email, Mobile Number, Job Title,
//   Company Name, "How many vacancies are you planning for in the next 12 months?"
// Public endpoint; protect with WEBFLOW_WEBHOOK_SECRET (header or ?secret=).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SHARED_SECRET = Deno.env.get('WEBFLOW_WEBHOOK_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webflow-secret',
};

const GENERIC_DOMAINS = new Set([
  'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','live.com',
  'me.com','msn.com','aol.com','protonmail.com','ymail.com','googlemail.com',
]);

function domainFromEmail(email: string): string | null {
  if (!email || !email.includes('@')) return null;
  const d = email.split('@')[1]?.toLowerCase().trim();
  if (!d || d.length < 3 || GENERIC_DOMAINS.has(d)) return null;
  return d;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Resolve a value by trying several key spellings: exact normalised match first,
// then a fuzzy contains-match (handles Webflow names like 'Business-Email-2').
function pick(obj: Record<string, any>, keys: string[]): string {
  if (!obj) return '';
  const entries: [string, any][] = Object.entries(obj).map(([k, v]) => [norm(k), v]);
  for (const key of keys) {
    const nk = norm(key);
    const hit = entries.find(([k]) => k === nk);
    if (hit && String(hit[1]).trim() !== '') return String(hit[1]).trim();
  }
  for (const key of keys) {
    const nk = norm(key);
    if (nk.length < 3) continue;
    const hit = entries.find(([k]) => k.includes(nk) || nk.includes(k));
    if (hit && String(hit[1]).trim() !== '') return String(hit[1]).trim();
  }
  return '';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')   return new Response('Method not allowed', { status: 405, headers: CORS });

  if (SHARED_SECRET) {
    const provided = req.headers.get('x-webflow-secret') || new URL(req.url).searchParams.get('secret') || '';
    if (provided !== SHARED_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* tolerate */ }

  // Normalise Webflow payload shapes to a flat field map.
  const fields = (body?.payload?.data) || (body?.data) || (body?.payload) || body || {};

  const fullName = pick(fields, ['full name','fullname','name','your name','contact name']);
  const email    = pick(fields, ['business email','email','work email','email address']);
  const phone    = pick(fields, ['mobile number','mobile','phone','phone number','tel','whatsapp']);
  const jobTitle = pick(fields, ['job title','jobtitle','title','role','position']);
  const company  = pick(fields, ['company name','company','organization','organisation','business']);
  const vacancies= pick(fields, ['vacancies','how many vacancies','number of vacancies','hiring volume','annual hiring','vacancy']);
  const website  = pick(fields, ['website','company website','url']);

  if (!email && !company && !fullName) {
    return new Response(JSON.stringify({ ok: false, error: 'no usable fields', received: Object.keys(fields) }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const domain = domainFromEmail(email)
              || (website ? website.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase() : null);
  const displayName = company || fullName || (email ? email.split('@')[0] : 'Demo request');

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // owner_id / am_mail forced by the accounts BEFORE INSERT trigger.
  const row = {
    name:   displayName,
    domain: domain,
    source: 'Webflow Demo Request',
    stage:  'mql',
    is_disqualified: false,
    source_created_at: new Date().toISOString(),
    raw_data: {
      'Company Name':   company || displayName,
      'Contact_Name':   fullName || null,
      'Contact_Email':  email || null,
      'Contact_Mobile': phone || null,
      'Job Title':      jobTitle || null,
      'Contact_Title':  jobTitle || null,
      'WP_Vacancies':   vacancies || null,
      'Source':         'Webflow Demo Request',
      'WP_Website':     website || null,
      'Demo_Message':   null,
      '_intake':        'webflow',
      '_received_at':   new Date().toISOString(),
      '_raw_submission': fields,
    },
  };

  const { data, error } = await supabase.from('accounts').insert(row).select('id, name').single();
  if (error) {
    console.error('[webflow-demo-intake] insert failed:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  try {
    const parts = [
      'Demo requested via Webflow',
      fullName ? 'by ' + fullName : '',
      jobTitle ? '(' + jobTitle + ')' : '',
      email ? '· ' + email : '',
      phone ? '· ' + phone : '',
      vacancies ? '· vacancies: ' + vacancies : '',
    ].filter(Boolean).join(' ');
    await supabase.from('activities').insert({ account_id: data.id, type: 'note', text: parts });
  } catch (_) { /* non-fatal */ }

  console.log(`[webflow-demo-intake] created account ${data.id} (${data.name})`);
  return new Response(JSON.stringify({ ok: true, account_id: data.id }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
