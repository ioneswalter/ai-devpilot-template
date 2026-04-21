/** ImplementationPanel - AI implementation workflow UI (FR-105) */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import { supabase } from '@/lib/supabase-client';
import { CopyableCommand } from '@/components/ui/CopyableCommand';
import { useImplementation } from './useImplementation';
import { ImplementationStartForm } from './ImplementationStartForm';
import { ImplementationLog } from './ImplementationLog';
import { ImplementationFooter } from './ImplementationFooter';
import { ImplementationSummary } from './ImplementationSummary';
import { AddTaskForm } from './AddTaskForm';
import { WriteCodeFlow } from './WriteCodeFlow';
import { PipelineStatusSection } from './PipelineStatusSection';
import { LearningInsightsPanel } from './LearningInsightsPanel';
import { PipelineDashboard } from './PipelineDashboard';
import { CompliancePanel } from './CompliancePanel';
import { SpecRequiredGate, ReviewBlockingGate, ManualImplGate } from './ImplementationGates';
import { VersionGroupedTasks } from './VersionGroupedTasks';

interface ImplementationPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
  onComplete: () => void;
}

export function ImplementationPanel({
  featureId, featureCode, featureTitle, featureStatus, onClose, onComplete,
}: ImplementationPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const hasScrolledToLog = useRef(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isWritingCode, setIsWritingCode] = useState(false);
  const [ready, setReady] = useState(false);
  const [isAcceptingAll, setIsAcceptingAll] = useState(false);
  const [complianceBlocked, setComplianceBlocked] = useState(false);
  const handleComplianceBlocked = useCallback((blocked: boolean) => {
    setComplianceBlocked(blocked);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  const impl = useImplementation(featureId);

  // FR-149 v1.1: Detect if feature has a newer version that needs building
  const versionQuery = useQuery({
    queryKey: ['feature-version-build', featureId],
    queryFn: async () => {
      const { data: versions } = await supabase
        .from('feature_versions')
        .select('id, version_label, version_number, superseded_by, status')
        .eq('feature_id', featureId)
        .order('version_number', { ascending: false });
      if (!versions || versions.length === 0) return null;
      const current = versions.find(v => v.superseded_by === null);
      if (!current || current.version_number <= 1) return null;
      return { currentLabel: current.version_label, currentStatus: current.status, priorLabel: versions.find(v => v.superseded_by !== null)?.version_label ?? 'v1.0' };
    },
    staleTime: 30_000,
  });
  const versionInfo = versionQuery.data;

  const specReviewQuery = useQuery({
    queryKey: ['spec-review-gate', featureId],
    queryFn: async () => {
      try { return (await adminApi.getReview(featureId)).data.review; }
      catch { return null; }
    },
    enabled: featureStatus === 'specified',
    staleTime: 5_000,
  });
  const specReviewStatus = specReviewQuery.data?.status ?? null;
  const specReviewBlocking = featureStatus === 'specified' && specReviewStatus === 'in_review';
  const specReviewSentBack = featureStatus === 'specified' && specReviewStatus === 'sent_back';

  useEffect(() => {
    if (!hasScrolledToLog.current && impl.isImplementing && logRef.current) {
      hasScrolledToLog.current = true;
      requestAnimationFrame(() => {
        logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }, [impl.isImplementing]);

  if (!ready || impl.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading implementation details...</p>
      </div>
    );
  }

  if (!impl.request && (featureStatus === 'proposed' || featureStatus === 'reviewed')) {
    return <SpecRequiredGate featureCode={featureCode} featureTitle={featureTitle} featureStatus={featureStatus} onClose={onClose} />;
  }

  if (!impl.request && (specReviewBlocking || specReviewSentBack)) {
    return <ReviewBlockingGate featureCode={featureCode} featureTitle={featureTitle} isSentBack={specReviewSentBack} onClose={onClose} />;
  }

  if (!impl.request) {
    if (featureStatus === 'in_development') {
      return <ManualImplGate featureCode={featureCode} featureTitle={featureTitle} isRequesting={impl.isRequesting} onStartAnyway={() => impl.requestImplementation().catch(() => {})} onClose={onClose} />;
    }
    return (
      <ImplementationStartForm
        featureCode={featureCode} featureTitle={featureTitle}
        isRequesting={impl.isRequesting} requestError={impl.requestError as Error | null}
        onStart={(notes) => impl.requestImplementation(notes).catch(() => {})}
        onClose={onClose}
      />
    );
  }

  const aiPlan = impl.request?.ai_response;
  const showLog = impl.isImplementing || impl.implementedCount > 0 || impl.failedImplCount > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate flex-1">{featureTitle}</h3>
          {impl.pendingCount > 0 && !impl.isImplementing && (
            <button
              onClick={() => { setIsAcceptingAll(true); impl.acceptAllTasks().finally(() => setIsAcceptingAll(false)); }}
              disabled={isAcceptingAll || impl.isUpdating}
              className="px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shrink-0"
            >
              {isAcceptingAll ? 'Accepting...' : `Accept All (${impl.pendingCount})`}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Requested by: {impl.request?.requested_by_name ?? 'Admin'}</span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${
            impl.request?.status === 'completed' && impl.pendingCount > 0 ? 'bg-amber-100 text-amber-700' :
            impl.request?.status === 'completed' ? 'bg-green-100 text-green-700' :
            impl.request?.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {impl.request?.status === 'completed' && impl.pendingCount > 0 ? 'Awaiting Review' : impl.request?.status}
          </span>
        </div>
      </div>

      {impl.request?.error_message && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">{impl.request.error_message}</div>
      )}

      {versionInfo && (
        <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-purple-100 text-purple-700">{versionInfo.currentLabel}</span>
            <span className="text-sm font-medium text-purple-900">
              {featureStatus === 'specified' ? 'New version ready to build' :
               featureStatus === 'in_testing' ? 'Version built — ready to deploy' :
               featureStatus === 'in_development' ? 'Version build in progress' :
               'New version'}
            </span>
          </div>
          <p className="text-xs text-purple-700">
            {featureStatus === 'specified'
              ? <>Run <CopyableCommand command={`\\build ${featureCode}`} className="bg-purple-100" /> in Claude Code to implement the {versionInfo.currentLabel} delta.</>
              : featureStatus === 'in_testing'
              ? <>The {versionInfo.currentLabel} build is complete. Run <CopyableCommand command="\\deploy" className="bg-purple-100" /> to deploy changes to production.</>
              : <>The {versionInfo.currentLabel} implementation is in progress.</>
            }
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {aiPlan?.summary && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">Summary</h4>
            <p className="text-sm text-blue-900">{aiPlan.summary}</p>
          </div>
        )}
        {aiPlan?.architecture_notes && (
          <div className="bg-gray-50 border rounded-lg p-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Architecture Notes</h4>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{aiPlan.architecture_notes}</p>
          </div>
        )}

        <VersionGroupedTasks taskItems={impl.taskItems} versionInfo={versionInfo} onDecision={(id, data) => impl.updateTaskItem(id, data)} onComment={(id, comment) => impl.updateTaskItem(id, { comment })} isUpdating={impl.isUpdating} isImplementing={impl.isImplementing} />

        {showAddForm ? (
          <AddTaskForm isAdding={impl.isAdding} onAdd={(task) => impl.addTaskItem(task).then(() => setShowAddForm(false))} onCancel={() => setShowAddForm(false)} />
        ) : !impl.isImplementing ? (
          <button onClick={() => setShowAddForm(true)} className="w-full py-2 text-xs font-medium text-gray-500 border border-dashed rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors">+ Add task manually</button>
        ) : null}

        {!aiPlan && impl.request?.implementation_prompt && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Implementation Prompt</h4>
            <pre className="text-xs text-gray-700 bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap overflow-x-auto">{impl.request.implementation_prompt}</pre>
          </div>
        )}

        <CompliancePanel featureId={featureId} taskItems={impl.taskItems} onBlockedChange={handleComplianceBlocked} />

        <PipelineStatusSection isPipelineRunning={impl.isPipelineRunning} pipelineProgress={impl.pipelineProgress} pipelineCurrentTask={impl.pipelineCurrentTask} isCancellingPipeline={impl.isCancellingPipeline} onCancelPipeline={() => impl.cancelPipeline().catch(() => {})} isCIRunning={impl.isCIRunning} ciResults={impl.ciResults} onRerunCI={impl.rerunCI} isRerunningCI={impl.isRerunningCI} isDeploying={impl.isDeploying} deployResults={impl.deployResults} onRedeploy={impl.redeploy} isRedeploying={impl.isRedeploying} isReadying={impl.isReadying} readinessResults={impl.readinessResults} onRerunReadiness={impl.rerunReadiness} isRerunningReadiness={impl.isRerunningReadiness} pipeline={impl.pipeline} featureId={featureId} featureStatus={featureStatus} />
        <PipelineDashboard />
        <LearningInsightsPanel />

        {showLog && <ImplementationLog ref={logRef} taskItems={impl.taskItems} isImplementing={impl.isImplementing} pipelineLogs={impl.pipelineLogs} />}

        {isWritingCode && (
          <WriteCodeFlow
            files={impl.taskItems.filter(t => t.implementation_status === 'completed' && t.generated_code).map(t => ({ title: t.title, filePath: t.file_path, code: t.generated_code! }))}
            onComplete={() => { setIsWritingCode(false); impl.markCodeApplied(); }}
            onCancel={() => setIsWritingCode(false)}
          />
        )}

        {!isWritingCode && !impl.isImplementing && !impl.canImplement && (impl.implementedCount > 0 || impl.failedImplCount > 0) && (
          <ImplementationSummary implementedCount={impl.implementedCount} failedCount={impl.failedImplCount} totalAccepted={impl.acceptedCount} featureCode={featureCode} codeApplied={impl.request?.code_applied ?? false} />
        )}
      </div>

      <ImplementationFooter
        isImplementing={impl.isImplementing} canImplement={impl.canImplement}
        isComplete={!impl.canImplement && impl.implementedCount > 0 && !isWritingCode}
        codeApplied={impl.request?.code_applied ?? false}
        complianceBlocked={complianceBlocked}
        taskCount={impl.taskItems.length} pendingCount={impl.pendingCount}
        acceptedCount={impl.acceptedCount} rejectedCount={impl.rejectedCount}
        implementedCount={impl.implementedCount} failedImplCount={impl.failedImplCount}
        onImplement={() => impl.startImplementation()} onWriteCode={() => setIsWritingCode(true)}
        onClose={onComplete}
      />
    </div>
  );
}
