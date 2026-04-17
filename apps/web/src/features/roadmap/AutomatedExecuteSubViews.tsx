/**
 * AutomatedExecuteSubViews — Sub-components extracted from AutomatedExecuteView.
 * RunningProgress, BrowserSuiteResultSummary, FailureDetail
 */

import { PhaseIndicator } from './AutomatedExecuteWidgets';
import type { BrowserSuiteResult, BrowserScriptResult } from './useAutomatedTests';

/** Real-time progress during test execution with live results */
export function RunningProgress({
  progress,
  liveResults,
}: {
  progress: { current: number; total: number; scriptTitle: string } | null;
  scripts: Array<{ test_case_title: string }>;
  liveResults: BrowserScriptResult[];
}) {
  if (!progress) {
    return <PhaseIndicator label="Preparing test execution..." />;
  }

  const pct = Math.round((progress.current / progress.total) * 100);
  const passed = liveResults.filter((r) => r.result === 'passed').length;
  const failed = liveResults.filter((r) => r.result !== 'passed').length;

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            Running test {progress.current} of {progress.total}
          </p>
          <p className="text-xs text-gray-500 truncate">{progress.scriptTitle}</p>
        </div>
        <span className="text-xs font-mono text-indigo-600">{pct}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Live running tally */}
      {liveResults.length > 0 && (
        <div className="flex gap-3 text-xs justify-center">
          <span className="text-green-600 font-medium">{passed} passed</span>
          {failed > 0 && <span className="text-red-600 font-medium">{failed} failed</span>}
          <span className="text-gray-400">{progress.total - liveResults.length} remaining</span>
        </div>
      )}

      {/* Completed test results — fills remaining space */}
      {liveResults.length > 0 && (
        <div className="border rounded-lg divide-y flex-1 overflow-y-auto min-h-0">
          {liveResults.map((r) => (
            <div key={r.script_id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                r.result === 'passed' ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="flex-1 truncate text-gray-700">{r.test_case_title}</span>
              <span className={`text-[10px] font-medium ${
                r.result === 'passed' ? 'text-green-600' : 'text-red-600'
              }`}>
                {r.result === 'passed' ? 'Pass' : 'Fail'}
              </span>
              <span className="text-[10px] text-gray-400 w-10 text-right">
                {(r.duration_ms / 1000).toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Suite result summary with real timing */
export function BrowserSuiteResultSummary({ result }: { result: BrowserSuiteResult }) {
  const isPass = result.is_release_ready;
  return (
    <div className={`p-4 rounded-lg border ${
      isPass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        {isPass ? (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        )}
        <h4 className={`text-sm font-semibold ${isPass ? 'text-green-800' : 'text-red-800'}`}>
          {isPass ? 'All Tests Passed' : 'Some Tests Failed'}
        </h4>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="text-green-700">{result.passed} passed</span>
        {result.failed > 0 && <span className="text-red-700">{result.failed} failed</span>}
        {result.errors > 0 && <span className="text-red-700">{result.errors} errors</span>}
        {result.skipped_stale > 0 && <span className="text-amber-700">{result.skipped_stale} skipped (stale)</span>}
        <span className="text-gray-500">{(result.duration_ms / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}

/** Show step-by-step failure details for a script */
export function FailureDetail({ scriptResult }: { scriptResult: BrowserScriptResult }) {
  return (
    <div className="border border-red-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-red-50 border-b border-red-200">
        <span className="text-xs font-medium text-red-800">{scriptResult.test_case_title}</span>
        <span className="text-[10px] text-red-600 ml-2">
          {scriptResult.steps_completed}/{scriptResult.steps_total} steps passed
        </span>
      </div>
      <div className="divide-y divide-red-100">
        {scriptResult.step_results?.map((step) => (
          <div
            key={step.step_number}
            className={`px-3 py-1.5 flex items-start gap-2 text-xs ${
              step.passed ? 'text-gray-600' : 'text-red-700 bg-red-50/50'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${
              step.passed ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="font-mono text-[10px] text-gray-400 w-4 flex-shrink-0">
              {step.step_number}
            </span>
            <span className="flex-1">{step.actual_outcome}</span>
            <span className="text-[10px] text-gray-400">{(step.duration_ms / 1000).toFixed(1)}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}
