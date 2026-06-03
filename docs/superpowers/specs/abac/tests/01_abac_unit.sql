-- docs/superpowers/specs/abac/tests/01_abac_unit.sql
-- Unit tests for public.abac_check. Each test runs inside a single transaction
-- that ROLLBACKs at the end so production state is unchanged.
-- Run via Supabase MCP execute_sql.

BEGIN;

-- Force the engine on for the duration of these tests.
UPDATE public.app_settings SET value='true'::jsonb WHERE key='abac_enabled';

DO $$
DECLARE
  v_test_uid     uuid := gen_random_uuid();
  v_test_team    uuid := gen_random_uuid();
  v_test_acct    public.accounts;
  v_policy_allow uuid;
  v_policy_deny  uuid;
  v_result       boolean;
BEGIN
  -- Fixture: auth user + team + user profile + account
  -- profiles.id has FK to auth.users(id), so seed an auth.users row first.
  INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    VALUES (v_test_uid, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'unit@test.local', now(), now());
  INSERT INTO public.teams (id, name) VALUES (v_test_team, 'unit-test-team');
  -- A handle_new_user trigger on auth.users may auto-insert a profile, so upsert.
  INSERT INTO public.profiles (id, email, full_name, role, short_id, team_id)
    VALUES (v_test_uid, 'unit@test.local', 'Unit Test', 'user', 'UT', v_test_team)
    ON CONFLICT (id) DO UPDATE
      SET email=EXCLUDED.email, full_name=EXCLUDED.full_name, role=EXCLUDED.role,
          short_id=EXCLUDED.short_id, team_id=EXCLUDED.team_id;
  INSERT INTO public.accounts (name, deal_value, wp_marketing_channel)
    VALUES ('UnitTest Co', 500000, 'Egypt')
    RETURNING * INTO v_test_acct;

  -- Spoof auth.uid() for this transaction.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_test_uid::text)::text, true);

  -- Test 1: default deny — no policy exists for read.
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 1 FAILED: expected default deny, got allow'; END IF;

  -- Test 2: matching allow policy → allow.
  INSERT INTO public.abac_policies (name, resource, action, effect, subject, condition, priority)
    VALUES ('allow-egypt', 'accounts', 'read', 'allow',
            jsonb_build_object('team_id', v_test_team::text),
            jsonb_build_object('all', jsonb_build_array(
              jsonb_build_object('field','account.wp_marketing_channel','op','eq','value','Egypt')
            )), 100)
    RETURNING id INTO v_policy_allow;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 2 FAILED: expected allow when policy matches'; END IF;

  -- Test 3: deny overrides allow.
  INSERT INTO public.abac_policies (name, resource, action, effect, subject, condition, priority)
    VALUES ('deny-big', 'accounts', 'read', 'deny',
            jsonb_build_object('team_id', v_test_team::text),
            jsonb_build_object('all', jsonb_build_array(
              jsonb_build_object('field','account.deal_value','op','gt','value',100000)
            )), 50)
    RETURNING id INTO v_policy_deny;
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 3 FAILED: expected deny override, got allow'; END IF;

  -- Test 4: disabled policy ignored.
  UPDATE public.abac_policies SET enabled=false WHERE id = v_policy_deny;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 4 FAILED: disabled policy should not fire'; END IF;

  -- Test 5: subject mismatch ignored (different team → allow does not fire).
  UPDATE public.abac_policies
    SET subject = jsonb_build_object('team_id', gen_random_uuid()::text), enabled = true
    WHERE id = v_policy_allow;
  v_result := public.abac_check('read', v_test_acct);
  IF v_result THEN RAISE EXCEPTION 'TEST 5 FAILED: allow with wrong subject should not fire → expected default deny'; END IF;

  -- Test 6: admin bypass — promote test user to admin and confirm allow regardless.
  UPDATE public.profiles SET role='admin' WHERE id = v_test_uid;
  v_result := public.abac_check('read', v_test_acct);
  IF NOT v_result THEN RAISE EXCEPTION 'TEST 6 FAILED: admin should bypass and allow'; END IF;

  RAISE NOTICE 'All 6 unit tests passed.';
END $$;

ROLLBACK;
-- Belt-and-braces: make absolutely sure the flag is off after the file runs.
UPDATE public.app_settings SET value='false'::jsonb WHERE key='abac_enabled';
