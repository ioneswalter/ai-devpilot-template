/**
 * TestRunPanel — Modal content for test execution and status.
 * Opens to status overview; admin clicks "Run Tests" to enter marking mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTestExecution } from './useTestExecution';
import { TestCaseExecutionCard } from './TestCaseExecutionCard';
import { TestCaseStatusCard } from './TestCaseStatusCard';
import { TestRunHistory } from './TestRunHistory';
import type { TestCase } from './roadmap-helpers';
import type { TestRunResult, TestResultInput } from './test-execution-types';

interface TestRunDraft {
  view: PanelView;
  environment: string;
  results: Record<string, TestRunResult | null>;
  notes: Record<string, string>;
  savedAt: number;
}

const DRAFT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

function getDraftKey(featureId: string): string {
  return `test-run-draft-${featureId}`;
}

function loadDraft(featureId: string): TestRunDraft | null {
  try {
    const raw = sessionStorage.getItem(getDraftKey(featureId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as TestRunDraft;
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      sessionStorage.removeItem(getDraftKey(featureId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveDraft(featureId: string, draft: Omit<TestRunDraft, 'savedAt'>): void {
  try {
    sessionStorage.setItem(getDraftKey(featureId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* sessionStorage full or unavailable */ }
}

function clearDraft(featureId: string): void {
  try { sessionStorage.removeItem(getDraftKey(featureId)); } catch { /* ignore */ }
}

interface TestRunPanelProps {
  featureId: string;
  featureCode: string;
  featureTitle: string;
  featureStatus: string;
  testCases: TestCase[];
  onClose: () => void;
  onComplete: () => void;
  onRefresh?: () => void;
}

type PanelView = 'status' | 'execute';

export function TestRunPanel({
  featureId, featureCode, featureTitle, featureStatus, testCases, onClose, onComplete, onRefresh,
}: TestRunPanelProps) {
  const exec = useTestExecution(featureId);
  const draft = useRef(loadDraft(featureId)).current;
  const [view, setView] = useState<PanelView>(draft?.view ?? 'status');
  const [environment, setEnvironment] = useState(draft?.environment ?? 'development');
  const [results, setResults] = useState<Record<string, TestRunResult | null>>(draft?.results ?? {});
  const [notes, setNotes] = useState<Record<string, string>>(draft?.notes ?? {});
  const [hasDraft, setHasDraft] = useState(draft?.view === 'execute');
  const lastSubmitRef = useRef<{ passed: number; failed: number; skipped: number; total: number } | null>(null);

  // Persist draft to sessionStorage when in execute view
  const persistDraft = useCallback(() => {
    if (view === 'execute') {
      saveDraft(featureId, { view, environment, results, notes });
    }
  }, [featureId, view, environment, results, notes]);

  useEffect(() => { persistDraft(); }, [persistDraft]);

  // Compute last run result per test case from history (ordered by executed_at desc)
  const lastRunResults: Record<string, TestRunResult> = {};
  for (const entry of exec.history) {
    if (!lastRunResults[entry.test_case_id]) {
      lastRunResults[entry.test_case_id] = entry.result;
    }
  }

  const markedCount = Object.values(results).filter(Boolean).length;

  const handleSubmit = () => {
    const entries: TestResultInput[] = testCases
      .filter((tc) => results[tc.id!])
      .map((tc) => ({
        test_case_id: tc.id!,
        result: results[tc.id!]!,
        notes: notes[tc.id!] || undefined,
      }));
    if (entries.length === 0) return;
    lastSubmitRef.current = {
      passed: entries.filter((e) => e.result === 'passed').length,
      failed: entries.filter((e) => e.result === 'failed').length,
      skipped: entries.filter((e) => e.result === 'skipped').length,
      total: entries.length,
    };
    exec.submitResults(environment, entries);
    setResults({});
    setNotes({});
    clearDraft(featureId);
    setHasDraft(false);
  };

  // After successful submission — refresh parent data and return to status view
  if (exec.isSubmitSuccess && view === 'execute') {
    onRefresh?.();
    setView('status');
    exec.resetSubmit();
    lastSubmitRef.current = null;
    clearDraft(featureId);
    setHasDraft(false);
  }

  // Compute test status from test case data + history
  const passedCount = testCases.filter((tc) => tc.passed === true).length;
  const failedCount = testCases.filter((tc) => tc.passed === false).length;
  const skippedCount = testCases.filter((tc) => tc.passed == null && tc.id && lastRunResults[tc.id] === 'skipped').length;
  const notRunCount = testCases.filter((tc) => tc.passed == null).length - skippedCount;
  const allPassed = testCases.length > 0 && failedCount === 0 && notRunCount === 0 && skippedCount === 0;
  const hasFailed = failedCount > 0;

  if (view === 'status') {
    return (
      <div className="flex flex-col min-h-[400px]">
        <div className="p-4 border-b bg-white">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {testCases.map((tc) => (
            <TestCaseStatusCard
              key={tc.id}
              testCode={tc.test_code}
              title={tc.title}
              passed={tc.passed ?? null}
              isSkipped={tc.id ? lastRunResults[tc.id] === 'skipped' : false}
            />
          ))}
          {allPassed && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-green-800">All Tests Passed</h4>
                  <p className="text-sm text-green-700 mt-0.5">{passedCount} of {testCases.length} tests passed successfully.</p>
                </div>
              </div>
            </div>
          )}
          {hasFailed && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-red-800">Tests Failing — Release Blocked</h4>
                  <p className="text-sm text-red-700 mt-0.5">
                    {failedCount} of {testCases.length} test{failedCount > 1 ? 's' : ''} failed. {passedCount} passed{skippedCount > 0 ? `, ${skippedCount} skipped` : ''}{notRunCount > 0 ? `, ${notRunCount} not yet run` : ''}.
                  </p>
                  <p className="text-xs text-red-600 mt-2">Fix failing tests before releasing this feature.</p>
                </div>
              </div>
            </div>
          )}
          {!hasFailed && (notRunCount > 0 || skippedCount > 0) && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Tests Pending — Release Blocked</h4>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {notRunCount > 0 && `${notRunCount} test${notRunCount > 1 ? 's' : ''} not yet run. `}
                    {skippedCount > 0 && `${skippedCount} test${skippedCount > 1 ? 's' : ''} skipped. `}
                    {passedCount > 0 ? `${passedCount} passed.` : ''}
                  </p>
                  <p className="text-xs text-amber-600 mt-2">All tests must pass before releasing this feature.</p>
                </div>
              </div>
            </div>
          )}
          <TestRunHistory history={exec.history} isLoading={exec.isLoading} />
        </div>
        <div className="border-t p-3 flex items-center justify-between bg-white">
          <span className="text-xs text-gray-400">
            {passedCount} passed, {failedCount} failed{skippedCount > 0 ? `, ${skippedCount} skipped` : ''}, {notRunCount} not run
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
            {!allPassed && (
              <button
                onClick={() => {
                  const prefilled: Record<string, TestRunResult | null> = {};
                  for (const tc of testCases) {
                    if (!tc.id) continue;
                    if (lastRunResults[tc.id]) prefilled[tc.id] = lastRunResults[tc.id];
                    else if (tc.passed === true) prefilled[tc.id] = 'passed';
                    else if (tc.passed === false) prefilled[tc.id] = 'failed';
                  }
                  setResults(prefilled);
                  setNotes({});
                  setHasDraft(false);
                  setView('execute');
                }}
                className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >Run Tests</button>
            )}
            {allPassed && featureStatus !== 'released' && (
              <button
                onClick={onComplete}
                className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >Release Feature</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[400px]">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-blue-600">{featureCode}</code>
          <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
        </div>
        <p className="text-xs text-gray-500">Mark each test case as Pass, Fail, or Skip</p>
      </div>
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">Environment:</label>
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="text-xs border rounded px-2 py-1 bg-white">
          <option value="development">Development</option>
          <option value="staging">Staging</option>
          <option value="production">Production</option>
        </select>
      </div>
      {exec.submitError && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-red-700">
            {exec.submitError instanceof Error ? exec.submitError.message : 'Failed to submit'}
          </span>
        </div>
      )}
      {hasDraft && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
          <span className="text-xs text-blue-700">Draft restored — your previous progress was saved.</span>
          <button
            onClick={() => {
              setResults({});
              setNotes({});
              clearDraft(featureId);
              setHasDraft(false);
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Discard
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Mark Results ({markedCount}/{testCases.length})
        </h4>
        {testCases.map((tc) => (
          <TestCaseExecutionCard
            key={tc.id}
            testCase={{ ...tc, id: tc.id!, description: tc.description ?? null, passed: tc.passed ?? null }}
            result={results[tc.id!] ?? null}
            notes={notes[tc.id!] ?? ''}
            onResultChange={(r) => setResults((prev) => ({ ...prev, [tc.id!]: r }))}
            onNotesChange={(n) => setNotes((prev) => ({ ...prev, [tc.id!]: n }))}
            lastRunResult={tc.id ? lastRunResults[tc.id] ?? null : null}
          />
        ))}
      </div>
      <div className="border-t p-3 flex items-center justify-between bg-white">
        <button onClick={() => { setView('status'); setResults({}); setNotes({}); clearDraft(featureId); setHasDraft(false); }} className="text-xs text-gray-500 hover:text-gray-700">
          Back to Overview
        </button>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
          {markedCount > 0 && (
            <button
              onClick={handleSubmit}
              disabled={exec.isSubmitting}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {exec.isSubmitting ? 'Submitting...' : `Submit ${markedCount} Result${markedCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
