/**
 * useDeployProgress - TanStack Query hook for real-time deploy progress polling (FR-142)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { DeployProgressResponse } from '@/lib/api/admin-api';

const POLL_INTERVAL = 3000; // 3-second polling
const STALE_TIME = 2000;
const GC_TIME = 5 * 60 * 1000; // Keep cached for 5 min after unmount (J5 nav resilience)

export function useDeployProgress(pipelineId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  const query = useQuery<DeployProgressResponse>({
    queryKey: ['deploy-progress', pipelineId],
    queryFn: async () => {
      if (!pipelineId) throw new Error('No pipeline ID');
      const result = await adminApi.getDeployProgress(pipelineId);
      return result.data;
    },
    enabled: enabled && !!pipelineId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_INTERVAL;
      // Stop polling if deploy is complete and no active escalations
      const stage = data.current_stage;
      const hasActiveEscalation = data.escalations.some(
        (e) => e.status === 'open' || e.status === 'acknowledged'
      );
      if (stage === 'deployed' && !hasActiveEscalation) return false;
      if (stage === 'deploy_failed' && !hasActiveEscalation) return false;
      // Keep polling during deploying, escalated, or active escalations
      return POLL_INTERVAL;
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (escalationId: string) => adminApi.acknowledgeEscalation(escalationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-progress', pipelineId] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ escalationId, notes }: { escalationId: string; notes: string }) =>
      adminApi.resolveEscalation(escalationId, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deploy-progress', pipelineId] });
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    acknowledge: acknowledgeMutation.mutate,
    isAcknowledging: acknowledgeMutation.isPending,
    resolve: (escalationId: string, notes: string) =>
      resolveMutation.mutate({ escalationId, notes }),
    isResolving: resolveMutation.isPending,
  };
}
