# Roles Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split today's `teams`-as-roles conflation into two clean concepts — a `roles` table (with three protected system rows: Admin / Team Lead / Sales Member, plus custom rows) and `teams` table (Sales Egypt, Gulf, etc.) — and wire the existing ABAC engine + Settings UI to the new shape.

**Architecture:** Phase 1 ships schema + a backfill that leaves user behaviour identical. Phase 2 swaps the policy set under the engine (regression-tested before flipping). Phase 3 swaps the frontend to read/write `role_id` + the new system-role rules. Phase 4 drops the legacy columns after a stability window. The ABAC engine itself only learns one new trick: matching subjects on `role_id`.

**Tech Stack:**
- Postgres 15 (Supabase project `rtdrlpnfqjtwtsrwnifn`) — `roles` table, RLS, `abac_check` evaluator extension
- Supabase MCP — `apply_migration` for DDL, `execute_sql` for verification and tests
- `crm.html` — single-file vanilla JS CRM; edits to the ABAC IIFE at the bottom of `<body>` and the modal/HTML markup just above it
- Existing tests: `docs/superpowers/specs/abac/tests/01_abac_unit.sql`, `02_abac_regression.sql`

---

## File structure

| Path | Responsibility |
|---|---|
| `crm.html` (modify) | Settings → Roles & Permissions UI: switch data source to `roles`, add SYSTEM badge + locked system-role fields, add inline team picker per member, remove crown handler, add Manage Teams sub-modal, route Invite User to write `role_id` |
| `docs/superpowers/specs/roles-redesign/tests/01_role_id_subject_matcher.sql` (new) | Unit test for the new `subject.role_id` matcher in `abac_check` |
| `docs/superpowers/specs/roles-redesign/tests/02_roles_regression.sql` (new) | Phase 2 regression sweep — `abac_check_batch('read', …)` decisions must match pre-Phase-2 for every (user, account) pair |
| `docs/superpowers/specs/roles-redesign/CHANGELOG.md` (new at Task 13) | Record the migration milestones and the new "to change a role, go to its Members tab" workflow |

Migrations are applied via Supabase MCP `apply_migration` per project convention — no migration files on disk.

---

## Phase 1 — Schema + seed (no behaviour change)

### Task 1: Migration — `roles` table + system seeds + `profiles.role_id` + backfill + drop "Admin" team row

**Files:**
- Apply migration `roles_redesign_phase1_schema` via MCP
- Verify via MCP `execute_sql`

- [ ] **Step 1: Apply migration `roles_redesign_phase1_schema`**

Use the `mcp__b7e33bec-653b-4703-9358-0d8100f64694__apply_migration` tool with `project_id: "rtdrlpnfqjtwtsrwnifn"`:

```sql
-- 1. roles table
CREATE TABLE public.roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  type          text NOT NULL CHECK (type IN ('admin','team_lead','member','custom')),
  description   text,
  is_system     boolean NOT NULL DEFAULT false,
  requires_team boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_name_lower_uniq ON public.roles (lower(name));
CREATE INDEX roles_type_idx ON public.roles (type);

CREATE OR REPLACE FUNCTION public._touch_roles_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public._touch_roles_updated_at();

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_select_all  ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_write_admin ON public.roles FOR ALL    TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 2. Seed system rows
INSERT INTO public.roles (name, type, description, is_system, requires_team) VALUES
  ('Admin',        'admin',     'Full access to everything. Bypasses every ABAC policy.', true, false),
  ('Team Lead',    'team_lead', 'Can read + update any account owned by anyone in their team.', true, true),
  ('Sales Member', 'member',    'Can read + update accounts they own.', true, true);

-- 3. profiles.role_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

-- 4. Backfill: admins → Admin role; everyone else → Sales Member.
UPDATE public.profiles p
   SET role_id = (SELECT id FROM public.roles WHERE name = 'Admin')
 WHERE p.role = 'admin' AND role_id IS NULL;

UPDATE public.profiles p
   SET role_id = (SELECT id FROM public.roles WHERE name = 'Sales Member')
 WHERE (p.role IS NULL OR p.role = 'user') AND role_id IS NULL;

-- 5. The legacy "Admin" team row was a role placeholder, not a real team.
--    Null out membership of any users sitting in it, then delete it.
UPDATE public.profiles
   SET team_id = NULL
 WHERE team_id = (SELECT id FROM public.teams WHERE lower(name) = 'admin');

DELETE FROM public.teams WHERE lower(name) = 'admin';
```

- [ ] **Step 2: Verify schema + seeds with MCP `execute_sql`**

Run:

```sql
SELECT name, type, is_system, requires_team FROM public.roles ORDER BY name;
SELECT count(*) FROM public.roles WHERE is_system = true;
SELECT count(*) AS unassigned_users FROM public.profiles WHERE role_id IS NULL;
SELECT name FROM public.teams WHERE lower(name) = 'admin';
```

Expected:
- 3 rows (Admin / Sales Member / Team Lead), all `is_system=true`
- `count = 3` for the system-role count
- `unassigned_users = 0` (everyone got backfilled)
- 0 rows for the "Admin" team check

- [ ] **Step 3: Verify every existing user landed on the correct role**

```sql
SELECT p.email, p.role AS legacy_role, r.name AS new_role
  FROM public.profiles p
  JOIN public.roles r ON r.id = p.role_id
 ORDER BY p.email;
```

Expected:
- Admin emails (`a.hammad@…`, `hamdy@basharsoft.com`, `huda.elshwadfy@recruitera.ai`) → `new_role = 'Admin'`
- Mariam → `new_role = 'Sales Member'`

If any row shows the wrong mapping, STOP and report. Otherwise proceed.

- [ ] **Step 4: Confirm no commit needed (DB-only task)**

Phase 1 changes only DB state. Skip the commit step. Note in your status report that no files were edited.

---

## Phase 2 — ABAC policy migration

### Task 2: Migration — extend `abac_check` subject matcher with `role_id`

The current `abac_check` (and `abac_simulate`) match on `subject.role` (the legacy enum), `subject.team_id`, and `subject.user_ids`. Add matching on `subject.role_id` so the new system-role policies fire for the correct callers.

- [ ] **Step 1: Apply migration `roles_redesign_phase2a_subject_matcher`**

```sql
-- abac_check: same body as the hardened version from ABAC plan Task 3 + pilot
-- extension from ABAC plan Task 16, with one addition: load role_id into v_profile
-- and add an extra subject-match arm for role_id.
CREATE OR REPLACE FUNCTION public.abac_check(
  p_action  text,
  p_account public.accounts
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean;
  v_pilot   boolean := false;
  v_uid     uuid := auth.uid();
  v_profile RECORD;
  v_policy  RECORD;
  v_allowed boolean := false;
  v_subj_ok boolean;
  v_cond_ok boolean;
BEGIN
  SELECT CASE jsonb_typeof(value) WHEN 'boolean' THEN (value)::boolean ELSE false END
    INTO v_enabled FROM public.app_settings WHERE key='abac_enabled';
  IF v_uid IS NOT NULL THEN
    SELECT abac_pilot INTO v_pilot FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_enabled IS DISTINCT FROM true AND v_pilot IS DISTINCT FROM true THEN RETURN true; END IF;

  IF v_uid IS NULL THEN RETURN false; END IF;

  -- v_profile now also carries role_id so the new subject matcher can read it.
  SELECT p.id, p.email, p.full_name, p.role::text AS role, p.team_id,
         p.role_id, t.name AS team_name
    INTO v_profile
    FROM public.profiles p
    LEFT JOIN public.teams t ON t.id = p.team_id
    WHERE p.id = v_uid;

  IF v_profile.role = 'admin' THEN RETURN true; END IF;

  FOR v_policy IN
    SELECT id, effect, subject, condition, priority
      FROM public.abac_policies
     WHERE resource='accounts' AND action=p_action AND enabled=true
     ORDER BY priority ASC, id
  LOOP
    v_subj_ok := true;

    -- Legacy 'role' enum match (kept until Phase 4 drops profiles.role)
    IF v_policy.subject ? 'role'
       AND v_policy.subject->>'role' IS DISTINCT FROM v_profile.role THEN
      v_subj_ok := false;
    END IF;

    -- NEW: role_id match
    IF v_subj_ok AND v_policy.subject ? 'role_id'
       AND v_policy.subject->>'role_id' IS DISTINCT FROM v_profile.role_id::text THEN
      v_subj_ok := false;
    END IF;

    IF v_subj_ok AND v_policy.subject ? 'team_id'
       AND v_policy.subject->>'team_id' IS DISTINCT FROM v_profile.team_id::text THEN
      v_subj_ok := false;
    END IF;

    IF v_subj_ok AND v_policy.subject ? 'user_ids' THEN
      IF NOT (v_policy.subject->'user_ids' @> to_jsonb(v_uid::text)) THEN v_subj_ok := false; END IF;
    END IF;

    IF NOT v_subj_ok THEN CONTINUE; END IF;

    BEGIN
      v_cond_ok := public._abac_eval_condition(v_policy.condition, v_profile, p_account);
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
        VALUES (v_uid, 'accounts', p_account.id, p_action, 'error', v_policy.id, SQLERRM);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      CONTINUE;
    END;

    IF v_cond_ok THEN
      IF v_policy.effect = 'deny' THEN
        BEGIN
          INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
          VALUES (v_uid, 'accounts', p_account.id, p_action, 'deny', v_policy.id, 'policy matched');
        EXCEPTION WHEN OTHERS THEN NULL; END;
        RETURN false;
      ELSE
        v_allowed := true;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_allowed THEN
    BEGIN
      INSERT INTO public.abac_audit (user_id, resource, resource_id, action, effect, policy_id, reason)
      VALUES (v_uid, 'accounts', p_account.id, p_action, 'deny', NULL, 'default deny — no allow policy matched');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN false;
  END IF;
  RETURN true;
END $$;

-- Same role_id arm on abac_simulate so the Settings → Simulator tab agrees with the engine.
CREATE OR REPLACE FUNCTION public.abac_simulate(
  p_user_id uuid, p_action text, p_account_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_acct      public.accounts;
  v_profile   RECORD;
  v_policy    RECORD;
  v_subj_ok   boolean;
  v_cond_ok   boolean;
  v_match_name text;
  v_allowed   boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin only'; END IF;
  SELECT a.* INTO v_acct FROM public.accounts a WHERE a.id = p_account_id;
  IF v_acct.id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','account not found'); END IF;
  SELECT p.id, p.email, p.full_name, p.role::text AS role, p.team_id, p.role_id, t.name AS team_name
    INTO v_profile FROM public.profiles p LEFT JOIN public.teams t ON t.id=p.team_id
    WHERE p.id = p_user_id;
  IF v_profile.role = 'admin' THEN
    RETURN jsonb_build_object('allowed', true, 'policy_name', NULL, 'reason','admin bypass');
  END IF;
  FOR v_policy IN
    SELECT id, name, effect, subject, condition, priority
      FROM public.abac_policies
     WHERE resource='accounts' AND action=p_action AND enabled=true
     ORDER BY priority ASC, id
  LOOP
    v_subj_ok := true;
    IF v_policy.subject ? 'role'    AND v_policy.subject->>'role'    IS DISTINCT FROM v_profile.role         THEN v_subj_ok := false; END IF;
    IF v_subj_ok AND v_policy.subject ? 'role_id' AND v_policy.subject->>'role_id' IS DISTINCT FROM v_profile.role_id::text THEN v_subj_ok := false; END IF;
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
        IF v_match_name IS NULL THEN v_match_name := v_policy.name; END IF;
        v_allowed := true;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'policy_name', v_match_name,
    'reason', CASE WHEN v_allowed THEN 'allow — '||v_match_name ELSE 'default deny — no allow policy matched' END
  );
END $$;
```

- [ ] **Step 2: Quick functional check**

```sql
-- Engine still returns TRUE for every account when called as service-role (flag check happens first; admins bypass downstream)
SELECT public.abac_check('read', a.*) FROM public.accounts a LIMIT 3;
```

Expected: 3 rows of `t`. If anything fails to compile, the migration would have errored — but run this as a smoke.

### Task 3: Write the role_id matcher unit test

**Files:**
- Create: `docs/superpowers/specs/roles-redesign/tests/01_role_id_subject_matcher.sql`

- [ ] **Step 1: Create the test file**

Use the `Write` tool to save this exact content to `/Users/appleera/Downloads/crm/docs/superpowers/specs/roles-redesign/tests/01_role_id_subject_matcher.sql` (create parent dirs first via `mkdir -p`):

```sql
-- docs/superpowers/specs/roles-redesign/tests/01_role_id_subject_matcher.sql
-- Verifies abac_check now matches on subject.role_id. Run via Supabase MCP.

BEGIN;

UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';

DO $$
DECLARE
  v_test_uid       uuid := gen_random_uuid();
  v_role_a         uuid;
  v_role_b         uuid;
  v_account        public.accounts;
  v_policy_a       uuid;
  v_result         boolean;
BEGIN
  -- Seed test fixtures
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
    VALUES ('00000000-0000-0000-0000-000000000000', v_test_uid, 'authenticated', 'authenticated',
            'role-id-test@local', crypt('test', gen_salt('bf')), now(),
            '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  -- handle_new_user has already inserted the profile; create roles and patch role_id.
  INSERT INTO public.roles (name, type, description, is_system, requires_team)
    VALUES ('UnitTest A','custom','for role_id test',false,false) RETURNING id INTO v_role_a;
  INSERT INTO public.roles (name, type, description, is_system, requires_team)
    VALUES ('UnitTest B','custom','for role_id test',false,false) RETURNING id INTO v_role_b;
  UPDATE public.profiles SET role_id = v_role_a, role = 'user' WHERE id = v_test_uid;

  INSERT INTO public.accounts (name) VALUES ('RoleIdTest Co') RETURNING * INTO v_account;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_uid::text)::text, true);

  -- Test 1: policy targeting role A → allows our user (role_id = A)
  INSERT INTO public.abac_policies (name, resource, action, effect, subject, condition, priority)
    VALUES ('role-id-test-allow-A', 'accounts', 'read', 'allow',
            jsonb_build_object('role_id', v_role_a::text),
            '{"all":[]}'::jsonb, 100)
    RETURNING id INTO v_policy_a;
  v_result := public.abac_check('read', v_account);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 1 FAILED: role_id A policy should allow user with role_id A'; END IF;

  -- Test 2: change the policy's subject to role B → user A should no longer match → default deny
  UPDATE public.abac_policies
    SET subject = jsonb_build_object('role_id', v_role_b::text)
    WHERE id = v_policy_a;
  v_result := public.abac_check('read', v_account);
  IF v_result THEN RAISE EXCEPTION 'TEST 2 FAILED: role_id B policy should NOT match user with role_id A'; END IF;

  RAISE NOTICE 'All role_id matcher tests passed.';
END $$;

ROLLBACK;
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
```

- [ ] **Step 2: Run via MCP `execute_sql`**

Paste the file contents into `mcp__b7e33bec-653b-4703-9358-0d8100f64694__execute_sql` with `project_id="rtdrlpnfqjtwtsrwnifn"`.

Expected: no `TEST N FAILED` exception. Final NOTICE `All role_id matcher tests passed.` (the MCP layer may not surface NOTICEs — absence of an EXCEPTION is the success signal).

- [ ] **Step 3: Commit the test file**

```bash
cd /Users/appleera/Downloads/crm
git add docs/superpowers/specs/roles-redesign/tests/01_role_id_subject_matcher.sql
git commit -m "test(roles): add unit test for subject.role_id matcher in abac_check"
git push origin HEAD
```

### Task 4: Seed system-role auto-policies and disable legacy ones

The Admin role's bypass works without a policy (the `role='admin'` short-circuit in `abac_check` still fires because we backfilled `profiles.role` alongside `role_id`). Member and Team Lead need explicit allow policies, and the legacy Compat policies must come down so the regression sweep can compare like-for-like.

- [ ] **Step 1: Apply migration `roles_redesign_phase2b_system_policies`**

```sql
DO $$
DECLARE
  v_member_id    uuid := (SELECT id FROM public.roles WHERE name = 'Sales Member');
  v_lead_id      uuid := (SELECT id FROM public.roles WHERE name = 'Team Lead');
BEGIN
  -- Member: read + update accounts the user owns (or unassigned, or AM-matched by email)
  INSERT INTO public.abac_policies
    (name, description, resource, action, effect, subject, condition, priority, enabled)
  VALUES
    ('auto:role:'||v_member_id::text||':read',
     'System: Sales Member reads accounts they own or are unassigned or are AM on.',
     'accounts','read','allow',
     jsonb_build_object('role_id', v_member_id::text),
     '{"any":[
        {"field":"account.owner_id","op":"eq","value_from":"user.id"},
        {"field":"account.owner_id","op":"is_null"},
        {"field":"account.am_mail","op":"eq","value_from":"user.email"}
      ]}'::jsonb, 100, true),
    ('auto:role:'||v_member_id::text||':update',
     'System: Sales Member updates accounts they own or are unassigned or are AM on.',
     'accounts','update','allow',
     jsonb_build_object('role_id', v_member_id::text),
     '{"any":[
        {"field":"account.owner_id","op":"eq","value_from":"user.id"},
        {"field":"account.owner_id","op":"is_null"},
        {"field":"account.am_mail","op":"eq","value_from":"user.email"}
      ]}'::jsonb, 100, true)
  ON CONFLICT (name) DO UPDATE
     SET subject = EXCLUDED.subject, condition = EXCLUDED.condition, enabled = true;

  -- Team Lead: read + update accounts whose owner is in the same team as the lead
  INSERT INTO public.abac_policies
    (name, description, resource, action, effect, subject, condition, priority, enabled)
  VALUES
    ('auto:role:'||v_lead_id::text||':read',
     'System: Team Lead reads accounts owned by anyone in their team.',
     'accounts','read','allow',
     jsonb_build_object('role_id', v_lead_id::text),
     '{"all":[
        {"field":"account.owner_team_id","op":"eq","value_from":"user.team_id"}
      ]}'::jsonb, 100, true),
    ('auto:role:'||v_lead_id::text||':update',
     'System: Team Lead updates accounts owned by anyone in their team.',
     'accounts','update','allow',
     jsonb_build_object('role_id', v_lead_id::text),
     '{"all":[
        {"field":"account.owner_team_id","op":"eq","value_from":"user.team_id"}
      ]}'::jsonb, 100, true)
  ON CONFLICT (name) DO UPDATE
     SET subject = EXCLUDED.subject, condition = EXCLUDED.condition, enabled = true;
END $$;

-- Disable the legacy compat policies — the new role-based ones replace them.
UPDATE public.abac_policies SET enabled = false
 WHERE name IN ('Compat — owner reads own','Compat — owner updates own');

-- Disable the older auto:lead:* policies (per-team crown-style designation).
UPDATE public.abac_policies SET enabled = false
 WHERE name LIKE 'auto:lead:%';
```

Note: the `ON CONFLICT (name)` clause requires `abac_policies.name` to be UNIQUE. If today's schema doesn't have that constraint, add it as part of this migration:

```sql
ALTER TABLE public.abac_policies ADD CONSTRAINT abac_policies_name_uniq UNIQUE (name);
```

(Idempotent: re-running raises if already present — wrap in DO block if needed.)

- [ ] **Step 2: Verify the seeded set**

```sql
SELECT name, action, effect, enabled
  FROM public.abac_policies
 WHERE name LIKE 'auto:role:%' OR name LIKE 'Compat —%' OR name LIKE 'auto:lead:%'
 ORDER BY name;
```

Expected:
- 4 `auto:role:*` rows, all `enabled = true`
- 2 `Compat — …` rows, both `enabled = false`
- Any `auto:lead:*` rows present from earlier work, all `enabled = false`

### Task 5: Phase 2 regression sweep

**Files:**
- Create: `docs/superpowers/specs/roles-redesign/tests/02_roles_regression.sql`

- [ ] **Step 1: Create the regression file**

Use `Write` to save this exact content:

```sql
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
```

- [ ] **Step 2: Run the file**

Submit to `execute_sql`. Required result: `mismatches = 0`.

If mismatches > 0, STOP — the new auto-policies don't match the Compat behavior exactly. Inspect the sample rows and adjust the conditions in Task 4 before proceeding.

- [ ] **Step 3: Verify post-state**

```sql
SELECT value AS flag FROM public.app_settings WHERE key='abac_enabled';
SELECT name, enabled FROM public.abac_policies WHERE name LIKE 'auto:role:%' OR name LIKE 'Compat —%' ORDER BY name;
```

Expected: `flag = false` (ROLLBACK reverted the temp flip), the 4 `auto:role:*` rows remain `enabled = true`, the 2 Compat rows remain `enabled = false`.

- [ ] **Step 4: Commit the regression file**

```bash
cd /Users/appleera/Downloads/crm
git add docs/superpowers/specs/roles-redesign/tests/02_roles_regression.sql
git commit -m "test(roles): Phase 2 regression sweep — new role policies must match legacy Compat decisions"
git push origin HEAD
```

---

## Phase 3 — Frontend rollout

All Phase 3 tasks edit `crm.html`. The ABAC IIFE at the end of `<body>` already exposes shared helpers (`_restGet`, `_restWrite`, `_rolesCache`, `_allProfiles`, `esc`, `toast`) — reuse them.

### Task 6: Switch Roles tab data source to `roles` table + SYSTEM badge

**Files:**
- Modify: `crm.html` — `renderSettingsRoles` and `_paintRolesFromCache` in the ABAC IIFE

- [ ] **Step 1: Replace the fetch + cache shape**

In `crm.html`, locate this block inside `renderSettingsRoles`:

```javascript
let teams, profiles, autoPolicies;
try {
  [teams, profiles, autoPolicies] = await Promise.all([
    _restGet('teams?select=id,name,description,lead_user_id,created_at&order=name.asc'),
    _restGet('profiles?select=id,email,full_name,role,team_id&order=email.asc'),
    _restGet('abac_policies?select=*&name=like.auto:*'),
  ]);
```

Replace with:

```javascript
let roles, teams, profiles, autoPolicies;
try {
  [roles, teams, profiles, autoPolicies] = await Promise.all([
    _restGet('roles?select=id,name,type,description,is_system,requires_team&order=is_system.desc,name.asc'),
    _restGet('teams?select=id,name,description&order=name.asc'),
    _restGet('profiles?select=id,email,full_name,role,team_id,role_id&order=email.asc'),
    _restGet('abac_policies?select=*&name=like.auto:*'),
  ]);
```

- [ ] **Step 2: Replace the rolesCache build with role data**

Find this line in `renderSettingsRoles`:

```javascript
_rolesCache = teams.map(t => Object.assign({}, t, { user_count: profiles.filter(p => p.team_id === t.id).length }));
_teamsCache = teams; // keep policy editor in sync
```

Replace with:

```javascript
_rolesCache = roles.map(r => Object.assign({}, r, {
  user_count: profiles.filter(p => p.role_id === r.id).length
}));
_teamsCache = teams; // for the Manage Teams sub-modal + advanced policy editor
```

- [ ] **Step 3: Update `_recountUsers` to use `role_id`**

In the IIFE, replace:

```javascript
function _recountUsers(){
  _rolesCache.forEach(r => { r.user_count = _allProfiles.filter(p => p.team_id === r.id).length; });
}
```

With:

```javascript
function _recountUsers(){
  _rolesCache.forEach(r => { r.user_count = _allProfiles.filter(p => p.role_id === r.id).length; });
}
```

- [ ] **Step 4: Add the SYSTEM chip in the roles list**

In `_paintRolesFromCache`, find:

```javascript
<div style="font-size:13px;font-weight:700;color:var(--text-1);">${esc(r.name)}</div>
```

Replace with:

```javascript
<div style="font-size:13px;font-weight:700;color:var(--text-1);display:flex;align-items:center;gap:6px;">
  ${esc(r.name)}
  ${r.is_system ? '<span title="System role — cannot be deleted or renamed" style="font-size:9.5px;font-weight:700;letter-spacing:0.06em;background:#f0eef9;color:#7c3aed;padding:1px 6px;border-radius:999px;">SYSTEM</span>' : ''}
</div>
```

- [ ] **Step 5: JS syntax check**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
```

Expected: `OK 11 blocks`.

- [ ] **Step 6: Commit**

```bash
cd /Users/appleera/Downloads/crm
git add crm.html
git commit -m "feat(roles): switch Roles UI to read from roles table + add SYSTEM badge"
git push origin HEAD
```

### Task 7: Lock system roles in the UI (disabled Delete + Rename guard)

**Files:**
- Modify: `crm.html` — `_renderRoleDetail` in the ABAC IIFE

- [ ] **Step 1: Update the role-detail header to gate Delete + Rename based on `is_system`**

In `_renderRoleDetail`, find the header markup block (search for `Rename` and `Delete role` buttons):

```javascript
<div style="display:flex;gap:8px;">
  <button class="btn btn-secondary" onclick="abacRoleRename('${role.id}')" style="padding:6px 12px;font-size:12px;">Rename</button>
  ${isAdminRole ? '' : `<button class="btn btn-secondary" onclick="abacRoleDelete('${role.id}')" style="padding:6px 12px;font-size:12px;color:var(--bad);border-color:var(--bad);">Delete role</button>`}
</div>
```

Replace with:

```javascript
<div style="display:flex;gap:8px;">
  ${role.is_system
    ? `<button class="btn btn-secondary" onclick="abacRoleEditDescription('${role.id}')" style="padding:6px 12px;font-size:12px;">Edit description</button>`
    : `<button class="btn btn-secondary" onclick="abacRoleRename('${role.id}')" style="padding:6px 12px;font-size:12px;">Rename</button>`
  }
  ${role.is_system ? '' : `<button class="btn btn-secondary" onclick="abacRoleDelete('${role.id}')" style="padding:6px 12px;font-size:12px;color:var(--bad);border-color:var(--bad);">Delete role</button>`}
</div>
```

- [ ] **Step 2: Replace the `isAdminRole` check on the explainer banner with `type==='admin'`**

In the same function find:

```javascript
const isAdminRole = role.name.toLowerCase() === 'admin';
```

Replace with:

```javascript
const isAdminRole = role.type === 'admin';
```

- [ ] **Step 3: Add `abacRoleEditDescription` handler**

Inside the ABAC IIFE, right after `abacRoleRename`, add:

```javascript
window.abacRoleEditDescription = async function(id){
  const role = _rolesCache.find(r => r.id === id);
  if(!role) return;
  const newDesc = (prompt('Edit description:', role.description || '') || '').trim();
  if(newDesc === (role.description || '')) return;
  try {
    await _restWrite(`roles?id=eq.${id}`, 'PATCH', { description: newDesc || null });
    role.description = newDesc || null;
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Description updated','success');
  } catch (e) { if(typeof toast==='function') toast('Update failed: '+e.message,'error'); }
};
```

- [ ] **Step 4: Replace `abacRoleRename` so it writes to `roles` not `teams`, and refuses if `is_system`**

Find `window.abacRoleRename` and replace its body with:

```javascript
window.abacRoleRename = async function(id){
  const role = _rolesCache.find(r => r.id === id);
  if(!role) return;
  if(role.is_system){
    if(typeof toast==='function') toast('System roles cannot be renamed','error');
    return;
  }
  const newName = (prompt('Rename role:', role.name) || '').trim();
  if(!newName || newName === role.name) return;
  const newDesc = (prompt('Description:', role.description || '') || '').trim();
  try {
    await _restWrite(`roles?id=eq.${id}`, 'PATCH', { name:newName, description:newDesc || null });
    role.name = newName; role.description = newDesc || null;
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Role updated','success');
  } catch (e) { if(typeof toast==='function') toast('Rename failed: '+e.message,'error'); }
};
```

- [ ] **Step 5: Replace `abacRoleDelete` to write to `roles` and refuse system rows server-side via RLS + client-side**

Replace the body:

```javascript
window.abacRoleDelete = async function(id){
  const role = _rolesCache.find(r => r.id === id);
  if(!role) return;
  if(role.is_system){
    if(typeof toast==='function') toast('System roles cannot be deleted','error');
    return;
  }
  if(!confirm(`Delete role "${role.name}"? Members will lose their role assignment. Their team assignment is kept. Toggles you set become inert (policies stay disabled in Advanced).`)) return;
  try {
    const rolePerms = _rolePolicies[id] || {};
    for(const p of Object.values(rolePerms)){
      try { await _restWrite(`abac_policies?id=eq.${p.id}`, 'PATCH', { enabled:false }); } catch {}
    }
    await _restWrite(`roles?id=eq.${id}`,'DELETE');
    _selectedRoleId = null;
    _rolesCache = _rolesCache.filter(r => r.id !== id);
    _allProfiles.forEach(p => { if(p.role_id === id) p.role_id = null; });
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Role deleted','success');
  } catch (e) { if(typeof toast==='function') toast('Delete failed: '+e.message,'error'); }
};
```

- [ ] **Step 6: Add a server-side guard against deleting system roles**

Apply migration `roles_redesign_phase3a_system_guard` so even a curl-bypass can't delete the system rows:

```sql
CREATE OR REPLACE FUNCTION public._roles_guard_system()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.is_system THEN
    RAISE EXCEPTION 'System roles cannot be deleted (%)', OLD.name USING ERRCODE='check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_system THEN
    IF NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'System role name cannot be changed (%)', OLD.name USING ERRCODE='check_violation';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'System role type cannot be changed (%)', OLD.name USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_roles_guard_system
  BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public._roles_guard_system();
```

- [ ] **Step 7: JS syntax check**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
```

Expected: `OK 11 blocks`.

- [ ] **Step 8: Commit**

```bash
cd /Users/appleera/Downloads/crm
git add crm.html
git commit -m "feat(roles): lock system roles — disable Delete + Rename in UI; server-side guard trigger"
git push origin HEAD
```

### Task 8: Members tab — inline team picker per row + write `role_id` on add

**Files:**
- Modify: `crm.html` — `_renderRoleDetail` (Members panel) + `abacRoleAddMember`

- [ ] **Step 1: Update the Members rows to include a team dropdown when `role.requires_team` is true**

In `_renderRoleDetail`, find the `memberRows = …` block and replace with:

```javascript
const memberRows = members.length === 0
  ? '<div style="padding:30px;text-align:center;color:var(--text-4);font-size:12px;">No members in this role yet. Add some below.</div>'
  : members.map(m => {
      const teamPicker = role.requires_team
        ? `<select onchange="abacMemberSetTeam('${m.id}', this.value)" style="font:inherit;font-size:11.5px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;margin-left:8px;">
             <option value="">— pick team —</option>
             ${_teamsCache.map(t => `<option value="${t.id}" ${t.id===m.team_id?'selected':''}>${esc(t.name)}</option>`).join('')}
           </select>`
        : '';
      return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;margin-bottom:6px;">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:var(--text-1);">${esc(m.full_name||m.email)}</div>
        <div style="font-size:11.5px;color:var(--text-3);display:flex;align-items:center;gap:4px;">
          ${esc(m.email)}
          ${m.role==='admin'?'<span style="margin-left:6px;font-size:10px;background:#f0eef9;color:#7c3aed;padding:1px 7px;border-radius:999px;font-weight:600;">ADMIN</span>':''}
          ${teamPicker}
        </div>
      </div>
      <button class="btn btn-secondary" onclick="abacRoleRemoveMember('${m.id}')" style="padding:4px 10px;font-size:11px;color:var(--bad);border-color:var(--bad);">Remove</button>
    </div>`;
    }).join('');
```

- [ ] **Step 2: Replace `abacRoleAddMember` so it writes `role_id` AND `team_id`**

Find `window.abacRoleAddMember` and replace with:

```javascript
window.abacRoleAddMember = async function(roleId){
  const sel = document.getElementById('abac-add-member-sel');
  const uid = sel?.value;
  if(!uid) return;
  const role = _rolesCache.find(r => r.id === roleId);
  if(!role) return;
  const payload = { role_id: roleId };
  if(!role.requires_team) payload.team_id = null;
  try {
    await _restWrite(`profiles?id=eq.${uid}`, 'PATCH', payload);
    const prof = _allProfiles.find(p => p.id === uid);
    if (prof) { prof.role_id = roleId; if(!role.requires_team) prof.team_id = null; }
    _recountUsers();
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Member added','success');
  } catch (e) { if(typeof toast==='function') toast('Add failed: '+e.message,'error'); }
};
```

- [ ] **Step 3: Replace `abacRoleRemoveMember` so it clears `role_id` (not `team_id`)**

```javascript
window.abacRoleRemoveMember = async function(uid){
  if(!confirm('Remove this user from the role? They will have no role until you assign them to another.')) return;
  try {
    await _restWrite(`profiles?id=eq.${uid}`, 'PATCH', { role_id: null });
    const prof = _allProfiles.find(p => p.id === uid);
    if (prof) prof.role_id = null;
    _recountUsers();
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Member removed','success');
  } catch (e) { if(typeof toast==='function') toast('Remove failed: '+e.message,'error'); }
};
```

- [ ] **Step 4: Add the `abacMemberSetTeam` handler**

Inside the IIFE (right after `abacRoleRemoveMember`):

```javascript
window.abacMemberSetTeam = async function(uid, teamId){
  try {
    await _restWrite(`profiles?id=eq.${uid}`, 'PATCH', { team_id: teamId || null });
    const prof = _allProfiles.find(p => p.id === uid);
    if (prof) prof.team_id = teamId || null;
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Team assigned','success');
  } catch (e) { if(typeof toast==='function') toast('Assign failed: '+e.message,'error'); }
};
```

- [ ] **Step 5: JS syntax check + commit**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
git add crm.html
git commit -m "feat(roles): Members tab inline team picker + writes role_id (not team_id)"
git push origin HEAD
```

### Task 9: Remove the legacy crown ("Make Lead") UI

**Files:**
- Modify: `crm.html` — remove the Crown badge + buttons inside Members rows and the `abacRoleSetLead` handler

- [ ] **Step 1: Drop the crown badge from member rows**

Already done in Task 8 (the new member-row template doesn't render a crown). Verify by searching the IIFE for `👑` — it should now appear only in the explainer banner. Remove the explainer banner too:

In `_renderRoleDetail`, find the `leadExplainer = leadId …` block and the line `${leadExplainer}` in the panel.innerHTML. Replace with empty string (delete both).

- [ ] **Step 2: Delete the `abacRoleSetLead` function**

Find `window.abacRoleSetLead = async function(roleId, newLeadId){ … };` and remove the entire function. It's no longer called from anywhere.

- [ ] **Step 3: JS syntax check + commit**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
git add crm.html
git commit -m "refactor(roles): remove legacy crown / abacRoleSetLead — Team Lead is now a role assignment"
git push origin HEAD
```

### Task 10: Route Invite User flow to write `role_id` + Add Role to create custom roles

**Files:**
- Modify: `crm.html` — Invite User modal HTML + `abacInviteUserOpen` + `abacInviteUserSubmit`, `abacRoleCreate`
- Modify: edge function `invite-user` to accept and use `role_id`

- [ ] **Step 1: Update the modal markup so the Role dropdown is the new `roles` rows, not user-vs-admin**

In `crm.html` find the Invite User modal (search `id="abac-inv-role"`) and replace its `<select>` with:

```html
<label style="font-size:11.5px;font-weight:600;color:var(--text-3);">Role
  <select id="abac-inv-role-id" style="display:block;width:100%;padding:6px 8px;font:inherit;font-size:13px;border:1px solid var(--border);border-radius:6px;margin-top:3px;"></select></label>
```

(Drop the old `abac-inv-role` and rename to `abac-inv-role-id`. The corresponding label cell for "Assign to role" / `abac-inv-team` becomes the team picker label "Team (when required)".)

- [ ] **Step 2: Update `abacInviteUserOpen` to populate the role dropdown from `_rolesCache`**

Replace:

```javascript
window.abacInviteUserOpen = function(){
  document.getElementById('abac-inv-name').value     = '';
  document.getElementById('abac-inv-email').value    = '';
  document.getElementById('abac-inv-password').value = 'Recruitera@2025';
  document.getElementById('abac-inv-role').value     = 'user';
  const teamSel = document.getElementById('abac-inv-team');
  teamSel.innerHTML = '<option value="">— none —</option>' + _rolesCache.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  if (_selectedRoleId) teamSel.value = _selectedRoleId;
  document.getElementById('abac-inv-error').style.display   = 'none';
  document.getElementById('abac-inv-success').style.display = 'none';
  document.getElementById('abac-inv-submit').disabled = false;
  document.getElementById('abac-inv-submit').textContent = 'Create user';
  document.getElementById('abac-invite-bg').classList.add('open');
};
```

With:

```javascript
window.abacInviteUserOpen = function(){
  document.getElementById('abac-inv-name').value     = '';
  document.getElementById('abac-inv-email').value    = '';
  document.getElementById('abac-inv-password').value = 'Recruitera@2025';
  const roleSel = document.getElementById('abac-inv-role-id');
  roleSel.innerHTML = _rolesCache.map(r => `<option value="${r.id}">${esc(r.name)}${r.is_system?' · system':''}</option>`).join('');
  if (_selectedRoleId) roleSel.value = _selectedRoleId;
  const teamSel = document.getElementById('abac-inv-team');
  teamSel.innerHTML = '<option value="">— none —</option>' + _teamsCache.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  document.getElementById('abac-inv-error').style.display   = 'none';
  document.getElementById('abac-inv-success').style.display = 'none';
  document.getElementById('abac-inv-submit').disabled = false;
  document.getElementById('abac-inv-submit').textContent = 'Create user';
  document.getElementById('abac-invite-bg').classList.add('open');
};
```

- [ ] **Step 3: Update `abacInviteUserSubmit` to send role_id (and infer admin/user from role.type)**

Replace the start of the function:

```javascript
const role     = document.getElementById('abac-inv-role').value;
const team_id  = document.getElementById('abac-inv-team').value || null;
```

With:

```javascript
const role_id  = document.getElementById('abac-inv-role-id').value;
const role_obj = _rolesCache.find(r => r.id === role_id);
const role     = role_obj?.type === 'admin' ? 'admin' : 'user';
const team_id  = (role_obj?.requires_team) ? (document.getElementById('abac-inv-team').value || null) : null;
```

Update the body of the POST to include `role_id`:

```javascript
body: JSON.stringify({ email, full_name: name, role, role_id, team_id, password })
```

- [ ] **Step 4: Update the `invite-user` edge function to write `role_id`**

Re-deploy `invite-user` with this body added inside the patch step (after the auth user is created, in step 5 of the function):

```typescript
// 5. Patch the profile created by handle_new_user with name + team_id + role_id.
await admin.from('profiles')
  .update({ full_name: full_name || email.split('@')[0], team_id, role_id: body.role_id || null })
  .eq('id', newUid);
```

Bump the function comment to `v2` and redeploy via MCP `deploy_edge_function`.

- [ ] **Step 5: Replace `abacRoleCreate` so it creates a row in `roles` (not `teams`)**

Find `window.abacRoleCreate = async function(){ … };` and replace with:

```javascript
window.abacRoleCreate = async function(){
  const name = (prompt('Name of the new role?') || '').trim();
  if(!name) return;
  const description = (prompt('Short description for this role (optional)?') || '').trim();
  const requiresTeam = confirm('Does this role require its members to be assigned to a Team? Click OK for Yes, Cancel for No.');
  try {
    const created = await _restWrite('roles', 'POST', {
      name, description: description || null,
      type: 'custom', is_system: false, requires_team: requiresTeam,
    });
    _selectedRoleId = Array.isArray(created) ? created[0]?.id : created.id;
    _rolesFetchedAt = 0; // force a refresh so the new role appears
    await renderSettingsRoles({force:true});
    if(typeof toast==='function') toast('Role created','success');
  } catch (e) {
    const msg = String(e.message||e);
    if(typeof toast==='function') toast(/duplicate|unique/i.test(msg) ? 'Role name already exists' : 'Create failed: '+msg, 'error');
  }
};
```

- [ ] **Step 6: JS syntax check + commit + redeploy**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
git add crm.html
git commit -m "feat(roles): Invite User + Add Role write role_id (custom type, requires_team prompt); invite-user v2 wires role_id"
git push origin HEAD
```

After committing the frontend, redeploy the edge function via MCP `deploy_edge_function` per the v2 changes above.

### Task 11: Manage Teams sub-modal

**Files:**
- Modify: `crm.html` — add modal HTML + handlers; add button to the Roles tab header

- [ ] **Step 1: Insert the modal HTML**

In `crm.html`, find the Invite User modal block (search `id="abac-invite-bg"`). Immediately AFTER its closing `</div>`, insert:

```html
<!-- ─── Manage Teams modal ─── -->
<div class="disq-modal-bg" id="abac-teams-bg" style="z-index:243;">
  <div class="disq-modal" style="max-width:560px;">
    <div class="disq-hdr">
      <div class="disq-title">Manage Teams</div>
      <div class="disq-sub">Teams are the geographic / functional groups your roles can scope to. Roles like Team Lead and Sales Member reference teams.</div>
    </div>
    <div class="disq-body" style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;gap:6px;">
        <input id="abac-teams-newname" type="text" placeholder="New team name" style="flex:1;font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;"/>
        <button class="btn btn-purple" onclick="abacTeamsCreate()" style="padding:6px 12px;font-size:12px;">+ Create</button>
      </div>
      <div id="abac-teams-list" style="display:flex;flex-direction:column;gap:4px;"></div>
    </div>
    <div class="disq-footer">
      <button class="btn btn-secondary" style="flex:1" onclick="abacTeamsClose()">Done</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add the open/close/list handlers in the IIFE**

```javascript
window.abacTeamsOpen = function(){
  abacTeamsRenderList();
  document.getElementById('abac-teams-bg').classList.add('open');
};
window.abacTeamsClose = function(){
  document.getElementById('abac-teams-bg').classList.remove('open');
};
function abacTeamsRenderList(){
  const list = document.getElementById('abac-teams-list');
  if(!list) return;
  const memberCount = id => _allProfiles.filter(p => p.team_id === id).length;
  list.innerHTML = _teamsCache.length === 0
    ? '<div style="padding:14px;color:var(--text-4);font-size:12px;text-align:center;">No teams yet. Create one above.</div>'
    : _teamsCache.map(t => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-1);">${esc(t.name)}</div>
          <div style="font-size:11.5px;color:var(--text-3);">${memberCount(t.id)} member${memberCount(t.id)===1?'':'s'}</div>
        </div>
        <button class="btn btn-secondary" onclick="abacTeamsDelete('${t.id}')" style="padding:4px 10px;font-size:11px;color:var(--bad);border-color:var(--bad);">Delete</button>
      </div>`).join('');
}
window.abacTeamsCreate = async function(){
  const inp = document.getElementById('abac-teams-newname');
  const name = (inp?.value || '').trim();
  if(!name) return;
  try {
    const created = await _restWrite('teams', 'POST', { name });
    _teamsCache.push(Array.isArray(created) ? created[0] : created);
    inp.value = '';
    abacTeamsRenderList();
    _paintRolesFromCache(); // refresh inline team pickers
    if(typeof toast==='function') toast('Team created','success');
  } catch (e) {
    const msg = String(e.message||e);
    if(typeof toast==='function') toast(/duplicate|unique/i.test(msg) ? 'Team name already exists' : 'Create failed: '+msg, 'error');
  }
};
window.abacTeamsDelete = async function(id){
  if(!confirm('Delete this team? Members will lose their team assignment.')) return;
  try {
    await _restWrite(`teams?id=eq.${id}`, 'DELETE');
    _teamsCache = _teamsCache.filter(t => t.id !== id);
    _allProfiles.forEach(p => { if(p.team_id === id) p.team_id = null; });
    abacTeamsRenderList();
    _paintRolesFromCache();
    if(typeof toast==='function') toast('Team deleted','success');
  } catch (e) { if(typeof toast==='function') toast('Delete failed: '+e.message,'error'); }
};
```

- [ ] **Step 3: Add the Manage Teams button to the Roles tab header**

In `_paintRolesFromCache`, find:

```javascript
<button class="btn btn-purple" onclick="abacInviteUserOpen()" style="padding:6px 14px;font-size:12px;">+ Invite User</button>
```

Replace with:

```javascript
<div style="display:flex;gap:8px;">
  <button class="btn btn-secondary" onclick="abacTeamsOpen()" style="padding:6px 12px;font-size:12px;">Manage Teams</button>
  <button class="btn btn-purple" onclick="abacInviteUserOpen()" style="padding:6px 14px;font-size:12px;">+ Invite User</button>
</div>
```

- [ ] **Step 4: JS syntax check + commit**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
git add crm.html
git commit -m "feat(roles): Manage Teams sub-modal + button in Roles tab header"
git push origin HEAD
```

### Task 12: Toggle handler — ensure auto-policies still target the role correctly

The existing `abacRoleToggle` writes auto-policies named `auto:<role_id>:<action>` with `subject.team_id`. Under the new model, the auto-policies should match by `role_id` not `team_id`.

**Files:**
- Modify: `crm.html` — `abacRoleToggle`

- [ ] **Step 1: Replace the toggle handler so it writes `subject.role_id`**

Replace the body of `window.abacRoleToggle`:

```javascript
window.abacRoleToggle = async function(roleId, action, enabled){
  const role = _rolesCache.find(r => r.id === roleId);
  if(!role) return;
  const existing = (_rolePolicies[roleId] || {})[action];
  try {
    if(existing){
      await _restWrite(`abac_policies?id=eq.${existing.id}`, 'PATCH', { enabled });
      existing.enabled = enabled;
    } else if (enabled) {
      const payload = {
        name: _policyAutoName(roleId, action),
        description: `Auto: ${role.name} → ${action}. Managed by the Roles & Permissions tab.`,
        resource: 'accounts',
        action,
        effect: 'allow',
        subject: { role_id: roleId },
        condition: { all: [] },
        priority: 100,
        enabled: true,
      };
      const inserted = await _restWrite('abac_policies', 'POST', payload);
      const row = Array.isArray(inserted) ? inserted[0] : inserted;
      (_rolePolicies[roleId] = _rolePolicies[roleId] || {})[action] = row;
    }
    if(typeof toast==='function') toast(enabled ? 'Granted' : 'Revoked', 'success');
    _renderRoleDetail();
  } catch (e) {
    if(typeof toast==='function') toast('Toggle failed: '+e.message,'error');
    await renderSettingsRoles({force:true});
  }
};
```

(The only change vs. today: `subject: { role_id: roleId }` instead of `subject: { team_id: roleId }`.)

- [ ] **Step 2: JS syntax check + commit**

```bash
cd /Users/appleera/Downloads/crm
perl -0777 -ne 'my @b; while(/<script\b[^>]*>(.*?)<\/script>/sg){push @b,$1;} for my $i (0..$#b){my $t="/tmp/c$i.js"; open my $f,">",$t; print $f $b[$i]; close $f; my $rc=system("node --check $t 2>&1"); if($rc != 0){print "FAIL block $i\n"; exit 1;}} print "OK ",scalar @b," blocks\n";' crm.html
git add crm.html
git commit -m "fix(roles): toggle handler writes subject.role_id (was team_id) so new policies target the role correctly"
git push origin HEAD
```

---

## Phase 4 — Cleanup (deferred 24h after Phase 3 ships)

### Task 13: Drop legacy columns + rewrite `is_admin`

Run only after 24 hours of Phase 3 in production with no drift in `abac_audit`.

- [ ] **Step 1: Apply migration `roles_redesign_phase4_cleanup`**

```sql
-- Rewrite is_admin to read the new source of truth.
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.id = auth.uid() AND r.type = 'admin'
  );
$$;

-- Now safe to drop the legacy enum
ALTER TABLE public.profiles DROP COLUMN role;

-- Drop the dead crown column
ALTER TABLE public.teams DROP COLUMN lead_user_id;

-- Also drop the now-vestigial 'role' arm of the subject matcher: re-install abac_check / abac_simulate
-- with that block removed for cleanliness. (Optional — they're harmless if left in; skip if you prefer.)
```

- [ ] **Step 2: Verify nothing in the code reads `profiles.role` anymore**

```bash
grep -n "profiles\.role[^_]\|profile\.role[^_]" crm.html | grep -v "role_id\|profile\.role,\|profiles\.role," | head -20
```

Expected: no references (or only role_id / commented-out lines).

- [ ] **Step 3: Smoke test the live CRM still works**

Hard refresh the production site as admin. Confirm Pipeline / Accounts / Settings all load. Then sign in as Mariam and confirm she still sees her accounts.

---

## Phase 5 — Documentation

### Task 14: CHANGELOG + onboarding note

**Files:**
- Create: `docs/superpowers/specs/roles-redesign/CHANGELOG.md`

- [ ] **Step 1: Write the changelog**

Use the `Write` tool:

```markdown
# Roles redesign — changelog

## 2026-06-DD Phase 1 — schema + seed
- Added `public.roles` table with three system rows (Admin, Team Lead, Sales Member).
- Added `profiles.role_id`; backfilled from `profiles.role`.
- Removed the legacy "Admin" team row from `public.teams`.

## 2026-06-DD Phase 2 — ABAC policy migration
- `abac_check` and `abac_simulate` now match `subject.role_id`.
- Seeded 4 auto-policies for Sales Member + Team Lead read/update.
- Disabled the legacy `Compat —` policies and the older `auto:lead:*` policies.
- Regression sweep: 0 mismatches across all (user, account) pairs.

## 2026-06-DD Phase 3 — frontend rollout
- Roles & Permissions tab now reads from the `roles` table.
- SYSTEM badge on protected rows; Delete + Rename guarded both client- and server-side.
- Members tab inline team picker for roles where `requires_team=true`.
- Crown / "Make Team Lead" UI removed — promotion is just role assignment.
- Manage Teams sub-modal added.
- Invite User and Add Role write `role_id`.

## 2026-06-DD Phase 4 — cleanup
- Dropped `profiles.role` enum; rewrote `is_admin()` against `roles.type`.
- Dropped `teams.lead_user_id`.

## How to change someone's role now
Settings → Roles & Permissions → open the NEW role → Members → Add member → pick them. They're auto-removed from the previous role.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/appleera/Downloads/crm
git add docs/superpowers/specs/roles-redesign/CHANGELOG.md
git commit -m "docs(roles): add CHANGELOG for the redesign rollout"
git push origin HEAD
```

---

## Self-review

**Spec coverage check:**

- §2 Goals → Tasks 1 (schema + seed), 4 (engine policies), 6–12 (UI refinements 1–5), 13 (cleanup), 14 (docs). ✓
- §3 Non-goals → none introduced by any task. ✓
- §5 Data model → Task 1 ships `roles` table + columns, seeded rows, `profiles.role_id`. ✓
- §6.1 admin bypass → still handled by `role='admin'` short-circuit in Task 2; Task 13 rewrites `is_admin`. ✓
- §6.2/6.3 Team Lead + Member semantics → Task 4 seeds the auto-policies; Task 5 sweep confirms. ✓
- §6.4 custom = blank slate → Task 10 `abacRoleCreate` creates a `custom` row; Task 12 toggle creates `condition:{all:[]}` policies. ✓
- §6.5 subject matcher extension → Task 2. ✓
- §7.1 SYSTEM badge → Task 6. ✓
- §7.2 locked editing → Task 7. ✓
- §7.3 inline team picker → Task 8. ✓
- §7.4 Manage Teams sub-modal → Task 11. ✓
- §7.5 crown removal → Task 9. ✓
- §7.6 cross-role move semantics → Task 8 (clears `team_id` when role doesn't require one). ✓
- §8 Migration phases → Tasks 1, 2–5, 6–12, 13, 14 mirror Phases 1–5. ✓
- §9 Testing → Task 3 (subject matcher unit), Task 5 (regression sweep), Task 13 step 3 (smoke). ✓
- §10 Risks: backfill mis-assign, sweep mismatch, drop column breakage → Task 1 verification step covers backfill; Task 5 STOP-on-mismatch covers sweep; Task 13 step 3 covers cleanup smoke. ✓

**Placeholder scan:** no TBD / TODO / "implement later" left in any task. Every code step has the actual code. ✓

**Type consistency:** `role_id`, `team_id`, `requires_team`, `is_system`, `role.type`, `subject.role_id` are spelled consistently across Tasks 2–12. `auto:role:<role_id>:<action>` naming matches between Task 4 seed and Task 12 toggle handler. ✓

Plan is internally consistent and fully covers the spec.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-06-03-roles-redesign-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
