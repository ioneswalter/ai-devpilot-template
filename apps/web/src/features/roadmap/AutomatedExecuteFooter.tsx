/**
 * Footer action bar for AutomatedExecuteView.
 */

interface AutomatedExecuteFooterProps {
  phase: string;
  onBack: () => void;
  onClose: () => void;
  onStopTests: () => void;
  onRunAll: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  markedCount: number;
  extensionAvailable: boolean;
  hasScripts: boolean;
  allPassed: boolean;
}

export function AutomatedExecuteFooter({
  phase,
  onBack,
  onClose,
  onStopTests,
  onRunAll,
  onSubmit,
  isSubmitting,
  markedCount,
  extensionAvailable,
  hasScripts,
  allPassed,
}: AutomatedExecuteFooterProps) {
  return (
    <div className="border-t p-3 flex items-center justify-between bg-white">
      <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700">
        Back to Overview
      </button>
      <div className="flex gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
          Close
        </button>
        {phase === 'running' && (
          <button
            onClick={onStopTests}
            className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Stop Tests
          </button>
        )}
        {phase === 'ready' && hasScripts && !allPassed && (
          <button
            onClick={onRunAll}
            disabled={!extensionAvailable}
            className="px-4 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Run All Tests
          </button>
        )}
        {phase === 'done' && markedCount > 0 && (
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : `Submit ${markedCount} Results`}
          </button>
        )}
      </div>
    </div>
  );
}
