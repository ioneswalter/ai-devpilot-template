/**
 * PipelineStatusSection - Pipeline progress, CI, and deploy status display
 * Extracted from ImplementationPanel to stay under 300-line constitution limit.
 * FR-142: Integrates DeployProgressPanel with real-time step visualization.
 */

import { useQuery } from '@tanstack/react-query';
import { CIResultsPanel } from './CIResultsPanel';
import { DeployProgressPanel } from './DeployProgressPanel';
import { ReadinessStatusPanel } from './ReadinessStatusPanel';
import { useDeployProgress } from './useDeployProgress';
import { useReleaseFeature } from './useReleaseFeature';
import { supabase } from '@/lib/supabase-client';
import type { PipelineRun, CIResults, DeployResults, ReadinessResults } from '@/lib/api/admin-api';

interface PipelineStatusSectionProps {
  isPipelineRunning: boolean;
  pipelineProgress: { completed: number; total: number; failed: number } | null;
  pipelineCurrentTask: {
    id: string;
    title: string;
    file_path: string;
    implementation_status: string;
  } | null;
  isCancellingPipeline: boolean;
  onCancelPipeline: () => void;
  isCIRunning: boolean;
  ciResults: CIResults | null;
  onRerunCI: () => void;
  isRerunningCI: boolean;
  isDeploying: boolean;
  deployResults: DeployResults | null;
  onRedeploy: () => void;
  isRedeploying: boolean;
  isReadying: boolean;
  readinessResults: ReadinessResults | null;
  onRerunReadiness: () => void;
  isRerunningReadiness: boolean;
  pipeline: PipelineRun | null;
  // FR-146: Release feature props
  featureId?: string;
  featureStatus?: string;
  featureUpdatedAt?: string | null;
}

export function PipelineStatusSection({
  isPipelineRunning,
  pipelineProgress,
  pipelineCurrentTask,
  isCancellingPipeline,
  onCancelPipeline,
  isCIRunning,
  ciResults,
  onRerunCI,
  isRerunningCI,
  isDeploying,
  deployResults,
  onRedeploy,
  isRedeploying,
  isReadying,
  readinessResults,
  onRerunReadiness,
  isRerunningReadiness,
  pipeline,
  featureId,
  featureStatus,
  featureUpdatedAt,
}: PipelineStatusSectionProps) {
  // FR-146: Release feature hook + test counts
  const releaseFeature = useReleaseFeature();
  const testCountsQuery = useQuery({
    queryKey: ['test-counts', featureId],
    queryFn: async () => {
      if (!featureId) return { total: 0, passed: 0, failed: 0 };
      const { data } = await supabase
        .from('test_cases')
        .select('passed')
        .eq('feature_id', featureId);
      const total = data?.length ?? 0;
      const passed = data?.filter((t) => t.passed === true).length ?? 0;
      const failed = data?.filter((t) => t.passed === false).length ?? 0;
      return { total, passed, failed };
    },
    enabled: !!featureId && (featureStatus === 'in_testing' || featureStatus === 'released'),
    staleTime: 10_000,
  });
  const testCounts = testCountsQuery.data ?? { total: 0, passed: 0, failed: 0 };

  // FR-142: Use deploy progress hook for real-time step data
  const showDeployPanel =
    isDeploying ||
    !!deployResults ||
    pipeline?.current_stage === 'escalated' ||
    featureStatus === 'in_testing' ||
    featureStatus === 'released';
  const deployProgress = useDeployProgress(pipeline?.id ?? null, showDeployPanel);

  const currentStage = deployProgress.data?.current_stage ?? pipeline?.current_stage ?? '';
  const escalations = deployProgress.data?.escalations ?? [];
  const hasDeployResults =
    !!deployResults || deployProgress.data?.deploy_results?.overall_status === 'success';

  return (
    <>
      {/* Pipeline progress (FR-113) */}
      {isPipelineRunning && pipelineProgress && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
              Server Pipeline Running
            </h4>
            <button
              onClick={() => onCancelPipeline()}
              disabled={isCancellingPipeline}
              className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
            >
              {isCancellingPipeline ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
          <div className="w-full bg-indigo-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(5, (pipelineProgress.completed / pipelineProgress.total) * 100)}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-indigo-700">
            <span>
              {pipelineProgress.completed}/{pipelineProgress.total} tasks
            </span>
            {pipelineProgress.failed > 0 && (
              <span className="text-red-600">{pipelineProgress.failed} failed</span>
            )}
            {pipelineCurrentTask && (
              <span className="text-indigo-500 truncate">Current: {pipelineCurrentTask.title}</span>
            )}
          </div>
        </div>
      )}

      {/* CI validation in progress (FR-114) */}
      {isCIRunning && (
        <div className="bg-violet-50 border border-violet-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
            <h4 className="text-xs font-semibold text-violet-800 uppercase tracking-wider">
              CI Validation Running
            </h4>
          </div>
          <p className="text-xs text-violet-600">
            TypeScript, ESLint, and test validation in progress...
          </p>
        </div>
      )}

      {/* CI results display (FR-114) */}
      {ciResults && !isCIRunning && (
        <CIResultsPanel ciResults={ciResults} onRerun={onRerunCI} isRerunning={isRerunningCI} />
      )}

      {/* FR-142: Deploy progress panel (replaces old spinner + DeployStatusPanel) */}
      {showDeployPanel && (
        <DeployProgressPanel
          deployResults={deployProgress.data?.deploy_results ?? deployResults}
          escalations={escalations}
          isDeploying={isDeploying}
          currentStage={currentStage}
          lastHeartbeat={deployProgress.data?.last_heartbeat ?? null}
          onRedeploy={onRedeploy}
          isRedeploying={isRedeploying}
          onAcknowledge={deployProgress.acknowledge}
          onResolve={deployProgress.resolve}
          isAcknowledging={deployProgress.isAcknowledging}
          isResolving={deployProgress.isResolving}
          releaseGating={
            featureId && featureStatus
              ? {
                  featureStatus,
                  totalTests: testCounts?.total ?? 0,
                  passedTests: testCounts?.passed ?? 0,
                  failedTests: testCounts?.failed ?? 0,
                  hasDeployResults,
                  onRelease: () => releaseFeature.release(featureId),
                  isReleasing: releaseFeature.isReleasing,
                  releaseError: releaseFeature.error,
                  featureUpdatedAt: featureUpdatedAt ?? null,
                }
              : undefined
          }
        />
      )}

      {/* Readying in progress (FR-116) */}
      {isReadying && (
        <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin" />
            <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wider">
              Preparing for Testing
            </h4>
          </div>
          <p className="text-xs text-teal-600">
            Seeding test data, generating test cases, updating status...
          </p>
        </div>
      )}

      {/* Readiness results (FR-116) */}
      {readinessResults && !isReadying && (
        <ReadinessStatusPanel
          readinessResults={readinessResults}
          onRerunReadiness={onRerunReadiness}
          isRerunning={isRerunningReadiness}
        />
      )}

      {/* Pipeline completed/failed status */}
      {pipeline && pipeline.status !== 'running' && pipeline.status !== 'completed' && (
        <div
          className={`border rounded-lg p-3 text-xs ${
            pipeline.status === 'cancelled'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : pipeline.status === 'failed'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-gray-50 border-gray-200 text-gray-700'
          }`}
        >
          Pipeline {pipeline.status}
          {pipeline.error_message ? `: ${pipeline.error_message}` : ''}
        </div>
      )}
    </>
  );
}
