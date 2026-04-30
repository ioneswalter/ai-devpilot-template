/**
 * FR-141 — Mutations for UAT scenarios (create, patch, curate, delete).
 * Optimistic invalidation tied to the conversation list query key.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uatScenariosApi } from '@/lib/api/uat-scenarios-api';
import type { CreateScenarioInput, PatchScenarioInput, CurateRequest } from '@ownyourgig/types';
import { SCENARIOS_QUERY_KEY } from './useUatScenariosQuery';

export function useUatScenarioMutations(conversationId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: [SCENARIOS_QUERY_KEY, 'conversation', conversationId],
    });

  const createMutation = useMutation({
    mutationFn: (input: CreateScenarioInput) => uatScenariosApi.create(input),
    onSuccess: invalidate,
  });
  const patchMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchScenarioInput }) =>
      uatScenariosApi.patch(id, input),
    onSuccess: invalidate,
  });
  const curateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input?: CurateRequest }) =>
      uatScenariosApi.curate(id, input ?? { promote_pending_to: 'accepted' }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => uatScenariosApi.delete(id),
    onSuccess: invalidate,
  });

  return { createMutation, patchMutation, curateMutation, deleteMutation };
}
