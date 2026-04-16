/**
 * DeployProgressPanel - Real-time deployment progress with step visualization (FR-142)
 * Shows individual deployment steps, fix attempts, escalation banners, and success summary.
 */

import { DeployStepRow } from './DeployStepRow';
import { EscalationBanner } from './EscalationBanner';
import type { DeployResults, DeployStepResult, DeployEscalation } from '@/lib/api/admin-api';

interface DeployProgressPanelProps {
  deployResults: DeployResults | null;
  escalations: DeployEscalation[];
  isDeploying: boolean;
  currentStage: string;
  lastHeartbeat: string | null;
  onRedeploy: () => void;
  isRedeploying: boolean;
  onAcknowledge: (escalationId: string) => void;
  onResolve: (escalationId: string, notes: string) => void;
  isAcknowledging: boolean;
  isResolving: boolean;
}

function formatTotalDuration(startedAt: string, completedAt: string): string {
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function isStaleHeartbeat(lastHeartbeat: string | null): boolean {
  if (!lastHeartbeat) return false;
  return Date.now() - new Date(lastHeartbeat).getTime() > 10 * 60 * 1000;
}

function SuccessSummary({ results }: { results: DeployResults }) {
  const migCount = results.migrations.filter(s => s.status === 'success').length;
  const fnCount = results.functions.filter(s => s.status === 'success').length;
  const duration = results.started_at && results.completed_at
    ? formatTotalDuration(results.started_at, results.completed_at) : 'N/A';

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded p-2 space-y-1">
      <h5 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
        Deployment Complete
      </h5>
      <div className="flex flex-wrap gap-3 text-xs text-emerald-700">
        <span>Duration: {duration}</span>
        {migCount > 0 && <span>{migCount} migration(s) applied</span>}
        {fnCount > 0 && <span>{fnCount} function(s) deployed</span>}
        {migCount === 0 && fnCount === 0 && <span>No server-side artifacts</span>}
      </div>
    </div>
  );
}

export function DeployProgressPanel({
  deployResults,
  escalations,
  isDeploying,
  currentStage,
  lastHeartbeat,
  onRedeploy,
  isRedeploying,
  onAcknowledge,
  onResolve,
  isAcknowledging,
  isResolving,
}: DeployProgressPanelProps) {
  const migrations: DeployStepResult[] = deployResults?.migrations
    ? (Array.isArray(deployResults.migrations) ? deployResults.migrations : []) : [];
  const functions: DeployStepResult[] = deployResults?.functions
    ? (Array.isArray(deployResults.functions) ? deployResults.functions : []) : [];
  const allSteps = [...migrations, ...functions];
  const isComplete = deployResults?.overall_status === 'success';
  const isFailed = deployResults?.overall_status === 'failed' || deployResults?.overall_status === 'partial';
  const isEscalated = currentStage === 'escalated';
  const stale = isDeploying && isStaleHeartbeat(lastHeartbeat);

  // Active escalations (open or acknowledged)
  const activeEscalations = escalations.filter(e => e.status === 'open' || e.status === 'acknowledged');

  const borderColor = isEscalated ? 'border-amber-300' : isComplete ? 'border-emerald-200' : isFailed ? 'border-red-200' : 'border-indigo-200';
  const bgColor = isEscalated ? 'bg-amber-50' : isComplete ? 'bg-emerald-50' : isFailed ? 'bg-orange-50' : 'bg-indigo-50';

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${bgColor} ${borderColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isDeploying && !stale && (
            <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin" />
          )}
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${
            isEscalated ? 'text-amber-800' : isComplete ? 'text-emerald-800' : isFailed ? 'text-orange-800' : 'text-indigo-800'
          }`}>
            {isEscalated ? 'Deploy \u2014 Escalated' : isDeploying ? 'Deploying' : isComplete ? 'Deployed' : isFailed ? 'Deploy Failed' : 'Deploy'}
          </h4>
        </div>
        {isFailed && !isEscalated && (
          <button
            onClick={onRedeploy}
            disabled={isRedeploying}
            className="px-2 py-1 text-xs text-emerald-600 border border-emerald-200 rounded hover:bg-emerald-50 disabled:opacity-50"
          >
            {isRedeploying ? 'Re-deploying...' : 'Re-deploy'}
          </button>
        )}
      </div>

      {/* Stale heartbeat warning */}
      {stale && (
        <div className="text-xs bg-amber-100 border border-amber-200 rounded p-2 text-amber-800">
          Stale \u2014 no heartbeat for over 10 minutes. Pipeline may have crashed.
        </div>
      )}

      {/* Escalation banners */}
      {activeEscalations.map(esc => (
        <EscalationBanner
          key={esc.id}
          escalation={esc}
          onAcknowledge={onAcknowledge}
          onResolve={onResolve}
          isAcknowledging={isAcknowledging}
          isResolving={isResolving}
        />
      ))}

      {/* Step counts */}
      {allSteps.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-gray-600">
          {allSteps.filter(s => s.status === 'success').length > 0 && (
            <span className="text-green-600">{allSteps.filter(s => s.status === 'success').length} passed</span>
          )}
          {allSteps.filter(s => s.status === 'failed').length > 0 && (
            <span className="text-red-600">{allSteps.filter(s => s.status === 'failed').length} failed</span>
          )}
          {allSteps.filter(s => s.status === 'running').length > 0 && (
            <span className="text-blue-600">{allSteps.filter(s => s.status === 'running').length} running</span>
          )}
        </div>
      )}

      {/* Migration steps */}
      {migrations.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 mb-1">Migrations</h5>
          <div className="divide-y divide-gray-100">
            {migrations.map((step, i) => <DeployStepRow key={`m-${i}`} step={step} />)}
          </div>
        </div>
      )}

      {/* Function steps */}
      {functions.length > 0 && (
        <div>
          <h5 className="text-xs font-medium text-gray-500 mb-1">Edge Functions</h5>
          <div className="divide-y divide-gray-100">
            {functions.map((step, i) => <DeployStepRow key={`f-${i}`} step={step} />)}
          </div>
        </div>
      )}

      {/* Deploying with no results yet */}
      {isDeploying && allSteps.length === 0 && !stale && (
        <p className="text-xs text-emerald-600">Applying migrations and deploying Edge Functions...</p>
      )}

      {/* No artifacts */}
      {!isDeploying && allSteps.length === 0 && deployResults && (
        <p className="text-xs text-gray-500">No server-side artifacts deployed</p>
      )}

      {/* Success summary */}
      {isComplete && deployResults && <SuccessSummary results={deployResults} />}
    </div>
  );
}
