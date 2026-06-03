-- docs/superpowers/specs/abac/tests/02_abac_regression.sql
-- Phase 2 regression sweep. Proves the new ABAC engine produces the same
-- read-access decision as the legacy ACL for every (user, account) pair.
-- Run via Supabase MCP execute_sql. The whole sweep runs inside a single
-- transaction that ROLLBACKs at the end → no production state change.

BEGIN;

-- Engine briefly ON for this sweep.
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';

-- 1. Snapshot the LEGACY ACL: rule was
--    is_admin() OR owner_id = auth.uid() OR am_mail = my_email() OR owner_id IS NULL
CREATE TEMP TABLE legacy_acl ON COMMIT DROP AS
SELECT p.id AS user_id, p.email AS user_email, a.id AS account_id,
       (public.is_admin_for(p.id)
        OR a.owner_id = p.id
        OR a.owner_id IS NULL
        OR (a.am_mail IS NOT NULL AND lower(a.am_mail) = lower(p.email))
       ) AS legacy
  FROM public.profiles p
 CROSS JOIN public.accounts a;

-- 2. Compute the NEW ABAC decision per pair by spoofing the JWT for each user
--    in turn and calling abac_check from within a SELECT.
CREATE TEMP TABLE abac_acl (user_id uuid, account_id uuid, abac boolean) ON COMMIT DROP;

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN SELECT id FROM public.profiles LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user.id::text)::text, true);
    INSERT INTO abac_acl (user_id, account_id, abac)
    SELECT v_user.id, a.id, public.abac_check('read', a)
      FROM public.accounts a;
  END LOOP;
END $$;

-- Clear the spoofed JWT so subsequent statements run as the MCP role again.
PERFORM set_config('request.jwt.claims', NULL, true);

-- 3. Diff: any non-match is a regression.
CREATE TEMP TABLE diffs ON COMMIT DROP AS
SELECT l.user_id, l.user_email, l.account_id, l.legacy, b.abac
  FROM legacy_acl l
  JOIN abac_acl   b USING (user_id, account_id)
 WHERE l.legacy IS DISTINCT FROM b.abac;

-- 4. Surface the result. Final SELECT is what the test runner reads.
SELECT
  (SELECT count(*) FROM legacy_acl) AS pairs_checked,
  (SELECT count(*) FROM diffs)      AS mismatches,
  (SELECT count(*) FROM diffs WHERE legacy=true  AND abac=false) AS legacy_allow_abac_deny,
  (SELECT count(*) FROM diffs WHERE legacy=false AND abac=true ) AS legacy_deny_abac_allow;

-- 5. Show up to 20 sample mismatches for diagnosis (if any).
SELECT user_email, account_id, legacy, abac FROM diffs LIMIT 20;

-- 6. Reset flag. Sweep done.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
ROLLBACK;
