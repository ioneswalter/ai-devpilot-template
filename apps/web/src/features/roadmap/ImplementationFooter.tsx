/**
 * ImplementationFooter — Progress bar, task counts, and action buttons.
 */

interface ImplementationFooterProps {
  isImplementing: boolean;
  canImplement: boolean;
  /** True when all accepted tasks have been processed (none remaining) */
  isComplete: boolean;
  codeApplied: boolean;
  taskCount: number;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  implementedCount: number;
  failedImplCount: number;
  onImplement: () => void;
  onWriteCode: () => void;
  onClose: () => void;
}

export function ImplementationFooter({
  isImplementing,
  canImplement,
  isComplete,
  codeApplied,
  taskCount,
  pendingCount,
  acceptedCount,
  rejectedCount,
  implementedCount,
  failedImplCount,
  onImplement,
  onWriteCode,
  onClose,
}: ImplementationFooterProps) {
  const progressPct = acceptedCount > 0 ? (implementedCount / acceptedCount) * 100 : 0;

  return (
    <div className="border-t flex-shrink-0">
      {isImplementing && (
        <div className="px-4 py-2 bg-blue-50">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-3.5 h-3.5 text-blue-600 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs font-medium text-blue-700">
              Generating code... {implementedCount}/{acceptedCount} tasks completed
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
      <div className="p-3 bg-gray-50 flex items-center justify-between">
        <TaskCounts
          taskCount={taskCount}
          isImplementing={isImplementing}
          pendingCount={pendingCount}
          acceptedCount={acceptedCount}
          rejectedCount={rejectedCount}
          implementedCount={implementedCount}
          failedImplCount={failedImplCount}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {isImplementing ? 'Minimise' : isComplete && !codeApplied ? 'Minimise' : 'Close'}
          </button>
          {canImplement && !isImplementing && (
            <button
              onClick={onImplement}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Implement{acceptedCount - implementedCount - failedImplCount > 0
                ? ` (${acceptedCount - implementedCount - failedImplCount} tasks)`
                : ''}
            </button>
          )}
          {isComplete && !codeApplied && !isImplementing && (
            <button
              onClick={onWriteCode}
              className="px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Write Code ({implementedCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskCounts({
  taskCount, isImplementing, pendingCount, acceptedCount,
  rejectedCount, implementedCount, failedImplCount,
}: Omit<ImplementationFooterProps, 'canImplement' | 'isComplete' | 'codeApplied' | 'onImplement' | 'onWriteCode' | 'onClose'>) {
  const hasImplProgress = implementedCount > 0 || failedImplCount > 0;
  const remainingImplCount = acceptedCount - implementedCount - failedImplCount;

  return (
    <div className="flex items-center gap-3 text-xs">
      {isImplementing && (
        <span className="text-gray-500">
          Implementation continues in the background if you close this panel.
        </span>
      )}
      {!isImplementing && hasImplProgress && (
        <>
          <span className="text-blue-600">{implementedCount} generated</span>
          {failedImplCount > 0 && (
            <span className="text-red-500">{failedImplCount} failed (auto-split)</span>
          )}
          {remainingImplCount > 0 && (
            <span className="text-amber-600">{remainingImplCount} remaining — click Implement to process</span>
          )}
        </>
      )}
      {!isImplementing && !hasImplProgress && taskCount > 0 && (
        <>
          <span className="text-gray-500">{pendingCount} pending</span>
          <span className="text-green-600">{acceptedCount} accepted</span>
          <span className="text-red-500">{rejectedCount} rejected</span>
        </>
      )}
    </div>
  );
}
