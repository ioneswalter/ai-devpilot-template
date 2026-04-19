/**
 * useUATPackage — TanStack Query hook for UAT package data (FR-129)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';

const UAT_KEY = (featureId: string) => ['uat-package', featureId] as const;

export function useUATPackage(featureId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: UAT_KEY(featureId),
    queryFn: async () => {
      const res = await adminApi.getPackage(featureId);
      return res.data;
    },
    staleTime: 10_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => adminApi.generatePackage(featureId, 'manual'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UAT_KEY(featureId) }),
  });

  const updateItemMutation = useMutation({
    mutationFn: (vars: { itemId: string; decision: string; feedback?: string }) => {
      const packageId = query.data?.package?.id;
      if (!packageId) throw new Error('No package');
      return adminApi.updateItemDecision(packageId, vars.itemId, vars.decision, vars.feedback);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UAT_KEY(featureId) }),
  });

  const approveMutation = useMutation({
    mutationFn: (vars: { action: 'approve' | 'reject'; feedback?: string }) => {
      const packageId = query.data?.package?.id;
      if (!packageId) throw new Error('No package');
      return adminApi.approvePackage(packageId, vars.action, vars.feedback);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: UAT_KEY(featureId) }),
  });

  return {
    ...computeCounts(query.data),
    isLoading: query.isLoading,
    error: query.error,
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generateError: generateMutation.error,
    updateItem: updateItemMutation.mutateAsync,
    isUpdating: updateItemMutation.isPending,
    approve: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    approveError: approveMutation.error,
  };
}

function computeCounts(data: { package: unknown; checklist_items: Array<{ decision: string }> } | null | undefined) {
  const pkg = (data?.package as ReturnType<typeof useUATPackage>['package']) ?? null;
  const items = data?.checklist_items ?? [];
  return {
    package: pkg,
    items: items as ReturnType<typeof useUATPackage>['items'],
    pendingCount: items.filter((i) => i.decision === 'pending').length,
    passedCount: items.filter((i) => i.decision === 'pass').length,
    failedCount: items.filter((i) => i.decision === 'fail').length,
    deferredCount: items.filter((i) => i.decision === 'defer').length,
  };
}
