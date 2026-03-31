/**
 * useTestExecution - TanStack Query hook for FR-106 test execution workflow.
 * Provides test run history, release readiness summary, and mutation
 * to submit test results for a feature.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type {
  TestExecutionEntry,
  ReleaseReadiness,
  TestResultInput,
} from './test-execution-types';

const TEST_RUNS_KEY = ['test-runs'];
const READINESS_KEY = ['release-readiness'];

interface RawTestRun {
  id: string;
  test_case_id: string;
  environment: string;
  result: string;
  error_message: string | null;
  evidence: Record<string, unknown> | null;
  executed_at: string;
  executed_by: string;
  duration_ms: number | null;
  test_cases: { id: string; title: string; test_code: string; feature_id: string };
}

function mapTestRun(raw: RawTestRun): TestExecutionEntry {
  return {
    id: raw.id,
    test_case_id: raw.test_case_id,
    test_code: raw.test_cases?.test_code ?? '',
    test_title: raw.test_cases?.title ?? '',
    test_type: '',
    result: raw.result as TestExecutionEntry['result'],
    notes: raw.error_message,
    evidence: raw.evidence ?? null,
    executed_by: raw.executed_by,
    executed_at: raw.executed_at,
    environment: raw.environment,
  };
}

export function useTestExecution(featureId: string | null) {
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: [...TEST_RUNS_KEY, featureId],
    queryFn: async (): Promise<TestExecutionEntry[]> => {
      if (!featureId) return [];
      const res = await adminApi.getTestRunHistory(featureId);
      return ((res.test_runs ?? []) as unknown as RawTestRun[]).map(mapTestRun);
    },
    staleTime: 10_000,
    retry: false,
    enabled: !!featureId,
  });

  const readinessQuery = useQuery({
    queryKey: [...READINESS_KEY, featureId],
    queryFn: async (): Promise<ReleaseReadiness | null> => {
      if (!featureId) return null;
      const res = await adminApi.getReleaseSummary(featureId);
      return res;
    },
    staleTime: 10_000,
    retry: false,
    enabled: !!featureId,
  });

  const submitMutation = useMutation({
    mutationFn: ({
      environment,
      results,
    }: {
      environment: string;
      results: TestResultInput[];
    }) => adminApi.submitTestRun(featureId!, environment, results),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [...TEST_RUNS_KEY, featureId],
      });
      queryClient.invalidateQueries({
        queryKey: [...READINESS_KEY, featureId],
      });
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
    },
  });

  return {
    history: historyQuery.data ?? [],
    readiness: readinessQuery.data ?? null,
    isLoading: historyQuery.isLoading || readinessQuery.isLoading,
    error: historyQuery.error || readinessQuery.error,

    submitResults: (environment: string, results: TestResultInput[]) =>
      submitMutation.mutate({ environment, results }),
    isSubmitting: submitMutation.isPending,
    isSubmitSuccess: submitMutation.isSuccess,
    submitError: submitMutation.error,
    resetSubmit: submitMutation.reset,
  };
}
