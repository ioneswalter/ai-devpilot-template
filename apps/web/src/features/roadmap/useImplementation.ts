/**
 * useImplementation - TanStack Query hook for FR-105 implementation workflow.
 * Drives task-by-task code generation: each call processes ONE task, then
 * the frontend triggers the next until all are done.
 */

import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { ImplementationRequestWithItems } from '@/lib/api/admin-api';

const IMPL_KEY = ['implementation-request'];

export function useImplementation(featureId: string | null) {
  const queryClient = useQueryClient();
  const abortRef = useRef(false);

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
    // Poll every 3s while implementation is running
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && data.status === 'implementing') return 3000;
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

  /**
   * Implementation loop: calls implement-next repeatedly, one task at a time.
   * Each call processes ONE task and returns. Frontend refetches between calls
   * so the UI updates in real time.
   */
  const implementMutation = useMutation({
    mutationFn: async () => {
      const requestId = implQuery.data!.id;
      abortRef.current = false;

      // Loop: process one task per iteration
      let consecutiveErrors = 0;
      while (!abortRef.current) {
        try {
          const res = await adminApi.implementNextTask(requestId);
          consecutiveErrors = 0;

          // Refetch to update UI with latest task statuses
          await queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });

          if (res.data.done) {
            break;
          }
        } catch (err) {
          consecutiveErrors++;
          console.error('Implementation task error:', err);
          // Refetch so UI shows current state
          await queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
          // Stop after 3 consecutive errors to avoid infinite loop
          if (consecutiveErrors >= 3) {
            throw err;
          }
        }
      }
    },
    onMutate: () => {
      // Optimistically set status to 'implementing' so polling starts
      queryClient.setQueryData([...IMPL_KEY, featureId], (old: ImplementationRequestWithItems | null) => {
        if (!old) return old;
        return { ...old, status: 'implementing' };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...IMPL_KEY, featureId] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: (data: { item_id: string; decision?: string; title?: string; description?: string; comment?: string }) =>
      adminApi.updateTaskItem(data),
    onMutate: async (data) => {
      // Cancel in-flight refetches so they don't overwrite optimistic update
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
      // Rollback on error
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

  const taskItems = implQuery.data?.task_items ?? [];
  // Exclude split parent tasks — their subtasks replace them
  const activeItems = taskItems.filter(t => (t.implementation_status as string) !== 'split');
  const acceptedItems = activeItems.filter(t => t.decision === 'accepted' || t.decision === 'modified');
  // Only show as "implementing" if the frontend loop is actually running.
  const isImplementing = implementMutation.isPending;

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
    isImplementing,
    implementedCount: activeItems.filter(t => t.implementation_status === 'completed').length,
    generatingCount: activeItems.filter(t => t.implementation_status === 'generating').length,
    failedImplCount: activeItems.filter(t => t.implementation_status === 'failed').length,
    canImplement: acceptedItems.length > 0 && acceptedItems.some(t => t.implementation_status === 'pending'),

    // Actions
    isRequesting: requestMutation.isPending,
    requestError: requestMutation.error,
    requestImplementation: (notes?: string) => requestMutation.mutateAsync({ notes }),

    implementError: implementMutation.error,
    startImplementation: () => implementMutation.mutateAsync(),

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
