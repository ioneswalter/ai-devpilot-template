/**
 * CIResultsPanel - Display CI validation results (FR-114)
 * Shows typecheck, lint, and test stage results with error details
 */

import { useState } from 'react';
import type { CIResults, CIStageResult } from '@/lib/api/admin-api';

const CI_STAGE_LABELS: Record<string, string> = { typecheck: 'TypeScript', lint: 'ESLint', test: 'Tests' };

function CIStageRow({ stage, result }: { stage: string; result: CIStageResult }) {
  const lastAttempt = result.attempts[result.attempts.length - 1];
  const errorCount = lastAttempt?.errors?.length ?? 0;

  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
          result.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {result.passed ? '\u2713' : '\u2717'}
        </span>
        <span className="text-xs font-medium text-gray-800">{CI_STAGE_LABELS[stage] ?? stage}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        {result.attempts.length > 1 && <span>{result.attempts.length} attempts</span>}
        {!result.passed && errorCount > 0 && (
          <span className="text-red-600">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

interface CIResultsPanelProps {
  ciResults: CIResults;
  onRerun: () => void;
  isRerunning: boolean;
}

export function CIResultsPanel({ ciResults, onRerun, isRerunning }: CIResultsPanelProps) {
  const allPassed = ciResults.typecheck.passed && ciResults.lint.passed && ciResults.test.passed;
  const [showErrors, setShowErrors] = useState(false);

  const failedErrors: Array<{ stage: string; file: string; line: number; message: string; code: string }> = [];
  for (const [stage, result] of Object.entries(ciResults)) {
    if (!(result as CIStageResult).passed && (result as CIStageResult).attempts.length > 0) {
      const last = (result as CIStageResult).attempts[(result as CIStageResult).attempts.length - 1];
      for (const err of last.errors) {
        failedErrors.push({ stage, ...err });
      }
    }
  }

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${allPassed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${allPassed ? 'text-green-800' : 'text-red-800'}`}>
          CI Validation {allPassed ? 'Passed' : 'Failed'}
        </h4>
        {!allPassed && (
          <button
            onClick={onRerun}
            disabled={isRerunning}
            className="px-2 py-1 text-xs text-violet-600 border border-violet-200 rounded hover:bg-violet-50 disabled:opacity-50"
          >
            {isRerunning ? 'Re-running...' : 'Re-run CI'}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {(['typecheck', 'lint', 'test'] as const).map(stage => (
          <CIStageRow key={stage} stage={stage} result={ciResults[stage]} />
        ))}
      </div>

      {failedErrors.length > 0 && (
        <div>
          <button
            onClick={() => setShowErrors(v => !v)}
            className="text-xs text-red-600 hover:underline"
          >
            {showErrors ? 'Hide errors' : `Show ${failedErrors.length} error(s)`}
          </button>
          {showErrors && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {failedErrors.map((err, i) => (
                <div key={i} className="text-xs bg-white border border-red-100 rounded p-2 font-mono">
                  <span className="text-gray-400">[{CI_STAGE_LABELS[err.stage]}]</span>{' '}
                  <span className="text-gray-600">{err.file}:{err.line}</span>{' '}
                  <span className="text-red-700">{err.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
