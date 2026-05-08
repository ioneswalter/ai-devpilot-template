# Tasks — FR-163 DevPilot API Gateway + Customer Auth (Foundation)

**Branch**: `001-coop-marketplace-platform`
**Total tasks**: 16 (J1: 6, J2: 5, J3: 4, verifier: 1)

## Phase J1 — Gateway infrastructure end-to-end (Priority: P1)

- [x] T001 [J1] Create migration `supabase/migrations/<timestamp>_fr163_j1_api_keys_table.sql` per [data-model.md](data-model.md): `api_keys` table + indexes + RLS policy `api_keys_tenant_isolation` with FR-162 COALESCE pattern.
- [x] T002 [J1] Create `supabase/functions/_shared/api-key-helpers.ts` exporting `generateRawKey() → string`, `hashKey(raw) → string`, `keyPrefix(raw) → string` (first 8 chars). Use SHA-256 via Deno's `crypto.subtle`.
- [x] T003 [J1] Create `supabase/functions/_shared/api-gateway.ts` exporting `withApiGateway(handler)` per [contracts/api-gateway-middleware.md](contracts/api-gateway-middleware.md). Includes Bearer extraction, key lookup, JWT minting (with `SUPABASE_JWT_SECRET` check + 503 fallback), session-token-aware Supabase client construction, error responses.
- [x] T004 [J1] Edit `supabase/functions/pipeline-status/index.ts` — add detect-and-route at the top of `Deno.serve`. If header is API-key-shaped (`dp_*` prefix), call `withApiGateway(handler)`; else fall through to existing user-JWT path unchanged.
- [x] T005 [J1] Apply migration via `supabase db push` and deploy `pipeline-status` via `supabase functions deploy pipeline-status --no-verify-jwt`.
- [x] T006 [J1] Smoke per Quickstart J1.1, J1.2, J1.3. Confirm synthetic tenant call returns isolated data; revoked key 401s; OwnYourGig kanban still works.

## Phase J2 — Admin UI for API key lifecycle (Priority: P2)

- [x] T007 [J2] Add new action handlers under `supabase/functions/roadmap-admin-features/index.ts`: `api-key-issue`, `api-key-rotate`, `api-key-revoke`, `api-keys` (list). Reuse existing `_shared/admin-auth.ts`. Use `_shared/api-key-helpers.ts` for hash + prefix.
- [ ] T008 [J2] DEFERRED to FR-163 v1.1: frontend api-keys-api wrapper. Admin actions are reachable via curl in v1.0; UI ships when needed for non-developer admins.
- [ ] T009 [J2] DEFERRED to FR-163 v1.1: ApiKeysPanel React component.
- [ ] T010 [J2] DEFERRED to FR-163 v1.1: ApiKeyIssuanceModal React component (raw-key reveal modal).
- [x] T011 [J2] Deploy `roadmap-admin-features` Edge Function. Smoke per Quickstart J2.1, J2.2, J2.3, J2.4.

## Phase J3 — Audit log + rate limiting (Priority: P3)

- [x] T012 [J3] Create migration `supabase/migrations/<timestamp>_fr163_j3_api_audit_log_table.sql` per [data-model.md](data-model.md): `api_audit_log` table + indexes + RLS policy with FR-162 COALESCE pattern.
- [x] T013 [J3] Edit `supabase/functions/_shared/api-gateway.ts` to integrate FR-063 `_shared/rate-limit.ts` keyed off `api_keys.id`. Quota exhaustion returns `429 RATE_LIMITED` with `Retry-After` header.
- [x] T014 [J3] Same file — add fire-and-forget `INSERT INTO api_audit_log (...)` after the wrapped handler returns (or throws). Failed audit insert logs to console; never fails the user request.
- [x] T015 [J3] Apply migration + redeploy `pipeline-status` (which uses the updated middleware). Smoke per Quickstart J3.1, J3.2, J3.3.

## Verifier extension

- [x] T016 Edit `scripts/verify-rls-status.ts` — add `'api_keys'` and `'api_audit_log'` to `FR162_SCOPE_TABLES`. Run `pnpm verify:rls` and confirm 31/31 tables protected (and TC-FR162-J4-01 still PASS).

## Verification gate (mandatory after each phase)

- After J1: `pnpm verify:feature FR-130 --stage test`, `FR-161 --stage test`, `FR-106 --stage test`, `FR-162 --stage test` all return exit 0 (regression). Quickstart J1 scenarios pass.
- After J2: Quickstart J2 scenarios pass. Network panel inspection confirms no raw key in list responses.
- After J3: Quickstart J3 scenarios pass. `pnpm verify:rls` reports 31/31. `pnpm verify:feature FR-163 --stage build` returns exit 0.
