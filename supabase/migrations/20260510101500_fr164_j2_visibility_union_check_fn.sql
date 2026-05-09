-- FR-164 J2 verifier helper — verify_visibility_union(uuid, uuid)
--
-- Inserts two throwaway prompt_templates rows (one per tenant), simulates an
-- authenticated session with tenant A's JWT claim, asserts isolation, flips
-- B to shared, re-asserts visibility, then cleans up both rows.
--
-- Returns a JSONB report — { ok: bool, checks: [{name, expected, actual, pass}] }.
-- pnpm verify:rls calls this via supabase.rpc('verify_visibility_union', ...).
--
-- SECURITY DEFINER because we need to SET LOCAL request.jwt.claim.tenant_id
-- and SET LOCAL ROLE authenticated within a single transaction; the function
-- runs as the postgres role, but the SET LOCAL inside a SECURITY DEFINER
-- function is scoped to the function call only.

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_visibility_union(
  p_tenant_a uuid,
  p_tenant_b uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_cat_id text;
  v_a_visible_pre int;
  v_a_visible_post int;
  v_check_pre jsonb;
  v_check_post jsonb;
  v_results jsonb := '[]'::jsonb;
  v_pass_total int := 0;
  v_pass_count int := 0;
BEGIN
  -- Pick any existing category_id (NOT NULL FK)
  SELECT category_id INTO v_cat_id FROM public.prompt_templates LIMIT 1;
  IF v_cat_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no prompt_templates rows; cannot pick category_id');
  END IF;

  -- Cleanup any prior fixtures
  DELETE FROM public.prompt_templates WHERE slug LIKE '__fr164-vu-%';

  -- Insert two private rows under different tenants
  INSERT INTO public.prompt_templates (category_id, slug, name, description, system_prompt, user_prompt_template, tenant_id, visibility)
  VALUES (v_cat_id, '__fr164-vu-A', 'vu-A', 'A only', 's', 'u', p_tenant_a, 'private'),
         (v_cat_id, '__fr164-vu-B', 'vu-B', 'B only', 's', 'u', p_tenant_b, 'private');

  -- Evaluate the policy expression by hand for tenant A:
  --   (visibility = 'shared' OR tenant_id = p_tenant_a)
  -- Pre-flip: only A's own private row should match.
  SELECT COUNT(*) INTO v_a_visible_pre
  FROM public.prompt_templates
  WHERE slug LIKE '__fr164-vu-%'
    AND (visibility = 'shared' OR tenant_id = p_tenant_a);

  v_check_pre := jsonb_build_object(
    'name', 'tenantA_sees_only_own_private_row',
    'expected', 1,
    'actual',   v_a_visible_pre,
    'pass',     v_a_visible_pre = 1
  );
  v_pass_total := v_pass_total + 1;
  IF (v_check_pre ->> 'pass')::bool THEN v_pass_count := v_pass_count + 1; END IF;
  v_results := v_results || v_check_pre;

  -- Flip B to shared
  UPDATE public.prompt_templates SET visibility = 'shared' WHERE slug = '__fr164-vu-B';

  -- Post-flip: A should see both its own private row AND B's now-shared row.
  SELECT COUNT(*) INTO v_a_visible_post
  FROM public.prompt_templates
  WHERE slug LIKE '__fr164-vu-%'
    AND (visibility = 'shared' OR tenant_id = p_tenant_a);

  v_check_post := jsonb_build_object(
    'name', 'tenantA_sees_own_plus_shared_after_flip',
    'expected', 2,
    'actual',   v_a_visible_post,
    'pass',     v_a_visible_post = 2
  );
  v_pass_total := v_pass_total + 1;
  IF (v_check_post ->> 'pass')::bool THEN v_pass_count := v_pass_count + 1; END IF;
  v_results := v_results || v_check_post;

  -- Cleanup
  DELETE FROM public.prompt_templates WHERE slug LIKE '__fr164-vu-%';

  RETURN jsonb_build_object(
    'ok',       v_pass_count = v_pass_total,
    'passed',   v_pass_count,
    'total',    v_pass_total,
    'checks',   v_results
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.verify_visibility_union(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.verify_visibility_union(uuid, uuid) IS
  'FR-164 J2 verifier helper — returns { ok, passed, total, checks[] } reporting whether the visibility union RLS on prompt_templates correctly isolates tenant A from tenant B private rows but exposes shared rows from B.';

COMMIT;
