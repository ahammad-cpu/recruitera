// Edge function: invite-user (v3)
// Admin-only. Creates an auth user + profile + (optionally) adds them to
// admin_allowlist so handle_new_user promotes them to role='admin'.
// Caller MUST already be an admin (the function checks via is_admin()).
//
// v3 (2026-06-04): also writes profiles.reports_to (the new user's lead).
// v2 (2026-06-04): writes profiles.role_id from the request body.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!jwt) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const { data: who, error: whoErr } = await userClient.auth.getUser();
  if (whoErr || !who?.user) return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', who.user.id).single();
  if (!callerProfile || callerProfile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  let body: { email?: string; full_name?: string; role?: 'admin'|'user'; role_id?: string|null; team_id?: string|null; reports_to?: string|null; password?: string } | null = null;
  try { body = await req.json(); } catch {}
  const email      = String(body?.email || '').trim().toLowerCase();
  const full_name  = String(body?.full_name || '').trim();
  const role       = body?.role === 'admin' ? 'admin' : 'user';
  const team_id    = body?.team_id || null;
  const reports_to = body?.reports_to || null;
  const password   = String(body?.password || 'Recruitera@2025');

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Valid email required' }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  if (role === 'admin') {
    await admin.from('admin_allowlist').upsert({ email }, { onConflict: 'email' });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || email.split('@')[0] },
  });
  if (createErr) {
    return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }
  const newUid = created.user?.id;
  if (!newUid) {
    return new Response(JSON.stringify({ error: 'No user id returned' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
  }

  // Admins never report to anyone; force reports_to null for them.
  const effectiveReportsTo = role === 'admin' ? null : reports_to;

  await admin.from('profiles')
    .update({ full_name: full_name || email.split('@')[0], team_id, role_id: body?.role_id || null, reports_to: effectiveReportsTo })
    .eq('id', newUid);

  return new Response(JSON.stringify({
    ok: true,
    user_id: newUid,
    email,
    role,
    temp_password: password,
    message: 'User created. Share the temporary password and ask them to reset on first login.',
  }), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
});
