/**
 * FR-141 — Generation hook. Calls uat-scenarios-generate (non-streaming v1) and
 * invalidates the scenarios list so newly inserted drafts appear in the storyboard.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uatScenariosApi } from '@/lib/api/uat-scenarios-api';

export function useUatScenarioGenerator(conversationId: string | null) {
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: ({ mode }: { mode: 'initial' | 'more' }) => {
      if (!conversationId) throw new Error('Missing conversation_id');
      return uatScenariosApi.generate(conversationId, mode);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['uat-scenarios', 'conversation', conversationId],
      });
    },
  });

  return {
    generate: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generationError: generateMutation.error,
    lastResult: generateMutation.data?.data ?? null,
  };
}
