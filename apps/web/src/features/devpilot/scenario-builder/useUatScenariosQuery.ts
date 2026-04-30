/**
 * FR-141 — Read-side query for UAT scenarios bound to a conversation.
 * Returns the scenarios + per-status / per-type counts.
 */

import { useQuery } from '@tanstack/react-query';
import { uatScenariosApi } from '@/lib/api/uat-scenarios-api';

export const SCENARIOS_QUERY_KEY = 'uat-scenarios';

export function useUatScenariosQuery(conversationId: string | null) {
  return useQuery({
    queryKey: [SCENARIOS_QUERY_KEY, 'conversation', conversationId],
    queryFn: () => uatScenariosApi.list({ conversation_id: conversationId! }),
    staleTime: 5_000,
    enabled: !!conversationId,
  });
}
