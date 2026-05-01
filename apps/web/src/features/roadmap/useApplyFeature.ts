/**
 * FR-159: useApplyFeature — TanStack mutation calling /__api/apply-feature.
 *
 * Replaces WriteCodeFlow.tsx's multi-step orchestration. The browser pre-loads
 * the file list from accepted tasks; this hook posts them to the dev-server
 * endpoint which atomically backs up, writes, runs `tsc`, and rolls back on
 * failure. On success the caller invokes `markCodeApplied` (existing mutation)
 * to flip implementation_requests.code_applied=true.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ApplyFeatureResponse } from '@ownyourgig/types';

interface ApplyFile {
  filePath: string;
  code: string;
}

export interface UseApplyFeatureInput {
  featureCode: string;
  featureId: string;
  files: ApplyFile[];
}

export function useApplyFeature() {
  const queryClient = useQueryClient();
  return useMutation<ApplyFeatureResponse, Error, UseApplyFeatureInput>({
    mutationFn: async ({ featureCode, files }) => {
      const res = await fetch('/__api/apply-feature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_code: featureCode, files }),
      });
      const body = (await res.json()) as ApplyFeatureResponse;
      if (!res.ok && body.status !== 'rolled_back' && body.status !== 'rollback_incomplete') {
        // Server-side error or unexpected non-2xx — surface the message.
        throw new Error(
          'message' in body && typeof body.message === 'string'
            ? body.message
            : `apply-feature failed (HTTP ${res.status})`
        );
      }
      return body;
    },
    onSettled: (_data, _err, { featureId }) => {
      queryClient.invalidateQueries({ queryKey: ['implementation-request', featureId] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-run', featureId] });
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
    },
  });
}
