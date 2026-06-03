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
