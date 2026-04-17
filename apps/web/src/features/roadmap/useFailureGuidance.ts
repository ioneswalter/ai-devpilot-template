/**
 * TanStack Query hook for failure guidance data (FR-137 T001)
 * Fetches AI-generated failure guidance for a feature's test failures.
 */

import { useQuery } from '@tanstack/react-query';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { FailureGuidance, GuidanceGroup } from './automation-test-types';

interface UseFailureGuidanceResult {
  guidance: Array<FailureGuidance & { test_case_title: string }>;
  groups: GuidanceGroup[];
  isLoading: boolean;
  error: Error | null;
}

export function useFailureGuidance(featureId: string | undefined): UseFailureGuidanceResult {
  const query = useQuery({
    queryKey: ['failure-guidance', featureId],
    queryFn: () => testAutomationApi.getGuidance(featureId!),
    enabled: !!featureId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    guidance: query.data?.guidance ?? [],
    groups: query.data?.groups ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}
