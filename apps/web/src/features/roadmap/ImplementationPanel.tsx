/**
 * ImplementationPanel - AI implementation workflow UI for FR-105
 * Shown when transitioning approved → in_development.
 * Engineers can review, accept/reject, edit, and comment on tasks.
 */

import { useEffect, useRef, useState } from 'react';
import { useImplementation } from './useImplementation';
import { ImplementationTaskCard } from './ImplementationTaskCard';
import { ImplementationStartForm } from './ImplementationStartForm';
import { ImplementationLog } from './ImplementationLog';
import { ImplementationFooter } from './ImplementationFooter';
import { ImplementationSummary } from './ImplementationSummary';
import { AddTaskForm } from './AddTaskForm';
import { WriteCodeProgress } from './WriteCodeProgress';
import { BuildCheckPanel } from './BuildCheckPanel';

interface ImplementationPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  onClose: () => void;
  onComplete: () => void;
}

export function ImplementationPanel({
  featureId,
  featureCode,
  featureTitle,
  featureStatus,
  onClose,
  onComplete,
}: ImplementationPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const hasScrolledToLog = useRef(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isWritingCode, setIsWritingCode] = useState(false);
  const [showBuildCheck, setShowBuildCheck] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  const impl = useImplementation(featureId);

  // Auto-scroll to log when panel opens with an active implementation
  // NOTE: must be before any early returns to satisfy React hooks rules
  useEffect(() => {
    if (!hasScrolledToLog.current && impl.isImplementing && logRef.current) {
      hasScrolledToLog.current = true;
      requestAnimationFrame(() => {
        logRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
  }, [impl.isImplementing]);

  // Show loading while data is being fetched or component just mounted
  if (!ready || impl.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading implementation details...</p>
      </div>
    );
  }

  // No request yet
  if (!impl.request) {
    // Feature already in_development but no AI request — implemented outside AI workflow
    if (featureStatus === 'in_development') {
      return (
        <div className="flex flex-col h-full">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-1">
              <code className="text-xs font-mono text-blue-600">{featureCode}</code>
              <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
            </div>
          </div>
          <div className="flex-1 p-4 flex items-center justify-center">
            <div className="text-center max-w-xs space-y-3">
              <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-gray-900">Implemented manually</h4>
              <p className="text-xs text-gray-500">
                This feature was implemented outside the AI workflow. You can still start an AI implementation to generate additional code or review tasks.
              </p>
              <button
                onClick={() => impl.requestImplementation().catch(() => {})}
                disabled={impl.isRequesting}
                className="px-4 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {impl.isRequesting ? 'Starting...' : 'Start AI Implementation Anyway'}
              </button>
            </div>
          </div>
          <div className="border-t p-3 flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
          </div>
        </div>
      );
    }

    // Approved feature, no request yet — show start form
    return (
      <ImplementationStartForm
        featureCode={featureCode}
        featureTitle={featureTitle}
        isRequesting={impl.isRequesting}
        requestError={impl.requestError as Error | null}
        onStart={(notes) => impl.requestImplementation(notes).catch(() => {})}
        onClose={onClose}
      />
    );
  }

  const aiPlan = impl.request?.ai_response;
  const showLog = impl.isImplementing || impl.implementedCount > 0 || impl.failedImplCount > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
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

      {/* Error banner */}
      {impl.request?.error_message && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
          {impl.request.error_message}
        </div>
      )}

      {/* Content */}
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

        {/* Task Items */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Implementation Tasks ({impl.taskItems.length})
          </h4>
          <div className="space-y-2">
            {impl.taskItems.map((item, i) => (
              <ImplementationTaskCard
                key={item.id}
                item={item}
                index={i}
                onDecision={(itemId, data) => impl.updateTaskItem(itemId, data)}
                onComment={(itemId, comment) => impl.updateTaskItem(itemId, { comment })}
                isUpdating={impl.isUpdating}
                isImplementing={impl.isImplementing}
              />
            ))}
          </div>
        </div>

        {/* Add manual task */}
        {showAddForm ? (
          <AddTaskForm
            isAdding={impl.isAdding}
            onAdd={(task) => impl.addTaskItem(task).then(() => setShowAddForm(false))}
            onCancel={() => setShowAddForm(false)}
          />
        ) : !impl.isImplementing ? (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 text-xs font-medium text-gray-500 border border-dashed rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            + Add task manually
          </button>
        ) : null}

        {/* Implementation prompt fallback */}
        {!aiPlan && impl.request?.implementation_prompt && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Implementation Prompt
            </h4>
            <pre className="text-xs text-gray-700 bg-gray-50 border rounded-lg p-3 whitespace-pre-wrap overflow-x-auto">
              {impl.request.implementation_prompt}
            </pre>
          </div>
        )}

        {showLog && (
          <ImplementationLog
            ref={logRef}
            taskItems={impl.taskItems}
            isImplementing={impl.isImplementing}
          />
        )}

        {/* Write code progress animation */}
        {isWritingCode && (
          <WriteCodeProgress
            files={impl.taskItems
              .filter(t => t.implementation_status === 'completed' && t.generated_code)
              .map(t => ({ title: t.title, filePath: t.file_path, code: t.generated_code! }))}
            onComplete={() => {
              setIsWritingCode(false);
              setShowBuildCheck(true);
            }}
          />
        )}

        {showBuildCheck && (
          <BuildCheckPanel
            onBuildPass={() => {
              setShowBuildCheck(false);
              impl.markCodeApplied();
            }}
          />
        )}

        {/* Completion summary — shown when all tasks processed, not currently running */}
        {!isWritingCode && !impl.isImplementing && !impl.canImplement && (impl.implementedCount > 0 || impl.failedImplCount > 0) && (
          <ImplementationSummary
            implementedCount={impl.implementedCount}
            failedCount={impl.failedImplCount}
            totalAccepted={impl.acceptedCount}
            featureCode={featureCode}
            codeApplied={impl.request?.code_applied ?? false}
          />
        )}
      </div>

      <ImplementationFooter
        isImplementing={impl.isImplementing}
        canImplement={impl.canImplement}
        isComplete={!impl.canImplement && impl.implementedCount > 0 && !isWritingCode}
        codeApplied={impl.request?.code_applied ?? false}
        taskCount={impl.taskItems.length}
        pendingCount={impl.pendingCount}
        acceptedCount={impl.acceptedCount}
        rejectedCount={impl.rejectedCount}
        implementedCount={impl.implementedCount}
        failedImplCount={impl.failedImplCount}
        onImplement={() => impl.startImplementation()}
        onWriteCode={() => setIsWritingCode(true)}
        onClose={onComplete}
      />
    </div>
  );
}
