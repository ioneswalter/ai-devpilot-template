# Contract — Admin API for API Key Lifecycle

## Purpose

Define the admin-side endpoints that create, rotate, and revoke API keys. Backed by the existing `roadmap-admin-features` Edge Function so we don't introduce a new function for this.

## Endpoints

All paths are sub-routes of `roadmap-admin-features` selected via `?action=...`. All require existing admin auth (handled by the parent function).

### `POST /functions/v1/roadmap-admin-features?action=api-key-issue`

Issue a new API key.

**Request body**:

```json
{
  "tenant_id": "<uuid>",
  "name": "OwnYourGig prod kanban poller",
  "scopes": [],
  "rate_limit_per_minute": 60,
  "expires_at": null
}
```

**Response (201 Created)**:

```json
{
  "data": {
    "id": "<uuid>",
    "key_prefix": "dp_a1b2c3",
    "name": "OwnYourGig prod kanban poller",
    "raw_key": "dp_a1b2c3d4e5f6...full-32-byte-value...",
    "rate_limit_per_minute": 60,
    "expires_at": null,
    "created_at": "<iso>"
  }
}
```

The `raw_key` field is ONLY in the issuance response — never in any other API response, never in DB queries (only `key_hash` is stored).

### `POST /functions/v1/roadmap-admin-features?action=api-key-rotate`

Rotate an existing key (revoke old + issue new under same name).

**Request body**:

```json
{ "api_key_id": "<uuid>" }
```

**Response (200 OK)**:

```json
{
  "data": {
    "old_key_id": "<uuid>",
    "old_revoked_at": "<iso>",
    "new_key": {
      "id": "<uuid>",
      "key_prefix": "dp_x9y8z7",
      "name": "OwnYourGig prod kanban poller",
      "raw_key": "dp_x9y8z7...new-32-byte-value...",
      "rate_limit_per_minute": 60,
      "expires_at": null,
      "created_at": "<iso>"
    }
  }
}
```

Both old revocation and new insert happen in a single transaction (`BEGIN ... COMMIT`).

### `POST /functions/v1/roadmap-admin-features?action=api-key-revoke`

Revoke a key.

**Request body**:

```json
{ "api_key_id": "<uuid>" }
```

**Response (200 OK)**:

```json
{
  "data": {
    "id": "<uuid>",
    "revoked_at": "<iso>"
  }
}
```

Idempotent: revoking an already-revoked key returns the existing `revoked_at`.

### `GET /functions/v1/roadmap-admin-features?action=api-keys&tenant_id=<uuid>`

List API keys for a tenant. The raw key is NEVER in this response.

**Response (200 OK)**:

```json
{
  "data": {
    "keys": [
      {
        "id": "<uuid>",
        "key_prefix": "dp_a1b2c3",
        "name": "OwnYourGig prod kanban poller",
        "rate_limit_per_minute": 60,
        "expires_at": null,
        "revoked_at": null,
        "last_used_at": "<iso or null>",
        "created_at": "<iso>"
      }
    ]
  }
}
```

## Auth

All four routes require admin auth. The parent `roadmap-admin-features` Edge Function already validates admin role via the existing `_shared/admin-auth.ts` helper. No new auth surface added.

## Frontend integration

The admin UI renders an "API Keys" panel under the existing Roadmap → Admin module:

- **List view**: table with columns `key_prefix | name | rate_limit | last_used_at | revoked_at | actions`. Actions are Rotate / Revoke buttons.
- **Issue button**: opens a modal with form fields `tenant_id (default: OwnYourGig)`, `name`, `rate_limit_per_minute (default 60)`, `expires_at (optional)`. Submit calls the issuance endpoint.
- **Issuance success modal**: displays the raw key in a `<input readonly>` with a copy-to-clipboard button. Single "I've saved this key" button to close. No X / Esc dismissal until clicked. Copy button uses `navigator.clipboard.writeText`.
- **Rotate flow**: opens the same issuance success modal with the new raw key after the rotate call returns.

## Failure modes

| Mode                         | Response                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| Caller is not an admin       | `403 FORBIDDEN` from `_shared/admin-auth.ts` (existing).         |
| Tenant not found             | `404 TENANT_NOT_FOUND`                                           |
| API key id not found         | `404 API_KEY_NOT_FOUND`                                          |
| Rate limit override negative | `400 INVALID_FIELD: rate_limit_per_minute must be >= 1`          |
| Hash collision on insertion  | Retry once with a fresh random key. After two collisions, `500`. |

## Test coverage

Per quickstart.md scenarios J2.1 (issue), J2.2 (rotate), J2.3 (revoke), J2.4 (list).
