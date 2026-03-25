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

export function ImplementationSummary({ implementedCount, failedCount, totalAccepted, featureCode, codeApplied }: ImplementationSummaryProps) {
  const allSucceeded = failedCount === 0;
  const allFailed = implementedCount === 0;

  return (
    <div className={`rounded-lg p-4 border ${
      allSucceeded ? 'bg-green-50 border-green-200' :
      allFailed ? 'bg-red-50 border-red-200' :
      'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-start gap-3">
        <StatusIcon allSucceeded={allSucceeded} allFailed={allFailed} />
        <div className="flex-1">
          <h4 className={`text-sm font-semibold ${
            allSucceeded ? 'text-green-900' : allFailed ? 'text-red-900' : 'text-amber-900'
          }`}>
            {codeApplied ? 'Implementation Completed' :
             allSucceeded ? 'Code Generated — Ready to Write' :
             allFailed ? 'Code Generation Failed' :
             'Code Partially Generated'}
          </h4>
          <p className="text-xs text-gray-600 mt-1">
            {codeApplied
              ? `${implementedCount} of ${totalAccepted} tasks applied successfully.`
              : `${implementedCount} of ${totalAccepted} tasks ready.`}
            {failedCount > 0 && ` ${failedCount} task${failedCount > 1 ? 's' : ''} failed (exceeded 300-line limit).`}
          </p>
          {!codeApplied && (
            <NextSteps allSucceeded={allSucceeded} failedCount={failedCount} featureCode={featureCode} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ allSucceeded, allFailed }: { allSucceeded: boolean; allFailed: boolean }) {
  const color = allSucceeded ? 'text-green-600' : allFailed ? 'text-red-600' : 'text-amber-600';
  return (
    <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {allSucceeded ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      )}
    </svg>
  );
}

function NextSteps({ allSucceeded, failedCount }: { allSucceeded: boolean; failedCount: number; featureCode: string }) {
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-semibold text-gray-700">Next steps:</p>
      <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
        <li>Review generated code in each task card (click to expand)</li>
        {!allSucceeded && failedCount > 0 && (
          <li>Failed tasks were auto-split into smaller subtasks — click Implement to process them</li>
        )}
        <li>Click <strong>Write Code</strong> to apply generated code to the project</li>
        <li>Run tests to verify the implementation works correctly</li>
      </ul>
    </div>
  );
}
