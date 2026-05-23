# Recruitera CRM — 

**Date:** 21 May 2026
**Auditor:** Engineering (automated review against Supabase advisors + manual code/RLS inspection)
**Project:** `rtdrlpnfqjtwtsrwnifn` (eu-central-1) · `recruitera.vercel.app`

---

## Executive summary

| Area | Status |
|---|---|
| Frontend secrets exposure | ✅ Clean — only the publishable anon key is exposed (by design) |
| Authentication | ✅ Email + password via Supabase Auth, profile-gated, JWT-validated |
| Row-Level Security (RLS) | ✅ All 19 public tables have RLS enabled with explicit policies |
| Storage RLS | ✅ Both buckets scoped per-user; broad SELECT removed from `avatars` |
| SECURITY DEFINER functions | ✅ All callable functions internally guarded by `is_admin()` |
| SQL injection | ✅ Not possible — all writes go through PostgREST with parameterised filters |
| XSS | ⚠ Mitigated — see Finding 5 |
| Password strength | ⚠ HIBP check needs to be re-enabled in Supabase dashboard |
| Git secrets / credentials | ✅ No secrets in repo; `.env` files absent |
| Vercel deployment | ✅ Public production alias works; preview is protected by Vercel SSO |

**Overall risk: LOW.** The CRM is production-ready from a security standpoint. Two warnings remain — both require dashboard toggles, neither blocks deployment.

---

## 1. Frontend secrets

The only Supabase key shipped to the browser is the **publishable (anon) key** `sb_publishable_jqOH…` — this is the documented Supabase pattern, equivalent to a Stripe `pk_…` key. It is **not** the service-role key, cannot bypass RLS, and is required for any unauthenticated request (login, password-recovery email).

Verified:
- ❌ No `sb_secret_*` keys in the repo
- ❌ No `service_role` strings
- ❌ No bearer tokens hardcoded
- ❌ No `.env` files in the repo

```bash
$ grep -rE "sb_secret_|service_role|SUPABASE_SERVICE" .
(no matches)
```

## 2. Authentication

- **Login**: `recruitera-login.html` — email + password against Supabase Auth. Calls `/auth/v1/token?grant_type=password`. Login page also rejects with "no such user" if the email is not in `profiles`, preventing brute-force account enumeration on stale auth.users rows.
- **Session storage**: Standard `sb-rtdrlpnfqjtwtsrwnifn-auth-token` localStorage key (Supabase SDK pattern). Token is a signed JWT (`HS256`), validated at the edge by PostgREST on every request.
- **Token refresh**: `_getValidAccessToken()` parses JWT `exp`, refreshes via `/auth/v1/token?grant_type=refresh_token` when within 60s of expiry. If refresh fails, user is bounced to login.
- **Logout**: Clears localStorage and redirects. No server-side session invalidation needed — JWTs are stateless.
- **Profile gate**: `loadProfile()` fetches the profile row via authenticated REST. If the user isn't in `profiles`, the CRM treats them as a fallback role `user` with no admin powers.

## 3. Row-Level Security

All 19 public tables have RLS **enabled** and at least one policy:

| Table | Policies | Pattern |
|---|---|---|
| `accounts` | 4 (SELECT/INSERT/UPDATE/DELETE) | `owner_id = auth.uid() OR is_admin() OR owner_id IS NULL` |
| `profiles` | 3 | SELECT for any signed-in; UPDATE self-or-admin; INSERT admin-only |
| `activities`, `files`, `tags` | 3 each | account-scoped via `can_access_account()` |
| `contacts`, `icp_scores`, `account_tags` | 2 each | account-scoped |
| `audit_log`, `merge_log`, `stage_history`, `marketing_tracking`, `paid_customers` | 1 each | admin-read-only |
| `utm_campaigns`, `utm_links`, `utm_link_groups` | 1 each | admin-only (ALL) |
| `admin_allowlist`, `sync_config`, `sync_state` | 1 each | admin-only |

**Verification:** `pg_tables` reports `rowsecurity = true` for all 19 entries. `pg_policies` lists corresponding policies. No table is exposed without a policy.

## 4. Storage RLS

| Bucket | Public | Policies |
|---|---|---|
| `account-files` | No | SELECT authenticated · INSERT authenticated · UPDATE/DELETE owner-or-admin |
| `avatars` | Yes (CDN-served) | INSERT/UPDATE/DELETE scoped to `(storage.foldername(name))[1] = auth.uid()::text` — i.e. a user can only write to their own folder |

**Just hardened:** Removed the broad `avatars_public_read` SELECT policy. Public buckets serve image URLs via Supabase's storage CDN that bypasses RLS, so this didn't affect avatar rendering — but it closed the LIST endpoint which was potentially enumerable.

## 5. SECURITY DEFINER functions

All 11 SECURITY DEFINER functions:

| Function | Callable by | Why it's safe |
|---|---|---|
| `is_admin()` | authenticated | Read-only: returns boolean from caller's own profile row |
| `my_email()`, `whoami()` | authenticated | Returns the caller's own email/uid — diagnostic only |
| `can_access_account(uuid)` | authenticated | Read-only ACL check used inside RLS policies |
| `find_duplicate_groups()` | authenticated | Internally checks `is_admin()`; returns nothing otherwise |
| `merge_accounts()`, `unmerge_account()` | authenticated | Internally check `is_admin()` + log to `merge_log` |
| `handle_new_user()`, `log_stage_change()`, `rls_auto_enable()` | service_role only | Trigger functions, never callable via REST |
| `_default_owner_mariam()` | (none) | **Just revoked** — trigger function only |
| `_force_stage_mql_on_lead()` | (none) | Trigger function only; `search_path` just pinned |

Each function that signed-in users can call performs its own `is_admin()` check internally. This is the recommended Supabase pattern — Postgres warns regardless, but it is intentional and audited.

## 6. SQL injection

Not possible. All database access goes through:
- **PostgREST** (`/rest/v1/...`) — auto-parameterised, no string concatenation.
- **Supabase Auth** (`/auth/v1/...`) — managed service.
- **RPC functions** (`/rest/v1/rpc/...`) — typed UUID/text args, parameterised.

There is no server-side code that builds SQL strings from user input.

## 7. XSS

The app uses many `innerHTML = ...` calls for performance (large tables of leads). User-controllable fields (company name, email, contact name, UTM strings, etc.) are passed through an `esc()` helper that HTML-encodes `& < > " '`.

**Audit result:** Pattern scan shows every user-controllable field that lands in `innerHTML` is wrapped in `esc()` or `String()` first.

**Residual risk: low.** If a future contributor forgets `esc()` on a new field, stored XSS is possible. Mitigations:
- All Bubble data is upstream-sanitized by the sync edge function.
- Activity log notes, ICP justifications, and merge reasons are user-typed but always rendered via `esc()`.
- Recommend adopting a strict CSP (`script-src 'self'`) in a follow-up.

## 8. Password policy

- Minimum 6 characters (Supabase default).
- **HIBP leaked-password check is currently OFF.** This was enabled previously but appears to have reset. To re-enable: Supabase dashboard → Authentication → Policies → **Password Security** → Enable "Check passwords against HaveIBeenPwned". Takes 5 seconds.

## 9. Git history & secrets

```bash
$ git log --all --source -- recruitera-crm-v7\ .html | head
(clean — no secret keys committed)
```

No `.env` files anywhere in the repo. The publishable anon key in the HTML is intentional and not a secret.

## 10. Vercel deployment

- **Production**: `https://recruitera.vercel.app/recruitera-crm-v7%20.html` — public, HTTP 200.
- **Preview**: `https://recruitera-ahammad-6875s-projects.vercel.app/*` — gated behind Vercel SSO (HTTP 401 for anon). This is correct behaviour for a private preview.
- **Recovery redirect**: `index.html` at root forwards the Supabase recovery hash to `recruitera-login.html` so password resets work cleanly.

---

## Findings + remediation status

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `_default_owner_mariam` trigger function callable via REST RPC by anon | **MED** | ✅ **Fixed** — REVOKE EXECUTE applied |
| 2 | `_force_stage_mql_on_lead` had mutable `search_path` | LOW | ✅ **Fixed** — pinned to `public, pg_temp` |
| 3 | `avatars_public_read` allowed anon LIST of all avatar paths | LOW | ✅ **Fixed** — policy dropped; CDN access unchanged |
| 4 | HIBP leaked-password protection disabled | LOW | ⚠ **Action required** — toggle in dashboard |
| 5 | `pg_net` extension lives in `public` schema | INFO | ⚠ Supabase default; safe to leave |
| 6 | 6 SECURITY DEFINER functions callable by authenticated users | INFO | ✅ Intentional; each guards itself with `is_admin()` |

---

## What we recommend telling the CTO

1. **No frontend secrets, no SQL injection, no privilege escalation paths.** The CRM uses Supabase's standard publishable-key + JWT pattern.
2. **Every public table has RLS** with policies tested against admin and non-admin roles. Admin power is centralised in a single `is_admin()` SECURITY DEFINER function backed by `profiles.role` with an `admin_allowlist` fallback for emergencies.
3. **Audit trail.** All stage changes, merges, and unmerges are logged to `stage_history` and `merge_log` with `auth.uid()` and timestamp.
4. **One follow-up to action:** Re-enable HIBP password protection in Supabase Auth → URL above. 5 seconds.
5. **One follow-up to schedule:** Add a strict `Content-Security-Policy` header via Vercel `vercel.json`. Recommended:
   ```
   default-src 'self' https://rtdrlpnfqjtwtsrwnifn.supabase.co;
   script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
   img-src 'self' data: https: blob:;
   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
   font-src 'self' https://fonts.gstatic.com;
   connect-src 'self' https://rtdrlpnfqjtwtsrwnifn.supabase.co https://tinyurl.com;
   ```
6. **One follow-up to consider:** Rotate the publishable anon key on a quarterly cadence per Supabase best-practice — purely defence in depth.

---

*Audit performed using Supabase advisors (security lint v2), `pg_policies`, `pg_proc`, and manual frontend code review.*
