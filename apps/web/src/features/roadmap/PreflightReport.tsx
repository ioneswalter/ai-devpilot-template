/**
 * PreflightReport — Shows preflight validation results before test execution.
 * Blocks execution on errors, allows bypass on warnings only.
 */

import type { PreflightResult, PreflightIssue } from './usePreflightValidation';

interface PreflightReportProps {
  result: PreflightResult;
  onRetry: () => void;
  onRunAnyway: () => void;
  isRetrying: boolean;
}

export function PreflightReport({
  result,
  onRetry,
  onRunAnyway,
  isRetrying,
}: PreflightReportProps) {
  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div
        className={`p-4 rounded-lg border ${
          hasErrors ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}
      >
        <h3 className={`text-sm font-bold ${hasErrors ? 'text-red-800' : 'text-amber-800'}`}>
          {hasErrors ? 'Preflight Failed' : 'Preflight Warnings'}
        </h3>
        <p className={`text-xs mt-1 ${hasErrors ? 'text-red-600' : 'text-amber-600'}`}>
          {hasErrors
            ? `${result.errors.length} issue${result.errors.length !== 1 ? 's' : ''} must be fixed before running tests.`
            : `${result.warnings.length} warning${result.warnings.length !== 1 ? 's' : ''} detected — tests may be unreliable.`}
        </p>
      </div>

      {/* Errors */}
      {hasErrors && <IssueList issues={result.errors} type="error" />}

      {/* Warnings */}
      {hasWarnings && <IssueList issues={result.warnings} type="warning" />}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isRetrying ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Re-checking...
            </span>
          ) : (
            'Re-check Preflight'
          )}
        </button>

        {!hasErrors && hasWarnings && (
          <button
            onClick={onRunAnyway}
            className="px-4 py-2 text-sm font-medium text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50"
          >
            Run Anyway
          </button>
        )}

        {hasErrors && (
          <span className="text-xs text-gray-500">Fix the errors above, then re-check.</span>
        )}
      </div>
    </div>
  );
}

function IssueList({ issues, type }: { issues: PreflightIssue[]; type: 'error' | 'warning' }) {
  const colors =
    type === 'error'
      ? {
          bg: 'bg-red-50',
          border: 'border-red-200',
          badge: 'bg-red-100 text-red-700',
          text: 'text-red-700',
          suggestion: 'text-red-600',
        }
      : {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          badge: 'bg-amber-100 text-amber-700',
          text: 'text-amber-700',
          suggestion: 'text-amber-600',
        };

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg divide-y ${colors.border}`}>
      {issues.map((issue, idx) => (
        <div key={idx} className="px-4 py-3">
          <div className="flex items-start gap-2">
            <span
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${colors.badge} shrink-0 mt-0.5`}
            >
              {issue.code}
            </span>
            <div className="min-w-0">
              <p className={`text-xs font-medium ${colors.text}`}>{issue.message}</p>
              {issue.scriptTitle && (
                <p className="text-[11px] text-gray-500 mt-0.5">
                  in "{issue.scriptTitle}"{issue.stepNumber ? ` — step ${issue.stepNumber}` : ''}
                </p>
              )}
              <p className={`text-[11px] mt-1 ${colors.suggestion}`}>Fix: {issue.suggestion}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
