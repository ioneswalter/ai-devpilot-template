/**
 * DeployStatusPanel - Display deployment results (FR-115)
 * Shows migration and function deployment step-by-step results
 */

import { useState } from 'react';
import type { DeployResults, DeployStepResult } from '@/lib/api/admin-api';

function StepRow({ step }: { step: DeployStepResult }) {
  const [expanded, setExpanded] = useState(false);
  const icon = step.status === 'success' ? '\u2713' : step.status === 'skipped' ? '\u2014' : '\u2717';
  const color = step.status === 'success' ? 'text-green-700 bg-green-100' : step.status === 'skipped' ? 'text-gray-500 bg-gray-100' : 'text-red-700 bg-red-100';
  const label = step.action === 'execute_sql' ? 'Migration' : 'Function';

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${color}`}>{icon}</span>
          <span className="text-xs text-gray-500">{label}</span>
          <span className="text-xs font-medium text-gray-800 truncate max-w-[200px]">{step.artifact}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {step.duration_ms > 0 && <span>{(step.duration_ms / 1000).toFixed(1)}s</span>}
          {step.error && (
            <button onClick={() => setExpanded(v => !v)} className="text-red-500 hover:underline">
              {expanded ? 'hide' : 'error'}
            </button>
          )}
        </div>
      </div>
      {expanded && step.error && (
        <div className="mt-1 ml-7 text-xs bg-red-50 border border-red-100 rounded p-2 font-mono text-red-700 break-all">
          {step.error}
        </div>
      )}
    </div>
  );
}

interface DeployStatusPanelProps {
  deployResults: DeployResults;
  onRedeploy: () => void;
  isRedeploying: boolean;
}

export function DeployStatusPanel({ deployResults, onRedeploy, isRedeploying }: DeployStatusPanelProps) {
  const allSteps = [...deployResults.migrations, ...deployResults.functions];
  const successCount = allSteps.filter(s => s.status === 'success').length;
  const failedCount = allSteps.filter(s => s.status === 'failed').length;
  const allSuccess = deployResults.overall_status === 'success';

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${allSuccess ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${allSuccess ? 'text-emerald-800' : 'text-orange-800'}`}>
          Deployment {allSuccess ? 'Complete' : deployResults.overall_status === 'partial' ? 'Partial' : 'Failed'}
        </h4>
        {!allSuccess && (
          <button
            onClick={onRedeploy}
            disabled={isRedeploying}
            className="px-2 py-1 text-xs text-emerald-600 border border-emerald-200 rounded hover:bg-emerald-50 disabled:opacity-50"
          >
            {isRedeploying ? 'Re-deploying...' : 'Re-deploy'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        {successCount > 0 && <span className="text-green-600">{successCount} succeeded</span>}
        {failedCount > 0 && <span className="text-red-600">{failedCount} failed</span>}
      </div>

      {allSteps.length > 0 && (
        <div className="divide-y divide-gray-100">
          {allSteps.map((step, i) => <StepRow key={i} step={step} />)}
        </div>
      )}

      {allSteps.length === 0 && (
        <p className="text-xs text-gray-500">No server-side artifacts deployed</p>
      )}
    </div>
  );
}
