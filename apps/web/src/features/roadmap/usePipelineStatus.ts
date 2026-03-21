/**
 * TanStack Query hook for batch pipeline status data.
 * Fetches pipeline stage statuses for all features in a single request.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { FeaturePipelineState } from './pipeline-types';

const PIPELINE_QUERY_KEY = ['pipeline-status'] as const;
const STALE_TIME = 10_000; // 10 seconds — matches existing hook patterns

export function usePipelineStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PIPELINE_QUERY_KEY,
    queryFn: async () => {
      const response = await adminApi.getPipelineStatus();
      return response.pipelines;
    },
    staleTime: STALE_TIME,
  });

  /** Look up pipeline state for a specific feature */
  const getPipeline = (featureId: string): FeaturePipelineState | undefined => {
    return query.data?.find((p) => p.feature_id === featureId);
  };

  /** Invalidate cache — call after any panel action completes */
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY });
  };

  return {
    pipelines: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    getPipeline,
    invalidate,
  };
}
