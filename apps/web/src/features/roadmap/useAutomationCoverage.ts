/**
 * Hook for automation coverage metrics (FR-109 J5)
 */

import { useState, useCallback, useEffect } from 'react';
import { testAutomationApi } from '@/lib/api/test-automation-api';
import type { AutomationCoverage } from './automation-types';

interface UseAutomationCoverageReturn {
  coverage: AutomationCoverage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAutomationCoverage(featureId: string): UseAutomationCoverageReturn {
  const [coverage, setCoverage] = useState<AutomationCoverage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await testAutomationApi.getCoverage(featureId);
      setCoverage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coverage');
    } finally {
      setLoading(false);
    }
  }, [featureId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { coverage, loading, error, refresh };
}
