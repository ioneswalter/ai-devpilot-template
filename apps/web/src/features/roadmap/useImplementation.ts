/**
 * useImplementation - TanStack Query hook for FR-105 implementation workflow.
 * FR-113: Now uses server-side pipeline orchestration instead of browser loop.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type {
  ImplementationRequestWithItems,
  ImplementationTaskItem,
  PipelineRun,
  PipelineRunStatus,
} from '@/lib/api/admin-api';

const IMPL_KEY = ['implementation-request'];
const PIPELINE_KEY = ['pipeline-run'];

export function useImplementation(featureId: string | null) {
  const queryClient = useQueryClient();

  // ── Implementation request + tasks ──
  const implQuery = useQuery({
    queryKey: [...IMPL_KEY, featureId],
    queryFn: async (): Promise<ImplementationRequestWithItems | null> => {
      if (!featureId) return null;
      try {
        const res = await adminApi.getImplementation(featureId);
        return res.data;
      } catch (err) {
        if (err instanceof Error && err.message.includes('No implementation request exists')) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === 'implementing') return 3000;
      return false;
    },
    retry: false,
    enabled: !!featureId,
  });

  // ── Pipeline status polling (FR-113) ──
  const pipelineQuery = useQuery({
    queryKey: [...PIPELINE_KEY, featureId],
    queryFn: async (): Promise<PipelineRunStatus | null> => {
      if (!featureId) return null;
      try {
        const res = await adminApi.getPipelineRunStatus(featureId);
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 2_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.active?.status === 'running') return 3000;
      return false;
    },
    retry: false,
    enabled: !!featureId,
  });

  const requestMutation = useMutation({
    mutationFn: ({ notes }: { notes?: string } = {}) =>
      adminApi.requestImplementation(featureId!, notes),
    onSuccess: (res) => {
      queryClient.setQueryData([...IMPL_KEY, featureId], res.data);
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
    },
  });

  // ── Server-side pipeline start (FR-113) ──
  const startPipelineMutation = useMutation({
    mutationFn: async () => {
      const requestId = implQuery.data!.id;
      return adminApi.startPipeline(featureId!, requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...PIPELINE_KEY, featureId] });
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  });

  // ── Cancel pipeline (FR-113) ──
  const cancelPipelineMutation = useMutation({
    mutationFn: async () => {
      const pipelineId = pipelineQuery.data?.active?.id;
      if (!pipelineId) throw new Error('No active pipeline to cancel');
      return adminApi.cancelPipeline(pipelineId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...PIPELINE_KEY, featureId] });
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (data: { item_id: string; decision?: string; title?: string; description?: string; comment?: string }) =>
      adminApi.updateTaskItem(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: [...IMPL_KEY, featureId] });
      const previous = queryClient.getQueryData<ImplementationRequestWithItems>([...IMPL_KEY, featureId]);
      if (previous) {
        queryClient.setQueryData([...IMPL_KEY, featureId], {
          ...previous,
          task_items: previous.task_items.map((t) =>
            t.id === data.item_id ? { ...t, ...data, item_id: undefined } : t,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData([...IMPL_KEY, featureId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; file_path: string; task_type: string }) =>
      adminApi.addTaskItem({ request_id: implQuery.data?.id ?? '', ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  });

  const taskItems: ImplementationTaskItem[] = implQuery.data?.task_items ?? [];
  const activeItems = taskItems.filter(t => (t.implementation_status as string) !== 'split');
  const acceptedItems = activeItems.filter(t => t.decision === 'accepted' || t.decision === 'modified');

  // Pipeline state (FR-113)
  const activePipeline: PipelineRun | null = pipelineQuery.data?.active ?? null;
  const isPipelineRunning = activePipeline?.status === 'running';
  const pipelineCurrentTask = pipelineQuery.data?.current_task ?? null;

  return {
    request: implQuery.data ?? null,
    taskItems,
    isLoading: implQuery.isLoading,
    error: implQuery.error,

    // Counts (exclude split parent tasks)
    pendingCount: activeItems.filter(t => t.decision === 'pending').length,
    acceptedCount: acceptedItems.length,
    rejectedCount: activeItems.filter(t => t.decision === 'rejected').length,

    // Implementation progress (exclude split parent tasks)
    isImplementing: isPipelineRunning,
    implementedCount: activeItems.filter(t => t.implementation_status === 'completed').length,
    generatingCount: activeItems.filter(t => t.implementation_status === 'generating').length,
    failedImplCount: activeItems.filter(t => t.implementation_status === 'failed').length,
    canImplement: acceptedItems.length > 0 && acceptedItems.some(t => t.implementation_status === 'pending'),

    // Pipeline state (FR-113)
    pipeline: activePipeline,
    pipelineCurrentTask,
    pipelineLogs: activePipeline?.logs ?? [],
    isPipelineRunning,
    pipelineProgress: activePipeline
      ? { completed: activePipeline.completed_tasks, total: activePipeline.total_tasks, failed: activePipeline.failed_tasks }
      : null,

    // Actions
    isRequesting: requestMutation.isPending,
    requestError: requestMutation.error,
    requestImplementation: (notes?: string) => requestMutation.mutateAsync({ notes }),

    // FR-113: Server-side pipeline actions
    startPipelineError: startPipelineMutation.error,
    isStartingPipeline: startPipelineMutation.isPending,
    startPipeline: () => startPipelineMutation.mutateAsync(),

    cancelPipelineError: cancelPipelineMutation.error,
    isCancellingPipeline: cancelPipelineMutation.isPending,
    cancelPipeline: () => cancelPipelineMutation.mutateAsync(),

    // Legacy: kept for compatibility but now triggers server-side pipeline
    implementError: startPipelineMutation.error,
    startImplementation: () => startPipelineMutation.mutateAsync(),

    isUpdating: updateItemMutation.isPending,
    updateError: updateItemMutation.error,
    updateTaskItem: (itemId: string, data: { decision?: string; title?: string; description?: string; comment?: string }) =>
      updateItemMutation.mutateAsync({ item_id: itemId, ...data }),

    isAdding: addItemMutation.isPending,
    addTaskItem: (data: { title: string; description?: string; file_path: string; task_type: string }) =>
      addItemMutation.mutateAsync(data),

    markCodeApplied: async () => {
      const requestId = implQuery.data?.id;
      if (!requestId) return;
      await adminApi.markCodeApplied(requestId);
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  };
}
