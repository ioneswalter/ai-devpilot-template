/**
 * useComplianceReport — TanStack Query hook for FR-139 compliance panel.
 * Gathers generated code from implementation task items and validates
 * against the constitution via the FR-138 API.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { testApiMethods } from '@/lib/api/test-api';
import type { ComplianceReport } from './compliance-types';
import type { ImplementationTaskItem } from '@/lib/api/feature-api';

const COMPLIANCE_KEY = ['compliance-report'];

interface UseComplianceReportOptions {
  featureId: string;
  taskItems: ImplementationTaskItem[];
  enabled?: boolean;
}

interface UseComplianceReportResult {
  report: ComplianceReport | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useComplianceReport({
  featureId,
  taskItems,
  enabled = true,
}: UseComplianceReportOptions): UseComplianceReportResult {
  const queryClient = useQueryClient();

  const filesWithCode = taskItems.filter(
    (t) => t.generated_code && t.file_path,
  );
  const hasFiles = filesWithCode.length > 0;

  const complianceQuery = useQuery({
    queryKey: [...COMPLIANCE_KEY, featureId],
    queryFn: async (): Promise<ComplianceReport | null> => {
      if (!hasFiles) return null;

      const files = filesWithCode.map((t) => ({
        path: t.file_path,
        content: t.generated_code!,
      }));

      const result = await testApiMethods.validateConstitution(files);
      return result as ComplianceReport;
    },
    enabled: enabled && hasFiles,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    report: complianceQuery.data ?? null,
    isLoading: complianceQuery.isLoading && hasFiles,
    isError: complianceQuery.isError,
    error: complianceQuery.error as Error | null,
    refetch: () => {
      queryClient.invalidateQueries({
        queryKey: [...COMPLIANCE_KEY, featureId],
      });
    },
  };
}
