/**
 * ImplementationPanel - AI implementation workflow UI for FR-105
 * Shown when transitioning approved → in_development.
 * Engineers can review, accept/reject, edit, and comment on tasks.
 */

import { useEffect, useRef, useState } from 'react';
import { useImplementation } from './useImplementation';
import { ImplementationTaskCard } from './ImplementationTaskCard';

interface ImplementationPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  onClose: () => void;
  onComplete: () => void;
}

export function ImplementationPanel({
  featureId,
  featureCode,
  featureTitle,
  onClose,
  onComplete,
}: ImplementationPanelProps) {
  const impl = useImplementation(featureId);
  const logRef = useRef<HTMLDivElement>(null);
  const hasScrolledToLog = useRef(false);
  const [notes, setNotes] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFilePath, setNewFilePath] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTaskType, setNewTaskType] = useState<string>('create');

  function handleStart() {
    impl.requestImplementation(notes || undefined).catch(() => {
      // Error available via impl.requestError
    });
  }

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

  function handleAddTask() {
    if (newTitle.trim() && newFilePath.trim()) {
      impl.addTaskItem({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        file_path: newFilePath.trim(),
        task_type: newTaskType,
      }).then(() => {
        setNewTitle('');
        setNewFilePath('');
        setNewDescription('');
        setShowAddForm(false);
      });
    }
  }

  // No request yet — show start form
  if (!impl.isLoading && !impl.request) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
          <p className="text-xs text-gray-500">
            Start the AI implementation workflow to generate a detailed implementation plan.
          </p>
        </div>

        <div className="flex-1 p-4">
          {impl.isRequesting ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-xs">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <svg className="animate-spin w-16 h-16 text-blue-200" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <svg className="absolute inset-0 w-16 h-16 text-blue-500 p-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">AI is generating the implementation plan...</h4>
                <p className="text-xs text-gray-500">
                  Analyzing acceptance criteria, test cases, and project patterns. This may take 30-60 seconds.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Implementation Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add constraints, priorities, or special instructions for the AI..."
                  className="w-full text-sm border rounded-lg px-3 py-2 h-24 resize-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                />
              </div>

              {impl.requestError && (
                <p className="text-xs text-red-600">
                  {(impl.requestError as Error).message}
                </p>
              )}

              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Start AI Implementation
              </button>
            </div>
          )}
        </div>

        <div className="border-t p-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (impl.isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="border rounded-lg p-3 animate-pulse">
              <div className="flex gap-2 mb-2">
                <div className="h-5 w-16 bg-gray-200 rounded" />
                <div className="h-5 w-12 bg-gray-100 rounded" />
              </div>
              <div className="h-4 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const aiPlan = impl.request?.ai_response;

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
            impl.request?.status === 'completed' ? 'bg-green-100 text-green-700' :
            impl.request?.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-blue-100 text-blue-700'
          }`}>
            {impl.request?.status}
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
        {/* Summary */}
        {aiPlan?.summary && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1">Summary</h4>
            <p className="text-sm text-blue-900">{aiPlan.summary}</p>
          </div>
        )}

        {/* Architecture Notes */}
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
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Add Task</h4>
            <div className="flex gap-2">
              <select
                value={newTaskType}
                onChange={(e) => setNewTaskType(e.target.value)}
                className="text-xs border rounded px-2 py-1.5 bg-white"
              >
                <option value="create">Create</option>
                <option value="modify">Modify</option>
                <option value="test">Test</option>
                <option value="config">Config</option>
              </select>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title..."
                className="flex-1 text-sm border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
              />
            </div>
            <input
              type="text"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              placeholder="File path (e.g., apps/web/src/...)"
              className="w-full text-xs font-mono border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
            />
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)..."
              className="w-full text-xs border rounded px-2 py-1.5 h-16 resize-none focus:ring-1 focus:ring-blue-300"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddTask}
                disabled={!newTitle.trim() || !newFilePath.trim() || impl.isAdding}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {impl.isAdding ? 'Adding...' : 'Add Task'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
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

        {/* Live Implementation Log — inside scrollable area */}
        {(impl.isImplementing || impl.implementedCount > 0 || impl.failedImplCount > 0) && (
          <div ref={logRef} className="bg-gray-900 rounded-lg p-3 font-mono text-xs">
            <div className="flex items-center gap-2 mb-2 text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="uppercase tracking-wider font-semibold">Implementation Log</span>
            </div>
            {impl.taskItems
              .filter(t => t.implementation_status !== 'pending')
              .map((t) => (
                <div key={t.id} className="flex items-start gap-2 py-0.5">
                  {t.implementation_status === 'generating' && (
                    <span className="text-yellow-400 flex-shrink-0">
                      <svg className="w-3 h-3 animate-spin inline" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </span>
                  )}
                  {t.implementation_status === 'completed' && (
                    <span className="text-green-400 flex-shrink-0">✓</span>
                  )}
                  {t.implementation_status === 'failed' && (
                    <span className="text-red-400 flex-shrink-0">✗</span>
                  )}
                  <span className={
                    t.implementation_status === 'generating' ? 'text-yellow-300' :
                    t.implementation_status === 'completed' ? 'text-green-300' :
                    'text-red-300'
                  }>
                    {t.title}
                    <span className="text-gray-500 ml-2">{t.file_path}</span>
                    {t.ai_log && <span className="text-gray-400 ml-2">— {t.ai_log}</span>}
                  </span>
                </div>
              ))}
            {impl.isImplementing && (
              <div className="text-gray-500 mt-1 animate-pulse">▊</div>
            )}
          </div>
        )}
      </div>

      {/* Footer — always visible, never pushed off screen */}
      <div className="border-t flex-shrink-0">
        {/* Progress bar */}
        {impl.isImplementing && (
          <div className="px-4 py-2 bg-blue-50">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-3.5 h-3.5 text-blue-600 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs font-medium text-blue-700">
                Generating code... {impl.implementedCount}/{impl.acceptedCount} tasks completed
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${impl.acceptedCount > 0 ? (impl.implementedCount / impl.acceptedCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        <div className="p-3 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          {impl.taskItems.length > 0 && !impl.isImplementing && (
            <>
              <span className="text-gray-500">{impl.pendingCount} pending</span>
              <span className="text-green-600">{impl.acceptedCount} accepted</span>
              <span className="text-red-500">{impl.rejectedCount} rejected</span>
            </>
          )}
          {impl.isImplementing && (
            <span className="text-xs text-gray-500">Implementation continues in the background if you close this panel.</span>
          )}
          {impl.implementedCount > 0 && !impl.isImplementing && (
            <span className="text-blue-600">{impl.implementedCount} generated</span>
          )}
          {impl.failedImplCount > 0 && (
            <span className="text-red-500">{impl.failedImplCount} failed</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onComplete}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {impl.isImplementing ? 'Minimize' : 'Close'}
          </button>
          {impl.canImplement && !impl.isImplementing && (
            <button
              onClick={() => impl.startImplementation()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Implement
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
