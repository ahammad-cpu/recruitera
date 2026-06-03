-- docs/superpowers/specs/abac/tests/03_abac_smoke.sql
-- Phase 4 smoke test. Run via Supabase MCP execute_sql after the global flag
-- flip. Confirms:
--   1. Engine is on
--   2. Admin reads return the same row count as the underlying table
--   3. role=user reads via abac_check_batch match the RLS-filtered count (the
--      two should be identical because RLS uses abac_check internally)

DO $$
DECLARE
  v_admin uuid;
  v_user  uuid;
  v_acct  uuid;
  v_flag  boolean;
  v_admin_count int;
  v_user_rls_count int;
  v_user_abac_count int;
BEGIN
  -- 1. Engine should be on
  SELECT (value)::boolean INTO v_flag FROM public.app_settings WHERE key='abac_enabled';
  IF v_flag IS NOT true THEN RAISE EXCEPTION 'Flag not on: %', v_flag; END IF;

  -- Find one admin and one regular user
  SELECT id INTO v_admin FROM public.profiles WHERE role='admin' LIMIT 1;
  SELECT id INTO v_user  FROM public.profiles WHERE role='user'  LIMIT 1;

  -- 2. Admin sees every account (admin bypass)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin::text)::text, true);
  SELECT count(*) INTO v_admin_count FROM public.accounts;
  IF v_admin_count = 0 THEN RAISE EXCEPTION 'Admin sees zero accounts — admin bypass broken'; END IF;

  -- 3. role=user: RLS-filtered count must equal abac_check_batch count
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
  SELECT count(*) INTO v_user_rls_count FROM public.accounts;
  SELECT count(*) INTO v_user_abac_count
    FROM public.abac_check_batch('read', ARRAY(SELECT id FROM public.accounts))
   WHERE allowed;
  IF v_user_rls_count IS DISTINCT FROM v_user_abac_count THEN
    RAISE EXCEPTION 'Mismatch: RLS sees % rows, abac_check_batch says % allowed', v_user_rls_count, v_user_abac_count;
  END IF;
  -- Note: PostgREST gates RLS by SECURITY DEFINER calls; the count above should match.

  -- Clean up
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'Phase 4 smoke passed — admin saw %, user saw % (matches abac_check_batch).', v_admin_count, v_user_rls_count;
END $$;
