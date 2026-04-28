/**
 * ImplementationSummary — Shows completion status and next steps after implementation finishes.
 */

interface ImplementationSummaryProps {
  implementedCount: number;
  failedCount: number;
  totalAccepted: number;
  featureCode: string;
  codeApplied?: boolean;
}

export function ImplementationSummary({
  implementedCount,
  failedCount,
  totalAccepted,
  codeApplied,
}: ImplementationSummaryProps) {
  const allFailed = implementedCount === 0;
  // Treat as success when most tasks passed (even if a few failed)
  const isSuccess = implementedCount > 0 && !allFailed;

  return (
    <div
      className={`rounded-lg p-4 border ${
        allFailed
          ? 'bg-red-50 border-red-200'
          : isSuccess
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <StatusIcon isSuccess={isSuccess} allFailed={allFailed} />
        <div className="flex-1">
          <h4
            className={`text-sm font-semibold ${
              allFailed ? 'text-red-900' : isSuccess ? 'text-green-900' : 'text-amber-900'
            }`}
          >
            {codeApplied
              ? 'Code Applied to Project'
              : allFailed
                ? 'Code Generation Failed'
                : `${implementedCount} Tasks Ready to Write`}
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            {codeApplied
              ? `${implementedCount} task${implementedCount > 1 ? 's' : ''} applied successfully.`
              : `Generated code for ${implementedCount} of ${totalAccepted} tasks.`}
            {failedCount > 0 &&
              !codeApplied &&
              ` ${failedCount} skipped (too large — can be split manually later).`}
          </p>
          {!codeApplied && !allFailed && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-700">Next steps:</p>
              <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                <li>Review generated code in each task card (click to expand)</li>
                <li>
                  Click <strong>Write Code</strong> to apply the {implementedCount} completed tasks
                </li>
                {failedCount > 0 && (
                  <li>Skipped tasks can be broken down and re-implemented separately</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ isSuccess, allFailed }: { isSuccess: boolean; allFailed: boolean }) {
  if (allFailed) {
    return (
      <svg
        className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    );
  }
  return (
    <svg
      className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isSuccess ? 'text-green-600' : 'text-amber-600'}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
