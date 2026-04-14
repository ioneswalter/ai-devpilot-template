/**
 * TestRunPanel — Modal content for test execution and status.
 * Opens to status overview; admin clicks "Run Tests" to enter marking mode.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import { useTestExecution } from './useTestExecution';
import { TestCaseExecutionCard } from './TestCaseExecutionCard';
import { TestCaseStatusCard } from './TestCaseStatusCard';
import { TestRunHistory } from './TestRunHistory';
import { TestPipelineSteps } from './TestPipelineSteps';
import { AutomatedExecuteView } from './AutomatedExecuteView';
import { CriteriaCoverageBar } from './CriteriaCoverageBar';
import { useCriteriaCoverage } from './useCriteriaCoverage';
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
  acceptanceCriteria?: string[];
  onClose: () => void;
  onComplete: () => void;
  onRefresh?: () => void;
}

type PanelView = 'status' | 'execute' | 'manual';

export function TestRunPanel({
  featureId, featureCode, featureTitle, featureStatus, testCases, acceptanceCriteria, onClose, onComplete, onRefresh,
}: TestRunPanelProps) {
  const exec = useTestExecution(featureId);
  const draft = useRef(loadDraft(featureId)).current;
  const [view, setView] = useState<PanelView>(draft?.view ?? 'status');
  const [environment, setEnvironment] = useState(draft?.environment ?? 'development');
  const [results, setResults] = useState<Record<string, TestRunResult | null>>(draft?.results ?? {});
  const [notes, setNotes] = useState<Record<string, string>>(draft?.notes ?? {});
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

  // Criteria coverage (J5)
  const coverage = useCriteriaCoverage({
    criteria: acceptanceCriteria ?? [],
    testCases: testCases.filter((tc) => tc.id).map((tc) => ({
      id: tc.id!,
      test_code: tc.test_code,
      title: tc.title,
      passed: tc.passed ?? null,
    })),
    testRuns: exec.history.map((h) => ({
      test_case_id: h.test_case_id,
      evidence: h.evidence ?? null,
      result: h.result,
      executed_at: h.executed_at,
    })),
  });

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
     };

  // After successful submission — refresh parent data and return to status view
  if (exec.isSubmitSuccess && (view === 'execute' || view === 'manual')) {
    onRefresh?.();
    setView('status');
    exec.resetSubmit();
    lastSubmitRef.current = null;
    clearDraft(featureId);
     }

  /** Called by AutomatedExecuteView when suite completes — auto-mark results */
  const handleAutoResults = useCallback((autoResults: Record<string, TestRunResult>) => {
    setResults(autoResults);
  }, []);

  /** Submit auto-populated results directly */
  const handleAutoSubmit = useCallback((env: string) => {
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
    exec.submitResults(env, entries);
    clearDraft(featureId);
     }, [testCases, results, notes, exec, featureId]);

  // Compute test status from test case data + history
  const passedCount = testCases.filter((tc) => tc.passed === true).length;
  const failedCount = testCases.filter((tc) => tc.passed === false).length;
  const skippedCount = testCases.filter((tc) => tc.passed == null && tc.id && lastRunResults[tc.id] === 'skipped').length;
  const notRunCount = testCases.filter((tc) => tc.passed == null).length - skippedCount;
  const allPassed = testCases.length > 0 && failedCount === 0 && notRunCount === 0 && skippedCount === 0;

  // Check build task acceptance (only for in_development features)
  const buildGateQuery = useQuery({
    queryKey: ['build-gate', featureId],
    queryFn: async () => {
      try {
        const res = await adminApi.getImplementation(featureId);
        const tasks = res.data?.items ?? [];
        const pending = tasks.filter((t: { decision: string }) => t.decision === 'pending').length;
        const rejected = tasks.filter((t: { decision: string }) => t.decision === 'rejected').length;
        return { hasTasks: tasks.length > 0, pending, rejected };
      } catch {
        return { hasTasks: false, pending: 0, rejected: 0 };
      }
    },
    enabled: featureStatus === 'in_development',
    staleTime: 5_000,
  });
  const buildPending = buildGateQuery.data?.pending ?? 0;
  const buildRejected = buildGateQuery.data?.rejected ?? 0;
  const buildNeedsReview = featureStatus === 'in_development' && (buildPending > 0 || buildRejected > 0);

  // Workflow gate: block test panel for features that haven't been built
  const needsBuild = featureStatus === 'proposed' || featureStatus === 'reviewed' || featureStatus === 'approved';
  if (needsBuild) {
    const stepMsg = featureStatus === 'proposed'
      ? <>Run <code className="font-mono bg-amber-100 px-1 rounded">\review-proposal {featureCode}</code> → <code className="font-mono bg-amber-100 px-1 rounded">\spec</code> → <code className="font-mono bg-amber-100 px-1 rounded">\build</code> first.</>
      : featureStatus === 'reviewed'
        ? <>Run <code className="font-mono bg-amber-100 px-1 rounded">\spec {featureCode}</code> → <code className="font-mono bg-amber-100 px-1 rounded">\build</code> first.</>
        : <>Run <code className="font-mono bg-amber-100 px-1 rounded">\build {featureCode}</code> first, then accept the build in the Roadmap UI.</>;
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
        </div>
        <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">Build Required</p>
            <p className="text-xs text-amber-700">{stepMsg}</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="border-t p-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    );
  }

  // Workflow gate: block testing if build tasks are pending review or rejected
  if (buildNeedsReview) {
    const msg = buildRejected > 0
      ? <>{buildRejected} build task(s) were rejected. Run <code className="font-mono bg-amber-100 px-1 rounded">\fix-build {featureCode}</code> to address feedback, then accept in the Build panel.</>
      : <>{buildPending} build task(s) are pending review. Go to the Build panel to accept or reject each task before testing.</>;
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
        </div>
        <div className="px-4 py-3 border-b bg-amber-50 border-amber-200 flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800">Build Review Required</p>
            <p className="text-xs text-amber-700">{msg}</p>
          </div>
        </div>
        <div className="flex-1" />
        <div className="border-t p-3 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
    );
  }

  if (view === 'status') {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b bg-white">
          <div className="flex items-center gap-2">
            <code className="text-xs font-mono text-blue-600">{featureCode}</code>
            <h3 className="text-sm font-semibold text-gray-900 truncate">{featureTitle}</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Guided pipeline: Data → Scripts → Run */}
          <TestPipelineSteps
            featureId={featureId}
            featureCode={featureCode}
            testCaseCount={testCases.length}
            automatedCount={testCases.filter((tc) => tc.automated).length}
            passedCount={passedCount}
            failedCount={failedCount}
            notRunCount={notRunCount}
            onRefresh={onRefresh}
            onRunTests={() => {
              const prefilled: Record<string, TestRunResult | null> = {};
              for (const tc of testCases) {
                if (!tc.id) continue;
                if (lastRunResults[tc.id]) prefilled[tc.id] = lastRunResults[tc.id];
                else if (tc.passed === true) prefilled[tc.id] = 'passed';
                else if (tc.passed === false) prefilled[tc.id] = 'failed';
              }
              setResults(prefilled);
              setNotes({});
              setView('execute');
            }}
          />

          {/* Test case list */}
          {testCases.map((tc) => (
            <TestCaseStatusCard
              key={tc.id}
              testCode={tc.test_code}
              title={tc.title}
              passed={tc.passed ?? null}
              isSkipped={tc.id ? lastRunResults[tc.id] === 'skipped' : false}
            />
          ))}

          {acceptanceCriteria && acceptanceCriteria.length > 0 && (
            <CriteriaCoverageBar coverage={coverage} />
          )}
          <TestRunHistory history={exec.history} isLoading={exec.isLoading} />
        </div>
        <div className="border-t p-3 flex items-center justify-between bg-white">
          <span className="text-xs text-gray-400">
            {passedCount} passed, {failedCount} failed{skippedCount > 0 ? `, ${skippedCount} skipped` : ''}, {notRunCount} not run
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Close</button>
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

  // Automated execute view — primary flow
  if (view === 'execute') {
    return (
      <AutomatedExecuteView
        featureId={featureId}
        featureCode={featureCode}
        featureTitle={featureTitle}
        testCases={testCases}
        environment={environment}
        onEnvironmentChange={setEnvironment}
        onResultsReady={handleAutoResults}
        onSubmit={() => handleAutoSubmit(environment)}
        isSubmitting={exec.isSubmitting}
        submitError={exec.submitError}
        results={results}
        onBack={() => { setView('status'); setResults({}); setNotes({}); clearDraft(featureId); }}
        onClose={onClose}
        onSwitchToManual={() => setView('manual')}
      />
    );
  }

  // Manual fallback view — same as old execute view
  return (
    <div className="flex flex-col h-full">
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
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Manual Results ({markedCount}/{testCases.length})
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
            featureId={featureId}
          />
        ))}
      </div>
      <div className="border-t p-3 flex items-center justify-between bg-white">
        <div className="flex gap-2">
          <button onClick={() => setView('execute')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
            Switch to Automated
          </button>
          <button onClick={() => { setView('status'); setResults({}); setNotes({}); clearDraft(featureId); }} className="text-xs text-gray-500 hover:text-gray-700">
            Back to Overview
          </button>
        </div>
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
