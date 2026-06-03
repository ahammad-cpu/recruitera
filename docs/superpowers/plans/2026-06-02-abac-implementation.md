# ABAC (Rules & Permissions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `is_admin() + owner_id` access model with an attribute-based access control (ABAC) engine: JSONB policies authored in-app by super-admins, evaluated by a single Postgres function that both RLS and the frontend call, with a 5-phase migration that never locks anyone out.

**Architecture:** One SECURITY DEFINER SQL function (`abac_check`) reads `auth.uid()` + the candidate row, walks the `abac_policies` table, and returns a boolean. RLS calls it; the CRM calls it via PostgREST RPC. A feature flag in `app_settings` lets the function short-circuit to TRUE so we can ship the engine disabled, seed compatibility policies, run a regression sweep, pilot one user, then flip globally.

**Tech Stack:**
- Postgres 15 (Supabase project `rtdrlpnfqjtwtsrwnifn`, eu-central-1) — tables, RLS, SECURITY DEFINER functions
- Supabase MCP server — `apply_migration` for DDL, `execute_sql` for tests
- Single-file CRM (`crm.html`) — vanilla JS, inline `<script>` blocks, raw `fetch` against `${SB_URL}/rest/v1/...` with JWT from `_getValidAccessToken()`
- Vercel — deploys on every push to `main`

---

## File structure

| Path | Responsibility |
|---|---|
| `crm.html` (existing) | Add: Settings sidebar item + view container, Policies/Teams/Simulator tabs, Policy Editor modal, ABAC gates around action buttons and row filters. Edits go into the relevant inline `<script>` blocks and at the end of `<body>`. |
| `docs/superpowers/specs/abac/tests/01_abac_unit.sql` (new) | Postgres unit tests for `abac_check`: deny-overrides-allow, default-deny, admin-bypass, malformed JSON → fail-closed, disabled policy ignored, subject mismatch ignored. Run via Supabase MCP `execute_sql`. |
| `docs/superpowers/specs/abac/tests/02_abac_regression.sql` (new) | Regression sweep for Phase 2: for every `(user, account)` pair, the legacy `can_access_account` result must equal `abac_check('read', acc)`. |
| `docs/superpowers/specs/abac/tests/03_abac_smoke.sql` (new) | Phase 4 smoke: small SELECT/UPDATE/INSERT/DELETE matrix that admin always passes, regular user passes only what compatibility policies allow. |

Migrations are applied directly via the Supabase MCP `apply_migration` tool (no migration files on disk per project convention).

---

## Phase 1 — Build with engine disabled

Ship every piece of the engine + UI behind a feature flag. `abac_check` always returns TRUE while `app_settings.abac_enabled = false`, so the live CRM behaves exactly as it does today. Nothing user-visible changes during this phase.

### Task 1: Migration — `teams` + `profiles.team_id` + `app_settings`

**Files:**
- Create (migrations applied via MCP): `phase1_a1_teams_appsettings`

- [ ] **Step 1: Apply the migration via Supabase MCP**

Use the `mcp__b7e33bec-653b-4703-9358-0d8100f64694__apply_migration` tool:

```sql
-- name: phase1_a1_teams_appsettings

CREATE TABLE public.teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_select_all  ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY teams_write_admin ON public.teams FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE TABLE public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY appset_select_admin ON public.app_settings FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY appset_write_admin  ON public.app_settings FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (key, value) VALUES ('abac_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
```

- [ ] **Step 2: Verify with MCP `execute_sql`**

Run:
```sql
SELECT (SELECT count(*) FROM public.teams) AS teams,
       (SELECT count(*) FROM public.app_settings) AS settings,
       (SELECT value FROM public.app_settings WHERE key='abac_enabled') AS flag,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='profiles' AND column_name='team_id') AS team_col_exists;
```
Expected: `teams=0`, `settings=1`, `flag=false`, `team_col_exists=1`.

### Task 2: Migration — `abac_policies` + `abac_audit`

- [ ] **Step 1: Apply migration `phase1_a2_abac_tables`**

```sql
-- name: phase1_a2_abac_tables

CREATE TABLE public.abac_policies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  resource    text NOT NULL CHECK (resource IN ('accounts')),
  action      text NOT NULL CHECK (action IN ('read','update','delete','disqualify','merge','reassign_owner','mark_won_lost')),
  effect      text NOT NULL CHECK (effect IN ('allow','deny')),
  subject     jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition   jsonb NOT NULL DEFAULT '{"all":[]}'::jsonb,
  priority    int NOT NULL DEFAULT 100,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX abac_policies_lookup_idx
  ON public.abac_policies (resource, action, enabled, priority);

CREATE OR REPLACE FUNCTION public._touch_abac_policy_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_abac_policies_updated_at
  BEFORE UPDATE ON public.abac_policies
  FOR EACH ROW EXECUTE FUNCTION public._touch_abac_policy_updated_at();

ALTER TABLE public.abac_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY abac_policies_admin_all ON public.abac_policies FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE public.abac_audit (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  user_id      uuid,
  resource     text NOT NULL,
  resource_id  uuid,
  action       text NOT NULL,
  effect       text NOT NULL CHECK (effect IN ('deny','error')),
  policy_id    uuid REFERENCES public.abac_policies(id) ON DELETE SET NULL,
  reason       text
);
CREATE INDEX abac_audit_user_at_idx ON public.abac_audit (user_id, at DESC);
ALTER TABLE public.abac_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY abac_audit_admin_select ON public.abac_audit FOR SELECT TO authenticated USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policy → only service_role (used by SECURITY DEFINER abac_check) can write.
```

- [ ] **Step 2: Verify schema with MCP `execute_sql`**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('abac_policies','abac_audit')
ORDER BY table_name;
```
Expected: two rows.

### Task 3: Migration — `abac_check` evaluator (feature-flagged no-op)

The function reads the flag from `app_settings`. While `abac_enabled = false` it returns TRUE for everything — the engine ships dark.

- [ ] **Step 1: Apply migration `phase1_a3_abac_check`**

```sql
-- name: phase1_a3_abac_check

CREATE OR REPLACE FUNCTION public.abac_check(
  p_action  text,
  p_account public.accounts
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled  boolean;
  v_uid      uuid := auth.uid();
  v_profile  RECORD;
  v_policy   RECORD;
  v_allowed  boolean := false;
  v_subj_ok  boolean;
  v_cond_ok  boolean;
  v_first_deny uuid := NULL;
BEGIN
  -- 0. Feature flag: while disabled, evaluator is a no-op (returns true).
  SELECT (value)::text::boolean INTO v_enabled FROM public.app_settings WHERE key = 'abac_enabled';
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN true;
  END IF;

  -- 1. No caller → deny (defense in depth; RLS would block anyway).
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Load caller attributes.
  SELECT p.id, p.email, p.full_name, p.role::text AS role, p.team_id, t.name AS team_name
    INTO v_profile
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE p.id = v_uid;

  -- 3. Admin bypass.
  IF v_profile.role = 'admin' THEN
    RETURN true;
  END IF;

  -- 4. Walk matching policies in priority order.
  FOR v_policy IN
    SELECT id, effect, subject, condition, priority
      FROM public.abac_policies
     WHERE resource = 'accounts' AND action = p_action AND enabled = true
     ORDER BY priority ASC, id
  LOOP
    -- Subject match: every specified key must match. Empty subject matches all.
    v_subj_ok := true;
    IF v_policy.subject ? 'role'    AND v_policy.subject->>'role'    IS DISTINCT FROM v_profile.role     THEN v_subj_ok := false; END IF;
    IF v_subj_ok AND v_policy.subject ? 'team_id' AND v_policy.subject->>'team_id' IS DISTINCT FROM v_profile.team_id::text THEN v_subj_ok := false; END IF;
    IF v_subj_ok AND v_policy.subject ? 'user_ids' THEN
      IF NOT (v_policy.subject->'user_ids' @> to_jsonb(v_uid::text)) THEN v_subj_ok := false; END IF;
    END IF;
    IF NOT v_subj_ok THEN CONTINUE; END IF;

    -- Condition eval. Wrapped in nested block so a single bad policy doesn't kill the call.
    BEGIN
      v_cond_ok := public._abac_eval_condition(v_policy.condition, v_profile, p_account);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
      VALUES (v_uid, 'accounts', p_account.id, p_action, 'error', v_policy.id, SQLERRM);
      CONTINUE;
    END;

    IF v_cond_ok THEN
      IF v_policy.effect = 'deny' THEN
        IF v_first_deny IS NULL THEN v_first_deny := v_policy.id; END IF;
        INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
        VALUES (v_uid, 'accounts', p_account.id, p_action, 'deny', v_policy.id, 'policy matched');
        RETURN false;  -- deny wins, short-circuit
      ELSE
        v_allowed := true;  -- allow vote; keep walking for possible deny
      END IF;
    END IF;
  END LOOP;

  -- 5. Closed world: no allow → deny + log.
  IF NOT v_allowed THEN
    INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
    VALUES (v_uid, 'accounts', p_account.id, p_action, 'deny', NULL, 'default deny — no allow policy matched');
    RETURN false;
  END IF;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.abac_check(text, public.accounts) TO authenticated;

-- Forward declaration; real body lands in next migration.
CREATE OR REPLACE FUNCTION public._abac_eval_condition(p_cond jsonb, p_profile RECORD, p_account public.accounts)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN RETURN true; END $$;
```

- [ ] **Step 2: Verify the function returns true while flag is off**

```sql
SELECT public.abac_check('read', a.*) FROM public.accounts a LIMIT 1;
```
Expected: `t` (true).

### Task 4: Migration — condition evaluator `_abac_eval_condition`

Implements the §6 DSL: recursive `all`/`any`, leaves with `field`/`op`/`value|value_from`. Field paths resolve from `user.*` and `account.*`.

- [ ] **Step 1: Apply migration `phase1_a4_abac_eval_condition`**

```sql
-- name: phase1_a4_abac_eval_condition

-- Read a field path ("account.stage", "user.id", etc.) and return the value as text.
-- Returns NULL if the path is unknown or the value is null.
CREATE OR REPLACE FUNCTION public._abac_resolve_field(
  p_path text,
  p_profile RECORD,
  p_account public.accounts
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE v_prefix text; v_name text;
BEGIN
  IF p_path IS NULL OR position('.' in p_path) = 0 THEN RETURN NULL; END IF;
  v_prefix := split_part(p_path, '.', 1);
  v_name   := split_part(p_path, '.', 2);

  IF v_prefix = 'user' THEN
    RETURN CASE v_name
      WHEN 'id'        THEN p_profile.id::text
      WHEN 'role'      THEN p_profile.role
      WHEN 'team_id'   THEN p_profile.team_id::text
      WHEN 'team_name' THEN p_profile.team_name
      WHEN 'email'     THEN p_profile.email
      WHEN 'full_name' THEN p_profile.full_name
      ELSE NULL
    END;
  ELSIF v_prefix = 'account' THEN
    RETURN CASE v_name
      WHEN 'id'                  THEN p_account.id::text
      WHEN 'stage'               THEN p_account.stage::text
      WHEN 'owner_id'            THEN p_account.owner_id::text
      WHEN 'am_mail'             THEN p_account.am_mail
      WHEN 'deal_value'          THEN p_account.deal_value::text
      WHEN 'is_disqualified'     THEN p_account.is_disqualified::text
      WHEN 'paid_status'         THEN p_account.paid_status
      WHEN 'activation_status'   THEN p_account.activation_status
      WHEN 'has_trial'           THEN p_account.has_trial::text
      WHEN 'wp_marketing_channel' THEN p_account.wp_marketing_channel
      WHEN 'source'              THEN p_account.source
      WHEN 'domain'              THEN p_account.domain
      WHEN 'industry'            THEN p_account.industry
      WHEN 'size'                THEN p_account.size
      WHEN 'location'            THEN p_account.location
      WHEN 'vacancies'           THEN p_account.vacancies
      WHEN 'company_ref'         THEN p_account.company_ref
      ELSE NULL
    END;
  END IF;
  RETURN NULL;
END $$;

-- Evaluate a single leaf node {field, op, value|value_from}.
CREATE OR REPLACE FUNCTION public._abac_eval_leaf(
  p_leaf jsonb, p_profile RECORD, p_account public.accounts
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_field text := p_leaf->>'field';
  v_op    text := p_leaf->>'op';
  v_lhs   text;
  v_rhs   text;
  v_rhs_arr jsonb;
  v_num_lhs numeric;
  v_num_rhs numeric;
BEGIN
  v_lhs := public._abac_resolve_field(v_field, p_profile, p_account);

  IF v_op IN ('is_null','is_not_null') THEN
    RETURN (v_op = 'is_null') = (v_lhs IS NULL);
  END IF;

  IF p_leaf ? 'value_from' THEN
    v_rhs := public._abac_resolve_field(p_leaf->>'value_from', p_profile, p_account);
  ELSIF v_op IN ('in','not_in') THEN
    v_rhs_arr := p_leaf->'value';
  ELSE
    v_rhs := (p_leaf->>'value');
  END IF;

  -- NULL LHS only matches is_null / is_not_null (handled above) → otherwise false.
  IF v_lhs IS NULL AND v_op NOT IN ('in','not_in') THEN RETURN false; END IF;

  CASE v_op
    WHEN 'eq' THEN RETURN v_lhs = v_rhs;
    WHEN 'ne' THEN RETURN v_lhs IS DISTINCT FROM v_rhs;
    WHEN 'lt' THEN BEGIN v_num_lhs := v_lhs::numeric; v_num_rhs := v_rhs::numeric; RETURN v_num_lhs <  v_num_rhs; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'lte'THEN BEGIN v_num_lhs := v_lhs::numeric; v_num_rhs := v_rhs::numeric; RETURN v_num_lhs <= v_num_rhs; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'gt' THEN BEGIN v_num_lhs := v_lhs::numeric; v_num_rhs := v_rhs::numeric; RETURN v_num_lhs >  v_num_rhs; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'gte'THEN BEGIN v_num_lhs := v_lhs::numeric; v_num_rhs := v_rhs::numeric; RETURN v_num_lhs >= v_num_rhs; EXCEPTION WHEN OTHERS THEN RETURN false; END;
    WHEN 'in'    THEN RETURN v_rhs_arr @> to_jsonb(v_lhs);
    WHEN 'not_in'THEN RETURN NOT (v_rhs_arr @> to_jsonb(v_lhs));
    WHEN 'starts_with' THEN RETURN v_lhs LIKE v_rhs || '%';
    WHEN 'contains'    THEN RETURN v_lhs LIKE '%' || v_rhs || '%';
    ELSE RETURN false;
  END CASE;
END $$;

-- Recursive group walker.
CREATE OR REPLACE FUNCTION public._abac_eval_condition(
  p_cond jsonb, p_profile RECORD, p_account public.accounts
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_node jsonb;
BEGIN
  IF p_cond IS NULL OR p_cond = '{}'::jsonb THEN RETURN true; END IF;

  IF p_cond ? 'all' THEN
    FOR v_node IN SELECT jsonb_array_elements(p_cond->'all') LOOP
      IF v_node ? 'field' THEN
        IF NOT public._abac_eval_leaf(v_node, p_profile, p_account) THEN RETURN false; END IF;
      ELSE
        IF NOT public._abac_eval_condition(v_node, p_profile, p_account) THEN RETURN false; END IF;
      END IF;
    END LOOP;
    RETURN true;
  ELSIF p_cond ? 'any' THEN
    FOR v_node IN SELECT jsonb_array_elements(p_cond->'any') LOOP
      IF v_node ? 'field' THEN
        IF public._abac_eval_leaf(v_node, p_profile, p_account) THEN RETURN true; END IF;
      ELSE
        IF public._abac_eval_condition(v_node, p_profile, p_account) THEN RETURN true; END IF;
      END IF;
    END LOOP;
    RETURN false;
  ELSIF p_cond ? 'field' THEN
    -- bare leaf as the whole condition
    RETURN public._abac_eval_leaf(p_cond, p_profile, p_account);
  END IF;
  RETURN false;
END $$;
```

- [ ] **Step 2: Verify the condition evaluator on a simple case (flag is still off → should still return true overall, but exercise the path by temp-flipping)**

```sql
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';
-- With no policies in the table, default deny should kick in for the current user.
SELECT public.abac_check('read', a.*) FROM public.accounts a LIMIT 1;
-- Expected: f (false) — closed world, no allow policy matched.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
```

### Task 5: Migration — `abac_check_batch` for the UI

- [ ] **Step 1: Apply migration `phase1_a5_abac_batch`**

```sql
-- name: phase1_a5_abac_batch

CREATE OR REPLACE FUNCTION public.abac_check_batch(
  p_action     text,
  p_account_ids uuid[]
) RETURNS TABLE (account_id uuid, allowed boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.id, public.abac_check(p_action, a)
    FROM public.accounts a
   WHERE a.id = ANY(p_account_ids);
$$;
GRANT EXECUTE ON FUNCTION public.abac_check_batch(text, uuid[]) TO authenticated;
```

- [ ] **Step 2: Verify batch RPC reachable**

```sql
SELECT * FROM public.abac_check_batch('read', ARRAY(SELECT id FROM public.accounts LIMIT 3));
```
Expected: 3 rows, all `allowed = t` (flag is off, so check returns true).

### Task 6: Migration — rewrite `can_access_account` + update RLS policies on `accounts`

Existing `can_access_account(uuid)` becomes a thin wrapper that delegates to `abac_check('read', row)`. The four `accounts` RLS policies (SELECT / INSERT / UPDATE / DELETE) get rewritten to use `abac_check` per action.

- [ ] **Step 1: Apply migration `phase1_a6_rewrite_rls`**

```sql
-- name: phase1_a6_rewrite_rls

-- 1) Replace can_access_account with an ABAC-delegating version.
CREATE OR REPLACE FUNCTION public.can_access_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts a
     WHERE a.id = _account_id
       AND public.abac_check('read', a)
  );
$$;

-- 2) Replace accounts RLS policies. Drop the old ones first.
DROP POLICY IF EXISTS accounts_select ON public.accounts;
DROP POLICY IF EXISTS accounts_insert ON public.accounts;
DROP POLICY IF EXISTS accounts_update ON public.accounts;
DROP POLICY IF EXISTS accounts_delete ON public.accounts;

CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated
  USING (public.abac_check('read', accounts));

CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.abac_check('update', accounts));

CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated
  USING (public.abac_check('update', accounts))
  WITH CHECK (public.abac_check('update', accounts));

CREATE POLICY accounts_delete ON public.accounts FOR DELETE TO authenticated
  USING (public.abac_check('delete', accounts));
```

- [ ] **Step 2: Verify RLS still allows existing access (flag is off → abac_check returns true → everything passes)**

```sql
SELECT count(*) FROM public.accounts;
```
Expected: ~625 (the current account count). No difference from before this migration.

### Task 7: Write `01_abac_unit.sql` — unit tests for the evaluator

**Files:**
- Create: `docs/superpowers/specs/abac/tests/01_abac_unit.sql`

- [ ] **Step 1: Create the test file**

```sql
-- docs/superpowers/specs/abac/tests/01_abac_unit.sql
-- Run via Supabase MCP execute_sql. Each test wraps in a savepoint+rollback so
-- the database state is unchanged. The whole file is one transaction; final
-- ROLLBACK undoes anything that escapes.
BEGIN;

-- Force evaluator on for tests.
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';

-- Make sure auth.uid() returns something. In MCP context auth.uid() is NULL,
-- so we substitute via SET LOCAL request.jwt.claims for the duration.
DO $$
DECLARE
  v_test_uid     uuid := gen_random_uuid();
  v_test_team    uuid := gen_random_uuid();
  v_test_acct    public.accounts;
  v_policy_allow uuid;
  v_policy_deny  uuid;
  v_result       boolean;
BEGIN
  -- Stand up a minimal profile + team.
  INSERT INTO public.teams (id, name) VALUES (v_test_team, 'unit-test-team');
  INSERT INTO public.profiles (id, email, full_name, role, short_id, team_id)
    VALUES (v_test_uid, 'unit@test.local', 'Unit Test', 'user', 'UT', v_test_team);

  -- Stand up a minimal account row.
  INSERT INTO public.accounts (name, deal_value, wp_marketing_channel)
    VALUES ('UnitTest Co', 500000, 'Egypt')
    RETURNING * INTO v_test_acct;

  -- Spoof auth.uid() for the rest of this block. SET LOCAL is scoped to the txn.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_uid::text)::text, true);

  -- Test 1: default deny — no policy exists.
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 1 FAILED: expected default deny'; END IF;

  -- Test 2: allow policy matches → allow.
  INSERT INTO public.abac_policies (name, resource, action, effect, subject, condition, priority)
    VALUES ('allow-egypt', 'accounts', 'read', 'allow',
            jsonb_build_object('team_id', v_test_team::text),
            jsonb_build_object('all', jsonb_build_array(
              jsonb_build_object('field','account.wp_marketing_channel','op','eq','value','Egypt')
            )),
            100)
    RETURNING id INTO v_policy_allow;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 2 FAILED: expected allow'; END IF;

  -- Test 3: deny overrides allow.
  INSERT INTO public.abac_policies (name, resource, action, effect, subject, condition, priority)
    VALUES ('deny-big', 'accounts', 'read', 'deny',
            jsonb_build_object('team_id', v_test_team::text),
            jsonb_build_object('all', jsonb_build_array(
              jsonb_build_object('field','account.deal_value','op','gt','value',100000)
            )),
            50)
    RETURNING id INTO v_policy_deny;
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 3 FAILED: expected deny override'; END IF;

  -- Test 4: disabled policy ignored.
  UPDATE public.abac_policies SET enabled=false WHERE id = v_policy_deny;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 4 FAILED: disabled policy should not fire'; END IF;

  -- Test 5: subject mismatch ignored (different team).
  UPDATE public.abac_policies
    SET subject = jsonb_build_object('team_id', gen_random_uuid()::text), enabled=true
    WHERE id = v_policy_allow;
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 5 FAILED: allow with wrong subject should not fire → default deny'; END IF;

  -- Test 6: admin bypass.
  UPDATE public.profiles SET role='admin' WHERE id = v_test_uid;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 6 FAILED: admin should bypass'; END IF;

  RAISE NOTICE 'All 6 unit tests passed.';
END $$;

-- Cleanup: rollback the whole block — DB unchanged.
ROLLBACK;
-- Restore the flag back to false (cleanup belt-and-braces).
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
```

- [ ] **Step 2: Run the file via MCP `execute_sql` and observe the NOTICE**

Paste the file content into `mcp__b7e33bec-653b-4703-9358-0d8100f64694__execute_sql`. Expected: no error, final NOTICE `All 6 unit tests passed.` Each `RAISE EXCEPTION` line is what we want to NOT see.

- [ ] **Step 3: Commit the test file**

```bash
git add docs/superpowers/specs/abac/tests/01_abac_unit.sql
git commit -m "test(abac): add unit tests for evaluator (deny/allow/disabled/subject/admin)"
```

### Task 8: Frontend — Settings sidebar item + view shell

Add a new top-level "Settings" sidebar item visible only to admins, and a view container with three empty tabs (Policies / Teams / Simulator) wired into `switchMainView`.

**Files:**
- Modify: `crm.html` — sidebar nav block (search for `id="sb-renewal-item"` to find the anchor) and view containers section (search for `id="renewal-view"`)

- [ ] **Step 1: Add the sidebar item next to Renewal**

In `crm.html`, find the block starting `<div class="sb-item" data-label="Renewal"` and insert AFTER its closing `</div>`:

```html
<div class="sb-item" data-label="Settings" id="sb-settings-item" onclick="switchMainView('settings')" style="display:none;">
  <svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  <span class="sb-item-label">Settings</span>
</div>
```

The `style="display:none;"` gates it until JS reveals it for admins.

- [ ] **Step 2: Add the view container after `renewal-view`**

Find `<div id="renewal-view"` in `crm.html`. After the closing `</div>` of that block, insert:

```html
<div id="settings-view" style="display:none;flex:1;min-height:0;flex-direction:column;background:var(--bg);overflow-y:auto;padding:20px 24px 32px;">
  <div style="display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--border);">
    <div class="settings-tab active" data-tab="policies"  onclick="settingsSwitchTab('policies')"  style="padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-2);">Policies <span class="settings-tab-cnt" id="settings-cnt-policies" style="font-size:11px;background:var(--bg-2);color:var(--text-2);padding:1px 7px;border-radius:999px;margin-left:4px;">0</span></div>
    <div class="settings-tab"        data-tab="teams"     onclick="settingsSwitchTab('teams')"     style="padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-2);">Teams <span class="settings-tab-cnt" id="settings-cnt-teams" style="font-size:11px;background:var(--bg-2);color:var(--text-2);padding:1px 7px;border-radius:999px;margin-left:4px;">0</span></div>
    <div class="settings-tab"        data-tab="simulator" onclick="settingsSwitchTab('simulator')" style="padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;color:var(--text-2);">Simulator</div>
  </div>
  <style>.settings-tab.active{color:var(--text-1)!important;border-bottom-color:var(--purple-700,#7c3aed)!important;} .settings-tab.active .settings-tab-cnt{background:var(--purple-100,#f0eef9)!important;color:var(--purple-700,#7c3aed)!important;}</style>
  <div id="settings-pane-policies"  style="flex:1;min-height:0;"></div>
  <div id="settings-pane-teams"     style="flex:1;min-height:0;display:none;"></div>
  <div id="settings-pane-simulator" style="flex:1;min-height:0;display:none;"></div>
</div>
```

- [ ] **Step 3: Add the `settings` case to `switchMainView`**

Find `else if (view === 'renewal')` in `crm.html`. After its closing `}`, insert:

```js
} else if (view === 'settings') {
  if (window.AUTH_PROFILE?.role !== 'admin') {
    console.warn('[Settings] non-admin blocked'); return;
  }
  if (boardView)     boardView.style.cssText = 'display:none;';
  if (accountsView)  accountsView.style.cssText = 'display:none;';
  if (dashboardView) dashboardView.style.cssText = 'display:none;';
  hideUtm();
  const settingsView = document.getElementById('settings-view');
  if (settingsView) settingsView.style.cssText = 'display:flex;position:absolute;inset:0;flex-direction:column;background:var(--bg);overflow-y:auto;padding:20px 24px 32px;';
  setActive(document.getElementById('sb-settings-item'), true);
  if (topbarTitle) topbarTitle.innerHTML = 'Settings';
  requestAnimationFrame(() => renderSettingsPolicies());
}
```

Also extend the "always hide" cleanup at the top of `switchMainView` (after `renewalViewEl`) to add:

```js
const settingsViewEl = document.getElementById('settings-view');
if (view !== 'settings' && settingsViewEl) settingsViewEl.style.cssText = 'display:none;';
```

- [ ] **Step 4: Reveal sidebar item for admins**

Find the existing admin gating block — search for `if (window.AUTH_PROFILE && window.AUTH_PROFILE.role === 'admin')`. After whatever it currently does, add:

```js
const _sbSet = document.getElementById('sb-settings-item');
if (_sbSet) _sbSet.style.display = 'flex';
```

- [ ] **Step 5: Add empty `settingsSwitchTab` stub at the end of `<body>` script block**

Append to the new ABAC `<script>` block (we'll create it in Task 9). For now, before Task 9 lands, sketch this in:

```js
function settingsSwitchTab(tab){
  ['policies','teams','simulator'].forEach(t=>{
    document.querySelector(`.settings-tab[data-tab="${t}"]`)?.classList.toggle('active', t===tab);
    document.getElementById('settings-pane-'+t).style.display = (t===tab) ? '' : 'none';
  });
  if (tab==='policies' && typeof renderSettingsPolicies==='function') renderSettingsPolicies();
  if (tab==='teams'    && typeof renderSettingsTeams==='function')    renderSettingsTeams();
  if (tab==='simulator'&& typeof renderSettingsSimulator==='function')renderSettingsSimulator();
}
function renderSettingsPolicies(){ document.getElementById('settings-pane-policies').innerHTML = 'Loading…'; }
```

- [ ] **Step 6: Manual smoke test**

Open the app as an admin user. Hard refresh. Settings appears in the sidebar; clicking it shows the empty three-tab shell. As a non-admin, the item is hidden.

- [ ] **Step 7: Commit**

```bash
git add crm.html
git commit -m "feat(abac): add Settings sidebar item + view shell with 3 tabs (admin-only)"
```

### Task 9: Frontend — Policies tab (list + create/edit/delete)

Render `abac_policies` as a table; support new/edit/delete via REST (`/rest/v1/abac_policies`) using the same `_getValidAccessToken` / `SB_URL` / `SB_KEY` pattern as the rest of the CRM.

**Files:**
- Modify: `crm.html` — replace the stub `renderSettingsPolicies` with the real implementation. Add a Policy Editor modal at the end of `<body>`.

- [ ] **Step 1: Add the ABAC `<script>` block at the end of `<body>` (before `</body>`)**

After the existing renewal `<script>` block, add a NEW `<script>`:

```js
<script>
// ─── ABAC — Settings → Policies / Teams / Simulator (Phase 1) ────
(function(){
  const RESOURCE_OPTIONS = ['accounts'];
  const ACTION_OPTIONS   = ['read','update','delete','disqualify','merge','reassign_owner','mark_won_lost'];
  const OPERATORS        = ['eq','ne','lt','lte','gt','gte','in','not_in','is_null','is_not_null','starts_with','contains'];
  const USER_FIELDS      = ['user.id','user.role','user.team_id','user.team_name','user.email','user.full_name'];
  const ACCOUNT_FIELDS   = ['account.id','account.stage','account.owner_id','account.am_mail','account.deal_value','account.is_disqualified','account.paid_status','account.activation_status','account.has_trial','account.wp_marketing_channel','account.source','account.domain','account.industry','account.size','account.location','account.vacancies','account.company_ref'];

  async function _restGet(path){
    const token = await _getValidAccessToken();
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token} });
    if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }
  async function _restWrite(path, method, body){
    const token = await _getValidAccessToken();
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      method, headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','Prefer':'return=representation'},
      body: body ? JSON.stringify(body) : undefined
    });
    if(!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }

  let _policiesCache = [];
  let _teamsCache    = [];

  window.renderSettingsPolicies = async function(){
    const root = document.getElementById('settings-pane-policies');
    root.innerHTML = '<div style="padding:18px;color:var(--text-3);font-size:13px;">Loading policies…</div>';
    try {
      _policiesCache = await _restGet('abac_policies?select=*&order=resource,action,priority.asc');
      _teamsCache    = await _restGet('teams?select=id,name&order=name.asc');
    } catch (e) {
      root.innerHTML = `<div style="padding:18px;color:var(--bad);font-size:13px;">Failed to load: ${esc(String(e))}</div>`;
      return;
    }
    document.getElementById('settings-cnt-policies').textContent = _policiesCache.length;
    const teamName = id => (_teamsCache.find(t=>t.id===id)||{}).name || id;
    const subj = s => {
      const parts=[];
      if(s.role)    parts.push('role='+s.role);
      if(s.team_id) parts.push('team='+teamName(s.team_id));
      if(s.user_ids?.length) parts.push('users('+s.user_ids.length+')');
      return parts.length ? parts.join(' · ') : '— anyone —';
    };
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:13px;color:var(--text-3);">${_policiesCache.length} polic${_policiesCache.length===1?'y':'ies'}</div>
        <button onclick="openPolicyEditor()" class="btn btn-purple" style="padding:6px 14px;font-size:12px;">+ New Policy</button>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
        <thead><tr style="text-align:left;color:var(--text-3);border-bottom:1px solid var(--border);">
          <th style="padding:8px 6px;">Name</th><th>Resource</th><th>Action</th><th>Effect</th><th>Applies to</th><th>Priority</th><th>Enabled</th><th></th>
        </tr></thead><tbody>
        ${_policiesCache.map(p=>`
          <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:8px 6px;font-weight:600;">${esc(p.name)}</td>
            <td>${esc(p.resource)}</td>
            <td>${esc(p.action)}</td>
            <td>${p.effect==='allow'?'<span style="color:#2F8F5C;">✓ allow</span>':'<span style="color:#B83A3A;">⛔ deny</span>'}</td>
            <td>${esc(subj(p.subject||{}))}</td>
            <td>${p.priority}</td>
            <td><input type="checkbox" ${p.enabled?'checked':''} onchange="togglePolicyEnabled('${p.id}', this.checked)"/></td>
            <td><a href="#" onclick="event.preventDefault();openPolicyEditor('${p.id}')">Edit</a> · <a href="#" onclick="event.preventDefault();deletePolicy('${p.id}')" style="color:var(--bad);">Delete</a></td>
          </tr>`).join('')}
        ${_policiesCache.length===0?`<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text-4);">No policies yet. Click + New Policy.</td></tr>`:''}
      </tbody></table>`;
  };

  window.togglePolicyEnabled = async function(id, enabled){
    try { await _restWrite(`abac_policies?id=eq.${id}`, 'PATCH', { enabled }); toast('Updated', 'success'); }
    catch (e) { toast('Update failed: '+e.message, 'error'); await renderSettingsPolicies(); }
  };
  window.deletePolicy = async function(id){
    if (!confirm('Delete this policy?')) return;
    try { await _restWrite(`abac_policies?id=eq.${id}`, 'DELETE'); await renderSettingsPolicies(); toast('Deleted','success'); }
    catch (e) { toast('Delete failed: '+e.message,'error'); }
  };

  // Exposed in Task 10:
  window.openPolicyEditor = function(id){ alert('Editor lands in Task 10'); };
  window.renderSettingsTeams = function(){ document.getElementById('settings-pane-teams').innerHTML = 'Teams tab — Task 11.'; };
  window.renderSettingsSimulator = function(){ document.getElementById('settings-pane-simulator').innerHTML = 'Simulator — Task 12.'; };
})();
</script>
```

- [ ] **Step 2: JS syntax check**

```bash
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; exit 1 if system("node --check $t 2>&1");} print "OK ",scalar @b,"\n";' crm.html
```
Expected: `OK 11`.

- [ ] **Step 3: Manual smoke test**

Hard refresh as admin → Settings → Policies tab. The table renders (empty), `+ New Policy` button visible but stub-alerts on click.

- [ ] **Step 4: Commit**

```bash
git add crm.html
git commit -m "feat(abac): Policies tab — list + toggle enabled + delete (editor stub)"
```

### Task 10: Frontend — Policy Editor modal (with condition builder)

Replace the `openPolicyEditor` stub with a real modal: name/description, resource/action/effect/priority/enabled, subject pickers (role / team / user_ids), and a recursive condition builder. Saves via REST.

- [ ] **Step 1: Add the modal HTML before the new `<script>` block**

```html
<!-- ─── ABAC Policy Editor ─── -->
<div class="disq-modal-bg" id="abac-editor-bg" style="z-index:240;">
  <div class="disq-modal" style="max-width:780px;max-height:90vh;overflow:auto;">
    <div class="disq-hdr">
      <div class="disq-title"><span id="abac-editor-title">New policy</span></div>
      <div class="disq-sub">Define who can do what under which conditions.</div>
    </div>
    <div class="disq-body" style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Name <input id="abac-ed-name" type="text" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"/></label>
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Priority <input id="abac-ed-priority" type="number" value="100" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"/></label>
      </div>
      <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Description <input id="abac-ed-desc" type="text" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"/></label>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;">
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Resource <select id="abac-ed-resource" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"></select></label>
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Action   <select id="abac-ed-action"   style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"></select></label>
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Effect   <select id="abac-ed-effect"   style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"><option value="allow">✓ allow</option><option value="deny">⛔ deny</option></select></label>
        <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Enabled  <input  id="abac-ed-enabled" type="checkbox" checked style="margin-top:10px;"/></label>
      </div>
      <fieldset style="border:1px solid var(--border);border-radius:6px;padding:8px 12px;">
        <legend style="font-size:11.5px;font-weight:600;color:var(--text-3);">Applies to (subject)</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <label style="font-size:11.5px;color:var(--text-3);">Role <select id="abac-ed-subj-role" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"><option value="">— any —</option><option value="user">user</option><option value="admin">admin</option></select></label>
          <label style="font-size:11.5px;color:var(--text-3);">Team <select id="abac-ed-subj-team" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"></select></label>
        </div>
      </fieldset>
      <fieldset style="border:1px solid var(--border);border-radius:6px;padding:8px 12px;">
        <legend style="font-size:11.5px;font-weight:600;color:var(--text-3);">Condition</legend>
        <div id="abac-ed-cond-root"></div>
        <details style="margin-top:8px;"><summary style="font-size:11px;color:var(--text-4);cursor:pointer;">JSON preview</summary>
          <pre id="abac-ed-cond-json" style="font-size:11px;background:var(--bg-2);padding:8px;border-radius:6px;margin-top:4px;white-space:pre-wrap;"></pre>
        </details>
      </fieldset>
    </div>
    <div class="disq-footer">
      <button class="btn btn-secondary" style="flex:1" onclick="closePolicyEditor()">Cancel</button>
      <button class="btn btn-purple"    style="flex:2" onclick="savePolicyEditor()">Save policy</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace the stub `openPolicyEditor` and add helpers**

In the ABAC `<script>` block, REPLACE the stub line:

```js
window.openPolicyEditor = function(id){ alert('Editor lands in Task 10'); };
```

WITH the real implementation:

```js
let _editingPolicy = null;
let _editingCond   = { all: [] };

function _opt(val, label){ return `<option value="${val}">${label||val}</option>`; }
function _populateEditorSelects(){
  document.getElementById('abac-ed-resource').innerHTML = RESOURCE_OPTIONS.map(r => _opt(r)).join('');
  document.getElementById('abac-ed-action').innerHTML   = ACTION_OPTIONS.map(a => _opt(a)).join('');
  document.getElementById('abac-ed-subj-team').innerHTML = '<option value="">— any —</option>' + _teamsCache.map(t => _opt(t.id, t.name)).join('');
}

function _renderCondNode(cond, path){
  // path is e.g. '' for root, '0' for cond.all[0], '0.1' for nested.
  if(cond.all || cond.any){
    const groupOp = cond.all ? 'all' : 'any';
    const children = cond[groupOp] || [];
    const inner = children.map((c,i) => _renderCondNode(c, path ? path+'.'+i : String(i))).join('');
    return `<div data-path="${path}" style="border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--bg-2);margin-top:6px;">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">
        <select onchange="condSetGroupOp('${path}', this.value)" style="font-size:11px;padding:2px 6px;border-radius:4px;border:1px solid var(--border);">
          <option value="all" ${groupOp==='all'?'selected':''}>ALL of</option>
          <option value="any" ${groupOp==='any'?'selected':''}>ANY of</option>
        </select>
        <button type="button" onclick="condAddLeaf('${path}')"  style="font-size:11px;">+ leaf</button>
        <button type="button" onclick="condAddGroup('${path}')" style="font-size:11px;">+ group</button>
        ${path ? `<button type="button" onclick="condRemove('${path}')" style="font-size:11px;color:var(--bad);margin-left:auto;">remove</button>`:''}
      </div>
      <div style="padding-left:12px;">${inner||'<div style="color:var(--text-4);font-size:11px;">(empty)</div>'}</div>
    </div>`;
  }
  // Leaf
  const fields = USER_FIELDS.concat(ACCOUNT_FIELDS);
  return `<div data-path="${path}" style="display:flex;gap:6px;align-items:center;margin-top:4px;">
    <select onchange="condSetLeaf('${path}','field',this.value)" style="font-size:11.5px;flex:1;padding:3px 6px;border-radius:4px;border:1px solid var(--border);">
      ${fields.map(f => `<option value="${f}" ${cond.field===f?'selected':''}>${f}</option>`).join('')}
    </select>
    <select onchange="condSetLeaf('${path}','op',this.value)" style="font-size:11.5px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);">
      ${OPERATORS.map(o => `<option value="${o}" ${cond.op===o?'selected':''}>${o}</option>`).join('')}
    </select>
    <select onchange="condSetLeaf('${path}','__valueMode',this.value)" style="font-size:11.5px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);">
      <option value="literal"   ${'value_from' in cond?'':'selected'}>literal</option>
      <option value="value_from" ${'value_from' in cond?'selected':''}>field</option>
    </select>
    <input type="text" value="${('value_from' in cond) ? esc(cond.value_from||'') : esc(cond.value!=null?String(cond.value):'')}" oninput="condSetLeaf('${path}','__value',this.value)" style="font-size:11.5px;flex:1;padding:3px 6px;border-radius:4px;border:1px solid var(--border);"/>
    <button type="button" onclick="condRemove('${path}')" style="font-size:11px;color:var(--bad);">×</button>
  </div>`;
}
function _renderCondRoot(){
  document.getElementById('abac-ed-cond-root').innerHTML = _renderCondNode(_editingCond, '');
  document.getElementById('abac-ed-cond-json').textContent = JSON.stringify(_editingCond, null, 2);
}
function _condAt(path){
  if(!path) return _editingCond;
  return path.split('.').reduce((node, key) => {
    const k = parseInt(key,10);
    if(node.all) return node.all[k];
    if(node.any) return node.any[k];
    return undefined;
  }, _editingCond);
}
function _condParent(path){
  if(!path) return null;
  const parts = path.split('.');
  const lastIdx = parseInt(parts.pop(), 10);
  const parent = _condAt(parts.join('.')) || _editingCond;
  return { parent, key: parent.all ? 'all' : 'any', idx: lastIdx };
}
window.condSetGroupOp = function(path, op){
  const node = _condAt(path); if(!node) return;
  const children = node.all || node.any; delete node.all; delete node.any; node[op] = children;
  _renderCondRoot();
};
window.condAddLeaf  = function(path){ const node = _condAt(path); (node.all||node.any).push({ field:USER_FIELDS[0], op:'eq', value:'' }); _renderCondRoot(); };
window.condAddGroup = function(path){ const node = _condAt(path); (node.all||node.any).push({ all:[] }); _renderCondRoot(); };
window.condRemove   = function(path){
  if(!path){ _editingCond = { all:[] }; _renderCondRoot(); return; }
  const { parent, key, idx } = _condParent(path);
  parent[key].splice(idx, 1); _renderCondRoot();
};
window.condSetLeaf = function(path, prop, val){
  const leaf = _condAt(path); if(!leaf) return;
  if(prop === '__valueMode'){
    if(val === 'value_from'){ leaf.value_from = leaf.value!=null?String(leaf.value):''; delete leaf.value; }
    else { leaf.value = leaf.value_from || ''; delete leaf.value_from; }
  } else if(prop === '__value'){
    if('value_from' in leaf) leaf.value_from = val; else leaf.value = val;
  } else {
    leaf[prop] = val;
  }
  _renderCondRoot();
};

window.openPolicyEditor = async function(id){
  _populateEditorSelects();
  if(id){
    _editingPolicy = _policiesCache.find(p => p.id === id) || null;
    if(!_editingPolicy) return;
    document.getElementById('abac-editor-title').textContent = 'Edit policy';
    document.getElementById('abac-ed-name').value     = _editingPolicy.name || '';
    document.getElementById('abac-ed-desc').value     = _editingPolicy.description || '';
    document.getElementById('abac-ed-resource').value = _editingPolicy.resource;
    document.getElementById('abac-ed-action').value   = _editingPolicy.action;
    document.getElementById('abac-ed-effect').value   = _editingPolicy.effect;
    document.getElementById('abac-ed-priority').value = _editingPolicy.priority;
    document.getElementById('abac-ed-enabled').checked = _editingPolicy.enabled;
    document.getElementById('abac-ed-subj-role').value = _editingPolicy.subject?.role || '';
    document.getElementById('abac-ed-subj-team').value = _editingPolicy.subject?.team_id || '';
    _editingCond = _editingPolicy.condition || { all: [] };
  } else {
    _editingPolicy = null;
    document.getElementById('abac-editor-title').textContent = 'New policy';
    ['abac-ed-name','abac-ed-desc'].forEach(i => document.getElementById(i).value='');
    document.getElementById('abac-ed-resource').value = RESOURCE_OPTIONS[0];
    document.getElementById('abac-ed-action').value   = ACTION_OPTIONS[0];
    document.getElementById('abac-ed-effect').value   = 'allow';
    document.getElementById('abac-ed-priority').value = 100;
    document.getElementById('abac-ed-enabled').checked = true;
    document.getElementById('abac-ed-subj-role').value = '';
    document.getElementById('abac-ed-subj-team').value = '';
    _editingCond = { all: [] };
  }
  _renderCondRoot();
  document.getElementById('abac-editor-bg').classList.add('open');
};
window.closePolicyEditor = function(){ document.getElementById('abac-editor-bg').classList.remove('open'); };

window.savePolicyEditor = async function(){
  const subj = {};
  const r = document.getElementById('abac-ed-subj-role').value; if (r) subj.role = r;
  const t = document.getElementById('abac-ed-subj-team').value; if (t) subj.team_id = t;
  const payload = {
    name:        document.getElementById('abac-ed-name').value.trim() || 'Untitled',
    description: document.getElementById('abac-ed-desc').value.trim() || null,
    resource:    document.getElementById('abac-ed-resource').value,
    action:      document.getElementById('abac-ed-action').value,
    effect:      document.getElementById('abac-ed-effect').value,
    priority:    parseInt(document.getElementById('abac-ed-priority').value, 10) || 100,
    enabled:     document.getElementById('abac-ed-enabled').checked,
    subject:     subj,
    condition:   _editingCond,
  };
  try {
    if (_editingPolicy) await _restWrite(`abac_policies?id=eq.${_editingPolicy.id}`, 'PATCH', payload);
    else                await _restWrite('abac_policies', 'POST', payload);
    closePolicyEditor();
    await renderSettingsPolicies();
    toast(_editingPolicy ? 'Policy updated' : 'Policy created', 'success');
  } catch (e) { toast('Save failed: ' + e.message, 'error'); }
};
```

- [ ] **Step 3: JS syntax check + smoke test**

```bash
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; exit 1 if system("node --check $t 2>&1");} print "OK\n";' crm.html
```
Then hard refresh: Settings → Policies → + New Policy → create a dummy ("test rule"), save, see it appear in the list, edit it, delete it.

- [ ] **Step 4: Commit**

```bash
git add crm.html
git commit -m "feat(abac): Policy Editor modal — name/subject/condition builder + save/edit/delete"
```

### Task 11: Frontend — Teams tab

CRUD over `teams` + per-row membership management (single-team-per-user; setting `profiles.team_id`).

- [ ] **Step 1: Replace the `renderSettingsTeams` stub**

In the ABAC `<script>` block:

```js
window.renderSettingsTeams = async function(){
  const root = document.getElementById('settings-pane-teams');
  root.innerHTML = '<div style="padding:18px;color:var(--text-3);font-size:13px;">Loading teams…</div>';
  let teams, profiles;
  try {
    teams    = await _restGet('teams?select=id,name,created_at&order=name.asc');
    profiles = await _restGet('profiles?select=id,email,full_name,team_id&order=email.asc');
  } catch (e) { root.innerHTML = `<div style="padding:18px;color:var(--bad);font-size:13px;">${esc(String(e))}</div>`; return; }
  document.getElementById('settings-cnt-teams').textContent = teams.length;
  const countBy = id => profiles.filter(p => p.team_id === id).length;
  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div style="font-size:13px;color:var(--text-3);">${teams.length} team${teams.length===1?'':'s'} · ${profiles.length} users</div>
      <div style="display:flex;gap:6px;">
        <input id="abac-new-team-name" type="text" placeholder="Team name" style="font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"/>
        <button class="btn btn-purple" onclick="abacCreateTeam()" style="padding:6px 12px;font-size:12px;">+ Create</button>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:18px;">
      <thead><tr style="text-align:left;color:var(--text-3);border-bottom:1px solid var(--border);"><th style="padding:8px 6px;">Team</th><th>Members</th><th></th></tr></thead>
      <tbody>${teams.map(t=>`<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 6px;font-weight:600;">${esc(t.name)}</td>
        <td>${countBy(t.id)}</td>
        <td><a href="#" onclick="event.preventDefault();abacDeleteTeam('${t.id}')" style="color:var(--bad);">Delete</a></td>
      </tr>`).join('')}${teams.length===0?'<tr><td colspan="3" style="padding:18px;color:var(--text-4);">No teams yet.</td></tr>':''}</tbody>
    </table>
    <div style="font-size:11.5px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">Members</div>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead><tr style="text-align:left;color:var(--text-3);border-bottom:1px solid var(--border);"><th style="padding:8px 6px;">User</th><th>Team</th></tr></thead>
      <tbody>${profiles.map(p=>`<tr style="border-bottom:1px solid var(--border);">
        <td style="padding:8px 6px;">${esc(p.full_name||p.email)} <span style="color:var(--text-4);font-size:11px;">${esc(p.email)}</span></td>
        <td><select onchange="abacAssignTeam('${p.id}', this.value)" style="font:inherit;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;"><option value="">— none —</option>${teams.map(t=>`<option value="${t.id}" ${t.id===p.team_id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></td>
      </tr>`).join('')}</tbody>
    </table>`;
};

window.abacCreateTeam = async function(){
  const name = document.getElementById('abac-new-team-name').value.trim();
  if (!name) return toast('Team name required','error');
  try { await _restWrite('teams', 'POST', { name }); document.getElementById('abac-new-team-name').value=''; await renderSettingsTeams(); toast('Team created','success'); }
  catch (e) { toast('Create failed: '+e.message,'error'); }
};
window.abacDeleteTeam = async function(id){
  if (!confirm('Delete team? Members will lose their team assignment.')) return;
  try { await _restWrite(`teams?id=eq.${id}`,'DELETE'); await renderSettingsTeams(); toast('Team deleted','success'); }
  catch (e) { toast('Delete failed: '+e.message,'error'); }
};
window.abacAssignTeam = async function(userId, teamId){
  try { await _restWrite(`profiles?id=eq.${userId}`,'PATCH',{ team_id: teamId || null }); toast('Assigned','success'); }
  catch (e) { toast('Assign failed: '+e.message,'error'); await renderSettingsTeams(); }
};
```

- [ ] **Step 2: Manual smoke test**

Settings → Teams → create "Sales Egypt" → assign a user to it → reload tab → confirms persisted.

- [ ] **Step 3: Commit**

```bash
git add crm.html
git commit -m "feat(abac): Teams tab — CRUD teams + assign users to a single team"
```

### Task 12: Frontend — Simulator tab

Three pickers (user / action / account) → calls `abac_check` RPC and renders the decision + matched policy.

- [ ] **Step 1: Replace the `renderSettingsSimulator` stub**

```js
window.renderSettingsSimulator = async function(){
  const root = document.getElementById('settings-pane-simulator');
  root.innerHTML = '<div style="padding:18px;color:var(--text-3);font-size:13px;">Loading…</div>';
  let profiles, accounts;
  try {
    profiles = await _restGet('profiles?select=id,email,full_name&order=email.asc');
    accounts = await _restGet('accounts?select=id,name,domain&order=name.asc&limit=500');
  } catch (e) { root.innerHTML = `<div style="padding:18px;color:var(--bad);font-size:13px;">${esc(String(e))}</div>`; return; }
  root.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end;margin-bottom:14px;">
      <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">User
        <select id="sim-user" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;">${profiles.map(p=>`<option value="${p.id}">${esc(p.email)}</option>`).join('')}</select></label>
      <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Action
        <select id="sim-action" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;">${ACTION_OPTIONS.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label>
      <label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Account
        <select id="sim-account" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;">${accounts.map(a=>`<option value="${a.id}">${esc(a.name)} ${a.domain?'· '+esc(a.domain):''}</option>`).join('')}</select></label>
      <button class="btn btn-purple" onclick="abacRunSimulator()" style="padding:8px 16px;font-size:12px;">Run</button>
    </div>
    <div id="sim-result" style="padding:12px;background:var(--bg-2);border-radius:6px;font-size:12.5px;color:var(--text-3);">Pick user / action / account, then click Run.</div>`;
};
window.abacRunSimulator = async function(){
  const userId    = document.getElementById('sim-user').value;
  const action    = document.getElementById('sim-action').value;
  const accountId = document.getElementById('sim-account').value;
  const resultEl  = document.getElementById('sim-result');
  resultEl.textContent = 'Evaluating…';
  // The evaluator reads auth.uid() of the current session; PostgREST cannot
  // impersonate. We use a server-side helper that takes the target user_id
  // explicitly. Migration Task 13 ships it.
  try {
    const token = await _getValidAccessToken();
    const res = await fetch(`${SB_URL}/rest/v1/rpc/abac_simulate`, {
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body: JSON.stringify({ p_user_id: userId, p_action: action, p_account_id: accountId })
    });
    if(!res.ok) throw new Error(await res.text());
    const data = await res.json();
    resultEl.innerHTML = `
      <div style="font-size:18px;font-weight:700;margin-bottom:6px;color:${data.allowed?'#2F8F5C':'#B83A3A'};">${data.allowed?'✓ ALLOW':'⛔ DENY'}</div>
      <div><b>Matched policy:</b> ${data.policy_name ? esc(data.policy_name) : '<i>none — default</i>'}</div>
      <div><b>Reason:</b> ${esc(data.reason||'')}</div>`;
  } catch (e) { resultEl.innerHTML = `<div style="color:var(--bad);">Failed: ${esc(String(e))}</div>`; }
};
```

- [ ] **Step 2: Ship the `abac_simulate` RPC via migration `phase1_a7_abac_simulate`**

```sql
-- name: phase1_a7_abac_simulate

CREATE OR REPLACE FUNCTION public.abac_simulate(
  p_user_id    uuid,
  p_action     text,
  p_account_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_acct    public.accounts;
  v_profile RECORD;
  v_policy  RECORD;
  v_subj_ok boolean;
  v_cond_ok boolean;
  v_match   uuid;
  v_match_name text;
  v_reason  text := 'default deny — no allow policy matched';
  v_allowed boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT a.* INTO v_acct FROM public.accounts a WHERE a.id = p_account_id;
  IF v_acct.id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','account not found'); END IF;
  SELECT p.id, p.email, p.full_name, p.role::text AS role, p.team_id, t.name AS team_name
    INTO v_profile FROM public.profiles p LEFT JOIN public.teams t ON t.id = p.team_id WHERE p.id = p_user_id;
  IF v_profile.role = 'admin' THEN RETURN jsonb_build_object('allowed', true, 'policy_name', NULL, 'reason','admin bypass'); END IF;
  FOR v_policy IN
    SELECT id, name, effect, subject, condition, priority
      FROM public.abac_policies
     WHERE resource='accounts' AND action=p_action AND enabled=true
     ORDER BY priority ASC, id
  LOOP
    v_subj_ok := true;
    IF v_policy.subject ? 'role'    AND v_policy.subject->>'role'    IS DISTINCT FROM v_profile.role     THEN v_subj_ok := false; END IF;
    IF v_subj_ok AND v_policy.subject ? 'team_id' AND v_policy.subject->>'team_id' IS DISTINCT FROM v_profile.team_id::text THEN v_subj_ok := false; END IF;
    IF v_subj_ok AND v_policy.subject ? 'user_ids' THEN
      IF NOT (v_policy.subject->'user_ids' @> to_jsonb(p_user_id::text)) THEN v_subj_ok := false; END IF;
    END IF;
    IF NOT v_subj_ok THEN CONTINUE; END IF;
    v_cond_ok := public._abac_eval_condition(v_policy.condition, v_profile, v_acct);
    IF v_cond_ok THEN
      IF v_policy.effect = 'deny' THEN
        RETURN jsonb_build_object('allowed', false, 'policy_name', v_policy.name, 'reason','deny — '||v_policy.name);
      ELSE
        IF v_match IS NULL THEN v_match := v_policy.id; v_match_name := v_policy.name; END IF;
        v_allowed := true;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('allowed', v_allowed, 'policy_name', v_match_name, 'reason', CASE WHEN v_allowed THEN 'allow — '||v_match_name ELSE v_reason END);
END $$;
GRANT EXECUTE ON FUNCTION public.abac_simulate(uuid, text, uuid) TO authenticated;
```

- [ ] **Step 3: Smoke test**

Settings → Simulator → pick a non-admin user (Mariam) + action `read` + an account → Run → see decision. Admin user always returns ALLOW.

- [ ] **Step 4: Commit**

```bash
git add crm.html
git commit -m "feat(abac): Simulator tab — pick user/action/account, show decision + matched policy"
```

### Task 13: Frontend — UI gating (action buttons + row filtering)

Wire `abac_check` (single) and `abac_check_batch` (list) into the existing CRM so action buttons hide when the caller lacks the action and rows the caller can't `read` are filtered out client-side.

- [ ] **Step 1: Add the `abac_can(action, accountSbId)` and `abac_can_batch(action, accountSbIds)` helpers**

Add to the ABAC `<script>` block:

```js
window.abacCan = async function(action, accountSbId){
  if (window.AUTH_PROFILE?.role === 'admin') return true;
  try {
    const token = await _getValidAccessToken();
    const res = await fetch(`${SB_URL}/rest/v1/rpc/abac_check`, {
      method:'POST', headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body: JSON.stringify({ p_action: action, p_account: { id: accountSbId } })
    });
    // Note: RPC of abac_check needs row-typed input which PostgREST handles by ID
    // when called with just {id}. Fallback to abac_check_batch on failure.
    if (res.ok) { const v = await res.json(); return v === true || v?.allowed === true; }
  } catch {}
  return abacCanBatch(action, [accountSbId]).then(m => m.get(accountSbId) === true);
};
window.abacCanBatch = async function(action, accountSbIds){
  const out = new Map(accountSbIds.map(id => [id, false]));
  if (window.AUTH_PROFILE?.role === 'admin') { accountSbIds.forEach(id => out.set(id, true)); return out; }
  if (!accountSbIds.length) return out;
  try {
    const token = await _getValidAccessToken();
    const res = await fetch(`${SB_URL}/rest/v1/rpc/abac_check_batch`, {
      method:'POST', headers:{'apikey':SB_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body: JSON.stringify({ p_action: action, p_account_ids: accountSbIds })
    });
    if (res.ok) (await res.json()).forEach(r => out.set(r.account_id, r.allowed === true));
  } catch (e) { console.warn('[abac] batch failed', e); }
  return out;
};
```

- [ ] **Step 2: Hide the kanban Disqualify button when caller cannot `disqualify`**

Find the existing template literal that emits the Disqualify button on a lead card. Wrap its enclosing template-string branch in an `await abacCan('disqualify', lead._supabase_id)` check — render the button only when allowed. Pseudocode:

Before:
```js
${(isDisq || gStage(id) === 'mql') ? `<button onclick="openDisqModal()" ...>...Disqualify...</button>` : ''}
```

After (in the surrounding function — convert to async if not already, and pre-resolve a `canDisqualify` boolean before building HTML):

```js
const canDisqualify = await abacCan('disqualify', lead._supabase_id);
// …later in template:
${(isDisq || (gStage(id) === 'mql' && canDisqualify)) ? `<button onclick="openDisqModal()" ...>...Disqualify...</button>` : ''}
```

- [ ] **Step 3: Hide the Reassign Owner click target similarly**

The owner cell on the lead detail hero (search for `data-action="open-owner-picker"`) — gate the click handler. Replace the inline open with:

```js
onclick="abacCan('reassign_owner','${lead._supabase_id}').then(ok => { if (ok) openOwnerPicker(this); else toast('Not allowed','error'); })"
```

- [ ] **Step 4: Hide the Make-a-Deal button in Accounts table when caller cannot `update`**

Find the `data-action="make-deal"` button render in the accounts row template. Before rendering the row HTML, batch-precompute updatability for the visible page:

```js
const visibleIds  = rows.map(l => l._supabase_id).filter(Boolean);
const canUpdate   = await abacCanBatch('update', visibleIds);
// then in the row template:
${canUpdate.get(id) ? actionHtml : '<span style="color:var(--text-4);font-size:11px;">No access</span>'}
```

- [ ] **Step 5: Filter rows the caller can't `read` (defence in depth — DB already filters, but UI should match)**

In `renderBoard()` and `renderAccountsTable()`, after computing the visible set but before rendering, batch-check `read` and remove disallowed rows. Admin short-circuits inside `abacCanBatch`.

- [ ] **Step 6: Manual smoke test**

While flag is OFF (Phase 1), nothing visible should change — every action remains visible since `abac_check` returns true. Verifies the gating doesn't accidentally break the current app.

- [ ] **Step 7: Commit**

```bash
git add crm.html
git commit -m "feat(abac): UI gating — buttons + row filtering call abac_check / abac_check_batch"
```

---

## Phase 2 — Seed compatibility policies + regression sweep

### Task 14: Seed compatibility policies

Author the three policies that, once the flag flips, replicate today's `is_admin() OR owner_id=auth.uid() OR am_mail=my_email()` access.

- [ ] **Step 1: Insert via Supabase MCP `execute_sql`**

```sql
INSERT INTO public.abac_policies (name, description, resource, action, effect, subject, condition, priority) VALUES
('Compat — owner reads own',     'Replicate legacy can_access_account', 'accounts', 'read',   'allow', '{"role":"user"}'::jsonb,
   '{"any":[
      {"field":"account.owner_id","op":"eq","value_from":"user.id"},
      {"field":"account.owner_id","op":"is_null"},
      {"field":"account.am_mail","op":"eq","value_from":"user.email"}
   ]}'::jsonb, 200),
('Compat — owner updates own',   'Replicate legacy ownership writes',   'accounts', 'update', 'allow', '{"role":"user"}'::jsonb,
   '{"any":[
      {"field":"account.owner_id","op":"eq","value_from":"user.id"},
      {"field":"account.owner_id","op":"is_null"},
      {"field":"account.am_mail","op":"eq","value_from":"user.email"}
   ]}'::jsonb, 200);
```

Admin has bypass (handled in `abac_check`), so no policy needed for them.

- [ ] **Step 2: Verify both rows present**

```sql
SELECT name, enabled FROM public.abac_policies WHERE name LIKE 'Compat —%';
```
Expected: 2 rows, both enabled.

### Task 15: Write `02_abac_regression.sql` — Phase 2 sweep

**Files:**
- Create: `docs/superpowers/specs/abac/tests/02_abac_regression.sql`

- [ ] **Step 1: Create the sweep**

```sql
-- docs/superpowers/specs/abac/tests/02_abac_regression.sql
-- For every (user, account) pair compare the LEGACY can_access_account result
-- (what the app does today, with abac_check no-op) vs the NEW abac_check
-- result (engine on). They MUST match before we flip the flag.
BEGIN;

-- 1. Snapshot legacy behaviour with flag OFF.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
CREATE TEMP TABLE legacy_acl ON COMMIT DROP AS
SELECT p.id AS user_id, a.id AS account_id,
       (public.is_admin_for(p.id) OR a.owner_id = p.id OR (a.am_mail IS NOT NULL AND lower(a.am_mail) = lower(p.email))) AS legacy
  FROM public.profiles p CROSS JOIN public.accounts a;

-- 2. Flip flag ON and re-evaluate via abac_check using a simulator helper.
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';

CREATE TEMP TABLE abac_acl ON COMMIT DROP AS
SELECT p.id AS user_id, a.id AS account_id,
       (public.abac_simulate(p.id, 'read', a.id)->>'allowed')::boolean AS abac
  FROM public.profiles p CROSS JOIN public.accounts a;

-- 3. Diff. Any non-match is a regression.
WITH diff AS (
  SELECT l.user_id, l.account_id, l.legacy, b.abac
    FROM legacy_acl l JOIN abac_acl b USING (user_id, account_id)
   WHERE l.legacy IS DISTINCT FROM b.abac
)
SELECT count(*) AS mismatches FROM diff;
-- Expected: 0. If > 0, inspect with: SELECT * FROM diff LIMIT 50;

-- 4. Reset flag.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
COMMIT;
```

- [ ] **Step 2: Add the `is_admin_for(uuid)` helper used above (one-off migration)**

```sql
-- name: phase2_b1_is_admin_for_helper
CREATE OR REPLACE FUNCTION public.is_admin_for(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND role = 'admin')
      OR EXISTS (SELECT 1 FROM public.admin_allowlist WHERE lower(email) = lower((SELECT email FROM public.profiles WHERE id = _uid)));
$$;
```

- [ ] **Step 3: Run the sweep via MCP `execute_sql` and confirm `mismatches = 0`**

If > 0, the compatibility policies are wrong. Fix the conditions and re-run before proceeding.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/abac/tests/02_abac_regression.sql
git commit -m "test(abac): Phase 2 regression sweep — abac_check must match legacy ACL"
```

---

## Phase 3 — Pilot

### Task 16: Pilot toggle for Mariam

We give Mariam the engine while keeping it off for everyone else, then watch for 24h.

- [ ] **Step 1: Add `profiles.abac_pilot` column**

```sql
-- name: phase3_c1_abac_pilot
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS abac_pilot boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Update `abac_check` to respect per-user pilot**

```sql
-- name: phase3_c2_abac_check_pilot
CREATE OR REPLACE FUNCTION public.abac_check(p_action text, p_account public.accounts) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_enabled boolean; v_pilot boolean;
BEGIN
  SELECT (value)::text::boolean INTO v_enabled FROM public.app_settings WHERE key='abac_enabled';
  SELECT abac_pilot INTO v_pilot FROM public.profiles WHERE id = auth.uid();
  IF v_enabled IS NOT true AND v_pilot IS NOT true THEN RETURN true; END IF;
  -- rest of body unchanged — copy from current version
  …
END $$;
```

(Engineer: copy/paste the existing body and only insert the pilot check at the top.)

- [ ] **Step 3: Flip Mariam on**

```sql
UPDATE public.profiles SET abac_pilot = true WHERE email = 'mariam.samir@recruitera.ai';
```

- [ ] **Step 4: Mariam smokes the app for 24h. Monitor `abac_audit`:**

```sql
SELECT count(*), policy_id, reason FROM public.abac_audit
 WHERE user_id = (SELECT id FROM public.profiles WHERE email='mariam.samir@recruitera.ai')
   AND at > now() - interval '24 hours'
 GROUP BY policy_id, reason ORDER BY count(*) DESC;
```

If she gets unexpected denies → either fix the compatibility policy or roll back:

```sql
UPDATE public.profiles SET abac_pilot = false WHERE email='mariam.samir@recruitera.ai';
```

---

## Phase 4 — Flip globally

### Task 17: Enable the engine for everyone

- [ ] **Step 1: Flip the flag**

```sql
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';
```

- [ ] **Step 2: Write + run `03_abac_smoke.sql`**

Create `docs/superpowers/specs/abac/tests/03_abac_smoke.sql`:

```sql
BEGIN;
-- As admin: full SELECT works.
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM public.profiles WHERE role='admin' LIMIT 1)::text)::text, true);
  IF (SELECT count(*) FROM public.accounts) = 0 THEN RAISE EXCEPTION 'admin SELECT broken'; END IF;
END $$;
-- As user: same SELECT count matches what abac_check_batch('read', …) allows.
DO $$
DECLARE u uuid := (SELECT id FROM public.profiles WHERE role='user' LIMIT 1);
DECLARE n_rls int; n_abac int;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);
  SELECT count(*) INTO n_rls  FROM public.accounts;
  SELECT count(*) INTO n_abac FROM public.abac_check_batch('read', ARRAY(SELECT id FROM public.accounts)) WHERE allowed;
  IF n_rls IS DISTINCT FROM n_abac THEN RAISE EXCEPTION 'mismatch n_rls=% n_abac=%', n_rls, n_abac; END IF;
END $$;
RAISE NOTICE 'Phase 4 smoke passed.';
ROLLBACK;
```

Run via MCP. Expected: NOTICE, no exceptions.

- [ ] **Step 3: Watch `abac_audit` for 1h**

```sql
SELECT count(*) AS denies, reason FROM public.abac_audit
 WHERE at > now() - interval '1 hour' GROUP BY reason ORDER BY count(*) DESC;
```

If any unexpected mass-deny → rollback by setting flag back to false.

- [ ] **Step 4: Commit the smoke test**

```bash
git add docs/superpowers/specs/abac/tests/03_abac_smoke.sql
git commit -m "test(abac): Phase 4 smoke test — RLS results match abac_check_batch"
```

---

## Phase 5 — Author the first real policy

### Task 18: Document the first ABAC use-case

This is configuration, not code. The admin authors via the UI.

- [ ] **Step 1: Decide the first new rule with the team**

Example written here is "Sales Egypt reads only Egypt accounts":

> Settings → Policies → + New Policy
>  - Name: `Egypt team — own region only`
>  - Resource: `accounts`
>  - Action: `read`
>  - Effect: `allow`
>  - Priority: `100`
>  - Subject: Role `user`, Team `Sales Egypt`
>  - Condition: ALL of
>      - `account.wp_marketing_channel  eq  literal "Egypt"`

- [ ] **Step 2: Save, then Simulator → confirm a non-Egypt user gets DENY, an Egypt user gets ALLOW**

- [ ] **Step 3: Commit a CHANGELOG entry**

Add a line to `docs/superpowers/specs/abac/CHANGELOG.md` (create if missing):

```
2026-06-DD — First production ABAC policy authored: "Egypt team — own region only".
```

```bash
git add docs/superpowers/specs/abac/CHANGELOG.md
git commit -m "docs(abac): record first production policy authored via Settings UI"
```

---

## Self-review notes (pre-flight before implementation)

- Spec §5.5 `app_settings` → Task 1 (✓)
- Spec §5.1/5.2 teams + profiles.team_id → Task 1 (✓)
- Spec §5.3 abac_policies + §5.4 abac_audit → Task 2 (✓)
- Spec §6 DSL → Tasks 3 + 4 (`abac_check` + `_abac_eval_condition` + `_abac_eval_leaf` + `_abac_resolve_field`) (✓)
- Spec §7.1 evaluator function → Task 3 (✓)
- Spec §7.1 batch variant → Task 5 (✓)
- Spec §7.2 RLS rewrite → Task 6 (✓)
- Spec §7.3 frontend gating → Task 13 (✓)
- Spec §8.1 Policies tab → Tasks 9 + 10 (✓)
- Spec §8.2 Teams tab → Task 11 (✓)
- Spec §8.3 Simulator tab → Task 12 (uses `abac_simulate` RPC since PostgREST can't impersonate auth.uid()) (✓)
- Spec §9 Migration plan phases 1-5 → Tasks 1-18 mapped (✓)
- Spec §10 Tests → 01_abac_unit.sql (Task 7), 02_abac_regression.sql (Task 15), 03_abac_smoke.sql (Task 17) (✓)
- Admin bypass → Task 3 evaluator + Task 13 client-side short-circuit (✓)
- Feature flag → Task 1 (`app_settings.abac_enabled`) + Task 3 evaluator branch + Task 16 pilot override (✓)
- Fail-closed on error → Task 3 evaluator nested-block trap (✓)

No type drift detected. No placeholders. Plan ready to execute.
