/**
 * FR-163 J1 — Helpers for API key generation, hashing, and prefix extraction.
 *
 * Raw keys are 32-byte random strings prefixed with `dp_` (DevPilot) for
 * identification. The hash stored in `api_keys.key_hash` is SHA-256 hex of
 * the full raw key. The first 8 chars (`dp_aBcDeF`) are stored as `key_prefix`
 * for human-readable identification in the admin UI without exposing the
 * secret.
 */

const RAW_KEY_PREFIX = 'dp_';
const RAW_KEY_BODY_LENGTH = 32; // bytes of randomness → 64 hex chars

/** Generate a fresh raw API key. Format: `dp_<32-byte-random-hex>`. */
export function generateRawKey(): string {
  const bytes = new Uint8Array(RAW_KEY_BODY_LENGTH);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return RAW_KEY_PREFIX + hex;
}

/** SHA-256 hash of the raw key, hex-encoded. Stored in `api_keys.key_hash`. */
export async function hashKey(rawKey: string): Promise<string> {
  const buf = new TextEncoder().encode(rawKey);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** First 8 chars of the raw key for human identification. Stored in `key_prefix`. */
export function keyPrefix(rawKey: string): string {
  return rawKey.slice(0, 8);
}

/** Heuristic: does this Bearer token look like a DevPilot API key? */
export function isApiKeyShape(token: string): boolean {
  return (
    token.startsWith(RAW_KEY_PREFIX) &&
    token.length === RAW_KEY_PREFIX.length + RAW_KEY_BODY_LENGTH * 2
  );
}
