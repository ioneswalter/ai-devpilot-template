/**
 * TestPipelineSteps — Guided 1-2-3 test pipeline (replaces scattered actions)
 * Step 1: Test Data — generate if missing, show ready if exists
 * Step 2: Test Scripts — show automation count, point to \generate-tests
 * Step 3: Run Tests — enabled only when data + scripts ready
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testDataApi, type TestDataSet } from '@/lib/api/test-data-api';

interface TestPipelineStepsProps {
  featureId: string;
  featureCode: string;
  testCaseCount: number;
  automatedCount: number;
  passedCount: number;
  failedCount: number;
  notRunCount: number;
  onRunTests: () => void;
  onRefresh?: () => void;
}

type StepStatus = 'ready' | 'action-needed' | 'loading' | 'blocked';

export function TestPipelineSteps({
  featureId,
  featureCode,
  testCaseCount,
  automatedCount,
  passedCount,
  failedCount,
  notRunCount,
  onRunTests,
  onRefresh,
}: TestPipelineStepsProps) {
  const qc = useQueryClient();

  // Step 1: Check test data
  const { data: datasetsRes, isLoading: datasetsLoading } = useQuery({
    queryKey: ['test-datasets', featureId],
    queryFn: () => testDataApi.list(featureId),
    staleTime: 30_000,
  });
  const datasets: TestDataSet[] = datasetsRes?.data ?? [];
  const activeDatasets = datasets.filter((d) => d.status === 'active').length;
  const hasData = activeDatasets > 0;
  // Any dataset record means generation was run (persists across panel close/reopen)
  const generationRanBefore = datasets.length > 0;
  const noDataNeeded = generationRanBefore && activeDatasets === 0;

  const generateMut = useMutation({
    mutationFn: () => testDataApi.generate(featureId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-datasets', featureId] }),
  });

  // Data step is complete if: has active data, OR generation ran (even with 0 records)
  const justGenerated = generateMut.isSuccess;
  const dataReady = hasData || noDataNeeded || justGenerated;

  // Step statuses
  const dataStatus: StepStatus = datasetsLoading ? 'loading' : dataReady ? 'ready' : 'action-needed';
  const scriptsStatus: StepStatus = !dataReady
    ? 'blocked'
    : automatedCount === testCaseCount && testCaseCount > 0
      ? 'ready'
      : 'action-needed';
  // Allow running tests when data is ready and at least some scripts exist
  const canRun = dataReady && automatedCount > 0;
  const runStatus: StepStatus = canRun
    ? (passedCount === testCaseCount && testCaseCount > 0 ? 'ready' : 'action-needed')
    : 'blocked';

  const allPassed = passedCount === testCaseCount && testCaseCount > 0 && failedCount === 0;

  return (
    <div className="space-y-2">
      {/* Step 1: Test Data */}
      <PipelineStep
        number={1}
        title="Test Data"
        status={dataStatus}
        detail={
          datasetsLoading ? 'Checking...'
            : noDataNeeded ? 'No database records needed — this feature uses API-level testing'
              : hasData ? `${activeDatasets} dataset${activeDatasets !== 1 ? 's' : ''} ready`
                : 'Not checked yet — click Generate to check what data this feature needs'
        }
        action={
          !datasetsLoading && !noDataNeeded ? (
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className={`px-3 py-1 text-xs font-medium rounded-lg disabled:opacity-50 ${
                hasData
                  ? 'text-green-700 border border-green-300 hover:bg-green-100'
                  : 'text-white bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {generateMut.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : hasData ? 'Regenerate' : 'Generate'}
            </button>
          ) : undefined
        }
        error={generateMut.isError ? (generateMut.error instanceof Error ? generateMut.error.message : 'Failed') : undefined}
        success={undefined}
      />

      {/* Step 2: Test Scripts */}
      <PipelineStep
        number={2}
        title="Test Scripts"
        status={scriptsStatus}
        detail={
          scriptsStatus === 'blocked'
            ? 'Generate test data first (step 1)'
            : automatedCount === 0
              ? `No scripts — run \\generate-tests ${featureCode} in Claude Code`
              : `${automatedCount}/${testCaseCount} test cases automated`
        }
        action={
          scriptsStatus !== 'blocked' && automatedCount > 0 && onRefresh ? (
            <button
              onClick={onRefresh}
              className="px-3 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-100"
            >
              Refresh
            </button>
          ) : undefined
        }
      />

      {/* Step 3: Run Tests */}
      <PipelineStep
        number={3}
        title="Run Tests"
        status={runStatus}
        detail={
          runStatus === 'blocked'
            ? 'Complete steps 1 and 2 first'
            : allPassed
              ? `All ${passedCount} tests passed`
              : failedCount > 0
                ? `${failedCount} failed, ${passedCount} passed, ${notRunCount} not run`
                : notRunCount > 0
                  ? `${passedCount} passed, ${notRunCount} not yet run`
                  : 'Ready to run'
        }
        action={
          runStatus !== 'blocked' && !allPassed ? (
            <button
              onClick={onRunTests}
              className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
            >
              Run Tests
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

function PipelineStep({
  number,
  title,
  status,
  detail,
  action,
  error,
  success,
}: {
  number: number;
  title: string;
  status: StepStatus;
  detail: string;
  action?: React.ReactNode;
  error?: string;
  success?: string;
}) {
  const colors: Record<StepStatus, { bg: string; border: string; badge: string; text: string }> = {
    ready: { bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-600 text-white', text: 'text-green-700' },
    'action-needed': { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500 text-white', text: 'text-amber-700' },
    loading: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-400 text-white', text: 'text-gray-500' },
    blocked: { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-300 text-gray-500', text: 'text-gray-400' },
  };

  const c = colors[status];

  return (
    <div className={`${c.bg} border ${c.border} rounded-lg px-3 py-2.5 flex items-center gap-3`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.badge}`}>
        {status === 'ready' ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : number}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-900">{title}</span>
          {action}
        </div>
        <p className={`text-[11px] mt-0.5 ${c.text}`}>{detail}</p>
        {error && <p className="text-[11px] text-red-600 mt-0.5">{error}</p>}
        {success && <p className="text-[11px] text-green-600 mt-0.5">{success}</p>}
      </div>
    </div>
  );
}
