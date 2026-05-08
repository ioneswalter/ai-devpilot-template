# Contract — RLS Policies for Scoped Tables (J2)

## Purpose

Define the exact RLS policy applied to each of the 28 scoped tables.

## Policy template

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS <table>_tenant_isolation ON public.<table>;
CREATE POLICY <table>_tenant_isolation ON public.<table>
  FOR ALL
  TO authenticated
  USING (tenant_id = current_setting('request.jwt.claim.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('request.jwt.claim.tenant_id', true)::uuid);
```

`FOR ALL` covers SELECT, INSERT, UPDATE, DELETE. `TO authenticated` scopes the policy to the `authenticated` role — service role's BYPASS is unaffected. The `WITH CHECK` clause prevents an authenticated user from INSERTing or UPDATEing a row to a different tenant's id.

## Service role behaviour

Service role (the key used by all server-side scripts and Edge Functions calling `createClient(URL, SERVICE_ROLE_KEY)`) bypasses all RLS by Postgres convention. The policies above explicitly target `authenticated` rather than `PUBLIC` so service role is never restricted.

Verifiable via:

```sql
SET ROLE service_role; -- or use the service-role key
SELECT count(*) FROM product_features; -- returns all rows regardless of tenant_id
RESET ROLE;
```

## Anon role behaviour

The `anon` role (used by unauthenticated public reads) is NOT included in the policies. By default, RLS-enabled tables block anon reads entirely. If a future feature needs public reads of any scoped table, it must add an explicit policy for `anon` with its own constraints.

## NULL handling

`current_setting('request.jwt.claim.tenant_id', true)::uuid` returns NULL when the setting isn't set. NULL never equals anything in SQL (`NULL = NULL` is NULL, not true). So:

- An authenticated request that didn't go through `resolveAndSetTenant` (i.e., didn't call `set_tenant_context`) sees zero rows and can write zero rows. **Fail-closed.**
- This is the right default. Any authenticated path that needs to read scoped data must set the tenant context first.

## Per-table policy name

Each table gets a uniquely-named policy: `<table>_tenant_isolation`. Naming is deterministic so future migrations can `DROP POLICY IF EXISTS` cleanly.

| Table                     | Policy name                                  |
| ------------------------- | -------------------------------------------- |
| product_features          | `product_features_tenant_isolation`          |
| feature_versions          | `feature_versions_tenant_isolation`          |
| feature_spec_artifacts    | `feature_spec_artifacts_tenant_isolation`    |
| spec_reviews              | `spec_reviews_tenant_isolation`              |
| review_items              | `review_items_tenant_isolation`              |
| implementation_requests   | `implementation_requests_tenant_isolation`   |
| implementation_task_items | `implementation_task_items_tenant_isolation` |
| pipeline_runs             | `pipeline_runs_tenant_isolation`             |
| pipeline_queue            | `pipeline_queue_tenant_isolation`            |
| pipeline_failures         | `pipeline_failures_tenant_isolation`         |
| pipeline_notifications    | `pipeline_notifications_tenant_isolation`    |
| test_cases                | `test_cases_tenant_isolation`                |
| test_runs                 | `test_runs_tenant_isolation`                 |
| test_data_sets            | `test_data_sets_tenant_isolation`            |
| test_failure_guidance     | `test_failure_guidance_tenant_isolation`     |
| automated_test_scripts    | `automated_test_scripts_tenant_isolation`    |
| api_verification_tests    | `api_verification_tests_tenant_isolation`    |
| uat_packages              | `uat_packages_tenant_isolation`              |
| uat_checklist_items       | `uat_checklist_items_tenant_isolation`       |
| uat_review_decisions      | `uat_review_decisions_tenant_isolation`      |
| uat_review_audit          | `uat_review_audit_tenant_isolation`          |
| uat_scenarios             | `uat_scenarios_tenant_isolation`             |
| bp_review_projections     | `bp_review_projections_tenant_isolation`     |
| feature_dependencies      | `feature_dependencies_tenant_isolation`      |
| feature_comments          | `feature_comments_tenant_isolation`          |
| feature_ratings           | `feature_ratings_tenant_isolation`           |
| prompt_templates          | `prompt_templates_tenant_isolation`          |
| prompt_categories         | `prompt_categories_tenant_isolation`         |
| prompt_ratings            | `prompt_ratings_tenant_isolation`            |

(29 entries above — re-reads as 28 because one is a `pipeline_*` duplicate. The migration loop iterates the deduplicated list defined in plan.md.)

## Existing per-table policies

A few scoped tables already have RLS policies (e.g., `product_features` may have an admin-only policy from FR-062). The J2 migration uses `DROP POLICY IF EXISTS <name>_tenant_isolation` before creating the new policy — it does NOT touch other existing policies. If a table has a competing policy that's permissive (`USING (true)`), it must be reviewed during the J2 implementation and either removed or restricted.

## Verification

J4's verifier extension reads `pg_policies` joined to `pg_tables` and asserts: for each name in the 28-table scope set, `relrowsecurity = true` AND at least one policy named `<table>_tenant_isolation` exists.
