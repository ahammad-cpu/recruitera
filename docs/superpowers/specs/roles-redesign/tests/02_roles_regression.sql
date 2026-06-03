-- docs/superpowers/specs/roles-redesign/tests/02_roles_regression.sql
-- Phase 2 regression sweep. Proves the new role-based policies produce the
-- same read decision as the legacy Compat policies for every (user, account)
-- pair. Run via Supabase MCP execute_sql.

BEGIN;

-- 1. Snapshot the LEGACY decision: temporarily re-enable Compat + disable new role-based.
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';
UPDATE public.abac_policies SET enabled=true  WHERE name IN ('Compat — owner reads own','Compat — owner updates own');
UPDATE public.abac_policies SET enabled=false WHERE name LIKE 'auto:role:%';

CREATE TEMP TABLE legacy_acl ON COMMIT DROP AS
SELECT p.id AS user_id, p.email AS user_email, a.id AS account_id,
       (public.abac_simulate(p.id, 'read', a.id)->>'allowed')::boolean AS legacy
  FROM public.profiles p CROSS JOIN public.accounts a;

-- 2. Snapshot the NEW decision: re-enable role-based, disable Compat.
UPDATE public.abac_policies SET enabled=false WHERE name IN ('Compat — owner reads own','Compat — owner updates own');
UPDATE public.abac_policies SET enabled=true  WHERE name LIKE 'auto:role:%';

CREATE TEMP TABLE new_acl ON COMMIT DROP AS
SELECT p.id AS user_id, p.email AS user_email, a.id AS account_id,
       (public.abac_simulate(p.id, 'read', a.id)->>'allowed')::boolean AS new_decision
  FROM public.profiles p CROSS JOIN public.accounts a;

-- 3. Diff. Any non-match is a regression.
SELECT
  (SELECT count(*) FROM legacy_acl) AS pairs_checked,
  (SELECT count(*) FROM legacy_acl l JOIN new_acl n USING (user_id, account_id)
    WHERE l.legacy IS DISTINCT FROM n.new_decision) AS mismatches,
  (SELECT count(*) FROM legacy_acl l JOIN new_acl n USING (user_id, account_id)
    WHERE l.legacy=true  AND n.new_decision=false) AS legacy_allow_new_deny,
  (SELECT count(*) FROM legacy_acl l JOIN new_acl n USING (user_id, account_id)
    WHERE l.legacy=false AND n.new_decision=true ) AS legacy_deny_new_allow;

-- Optional sample of mismatches for diagnosis
SELECT l.user_email, l.account_id, l.legacy, n.new_decision
  FROM legacy_acl l JOIN new_acl n USING (user_id, account_id)
 WHERE l.legacy IS DISTINCT FROM n.new_decision
 LIMIT 20;

-- 4. Reset everything. ROLLBACK undoes the policy-enabled toggles too.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
ROLLBACK;
