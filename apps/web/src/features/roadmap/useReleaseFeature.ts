/**
 * useReleaseFeature - TanStack mutation hook for releasing features (FR-146)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';

export function useReleaseFeature() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (featureId: string) => adminApi.releaseFeature(featureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-status'] });
    },
  });

  return {
    release: mutation.mutate,
    isReleasing: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
  };
}
