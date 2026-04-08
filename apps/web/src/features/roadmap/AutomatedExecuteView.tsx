/**
 * AutomatedExecuteView — Real browser-based test execution via extension.
 * Opens actual browser tabs, clicks elements, and validates assertions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAutomatedTests } from './useAutomatedTests';
import { useExtensionBridge } from './useExtensionBridge';
import { PhaseIndicator, ScriptList, TestCaseResultRow } from './AutomatedExecuteWidgets';
import type { SingleRunResult } from './AutomatedExecuteWidgets';
import type { ScriptListItem } from './automation-types';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult } from './test-execution-types';
import type { BrowserSuiteResult, BrowserScriptResult } from './useAutomatedTests';

interface AutomatedExecuteViewProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  testCases: TestCase[];
  environment: string;
  onEnvironmentChange: (env: string) => void;
  onResultsReady: (results: Record<string, TestRunResult>) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: Error | null;
  results: Record<string, TestRunResult | null>;
  onBack: () => void;
  onClose: () => void;
  onSwitchToManual: () => void;
}

type Phase = 'loading' | 'ready' | 'running' | 'done' | 'error';

export function AutomatedExecuteView({
  featureId,
  featureCode,
  featureTitle,
  testCases,
  environment,
  onEnvironmentChange,
  onResultsReady,
  onSubmit,
  isSubmitting,
  submitError,
  results,
  onBack,
  onClose,
  onSwitchToManual,
}: AutomatedExecuteViewProps) {
  const auto = useAutomatedTests(featureId);
  const ext = useExtensionBridge();
  const [phase, setPhase] = useState<Phase>('loading');
  const [suiteResult, setSuiteResult] = useState<BrowserSuiteResult | null>(null);
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);
  const [singleResults, setSingleResults] = useState<Record<string, SingleRunResult>>({});

  // Step 1: Load scripts on mount
  useEffect(() => {
    auto.loadScripts();
  }, [auto.loadScripts]);

  // Step 2: Once scripts are loaded, move to ready (never auto-generate)
  // Also seed singleResults from DB so Pass/Fail labels persist across refreshes
  useEffect(() => {
    if (phase !== 'loading') return;
    if (!auto.scriptsLoaded) return;
    // Seed singleResults from last_run_result stored in DB
    const seeded: Record<string, SingleRunResult> = {};
    for (const script of auto.scripts) {
      if (script.last_run_result) {
        seeded[script.id] = {
          result: script.last_run_result,
          duration_ms: 0,
          failure_reason: undefined,
        };
      }
    }
    if (Object.keys(seeded).length > 0) {
      setSingleResults(seeded);
    }
    setPhase('ready');
  }, [phase, auto.scriptsLoaded, auto.scripts.length]);

  // Map suite results to test case Pass/Fail
  const mapSuiteToResults = useCallback((suite: BrowserSuiteResult) => {
    const mapped: Record<string, TestRunResult> = {};
    for (const r of suite.results) {
      if (r.result === 'passed') mapped[r.test_case_id] = 'passed';
      else if (r.result === 'failed' || r.result === 'error') mapped[r.test_case_id] = 'failed';
      else mapped[r.test_case_id] = 'skipped';
    }
    return mapped;
  }, []);

  const handleRunAll = useCallback(async () => {
    if (!ext.isAvailable) {
      // Fallback: show error about extension
      setPhase('error');
      return;
    }

    setPhase('running');
    setSuiteResult(null);
    const result = await auto.executeSuite(environment, ext.executeTestScript);
    if (result) {
      setSuiteResult(result);
      const mapped = mapSuiteToResults(result);
      onResultsReady(mapped);
      setPhase('done');
    } else {
      setPhase('error');
    }
  }, [auto, environment, ext.isAvailable, ext.executeTestScript, mapSuiteToResults, onResultsReady]);

  const handleRunSingle = useCallback(async (script: ScriptListItem) => {
    if (!ext.isAvailable || runningScriptId) return;
    setRunningScriptId(script.id);
    const result = await auto.executeScript(script, environment, ext.executeTestScript);
    const firstFailure = result.failures[0];
    const failureReason = firstFailure
      ? `Step ${firstFailure.step_number}: ${firstFailure.actual}`
      : undefined;
    setSingleResults((prev) => ({
      ...prev,
      [script.id]: { result: result.result, duration_ms: result.duration_ms, failure_reason: failureReason },
    }));
    setRunningScriptId(null);
    // Reload scripts so next run uses latest from DB
    await auto.loadScripts();
  }, [auto, environment, ext.isAvailable, ext.executeTestScript, runningScriptId]);

  const markedCount = Object.values(results).filter(Boolean).length;
  const allPassed = auto.scripts.length > 0 && auto.scripts.every(
    (s) => singleResults[s.id]?.result === 'passed' || s.last_run_result === 'passed',
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">AI-powered automated test execution</p>
      </div>

      {/* Environment selector */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Environment:</label>
          <select
            value={environment}
            onChange={(e) => onEnvironmentChange(e.target.value)}
            className="text-xs border rounded px-2 py-1 bg-white"
          >
            <option value="development">Development</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
        </div>
        <button
          onClick={onSwitchToManual}
          className="text-[10px] text-gray-500 hover:text-gray-700"
        >
          Switch to Manual Testing
        </button>
      </div>

      {/* Extension warning */}
      {!ext.checking && !ext.isAvailable && phase !== 'loading' && (
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          <strong>Browser extension not connected.</strong>{' '}
          {ext.connectionError?.includes('refresh')
            ? 'The extension was reloaded — please refresh this page (Cmd+R).'
            : 'Install the SpecKit DevTools extension and reload this page.'}
          <button
            onClick={() => window.location.reload()}
            className="ml-2 px-2 py-0.5 bg-amber-200 rounded hover:bg-amber-300 font-medium"
          >
            Refresh Page
          </button>
        </div>
      )}

      {submitError && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {submitError.message}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Phase: Loading */}
        {phase === 'loading' && (
          <PhaseIndicator label="Loading test scripts..." />
        )}

        {/* Phase: Error */}
        {phase === 'error' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-medium text-red-800 mb-1">Automation Error</p>
            <p className="text-xs text-red-700 mb-3">
              {!ext.isAvailable
                ? 'Browser extension is required for real test execution. Install SpecKit DevTools and reload.'
                : (auto.error ?? 'Failed to generate or run scripts')}
            </p>
            <button
              onClick={onSwitchToManual}
              className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-300 rounded hover:bg-red-100"
            >
              Test Manually
            </button>
          </div>
        )}

        {/* Phase: Ready — show scripts, ready to run */}
        {phase === 'ready' && (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {auto.scripts.length} Automated Scripts
              </h4>
            </div>
            <ScriptList
              scripts={auto.scripts}
              onRunSingle={ext.isAvailable ? handleRunSingle : undefined}
              runningScriptId={runningScriptId}
              singleResults={singleResults}
            />
            {auto.scripts.length === 0 && (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-gray-500">No test scripts found for this feature.</p>
                <p className="text-xs text-gray-400">
                  Run <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-indigo-600">\generate-tests {featureCode}</code> in Claude Code to generate scripts from actual source code.
                </p>
                <button
                  onClick={onSwitchToManual}
                  className="px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-300 rounded hover:bg-indigo-50"
                >
                  Test Manually Instead
                </button>
              </div>
            )}
          </>
        )}

        {/* Phase: Running — show real-time progress with live results */}
        {phase === 'running' && (
          <RunningProgress
            progress={auto.executingProgress}
            scripts={auto.scripts}
            liveResults={auto.liveResults}
          />
        )}

        {/* Phase: Done — show results with step details */}
        {phase === 'done' && suiteResult && (
          <>
            <BrowserSuiteResultSummary result={suiteResult} />
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4">
              Results by Test Case ({markedCount}/{testCases.length})
            </h4>
            <div className="space-y-2">
              {testCases.map((tc) => {
                const tcResult = results[tc.id!];
                const scriptResult = suiteResult.results.find((r) => r.test_case_id === tc.id);
                return (
                  <TestCaseResultRow
                    key={tc.id}
                    testCode={tc.test_code}
                    title={tc.title}
                    result={tcResult ?? null}
                    duration={scriptResult?.duration_ms}
                    skippedReason={!scriptResult ? 'No script' : undefined}
                  />
                );
              })}
            </div>

            {/* Failed step details */}
            {suiteResult.results.some((r) => r.failures.length > 0) && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
                  Failure Details
                </h4>
                <div className="space-y-2">
                  {suiteResult.results
                    .filter((r) => r.failures.length > 0)
                    .map((r) => (
                      <FailureDetail key={r.script_id} scriptResult={r} />
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
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
              onClick={() => { auto.stopExecution(); setPhase('done'); }}
              className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Stop Tests
            </button>
          )}
          {phase === 'ready' && auto.scripts.length > 0 && !allPassed && (
            <button
              onClick={handleRunAll}
              disabled={!ext.isAvailable}
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
    </div>
  );
}

/** Real-time progress during test execution with live results */
function RunningProgress({
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
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="flex-1">
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

      {/* Completed test results */}
      {liveResults.length > 0 && (
        <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
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

      <p className="text-[10px] text-gray-400 text-center">
        Browser is executing real actions — tabs may briefly switch focus
      </p>
    </div>
  );
}

/** Suite result summary with real timing */
function BrowserSuiteResultSummary({ result }: { result: BrowserSuiteResult }) {
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
function FailureDetail({ scriptResult }: { scriptResult: BrowserScriptResult }) {
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
