# Contract — `POST /promote-memory-row`

## Path

`POST /functions/v1/promote-memory-row`

## Auth

Detect-and-route, same pattern as `/usage-rollup`:

- **Bearer `dp_*`** (FR-163 API key) → `withApiGateway` middleware → caller's `tenantId` is taken from the API key. Caller must additionally be `is_admin=true` on that tenant for the operation to succeed (admin role check happens inside the handler, not in the gateway).
- **Bearer `<JWT>`** → service-role admin path. Validates the JWT, extracts `auth.uid()`, looks up the user's `tenant_id` and `is_admin` from `tenants`/`tenant_members`, enforces `tenant_id` matches the source row's `tenant_id`.
- **No bearer** → `401 UNAUTHORIZED`.

## Request body

```json
{
  "source_table": "prompt_templates" | "ai_learnings",
  "source_id": "<uuid>"
}
```

- `source_table` must be one of `prompt_templates`, `ai_learnings`. Other values → `400 INVALID_TABLE`.
- `source_id` must be a valid UUID. Bad UUID → `400 INVALID_UUID`.

## Response — 200 OK

```json
{
  "data": {
    "audit_id": "<uuid>",
    "source_table": "prompt_templates",
    "source_id": "<uuid>",
    "source_tenant_id": "<uuid>",
    "promoted_by": "<uuid>",
    "anonymisation_diff": [
      {
        "column": "user_prompt_template",
        "replacements": 3,
        "before_excerpt": "...OwnYourGig...",
        "after_excerpt": "...{{tenant}}..."
      }
    ],
    "requires_human_review": true,
    "promoted_at": "<iso8601>",
    "already_shared": false
  }
}
```

If the source row was already `visibility='shared'`, the response is identical except:

- No new audit row is written
- `audit_id` is null
- `already_shared: true`
- `anonymisation_diff: []`
- HTTP status remains 200

## Errors

| Code               | Status | Meaning                                                |
| ------------------ | ------ | ------------------------------------------------------ |
| `UNAUTHORIZED`     | 401    | Missing/invalid bearer token                           |
| `FORBIDDEN`        | 403    | Caller is not an admin on the source tenant            |
| `INVALID_TABLE`    | 400    | `source_table` not in allowed list                     |
| `INVALID_UUID`     | 400    | `source_id` not a UUID                                 |
| `SOURCE_NOT_FOUND` | 404    | Row does not exist or caller cannot see it under RLS   |
| `TENANT_MISMATCH`  | 403    | Caller's tenant differs from source row's tenant       |
| `INTERNAL_ERROR`   | 500    | Unexpected error; logged with full stack on the server |

## Idempotency

Calling `promote-memory-row` for a row that's already `'shared'` is safe and returns 200 with `already_shared: true`. No new audit row, no double-counting. This makes retries safe.

## Anonymisation behaviour

For each text column in the source row (`description`, `system_prompt`, `user_prompt_template` for `prompt_templates`; `title`, `context`, `correction` for `ai_learnings`), the handler:

1. Looks up `tenants.slug` and `tenants.name` for the source tenant.
2. Performs case-insensitive `replaceAll(slug, '{{tenant}}')` then `replaceAll(name, '{{tenant}}')`.
3. Records an entry in `anonymisation_diff` for any column where replacements > 0.

`requires_human_review` is set `true` if:

- Any column had > 2 replacements (suggests heavy tenant-specific phrasing), OR
- The `context` column on `ai_learnings` is non-empty after replacement (context fields often carry contextual identifiers)

Operators are expected to scan `requires_human_review=true` rows before treating them as durable shared learnings; v1.0 ships no automation for this review beyond the flag.
