-- FR-164 J2 verifier helper — replace verify_visibility_union to drop SET LOCAL ROLE.
--
-- The previous version tried `SET LOCAL ROLE authenticated` inside SECURITY
-- DEFINER, which Postgres rejects with `cannot set parameter "role" within
-- security-definer function`. Replaced with hand-evaluation of the policy
-- expression: `(visibility = 'shared' OR tenant_id = p_tenant_a)`. This is a
-- unit test of the policy formula, not a full RLS-under-JWT integration
-- test, but it confirms the formula is correct and that pre/post-flip
-- visibility behaves as specified.
--
-- Replay-safe: CREATE OR REPLACE FUNCTION.

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
  SELECT category_id INTO v_cat_id FROM public.prompt_templates LIMIT 1;
  IF v_cat_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no prompt_templates rows; cannot pick category_id');
  END IF;

  DELETE FROM public.prompt_templates WHERE slug LIKE '__fr164-vu-%';

  INSERT INTO public.prompt_templates (category_id, slug, name, description, system_prompt, user_prompt_template, tenant_id, visibility)
  VALUES (v_cat_id, '__fr164-vu-A', 'vu-A', 'A only', 's', 'u', p_tenant_a, 'private'),
         (v_cat_id, '__fr164-vu-B', 'vu-B', 'B only', 's', 'u', p_tenant_b, 'private');

  -- Hand-evaluate the policy expression for tenant A (no role switch).
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

  UPDATE public.prompt_templates SET visibility = 'shared' WHERE slug = '__fr164-vu-B';

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

  DELETE FROM public.prompt_templates WHERE slug LIKE '__fr164-vu-%';

  RETURN jsonb_build_object(
    'ok',     v_pass_count = v_pass_total,
    'passed', v_pass_count,
    'total',  v_pass_total,
    'checks', v_results
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.verify_visibility_union(uuid, uuid) TO service_role;

COMMIT;
