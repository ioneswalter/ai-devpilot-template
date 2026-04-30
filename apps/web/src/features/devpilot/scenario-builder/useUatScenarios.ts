/**
 * FR-141 — Composite hook combining the scenarios list query and the mutations.
 * Exposes a single `useScenarios` API consumed by the panel.
 */

import { useUatScenariosQuery } from './useUatScenariosQuery';
import { useUatScenarioMutations } from './useUatScenarioMutations';

export function useScenarios(conversationId: string | null) {
  const listQuery = useUatScenariosQuery(conversationId);
  const { createMutation, patchMutation, curateMutation, deleteMutation } =
    useUatScenarioMutations(conversationId);

  return {
    scenarios: listQuery.data?.data.scenarios ?? [],
    counts: {
      total: listQuery.data?.data.total ?? 0,
      draft: listQuery.data?.data.draft_count ?? 0,
      curated: listQuery.data?.data.curated_count ?? 0,
      happy: listQuery.data?.data.happy_path_count ?? 0,
      edge: listQuery.data?.data.edge_case_count ?? 0,
    },
    isLoading: listQuery.isLoading,
    listError: listQuery.error,
    refetch: listQuery.refetch,

    createScenario: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    patchScenario: patchMutation.mutateAsync,
    isPatching: patchMutation.isPending,
    patchError: patchMutation.error,

    curateScenario: curateMutation.mutateAsync,
    isCurating: curateMutation.isPending,
    curateError: curateMutation.error,

    deleteScenario: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    deleteError: deleteMutation.error,
  };
}
