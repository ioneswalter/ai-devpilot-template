/**
 * PipelineStatusSection - Pipeline progress, CI, and deploy status display
 * Extracted from ImplementationPanel to stay under 300-line constitution limit.
 */

import { CIResultsPanel } from './CIResultsPanel';
import { DeployStatusPanel } from './DeployStatusPanel';
import type { PipelineRun, CIResults, DeployResults } from '@/lib/api/admin-api';

interface PipelineStatusSectionProps {
  isPipelineRunning: boolean;
  pipelineProgress: { completed: number; total: number; failed: number } | null;
  pipelineCurrentTask: { id: string; title: string; file_path: string; implementation_status: string } | null;
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
  pipeline: PipelineRun | null;
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
  pipeline,
}: PipelineStatusSectionProps) {
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
              style={{ width: `${Math.max(5, (pipelineProgress.completed / pipelineProgress.total) * 100)}%` }}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-indigo-700">
            <span>{pipelineProgress.completed}/{pipelineProgress.total} tasks</span>
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
          <p className="text-xs text-violet-600">TypeScript, ESLint, and test validation in progress...</p>
        </div>
      )}

      {/* CI results display (FR-114) */}
      {ciResults && !isCIRunning && (
        <CIResultsPanel ciResults={ciResults} onRerun={onRerunCI} isRerunning={isRerunningCI} />
      )}

      {/* Deployment in progress (FR-115) */}
      {isDeploying && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
            <h4 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Deploying</h4>
          </div>
          <p className="text-xs text-emerald-600">Applying migrations and deploying Edge Functions...</p>
        </div>
      )}

      {/* Deploy results (FR-115) */}
      {deployResults && !isDeploying && (
        <DeployStatusPanel deployResults={deployResults} onRedeploy={onRedeploy} isRedeploying={isRedeploying} />
      )}

      {/* Pipeline completed/failed status */}
      {pipeline && pipeline.status !== 'running' && pipeline.status !== 'completed' && (
        <div className={`border rounded-lg p-3 text-xs ${
          pipeline.status === 'cancelled' ? 'bg-amber-50 border-amber-200 text-amber-800' :
          pipeline.status === 'failed' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-gray-50 border-gray-200 text-gray-700'
        }`}>
          Pipeline {pipeline.status}{pipeline.error_message ? `: ${pipeline.error_message}` : ''}
        </div>
      )}
    </>
  );
}
