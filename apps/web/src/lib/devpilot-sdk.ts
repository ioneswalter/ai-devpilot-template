/**
 * FR-165 J5 — DevPilot SDK indirection wrapper.
 *
 * Re-exports the existing productApi / pipelineApi / featureApi shapes from
 * `./api/`, plus a `getDevpilotBaseUrl()` helper and a `devpilotFetch()`
 * function that route through `VITE_DEVPILOT_BASE_URL` when set.
 *
 * v1.0 ships this module as the on-ramp for the post-cutover state. Existing
 * call sites are NOT refactored — they continue importing from `./api/...`
 * and resolving against `VITE_SUPABASE_URL`. After cutover (FR-165 v1.1),
 * call sites will migrate to import from this module so the env var flip
 * routes them at the standalone DevPilot DigitalOcean App.
 *
 * The env var defaults to undefined; when unset, devpilotFetch falls back
 * to the current `VITE_SUPABASE_URL/functions/v1/<name>` resolver.
 */

import { productApi } from './api/product-api';
import { pipelineApiMethods } from './api/pipeline-api';
import { featureApiMethods } from './api/feature-api';
import { devpilotApi } from './api/devpilot-api';

// Re-exports — the public API of this module. Keep names aligned with the
// upstream modules so call-site refactors are mechanical.
export {
  productApi,
  pipelineApiMethods as pipelineApi,
  featureApiMethods as featureApi,
  devpilotApi,
};

/**
 * Resolves the base URL for DevPilot Edge Function calls.
 *
 * Priority order:
 *   1. `VITE_DEVPILOT_BASE_URL` if set — the standalone DevPilot DO App
 *   2. `VITE_SUPABASE_URL/functions/v1` — the in-monorepo fallback (default)
 *
 * Returns the base URL with no trailing slash.
 */
export function getDevpilotBaseUrl(): string {
  const override = (import.meta.env.VITE_DEVPILOT_BASE_URL as string | undefined) ?? '';
  if (override.trim().length > 0) {
    return override.replace(/\/+$/, '');
  }
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

/**
 * Reports whether the override is currently active. Useful for displaying
 * a "DevPilot SDK pointed at <staging|monorepo>" debug indicator.
 */
export function isDevpilotOverrideActive(): boolean {
  const override = (import.meta.env.VITE_DEVPILOT_BASE_URL as string | undefined) ?? '';
  return override.trim().length > 0;
}

/**
 * Thin fetch wrapper that resolves URLs against `getDevpilotBaseUrl()`.
 *
 * Cutover-time call sites will use this in place of the existing apiClient;
 * v1.0 leaves apiClient untouched so existing callers keep working.
 */
export async function devpilotFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const base = getDevpilotBaseUrl();
  const path = endpoint.replace(/^\/+/, '');
  return fetch(`${base}/${path}`, options);
}
