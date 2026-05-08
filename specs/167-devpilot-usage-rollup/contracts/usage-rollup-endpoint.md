# Contract — `GET /usage-rollup` Edge Function

## Purpose

Return the current-period usage rollup for the calling tenant, with a linearly-extrapolated projected charge. FR-168's onboarding dashboard reads from this; admins use it for ops queries.

## Request

```
GET /functions/v1/usage-rollup
GET /functions/v1/usage-rollup?period=current
GET /functions/v1/usage-rollup?period=current&tenant_id=<uuid>   (admin only)
```

Query parameters:

| Param       | Required? | Notes                                                                                                           |
| ----------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `period`    | optional  | Defaults to `current`. v1.0 only supports `current`; future versions can add `previous` or arbitrary `YYYY-MM`. |
| `tenant_id` | optional  | Only honoured for service-role-authenticated requests. API-key callers are pinned to their key's tenant.        |

## Auth (detect-and-route, mirrors FR-163 pilot)

| Authorization header           | Path                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `Bearer dp_<32-byte-hex>`      | FR-163 gateway → `tenantId` resolved from `api_keys.key_hash` lookup                   |
| `Bearer <service-role-jwt>`    | Admin path → `tenant_id` from query param (defaults to OwnYourGig if absent)           |
| Anything else (incl. user JWT) | Service-role bypass via authenticated JWT — uses caller's `tenant_id` claim if present |
| Missing / empty `Bearer`       | `401 UNAUTHORIZED` (no info leak about reason)                                         |

## Response (success)

`HTTP/1.1 200 OK`

```json
{
  "data": {
    "tenant_id": "<uuid>",
    "period_start": "2026-05-01",
    "period_end": "2026-05-31",
    "ai_input_tokens": 1234567,
    "ai_output_tokens": 234567,
    "ai_raw_cost": 1.234,
    "ai_billable_cost": 2.47,
    "gateway_calls": 42,
    "projected_billable_cost": 8.51,
    "computed_at": "2026-05-09T14:23:00Z"
  }
}
```

Headers:

- `X-Request-Id: <uuid>` (always; for correlation)
- `X-Tenant-Id: <uuid>` (on success — caller can verify they hit the right tenant)

## Response shapes

### Empty period (tenant has zero AI usage in current month)

Returns the rollup row with all zero values:

```json
{
  "data": {
    "tenant_id": "<uuid>",
    "period_start": "2026-05-01",
    "period_end": "2026-05-31",
    "ai_input_tokens": 0,
    "ai_output_tokens": 0,
    "ai_raw_cost": 0,
    "ai_billable_cost": 0,
    "gateway_calls": 0,
    "projected_billable_cost": 0,
    "computed_at": "2026-05-09T14:23:00Z"
  }
}
```

### Compute-on-the-fly when no rollup exists yet

If `usage_rollups` has no row for the tenant + period, the Edge Function calls `compute_usage_rollup(tenant_id, period_start)` to generate one, then returns it. First call may add ~50ms of latency; subsequent calls in the same period are sub-ms.

### `projected_billable_cost` extrapolation

```
fraction_elapsed = (now() - period_start) / (period_end + 1 day - period_start)
projected_billable_cost = ceil(ai_billable_cost * 100 / fraction_elapsed) / 100
```

Edge cases:

- `fraction_elapsed < 0.05`: dashboard consumers should suppress the projection (display "Insufficient data" or similar). The endpoint still returns the math.
- `ai_billable_cost = 0`: `projected_billable_cost = 0`.
- End-of-period: `fraction_elapsed = 1`, projection = current cost.

## Error responses

### `401 UNAUTHORIZED`

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid authentication" } }
```

Returned for missing Bearer header. (FR-163 gateway path returns `INVALID_API_KEY` for invalid keys; this endpoint follows the same convention via the gateway.)

### `400 INVALID_PERIOD`

```json
{
  "error": {
    "code": "INVALID_PERIOD",
    "message": "period must be 'current' (other values not yet supported)"
  }
}
```

v1.0 only supports `period=current`. Future periods reserved.

### `404 TENANT_NOT_FOUND`

```json
{ "error": { "code": "TENANT_NOT_FOUND", "message": "Tenant not found" } }
```

Returned only on the admin path when `?tenant_id=<X>` doesn't resolve to a row in `tenants`.

### `500 INTERNAL_ERROR`

Any unhandled DB error surfaces as 500 with a generic message; the actual error is logged to the Edge Function console.

## Performance budget

- Cold call (no rollup row exists): ~50-100ms — one `compute_usage_rollup` RPC + one SELECT.
- Warm call (rollup exists): ~10-20ms — single SELECT.
- Compute is bounded by `ai_usage_logs` rows in the period (~10s-100s per tenant in v1.0). bigint COUNT and SUM are sub-ms with `(tenant_id)` index.

## Test coverage

Per quickstart.md scenarios J3.1 (synthetic tenant API key path), J3.2 (admin service-role path with `?tenant_id=`), J3.3 (zero-usage empty period), J3.4 (mid-period projection extrapolation).
