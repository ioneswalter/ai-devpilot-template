/**
 * Hook for conversation list and CRUD operations
 * Uses TanStack Query for caching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { devpilotApi } from '@/lib/api-client';

const CONVERSATIONS_KEY = ['devpilot-conversations'];

export function useConversations(statusFilter?: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;

  const listQuery = useQuery({
    queryKey: [...CONVERSATIONS_KEY, statusFilter],
    queryFn: () => devpilotApi.getConversations(statusFilter),
    staleTime: 30_000,
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: (title?: string) => devpilotApi.createConversation(title ? { title } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (conversationId: string) => devpilotApi.archiveConversation(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });

  return {
    conversations: listQuery.data?.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    refetch: listQuery.refetch,
    createConversation: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    archiveConversation: archiveMutation.mutateAsync,
    isArchiving: archiveMutation.isPending,
  };
}
